import { classifyError, Pattern } from "./classifyError";

export type IndexedDbErrorClassification = {
  reason: string;
  hint: string;
};

const PATTERNS: Pattern[] = [
  {
    regex:
      /allocation size overflow|quotaexceeded|quota exceeded|storage quota|exceeded/gi,
    reason: "allocation_size_overflow",
    hint: "IndexedDB write exceeded available storage quota.",
  },
  {
    regex:
      /unexpected token|unexpected end of input|json|syntax error|parse error/gi,
    reason: "json_parse_error",
    hint: "Malformed JSON stored in IndexedDB or during serialization.",
  },
  {
    regex:
      /payload|entity too large|413|request too large|max size|size exceeded/gi,
    reason: "payload_too_large",
    hint: "Attempted to persist a payload larger than allowed.",
  },
];

export function classifyIndexedDbError(
  err: unknown,
): IndexedDbErrorClassification {
  return classifyError(
    err,
    PATTERNS,
    "unknown_indexeddb_error",
    "Unhandled IndexedDB error; check browser storage state.",
  );
}

export default classifyIndexedDbError;
