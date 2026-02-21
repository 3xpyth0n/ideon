import { createServer, IncomingMessage } from "http";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { createRequire } from "module";
import type { Doc } from "yjs";
import { logger } from "./app/lib/logger";
import { initDb, getDb } from "./app/lib/db";
import { runMigrations } from "@/lib/migrations";
import { validateWebsocketRequest } from "./app/lib/ws-auth";

const require = createRequire(import.meta.url);
const Y = require("yjs");

const {
  setupWSConnection,
  docs,
  setPersistence,
} = require("y-websocket/bin/utils");
const { LeveldbPersistence } = require("y-leveldb");

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

      const { pathname } = new URL(request.url!, `http://${hostname}:${port}`);

      if (pathname?.startsWith("/yjs")) {
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

    server.listen(port, () => {
      logger.info(`> Ready on http://${hostname}:${port}`);
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  });
