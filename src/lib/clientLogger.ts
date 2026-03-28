const LEVELS: Record<string, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const nodeProcess = typeof process !== "undefined" ? process : undefined;
const envLevel = nodeProcess?.env?.NEXT_PUBLIC_LOG_LEVEL;
const defaultLevel =
  envLevel || (nodeProcess?.env?.NODE_ENV === "development" ? "debug" : "info");
const currentLevelValue = LEVELS[defaultLevel] ?? LEVELS.info;

function shouldLog(level: string) {
  const v = LEVELS[level] ?? LEVELS.info;
  return v >= currentLevelValue;
}

const REDACT_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  { regex: /project-[0-9a-z-]+/gi, replacement: "<REDACTED_PROJECT_ID>" },
  {
    regex: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    replacement: "<REDACTED_UUID>",
  },
  {
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: "<REDACTED_EMAIL>",
  },
  { regex: /\b[0-9a-f]{16,}\b/gi, replacement: "<REDACTED_HEX>" },
  { regex: /([A-Za-z0-9+/=]{40,})/g, replacement: "<REDACTED_TOKEN>" },
];

function sanitizeString(s: string): string {
  try {
    let out = s;
    for (const p of REDACT_PATTERNS) {
      out = out.replace(p.regex, p.replacement);
    }
    if (out.length > 2000) {
      out = out.slice(0, 2000) + "...<TRUNCATED>";
    }
    return out;
  } catch {
    return "<UNREDACTABLE>";
  }
}

function sanitizeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "string") return sanitizeString(value as string);
  if (t === "number" || t === "boolean" || t === "bigint") return value;
  if (t === "function") return "<FUNCTION>";
  if (t === "symbol") return "<SYMBOL>";
  if (Array.isArray(value)) {
    if (seen.has(value as object)) return "<CIRCULAR>";
    seen.add(value as object);
    return (value as unknown[]).map((v) => sanitizeValue(v, seen));
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message || ""),
      stack: sanitizeString(value.stack || ""),
    };
  }
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj as object)) return "<CIRCULAR>";
    seen.add(obj as object);
    const out: Record<string, unknown> = {};
    for (const k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        try {
          out[k] = sanitizeValue(obj[k], seen);
        } catch {
          out[k] = "<UNSERIALIZABLE>";
        }
      }
    }
    return out;
  }
  try {
    return String(value);
  } catch {
    return "<UNSERIALIZABLE>";
  }
}

function sanitizeArgs(args: unknown[]): unknown[] {
  try {
    return args.map((a) => sanitizeValue(a));
  } catch {
    return ["<SANITIZATION_ERROR>"];
  }
}

export const clientLogger = {
  debug: (...args: unknown[]) => {
    if (shouldLog("debug")) console.debug(...sanitizeArgs(args));
  },
  info: (...args: unknown[]) => {
    if (shouldLog("info")) console.info(...sanitizeArgs(args));
  },
  warn: (...args: unknown[]) => {
    if (shouldLog("warn")) console.warn(...sanitizeArgs(args));
  },
  error: (...args: unknown[]) => {
    if (shouldLog("error")) console.error(...sanitizeArgs(args));
  },
  sanitize: (value: unknown) => sanitizeValue(value),
};

export default clientLogger;
