import { createServer, IncomingMessage } from "http";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import type { Doc } from "yjs";
import { logger } from "./app/lib/logger";
import { initDb, getDb, withAuthenticatedSession, getGlobalDb } from "./app/lib/db";
import { runMigrations } from "@/lib/migrations";
import { validateWebsocketRequest } from "./app/lib/ws-auth";
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
      // Use a system session so RLS policies on projectRequests are satisfied.
      // The query reads all pending requests for the project (owner's perspective),
      // so we use a dedicated system user ID rather than a specific user's context.
      const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
      const result = await withAuthenticatedSession(
        SYSTEM_USER_ID,
        async (db) =>
          db
            .selectFrom("projectRequests")
            .select((eb) => eb.fn.count<number>("id").as("count"))
            .where("projectId", "=", projectId)
            .where("status", "=", "pending")
            .executeTakeFirst(),
        getGlobalDb(),
      );

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
    // Must use withAuthenticatedSession so that FORCE ROW LEVEL SECURITY on
    // `projects` and `projectCollaborators` is satisfied.
    return await withAuthenticatedSession(
      userId,
      async (db) => {
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
      },
      getGlobalDb(),
    );
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
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const persistenceDir = "./storage/yjs";
const ldb = new LeveldbPersistence(persistenceDir);

// Configure Persistence correctly for y-websocket
setPersistence({
  bindState: async (docName: string, ydoc: Doc) => {
    const persistedYdoc = await ldb.getYDoc(docName);
    const newUpdates = Y.encodeStateAsUpdate(ydoc);
    ldb.storeUpdate(docName, newUpdates);
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));
    ydoc.on("update", (update: Uint8Array) => {
      ldb.storeUpdate(docName, update);
    });
  },
  writeState: async (docName: string, ydoc: Doc) => {
    await ldb.storeUpdate(docName, Y.encodeStateAsUpdate(ydoc));
  },
});

// Initialize Database with fallback mechanism

initDb()
  .then(() => runMigrations())
  .then(() => app.prepare())
  .then(async () => {
    const server = createServer(async (req, res) => {
      try {
        await handle(req, res);
      } catch (err) {
        logger.error({ err, url: req.url }, "Error occurred handling request");
        res.statusCode = 500;
        res.end("internal server error");
      }
    });

    const wss = new WebSocketServer({ noServer: true });
    const shellWss = new WebSocketServer({ noServer: true });
    const nextUpgradeHandler = app.getUpgradeHandler();

    server.on("upgrade", async (request, socket, head) => {
      const origin = request.headers.origin;
      const appUrl = process.env.APP_URL;

      // In production, we expect APP_URL to be set and match the origin
      if (process.env.NODE_ENV === "production" && appUrl) {
        if (!origin || origin !== appUrl) {
          logger.warn(
            { origin, ip: request.socket.remoteAddress },
            "[CSWSH] Blocked WebSocket connection with invalid origin",
          );
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
            shellProjectId: string;
          }
        ).userId = userId;
        (
          request as IncomingMessage & { shellProjectId: string }
        ).shellProjectId = projectId;

        shellWss.handleUpgrade(request, socket, head, (ws) => {
          shellWss.emit("connection", ws, request);
        });
      } else if (pathname?.startsWith("/yjs")) {
        const docName = pathname.split("/").pop() || "default";

        // Security: Validate Authentication and Project Access
        const userId = await validateWebsocketRequest(request, docName);

        if (!userId) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        // Attach userId to request to pass it to connection handler
        (request as IncomingMessage & { userId: string }).userId = userId;

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
      // y-websocket sends room name as the last part of the path: /yjs/room-name
      const { pathname } = new URL(req.url!, `http://${hostname}:${port}`);
      const docName = pathname?.split("/").pop() || "default";

      // Attach userId to websocket instance
      (ws as WebSocket & { userId: string }).userId = (
        req as IncomingMessage & { userId: string }
      ).userId;

      setupWSConnection(ws, req, {
        docName,
        gc: true,
      });

      ws.on("close", () => {
        const doc = docs.get(docName);
        if (doc && doc.conns.size === 0) {
          // If this was the last connection, destroy the doc and remove from map
          setTimeout(async () => {
            const currentDoc = docs.get(docName);
            if (currentDoc && currentDoc.conns.size === 0) {
              // Compact document: clear history and save snapshot
              try {
                const snapshot = Y.encodeStateAsUpdate(currentDoc);
                // Ensure we don't lose data if clear fails, but ldb.clearDocument is standard in y-leveldb
                await ldb.clearDocument(docName);
                await ldb.storeUpdate(docName, snapshot);
              } catch (err) {
                logger.error(
                  { err, docName },
                  "[Compaction] Failed to compact document",
                );
              }

              currentDoc.destroy();
              docs.delete(docName);
            }
          }, 600000);
        }
      });
    });

    shellWss.on("connection", (ws, req) => {
      const typedReq = req as IncomingMessage & {
        userId: string;
        shellProjectId: string;
      };
      handleShellConnection(ws, typedReq.userId, typedReq.shellProjectId);
    });

    server.listen(port, () => {
      logger.info(`> Ready on http://${hostname}:${port}`);
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  });
