import { createServer, IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "crypto";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import type { Doc } from "yjs";
import { logger } from "./app/lib/logger";
import { sanitizeProjectDocument } from "./app/lib/projectContentSafety";
import { initDb, getDb, getPool } from "./app/lib/db";
import { runMigrations } from "@/lib/migrations";
import {
  validateWebsocketRequest,
  getUserProjectRole,
} from "./app/lib/ws-auth";
import * as pty from "node-pty";

import {
  setupWSConnection,
  docs,
  setPersistence,
} from "./lib/y-websocket/utils";
import { LeveldbPersistence } from "y-leveldb";

// Global helper to kick user from project
declare global {
  var kickUser: (projectId: string, userId: string) => void;
  var updateProjectRequests: (projectId: string) => Promise<void>;
  var notifyAccessGranted: (projectId: string, userId: string) => Promise<void>;
}

global.notifyAccessGranted = async (projectId: string, userId: string) => {
  const docName = `project-${projectId}-access`;
  const doc = docs.get(docName);

  if (doc) {
    try {
      const metaMap = doc.getMap("meta");
      // Set access granted for this user with a timestamp
      metaMap.set(`granted:${userId}`, Date.now());
    } catch (e) {
      logger.error(
        { err: e, projectId, userId },
        "[NotifyAccess] Failed to notify user",
      );
    }
  }
};

global.updateProjectRequests = async (projectId: string) => {
  const docName = `project-${projectId}`;
  const doc = docs.get(docName);

  if (doc) {
    try {
      const db = getDb();
      const result = await db
        .selectFrom("projectRequests")
        .select((eb) => eb.fn.count<number>("id").as("count"))
        .where("projectId", "=", projectId)
        .where("status", "=", "pending")
        .executeTakeFirst();

      const count = Number(result?.count || 0);

      const metaMap = doc.getMap("meta");
      metaMap.set("pendingRequestsCount", count);
    } catch (e) {
      logger.error(
        { err: e, projectId },
        "[UpdateRequests] Failed to update requests count",
      );
    }
  }
};

global.kickUser = (projectId: string, userId: string) => {
  const docName = `project-${projectId}`;
  const doc = docs.get(docName);
  if (doc) {
    // doc.conns is a Map<WebSocket, any>
    for (const [ws] of doc.conns) {
      if ((ws as WebSocket & { userId: string }).userId === userId) {
        ws.close(4003, "Access Revoked");
      }
    }
  }
};

// Shell PTY session management
interface ShellSession {
  pty: pty.IPty;
  projectId: string;
  userId: string;
  blockId: string;
  ws: WebSocket;
}

const shellSessions = new Map<string, ShellSession>();

const DEFAULT_SHELL_MAX_SESSIONS = 2;
const rawShellMaxSessions = process.env.SHELL_MAX_SESSIONS;
const parsedShellMaxSessions = rawShellMaxSessions
  ? Number.parseInt(rawShellMaxSessions, 10)
  : DEFAULT_SHELL_MAX_SESSIONS;
const SHELL_MAX_SESSIONS =
  Number.isInteger(parsedShellMaxSessions) && parsedShellMaxSessions >= 0
    ? parsedShellMaxSessions
    : DEFAULT_SHELL_MAX_SESSIONS;

function getProjectShellCount(projectId: string): number {
  let count = 0;
  for (const session of shellSessions.values()) {
    if (session.projectId === projectId) count++;
  }
  return count;
}

function killShellSession(blockId: string) {
  const session = shellSessions.get(blockId);
  if (!session) return;
  try {
    session.pty.kill();
  } catch {
    // Already dead
  }
  shellSessions.delete(blockId);
}

async function validateShellAccess(
  userId: string,
  projectId: string,
): Promise<boolean> {
  try {
    // Bypass FORCE RLS with raw pool query
    const pool = getPool();
    if (pool) {
      const db = getDb();

      const projectQuery = db
        .selectFrom("projects")
        .select(["id", "ownerId"])
        .where("id", "=", projectId)
        .compile();

      const projResult = await pool.query(
        projectQuery.sql,
        projectQuery.parameters as unknown[],
      );

      const project = (projResult.rows[0] ?? null) as {
        id: string;
        ownerId: string;
      } | null;

      if (!project) return false;
      if (project.ownerId === userId) return true;

      const collaboratorQuery = db
        .selectFrom("projectCollaborators")
        .select("role")
        .where("projectId", "=", projectId)
        .where("userId", "=", userId)
        .compile();

      const collabResult = await pool.query(
        collaboratorQuery.sql,
        collaboratorQuery.parameters as unknown[],
      );

      const collaborator = (collabResult.rows[0] ?? null) as {
        role: string;
      } | null;
      if (!collaborator) return false;
      return collaborator.role === "owner" || collaborator.role === "admin";
    }

    // SQLite fallback (no RLS)
    const db = getDb();

    const project = await db
      .selectFrom("projects")
      .select(["id", "ownerId"])
      .where("id", "=", projectId)
      .executeTakeFirst();

    if (!project) return false;

    if (project.ownerId === userId) return true;

    const collaborator = await db
      .selectFrom("projectCollaborators")
      .select("role")
      .where("projectId", "=", projectId)
      .where("userId", "=", userId)
      .executeTakeFirst();

    if (!collaborator) return false;

    const role = collaborator.role as string;
    return role === "owner" || role === "admin";
  } catch (err) {
    logger.error({ err }, "[Shell] Failed to validate access");
    return false;
  }
}

function handleShellConnection(
  ws: WebSocket,
  userId: string,
  projectId: string,
) {
  const typedWs = ws as WebSocket & { shellBlockId?: string };

  ws.on("message", async (raw) => {
    let msg: {
      type: string;
      blockId?: string;
      data?: string;
      cols?: number;
      rows?: number;
    };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "shell:start" && msg.blockId) {
      const blockId = msg.blockId;

      // Kill existing session for this block if any
      killShellSession(blockId);

      // Check max sessions per project
      if (getProjectShellCount(projectId) >= SHELL_MAX_SESSIONS) {
        ws.send(
          JSON.stringify({
            type: "shell:error",
            blockId,
            message: "Maximum concurrent shell sessions reached",
          }),
        );
        ws.close(4029, "Max sessions");
        return;
      }

      // Verify permission
      const hasAccess = await validateShellAccess(userId, projectId);
      if (!hasAccess) {
        ws.send(
          JSON.stringify({
            type: "shell:error",
            blockId,
            message: "Permission denied",
          }),
        );
        ws.close(4003, "Permission denied");
        return;
      }

      // Detect shell
      const shell =
        process.platform === "win32"
          ? "powershell.exe"
          : process.env.SHELL || "/bin/sh";

      try {
        const ptyProcess = pty.spawn(shell, [], {
          name: "xterm-256color",
          cols: 80,
          rows: 24,
          cwd: process.env.HOME || "/",
          env: {
            ...process.env,
            TERM: "xterm-256color",
          } as Record<string, string>,
        });

        const session: ShellSession = {
          pty: ptyProcess,
          projectId,
          userId,
          blockId,
          ws,
        };

        shellSessions.set(blockId, session);
        typedWs.shellBlockId = blockId;

        ptyProcess.onData((data: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "shell:data", blockId, data }));
          }
        });

        ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
          shellSessions.delete(blockId);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "shell:exit", blockId, exitCode }));
          }
        });
      } catch (err) {
        logger.error({ err, userId, projectId }, "[Shell] Failed to spawn PTY");
        ws.send(
          JSON.stringify({
            type: "shell:error",
            blockId,
            message: "Failed to start shell",
          }),
        );
      }
    } else if (msg.type === "shell:data" && msg.blockId && msg.data) {
      const session = shellSessions.get(msg.blockId);
      if (session && session.userId === userId) {
        session.pty.write(msg.data);
      }
    } else if (
      msg.type === "shell:resize" &&
      msg.blockId &&
      msg.cols &&
      msg.rows
    ) {
      const session = shellSessions.get(msg.blockId);
      if (session && session.userId === userId) {
        try {
          session.pty.resize(msg.cols, msg.rows);
        } catch {
          // Ignore resize errors
        }
      }
    } else if (msg.type === "shell:stop" && msg.blockId) {
      const session = shellSessions.get(msg.blockId);
      if (session && session.userId === userId) {
        killShellSession(msg.blockId);
      }
    }
  });

  ws.on("close", () => {
    // Kill all sessions owned by this connection
    for (const [blockId, session] of shellSessions.entries()) {
      if (session.ws === ws) {
        killShellSession(blockId);
      }
    }
  });
}

const dev = process.env.NODE_ENV === "development";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || process.env.APP_PORT || "3000", 10);

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const WS_MAX_PAYLOAD_BYTES = parsePositiveInt(
  process.env.YJS_WS_MAX_PAYLOAD_BYTES,
  64 * 1024 * 1024,
);

const isUnsupportedWsPayloadError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code;
  return code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
};

process.on("uncaughtException", (err) => {
  if (isUnsupportedWsPayloadError(err)) {
    logger.error(
      { err },
      "[WS] Ignored unsupported websocket message length exception",
    );
    return;
  }

  logger.error({ err }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const persistenceDir = "./storage/yjs";
const ldb = new LeveldbPersistence(persistenceDir);

// Configure Persistence correctly for y-websocket
setPersistence({
  bindState: async (docName: string, ydoc: Doc) => {
    const persistedYdoc = await ldb.getYDoc(docName);

    if (docName.startsWith("project-")) {
      try {
        if (sanitizeProjectDocument(persistedYdoc)) {
          logger.warn(
            { docName },
            "[YJS] Repaired oversized project content before client sync",
          );
        }
        // Enable GC to remove accumulated tombstones from prior full-replace syncs,
        // then compact LevelDB to a single clean state so sync messages stay small.
        persistedYdoc.gc = true;
        persistedYdoc.transact(() => {}, "compaction");
        const compactUpdate = Y.encodeStateAsUpdate(persistedYdoc);
        await ldb.clearDocument(docName);
        await ldb.storeUpdate(docName, compactUpdate);
        logger.info({ docName }, "[YJS] Compacted document on load");
      } catch (e) {
        logger.error(
          { err: e, docName },
          "[YJS] Failed to compact persisted project document",
        );
      }
    }

    const newUpdates = Y.encodeStateAsUpdate(ydoc);
    await ldb.storeUpdate(docName, newUpdates);
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));

    if (docName.startsWith("project-")) {
      try {
        if (sanitizeProjectDocument(ydoc)) {
          logger.warn(
            { docName },
            "[YJS] Repaired oversized in-memory project content after bind",
          );
          await ldb.storeUpdate(docName, Y.encodeStateAsUpdate(ydoc));
        }
      } catch (e) {
        logger.error(
          { err: e, docName },
          "[YJS] Failed to repair in-memory project content after bind",
        );
      }
    }

    ydoc.on("update", (update: Uint8Array) => {
      ldb.storeUpdate(docName, update);
    });
  },
  writeState: async (docName: string, ydoc: Doc) => {
    if (docName.startsWith("project-")) {
      try {
        if (sanitizeProjectDocument(ydoc)) {
          logger.warn(
            { docName },
            "[YJS] Repaired oversized project content before persistence",
          );
        }
      } catch (e) {
        logger.error(
          { err: e, docName },
          "[YJS] Failed to repair project content before persistence",
        );
      }
    }

    await ldb.storeUpdate(docName, Y.encodeStateAsUpdate(ydoc));
  },
});

// Initialize Database with fallback mechanism

initDb()
  .then(() => runMigrations())
  .then(() => app.prepare())
  .then(async () => {
    const server = createServer(async (req, res) => {
      const method = req.method;
      const url = req.url;

      // socket.remoteAddress is the transport-level address; prefer it for
      // loopback detection (not from headers, which can be spoofed).
      const socketRemote = (req.socket && req.socket.remoteAddress) || null;

      // Determine the client IP from common proxy headers when available.
      const xForwardedFor =
        (req.headers &&
          (req.headers["x-forwarded-for"] as string | undefined)) ||
        undefined;
      const cfConnecting =
        (req.headers &&
          (req.headers["cf-connecting-ip"] as string | undefined)) ||
        undefined;
      const xRealIp =
        (req.headers && (req.headers["x-real-ip"] as string | undefined)) ||
        undefined;

      const clientIpFromHeader = (() => {
        if (typeof xForwardedFor === "string" && xForwardedFor.trim()) {
          return xForwardedFor.split(",")[0].trim();
        }
        if (typeof cfConnecting === "string" && cfConnecting.trim())
          return cfConnecting.trim();
        if (typeof xRealIp === "string" && xRealIp.trim())
          return xRealIp.trim();
        return null;
      })();

      const clientIp = clientIpFromHeader || socketRemote || null;

      const isLoopback =
        socketRemote === "::1" ||
        socketRemote === "127.0.0.1" ||
        (typeof socketRemote === "string" &&
          socketRemote.startsWith("::ffff:127."));

      const reqId = randomUUID();
      try {
        res.setHeader("x-request-id", reqId);
      } catch {
        // ignore
      }

      try {
        if (!isLoopback) {
          logger.info({ method, url, remoteAddress: clientIp }, "");
        }
      } catch {
        // ignore
      }

      const startHr = process.hrtime.bigint();

      const onFinish = () => {
        try {
          if (!isLoopback) {
            const durationMs = Number(process.hrtime.bigint() - startHr) / 1e6;
            logger.info(
              {
                method,
                url,
                status: (res && (res as ServerResponse).statusCode) || null,
                durationMs,
                remoteAddress: clientIp,
              },
              "",
            );
          }
        } catch {
          // swallow
        }
      };

      res.once("finish", onFinish);

      try {
        await handle(req, res);
      } catch (err) {
        logger.error({ err, url }, "Error occurred handling request");
        res.statusCode = 500;
        res.end("internal server error");
      }
    });

    const wss = new WebSocketServer({
      noServer: true,
      maxPayload: WS_MAX_PAYLOAD_BYTES,
      perMessageDeflate: {
        zlibDeflateOptions: {
          chunkSize: 1024,
          memLevel: 7,
          level: 3,
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024,
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10,
        concurrencyLimit: 10,
        threshold: 1024,
      },
    });
    const shellWss = new WebSocketServer({
      noServer: true,
      maxPayload: WS_MAX_PAYLOAD_BYTES,
      perMessageDeflate: false,
    });

    wss.on("error", (err) => {
      logger.error({ err }, "[WS] Yjs server error");
    });

    shellWss.on("error", (err) => {
      logger.error({ err }, "[WS] Shell server error");
    });

    server.on("error", (err) => {
      logger.error({ err }, "[HTTP] Server error");
    });

    server.on("clientError", (err, socket) => {
      logger.warn({ err }, "[HTTP] Client error");
      if (socket.writable) {
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      }
    });

    const nextUpgradeHandler = app.getUpgradeHandler();

    server.on("upgrade", async (request, socket, head) => {
      const origin = request.headers.origin;
      const appUrl = process.env.APP_URL;
      const xForwardedProto = (
        request.headers["x-forwarded-proto"] || ""
      ).toString();

      if (process.env.NODE_ENV === "production" && appUrl && origin) {
        const normalizedOrigin = origin.toLowerCase();
        const normalizedAppUrl = appUrl.toLowerCase();

        let isValid = normalizedOrigin === normalizedAppUrl;

        if (!isValid && xForwardedProto === "https") {
          const reconstructedUrl = `https://${request.headers.host || ""}`;
          isValid = normalizedOrigin === reconstructedUrl.toLowerCase();
        }

        if (!isValid) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }
      }

      const parsedUrl = new URL(request.url!, `http://${hostname}:${port}`);
      const pathname = parsedUrl.pathname;

      if (pathname?.startsWith("/shell")) {
        const projectId = parsedUrl.searchParams.get("projectId");
        const blockId = parsedUrl.searchParams.get("blockId");

        if (!projectId || !blockId) {
          socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
          socket.destroy();
          return;
        }

        // Reuse Yjs auth to validate the user has project access
        const userId = await validateWebsocketRequest(
          request,
          `project-${projectId}`,
        );

        if (!userId) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        (
          request as IncomingMessage & {
            userId: string;
            userRole?: string;
            shellProjectId: string;
          }
        ).userId = userId;

        // Attach user role for this project so WS handlers can enforce permissions
        try {
          const role = await getUserProjectRole(userId, `project-${projectId}`);
          if (!role) {
            socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            socket.destroy();
            return;
          }
          (request as IncomingMessage & { userRole?: string }).userRole = role;
        } catch {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }
        (
          request as IncomingMessage & { shellProjectId: string }
        ).shellProjectId = projectId;

        shellWss.handleUpgrade(request, socket, head, (ws) => {
          shellWss.emit("connection", ws, request);
        });
      } else if (pathname?.startsWith("/yjs")) {
        const docName = pathname.split("/").pop() || "default";

        const userId = await validateWebsocketRequest(request, docName);

        if (!userId) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        (request as IncomingMessage & { userId: string }).userId = userId;

        try {
          const role = await getUserProjectRole(userId, docName);
          if (!role) {
            socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            socket.destroy();
            return;
          }
          (request as IncomingMessage & { userRole?: string }).userRole = role;
        } catch (err) {
          logger.error(
            { err, docName, userId },
            "Failed to resolve user project role",
          );
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      } else if (pathname?.startsWith("/_next/")) {
        nextUpgradeHandler(request, socket, head);
      } else {
        socket.destroy();
      }
    });

    wss.on("connection", (ws, req) => {
      const { pathname } = new URL(req.url!, `http://${hostname}:${port}`);
      const docName = pathname?.split("/").pop() || "default";

      (ws as WebSocket & { userId: string; userRole?: string }).userId = (
        req as IncomingMessage & { userId: string }
      ).userId;
      (ws as WebSocket & { userRole?: string }).userRole = (
        req as IncomingMessage & { userRole?: string }
      ).userRole;

      ws.on("error", (err) => {
        logger.warn({ err, docName }, "[WS] Yjs connection error");
      });

      setupWSConnection(ws, req, {
        docName,
        gc: true,
      });
    });

    shellWss.on("connection", (ws, req) => {
      const typedReq = req as IncomingMessage & {
        userId: string;
        shellProjectId: string;
      };
      ws.on("error", (err) => {
        logger.warn({ err }, "[WS] Shell connection error");
      });
      handleShellConnection(ws, typedReq.userId, typedReq.shellProjectId);
    });

    const INACTIVE_DOC_THRESHOLD_MS = 60 * 60 * 1000;
    const gcInterval = setInterval(() => {
      const now = Date.now();

      for (const [name, doc] of docs.entries()) {
        if (
          doc.conns.size === 0 &&
          now - (doc.createdAt ?? now) > INACTIVE_DOC_THRESHOLD_MS
        ) {
          try {
            doc.destroy();
            docs.delete(name);
          } catch (err) {
            logger.error(
              { err, docName: name },
              "[GC] Failed to destroy document",
            );
          }
        }
      }
    }, 300000);

    server.on("close", () => {
      clearInterval(gcInterval);
    });

    server.listen(port, () => {
      logger.info(`> Ready on http://${hostname}:${port}`);
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  });
