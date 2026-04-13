"use client";

const CHUNK_MAGIC = [0x49, 0x44, 0x43, 0x48] as const;
const CHUNK_HEADER_BYTES = 14;

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? `${fallback}`, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const CHUNK_PAYLOAD_BYTES = parsePositiveInt(
  process.env.NEXT_PUBLIC_YJS_WS_CHUNK_PAYLOAD_BYTES,
  524288,
);
const CHUNK_THRESHOLD_BYTES = parsePositiveInt(
  process.env.NEXT_PUBLIC_YJS_WS_CHUNK_THRESHOLD_BYTES,
  2097152,
);
const CHUNK_TTL_MS = parsePositiveInt(
  process.env.NEXT_PUBLIC_YJS_WS_CHUNK_TTL_MS,
  15000,
);

type ChunkAssembly = {
  createdAt: number;
  chunkCount: number;
  parts: Map<number, Uint8Array>;
  totalBytes: number;
};

let chunkMessageId = 1;

const nextChunkMessageId = () => {
  const id = chunkMessageId;
  chunkMessageId = (chunkMessageId + 1) >>> 0;
  if (chunkMessageId === 0) {
    chunkMessageId = 1;
  }
  return id;
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
    ((frame[6] << 24) | (frame[7] << 16) | (frame[8] << 8) | frame[9]) >>> 0;
  const chunkIndex = (frame[10] << 8) | frame[11];
  const chunkCount = (frame[12] << 8) | frame[13];
  if (chunkCount <= 0 || chunkIndex >= chunkCount) {
    return null;
  }
  const payload = frame.subarray(CHUNK_HEADER_BYTES);
  return { messageId, chunkIndex, chunkCount, payload };
};

const asUint8Array = (data: ArrayBufferLike | ArrayBufferView) => {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return view;
  }
  return new Uint8Array(data);
};

const toArrayBuffer = (data: Uint8Array): ArrayBuffer => {
  const copied = new Uint8Array(data);
  return copied.buffer;
};

const splitMessageIntoFrames = (message: Uint8Array): Uint8Array[] => {
  if (message.byteLength <= CHUNK_THRESHOLD_BYTES) {
    return [message];
  }

  const messageId = nextChunkMessageId();
  const chunkCount = Math.ceil(message.byteLength / CHUNK_PAYLOAD_BYTES);
  if (chunkCount > 0xffff) {
    // The frame header stores chunkCount in 16 bits, so larger messages must fall back to the unchunked payload to preserve the wire format.
    return [message];
  }

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

const toMessageData = (eventData: unknown): Uint8Array | null => {
  if (eventData instanceof ArrayBuffer) {
    return new Uint8Array(eventData);
  }
  if (ArrayBuffer.isView(eventData)) {
    return new Uint8Array(
      eventData.buffer,
      eventData.byteOffset,
      eventData.byteLength,
    );
  }
  return null;
};

export class ChunkedWebSocket {
  static readonly CONNECTING = WebSocket.CONNECTING;
  static readonly OPEN = WebSocket.OPEN;
  static readonly CLOSING = WebSocket.CLOSING;
  static readonly CLOSED = WebSocket.CLOSED;

  readonly url: string;
  readonly protocol: string;
  readonly extensions: string;

  onopen: ((this: WebSocket, ev: Event) => unknown) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;
  onerror: ((this: WebSocket, ev: Event) => unknown) | null = null;
  onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null;

  private readonly socket: WebSocket;
  private readonly listeners = new Map<
    string,
    Set<EventListenerOrEventListenerObject>
  >();
  private readonly assemblies = new Map<number, ChunkAssembly>();

  constructor(url: string | URL, protocols?: string | string[]) {
    this.socket = new WebSocket(url, protocols);
    this.socket.binaryType = "arraybuffer";

    this.url = this.socket.url;
    this.protocol = this.socket.protocol;
    this.extensions = this.socket.extensions;

    this.socket.addEventListener("open", (event) => {
      this.emit("open", event);
    });

    this.socket.addEventListener("error", (event) => {
      this.emit("error", event);
    });

    this.socket.addEventListener("close", (event) => {
      this.assemblies.clear();
      this.emit("close", event);
    });

    this.socket.addEventListener("message", (event) => {
      const data = toMessageData(event.data);
      if (!data || !isChunkFrame(data)) {
        this.emit("message", event);
        return;
      }

      const decoded = decodeChunkFrame(data);
      if (!decoded) {
        return;
      }

      const now = Date.now();
      for (const [messageId, assembly] of this.assemblies.entries()) {
        if (now - assembly.createdAt > CHUNK_TTL_MS) {
          this.assemblies.delete(messageId);
        }
      }

      let assembly = this.assemblies.get(decoded.messageId);
      if (!assembly) {
        assembly = {
          createdAt: now,
          chunkCount: decoded.chunkCount,
          parts: new Map<number, Uint8Array>(),
          totalBytes: 0,
        };
        this.assemblies.set(decoded.messageId, assembly);
      }

      if (assembly.chunkCount !== decoded.chunkCount) {
        this.assemblies.delete(decoded.messageId);
        return;
      }

      if (!assembly.parts.has(decoded.chunkIndex)) {
        assembly.parts.set(decoded.chunkIndex, decoded.payload);
        assembly.totalBytes += decoded.payload.byteLength;
      }

      if (assembly.parts.size !== assembly.chunkCount) {
        return;
      }

      const merged = new Uint8Array(assembly.totalBytes);
      let offset = 0;
      for (let index = 0; index < assembly.chunkCount; index += 1) {
        const part = assembly.parts.get(index);
        if (!part) {
          this.assemblies.delete(decoded.messageId);
          return;
        }
        merged.set(part, offset);
        offset += part.byteLength;
      }

      this.assemblies.delete(decoded.messageId);
      this.emit(
        "message",
        new MessageEvent("message", {
          data: merged.buffer.slice(
            merged.byteOffset,
            merged.byteOffset + merged.byteLength,
          ),
        }),
      );
    });
  }

  get readyState() {
    return this.socket.readyState;
  }

  get bufferedAmount() {
    return this.socket.bufferedAmount;
  }

  get binaryType() {
    return this.socket.binaryType;
  }

  set binaryType(value: BinaryType) {
    this.socket.binaryType = value;
  }

  close(code?: number, reason?: string) {
    this.socket.close(code, reason);
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    if (typeof data === "string" || data instanceof Blob) {
      this.socket.send(data);
      return;
    }

    const payload = asUint8Array(data);
    const frames = splitMessageIntoFrames(payload);
    for (const frame of frames) {
      this.socket.send(toArrayBuffer(frame));
    }
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set<EventListenerOrEventListenerObject>();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ) {
    const set = this.listeners.get(type);
    set?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    this.emit(event.type, event);
    return true;
  }

  private emit(type: string, event: Event) {
    switch (type) {
      case "open":
        this.onopen?.call(this.socket, event);
        break;
      case "message":
        this.onmessage?.call(this.socket, event as MessageEvent);
        break;
      case "error":
        this.onerror?.call(this.socket, event);
        break;
      case "close":
        this.onclose?.call(this.socket, event as CloseEvent);
        break;
      default:
        break;
    }

    const set = this.listeners.get(type);
    if (!set) {
      return;
    }
    for (const listener of set) {
      if (typeof listener === "function") {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    }
  }
}
