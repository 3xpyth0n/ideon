import { classifyError, Pattern } from "./classifyError";

const PATTERNS: Pattern[] = [
  {
    regex: /timeout|abort|failed to fetch|network|econnreset/gi,
    reason: "network_error",
    hint: "Request timed out or failed due to network issues.",
  },
  {
    regex:
      /unexpected token|unexpected end of input|json|syntax error|parse error/gi,
    reason: "json_parse_error",
    hint: "Malformed JSON in request or response.",
  },
  {
    regex:
      /payload|entity too large|413|request too large|max size|size exceeded/gi,
    reason: "payload_too_large",
    hint: "Payload exceeds server size limits.",
  },
  {
    regex: /401|unauthorized|403|forbidden/gi,
    reason: "auth_error",
    hint: "Authentication or authorization failed.",
  },
  {
    regex: /validation|schema|zod/gi,
    reason: "validation_error",
    hint: "Payload failed server-side validation.",
  },
];

export function classifySaveError(err: unknown) {
  return classifyError(
    err,
    PATTERNS,
    "unknown_error",
    "Unhandled error; check server logs for details.",
  );
}

export default classifySaveError;
