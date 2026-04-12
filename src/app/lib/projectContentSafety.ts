import * as Y from "yjs";

export const MAX_BLOCK_CONTENT_LENGTH = 1_000_000;
export const CLIENT_TRUNCATION_SUFFIX = "\n\n[Truncated for performance]";
export const SERVER_REPAIR_CONTENT_SUFFIX =
  "\n\n[... Truncated by server due to excessive size ...]";

type SafeYText = {
  length: number;
  toString(): string;
};

export function clampBlockContent(
  value: string,
  maxLength = MAX_BLOCK_CONTENT_LENGTH,
  suffix = CLIENT_TRUNCATION_SUFFIX,
): string {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength) + suffix;
}

export function safeReadYText(
  yText: SafeYText | undefined,
  fallback: unknown = "",
  maxLength = MAX_BLOCK_CONTENT_LENGTH,
): string {
  const fallbackText =
    typeof fallback === "string" ? clampBlockContent(fallback, maxLength) : "";

  if (!yText) {
    return fallbackText;
  }

  if (yText.length > maxLength) {
    return fallbackText;
  }

  try {
    return clampBlockContent(yText.toString(), maxLength);
  } catch {
    return fallbackText;
  }
}

export function syncYTextValue(
  yText: Y.Text | undefined,
  value: string,
  maxLength = MAX_BLOCK_CONTENT_LENGTH,
): string {
  const nextValue = clampBlockContent(value, maxLength);

  if (!yText) {
    return nextValue;
  }

  let current: string;
  try {
    current = yText.toString();
  } catch (error) {
    console.warn(error);
    const apply = () => {
      yText.delete(0, yText.length);
      yText.insert(0, nextValue);
    };
    if (yText.doc) {
      yText.doc.transact(apply, yText.doc.clientID);
    } else {
      apply();
    }
    return nextValue;
  }

  if (current === nextValue) {
    return nextValue;
  }

  // Compute minimal changed range to avoid creating tombstones for unchanged characters
  let start = 0;
  const minLen = Math.min(current.length, nextValue.length);
  while (start < minLen && current[start] === nextValue[start]) {
    start++;
  }

  let endCurrent = current.length;
  let endNext = nextValue.length;
  while (
    endCurrent > start &&
    endNext > start &&
    current[endCurrent - 1] === nextValue[endNext - 1]
  ) {
    endCurrent--;
    endNext--;
  }

  const deleteCount = endCurrent - start;
  const insertText = nextValue.slice(start, endNext);

  const apply = () => {
    if (deleteCount > 0) {
      yText.delete(start, deleteCount);
    }
    if (insertText.length > 0) {
      yText.insert(start, insertText);
    }
  };

  if (yText.doc) {
    yText.doc.transact(apply, yText.doc.clientID);
  } else {
    apply();
  }

  return nextValue;
}

function truncateYTextInPlace(
  yText: Y.Text,
  maxLength = MAX_BLOCK_CONTENT_LENGTH,
  suffix = SERVER_REPAIR_CONTENT_SUFFIX,
): boolean {
  if (yText.length <= maxLength) {
    return false;
  }

  yText.delete(maxLength, yText.length - maxLength);
  yText.insert(yText.length, suffix);
  return true;
}

export function sanitizeProjectDocument(
  doc: Y.Doc,
  maxLength = MAX_BLOCK_CONTENT_LENGTH,
): boolean {
  let hasChanges = false;

  doc.transact(() => {
    const contents = doc.getMap<unknown>("contents");
    contents.forEach((value) => {
      if (value instanceof Y.Text) {
        hasChanges = truncateYTextInPlace(value, maxLength) || hasChanges;
      }
    });

    const blocks = doc.getMap<unknown>("blocks");
    blocks.forEach((value, key) => {
      if (!value || typeof value !== "object") {
        return;
      }

      const block = value as {
        data?: {
          content?: unknown;
          [key: string]: unknown;
        };
        [key: string]: unknown;
      };

      const content = block.data?.content;
      if (typeof content !== "string" || content.length <= maxLength) {
        return;
      }

      blocks.set(key, {
        ...block,
        data: {
          ...block.data,
          content: clampBlockContent(
            content,
            maxLength,
            SERVER_REPAIR_CONTENT_SUFFIX,
          ),
        },
      });
      hasChanges = true;
    });
  }, "project-content-safety");

  return hasChanges;
}

export function estimateProjectTextLength(doc: Y.Doc): number {
  let total = 0;
  const contents = doc.getMap<unknown>("contents");

  if (contents.size > 0) {
    contents.forEach((value) => {
      if (value instanceof Y.Text) {
        total += value.length;
      }
    });
    return total;
  }

  const blocks = doc.getMap<unknown>("blocks");
  blocks.forEach((value) => {
    if (!value || typeof value !== "object") {
      return;
    }

    const content = (value as { data?: { content?: unknown } }).data?.content;
    if (typeof content === "string") {
      total += content.length;
    }
  });

  return total;
}
