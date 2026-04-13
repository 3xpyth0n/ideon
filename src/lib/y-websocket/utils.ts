import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as map from "lib0/map";
import debounce from "lodash.debounce";
import { callbackHandler, isCallbackSet } from "./callback";
import { IncomingMessage } from "http";
import { RawData, WebSocket } from "ws";
import { LeveldbPersistence } from "y-leveldb";
import { logger } from "../../app/lib/logger";

const CALLBACK_DEBOUNCE_WAIT = process.env.CALLBACK_DEBOUNCE_WAIT
  ? parseInt(process.env.CALLBACK_DEBOUNCE_WAIT)
  : 2000;
const CALLBACK_DEBOUNCE_MAXWAIT = process.env.CALLBACK_DEBOUNCE_MAXWAIT
  ? parseInt(process.env.CALLBACK_DEBOUNCE_MAXWAIT)
  : 10000;

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;

const getPositiveIntEnv = (name: string, fallback: number) => {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const DEFAULT_PROJECT_WS_MESSAGE_BYTES = 16 * 1024 * 1024;
const MAX_WS_MESSAGE_BYTES = getPositiveIntEnv(
  "YJS_MAX_SYNC_MESSAGE_BYTES",
  DEFAULT_PROJECT_WS_MESSAGE_BYTES,
);
export const CHUNK_PROTOCOL_MAGIC = [0x49, 0x44, 0x43, 0x48] as const;
export const CHUNK_PROTOCOL_HEADER_BYTES =
  CHUNK_PROTOCOL_MAGIC.length + 2 + 4 + 2 + 2;
const CHUNK_MAGIC = CHUNK_PROTOCOL_MAGIC;
const CHUNK_HEADER_BYTES = CHUNK_PROTOCOL_HEADER_BYTES;
const CHUNK_PAYLOAD_BYTES = getPositiveIntEnv(
  "YJS_WS_CHUNK_PAYLOAD_BYTES",
  512 * 1024,
);
const CHUNK_THRESHOLD_BYTES = getPositiveIntEnv(
  "YJS_WS_CHUNK_THRESHOLD_BYTES",
  2 * 1024 * 1024,
);
const CHUNK_TTL_MS = getPositiveIntEnv("YJS_WS_CHUNK_TTL_MS", 15000);

type ChunkAssembly = {
  createdAt: number;
  chunkCount: number;
  parts: Map<number, Uint8Array>;
  totalBytes: number;
};

const inboundChunkAssemblies = new WeakMap<
  WebSocket,
  Map<number, ChunkAssembly>
>();
let chunkMessageId = 1;

const nextChunkMessageId = () => {
  const id = chunkMessageId;
  chunkMessageId = (chunkMessageId + 1) >>> 0;
  if (chunkMessageId === 0) {
    chunkMessageId = 1;
  }
  return id;
};

const asUint8Array = (raw: RawData): Uint8Array => {
  if (raw instanceof Uint8Array) {
    return raw;
  }
  if (raw instanceof ArrayBuffer) {
    return new Uint8Array(raw);
  }
  if (Array.isArray(raw)) {
    const total = raw.reduce((sum, part) => sum + part.byteLength, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const part of raw) {
      const view = new Uint8Array(
        part.buffer,
        part.byteOffset,
        part.byteLength,
      );
      merged.set(view, offset);
      offset += view.byteLength;
    }
    return merged;
  }
  return new Uint8Array(0);
};

const isChunkFrame = (data: Uint8Array) =>
  data.byteLength >= CHUNK_HEADER_BYTES &&
  data[0] === CHUNK_MAGIC[0] &&
  data[1] === CHUNK_MAGIC[1] &&
  data[2] === CHUNK_MAGIC[2] &&
  data[3] === CHUNK_MAGIC[3];

const encodeChunkFrame = (
  messageId: number,
  chunkIndex: number,
  chunkCount: number,
  payload: Uint8Array,
) => {
  const frame = new Uint8Array(CHUNK_HEADER_BYTES + payload.byteLength);
  frame[0] = CHUNK_MAGIC[0];
  frame[1] = CHUNK_MAGIC[1];
  frame[2] = CHUNK_MAGIC[2];
  frame[3] = CHUNK_MAGIC[3];
  // Header bytes 4 and 5 store the protocol version and a reserved byte.
  frame[4] = 1;
  frame[5] = 0;
  frame[6] = (messageId >>> 24) & 0xff;
  frame[7] = (messageId >>> 16) & 0xff;
  frame[8] = (messageId >>> 8) & 0xff;
  frame[9] = messageId & 0xff;
  frame[10] = (chunkIndex >>> 8) & 0xff;
  frame[11] = chunkIndex & 0xff;
  frame[12] = (chunkCount >>> 8) & 0xff;
  frame[13] = chunkCount & 0xff;
  frame.set(payload, CHUNK_HEADER_BYTES);
  return frame;
};

const decodeChunkFrame = (frame: Uint8Array) => {
  const version = frame[4];
  if (version !== 1) {
    return null;
  }
  const messageId =
    (frame[6] << 24) | (frame[7] << 16) | (frame[8] << 8) | frame[9];
  const chunkIndex = (frame[10] << 8) | frame[11];
  const chunkCount = (frame[12] << 8) | frame[13];
  if (chunkCount <= 0 || chunkIndex >= chunkCount) {
    return null;
  }
  const payload = frame.subarray(CHUNK_HEADER_BYTES);
  return { messageId: messageId >>> 0, chunkIndex, chunkCount, payload };
};

const splitMessageIntoFrames = (message: Uint8Array): Uint8Array[] => {
  if (message.byteLength <= CHUNK_THRESHOLD_BYTES) {
    return [message];
  }

  const messageId = nextChunkMessageId();
  const chunkCount = Math.ceil(message.byteLength / CHUNK_PAYLOAD_BYTES);
  const frames: Uint8Array[] = [];
  for (let index = 0; index < chunkCount; index += 1) {
    const start = index * CHUNK_PAYLOAD_BYTES;
    const end = Math.min(start + CHUNK_PAYLOAD_BYTES, message.byteLength);
    frames.push(
      encodeChunkFrame(
        messageId,
        index,
        chunkCount,
        message.subarray(start, end),
      ),
    );
  }
  return frames;
};

const readChunkedMessages = (
  conn: WebSocket,
  frame: Uint8Array,
): Uint8Array[] => {
  if (!isChunkFrame(frame)) {
    return [frame];
  }

  const decoded = decodeChunkFrame(frame);
  if (!decoded) {
    return [];
  }

  let assemblies = inboundChunkAssemblies.get(conn);
  if (!assemblies) {
    assemblies = new Map<number, ChunkAssembly>();
    inboundChunkAssemblies.set(conn, assemblies);
  }

  const now = Date.now();
  for (const [messageId, assembly] of assemblies.entries()) {
    if (now - assembly.createdAt > CHUNK_TTL_MS) {
      assemblies.delete(messageId);
    }
  }

  let assembly = assemblies.get(decoded.messageId);
  if (!assembly) {
    assembly = {
      createdAt: now,
      chunkCount: decoded.chunkCount,
      parts: new Map<number, Uint8Array>(),
      totalBytes: 0,
    };
    assemblies.set(decoded.messageId, assembly);
  }

  if (assembly.chunkCount !== decoded.chunkCount) {
    assemblies.delete(decoded.messageId);
    return [];
  }

  if (!assembly.parts.has(decoded.chunkIndex)) {
    assembly.parts.set(decoded.chunkIndex, decoded.payload);
    assembly.totalBytes += decoded.payload.byteLength;
  }

  if (assembly.totalBytes > MAX_WS_MESSAGE_BYTES) {
    assemblies.delete(decoded.messageId);
    return [];
  }

  if (assembly.parts.size !== assembly.chunkCount) {
    return [];
  }

  const message = new Uint8Array(assembly.totalBytes);
  let offset = 0;
  for (let index = 0; index < assembly.chunkCount; index += 1) {
    const part = assembly.parts.get(index);
    if (!part) {
      assemblies.delete(decoded.messageId);
      return [];
    }
    message.set(part, offset);
    offset += part.byteLength;
  }

  assemblies.delete(decoded.messageId);
  return [message];
};

// disable gc when using snapshots!
const gcEnabled = process.env.GC !== "false" && process.env.GC !== "0";
const persistenceDir = process.env.YPERSISTENCE;

export interface Persistence {
  bindState: (docName: string, ydoc: WSSharedDoc) => Promise<void>;
  writeState: (docName: string, ydoc: WSSharedDoc) => Promise<unknown>;
  provider?: unknown;
}

let persistence: Persistence | null = null;

if (typeof persistenceDir === "string") {
  logger.info(
    { persistenceDir },
    `[YJS] Persisting documents to directory: ${persistenceDir}`,
  );
  const ldb = new LeveldbPersistence(persistenceDir);
  persistence = {
    provider: ldb,
    bindState: async (docName: string, ydoc: WSSharedDoc) => {
      const persistedYdoc = await ldb.getYDoc(docName);
      const newUpdates = Y.encodeStateAsUpdate(ydoc);
      ldb.storeUpdate(docName, newUpdates);
      Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));
      ydoc.on("update", (update: Uint8Array) => {
        ldb.storeUpdate(docName, update);
      });
    },
    writeState: async (docName: string, ydoc: WSSharedDoc) => {
      await ldb.writeState(docName, ydoc);
    },
  };
}

export const setPersistence = (persistence_: Persistence | null) => {
  persistence = persistence_;
};

export const getPersistence = () => persistence;

export const docs = new Map<string, WSSharedDoc>();

const messageSync = 0;
const messageAwareness = 1;
// const messageAuth = 2

const updateHandler = (update: Uint8Array, origin: unknown, doc: Y.Doc) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);
  (doc as WSSharedDoc).conns.forEach((_, conn) =>
    send(doc as WSSharedDoc, conn, message),
  );
};

export class WSSharedDoc extends Y.Doc {
  name: string;
  conns: Map<WebSocket, Set<number>>;
  awareness: awarenessProtocol.Awareness;
  createdAt: number;

  constructor(name: string) {
    super({ gc: gcEnabled });
    this.name = name;
    this.conns = new Map();
    this.awareness = new awarenessProtocol.Awareness(this);
    this.createdAt = Date.now();
    this.awareness.setLocalState(null);

    const awarenessChangeHandler = (
      {
        added,
        updated,
        removed,
      }: { added: number[]; updated: number[]; removed: number[] },
      conn: WebSocket | null,
    ) => {
      const changedClients = added.concat(updated, removed);
      if (conn !== null) {
        const connControlledIDs = this.conns.get(conn);
        if (connControlledIDs !== undefined) {
          added.forEach((clientID) => {
            connControlledIDs.add(clientID);
          });
          removed.forEach((clientID) => {
            connControlledIDs.delete(clientID);
          });
        }
      }
      // broadcast awareness update
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients),
      );
      const buff = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => {
        send(this, c, buff);
      });
    };
    this.awareness.on("update", awarenessChangeHandler);
    this.on("update", updateHandler);
    if (isCallbackSet) {
      this.on(
        "update",
        debounce(callbackHandler, CALLBACK_DEBOUNCE_WAIT, {
          maxWait: CALLBACK_DEBOUNCE_MAXWAIT,
        }) as unknown as (
          update: Uint8Array,
          origin: unknown,
          doc: Y.Doc,
          tr: Y.Transaction,
        ) => void,
      );
    }
  }
}

export const getYDoc = (docname: string, gc = true): WSSharedDoc =>
  map.setIfUndefined(docs, docname, () => {
    const doc = new WSSharedDoc(docname);
    doc.gc = gc;
    if (persistence !== null) {
      persistence.bindState(docname, doc);
    }
    docs.set(docname, doc);
    return doc;
  });

const messageListener = (
  conn: WebSocket,
  doc: WSSharedDoc,
  message: Uint8Array,
) => {
  try {
    if (
      doc.name.startsWith("project-") &&
      message.byteLength > MAX_WS_MESSAGE_BYTES
    ) {
      logger.warn(
        { doc: doc.name, messageBytes: message.byteLength },
        "[YJS] Rejecting oversized sync message",
      );
      try {
        conn.close(1009, "Sync message too large");
      } catch {
        closeConn(doc, conn);
      }
      return;
    }

    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case messageSync:
        // Enforce server-side permission: only allow sync/update messages from
        // connections that have an explicit write-capable role.
        try {
          const connRole = (conn as WebSocket & { userRole?: string }).userRole;
          if (connRole === undefined || connRole === null) {
            logger.error(
              { doc: doc.name },
              "[YJS] Sync message from connection without userRole — closing",
            );
            try {
              conn.close(4001, "Missing user role");
            } catch {
              // ignore
            }
            return;
          }

          const canWrite =
            connRole === "owner" ||
            connRole === "admin" ||
            connRole === "editor";

          if (!canWrite) {
            logger.info(
              { role: connRole },
              "[YJS] Ignoring sync message from read-only connection",
            );
            return;
          }
        } catch (e) {
          logger.error({ err: e }, "[YJS] Failed to check connection role");
          return;
        }

        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);

        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder));
        }
        break;
      case messageAwareness: {
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness,
          decoding.readVarUint8Array(decoder),
          conn,
        );
        break;
      }
    }
  } catch (err) {
    logger.error({ err }, "[YJS] message handling error");
  }
};

const closeConn = (doc: WSSharedDoc, conn: WebSocket) => {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn);
    doc.conns.delete(conn);
    if (controlledIds) {
      awarenessProtocol.removeAwarenessStates(
        doc.awareness,
        Array.from(controlledIds),
        null,
      );
    }
    if (doc.conns.size === 0 && persistence !== null) {
      persistence.writeState(doc.name, doc).then(() => {
        doc.destroy();
      });
      docs.delete(doc.name);
    }
  }
  inboundChunkAssemblies.delete(conn);
  conn.close();
};

const send = (doc: WSSharedDoc, conn: WebSocket, m: Uint8Array) => {
  if (doc.name.startsWith("project-") && m.byteLength > MAX_WS_MESSAGE_BYTES) {
    logger.warn(
      { doc: doc.name, messageBytes: m.byteLength },
      "[YJS] Skipping oversized sync payload",
    );
    return;
  }

  if (
    conn.readyState !== wsReadyStateConnecting &&
    conn.readyState !== wsReadyStateOpen
  ) {
    closeConn(doc, conn);
  }
  try {
    const frames = splitMessageIntoFrames(m);
    for (const frame of frames) {
      conn.send(frame, (err) => {
        if (err) closeConn(doc, conn);
      });
    }
  } catch {
    closeConn(doc, conn);
  }
};

const pingTimeout = 30000;

export const setupWSConnection = (
  conn: WebSocket,
  req: IncomingMessage,
  {
    docName = req.url!.slice(1).split("?")[0],
    gc = true,
  }: { docName?: string; gc?: boolean } = {},
) => {
  conn.binaryType = "arraybuffer";
  const doc = getYDoc(docName, gc);
  doc.conns.set(conn, new Set());

  try {
    const connRole = (conn as WebSocket & { userRole?: string }).userRole;
    if (connRole === undefined || connRole === null) {
      logger.error(
        { docName, conn: (conn as unknown as { url?: string }).url },
        "[YJS] Rejecting WS connection without userRole attached",
      );
      try {
        conn.close(4001, "Missing user role");
      } catch {
        // ignore
      }
      return;
    }
  } catch (e) {
    logger.error({ err: e }, "[YJS] Failed to validate connection role");
    try {
      conn.close(4001, "Invalid connection");
    } catch {
      // ignore
    }
    return;
  }

  conn.on("message", (message: RawData) => {
    const rawFrame = asUint8Array(message);
    const completeMessages = readChunkedMessages(conn, rawFrame);
    for (const completeMessage of completeMessages) {
      messageListener(conn, doc, completeMessage);
    }
  });

  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) {
        closeConn(doc, conn);
      }
      clearInterval(pingInterval);
    } else if (doc.conns.has(conn)) {
      pongReceived = false;
      try {
        conn.ping();
      } catch {
        closeConn(doc, conn);
        clearInterval(pingInterval);
      }
    }
  }, pingTimeout);
  conn.on("close", () => {
    closeConn(doc, conn);
    clearInterval(pingInterval);
  });
  conn.on("error", (err) => {
    logger.warn({ err, docName }, "[YJS] WS connection error");
    closeConn(doc, conn);
    clearInterval(pingInterval);
  });
  conn.on("pong", () => {
    pongReceived = true;
  });

  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(doc, conn, encoding.toUint8Array(encoder));
    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(
          doc.awareness,
          Array.from(awarenessStates.keys()),
        ),
      );
      send(doc, conn, encoding.toUint8Array(encoder));
    }
  }
};
