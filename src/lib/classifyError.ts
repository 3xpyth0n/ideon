import { getMessage } from "./getMessage";

export type Classification = { reason: string; hint: string };
export type Pattern = { regex: RegExp; reason: string; hint: string };

export function classifyError(
  err: unknown,
  patterns: Pattern[],
  defaultReason = "unknown_error",
  defaultHint = "Unhandled error; check logs for details.",
): Classification {
  const msg = String(getMessage(err) || "").toLowerCase();
  for (const p of patterns) {
    try {
      if (p.regex.test(msg)) return { reason: p.reason, hint: p.hint };
    } catch {
      // ignore invalid pattern
    }
  }
  return { reason: defaultReason, hint: defaultHint };
}

export function createClassifier(
  patterns: Pattern[],
  defaultReason?: string,
  defaultHint?: string,
) {
  return (err: unknown) =>
    classifyError(err, patterns, defaultReason, defaultHint);
}

export default classifyError;
