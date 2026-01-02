import { createServer } from "http";
import next from "next";
import { WebSocketServer } from "ws";
import { createRequire } from "module";
import type { Doc } from "yjs";
import { logger } from "./app/lib/logger";
import { initDb } from "./app/lib/db";
import { runMigrations } from "@/lib/migrations";

const require = createRequire(import.meta.url);
const Y = require("yjs");

const {
  setupWSConnection,
  docs,
  setPersistence,
} = require("y-websocket/bin/utils");
const { LeveldbPersistence } = require("y-leveldb");

const dev = process.env.NODE_ENV === "development";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.APP_PORT || "3000", 10);
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

    server.on("upgrade", (request, socket, head) => {
      const { pathname } = new URL(request.url!, `http://${hostname}:${port}`);

      if (pathname?.startsWith("/yjs")) {
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

      setupWSConnection(ws, req, {
        docName,
        gc: true,
      });

      ws.on("close", () => {
        const doc = docs.get(docName);
        if (doc && doc.conns.size === 0) {
          // If this was the last connection, destroy the doc and remove from map
          // Increased timeout to 10 minutes to reduce reload frequency
          setTimeout(async () => {
            const currentDoc = docs.get(docName);
            if (currentDoc && currentDoc.conns.size === 0) {
              logger.info(
                { docName },
                "[Cleanup] Compacting and destroying document to free memory.",
              );

              // Compact document: clear history and save snapshot
              try {
                const snapshot = Y.encodeStateAsUpdate(currentDoc);
                // Ensure we don't lose data if clear fails, but ldb.clearDocument is standard in y-leveldb
                await ldb.clearDocument(docName);
                await ldb.storeUpdate(docName, snapshot);
                logger.info({ docName }, "[Compaction] Compacted document");
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
