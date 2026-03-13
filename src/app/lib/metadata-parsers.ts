export type JsonRecord = Record<string, unknown>;

export interface ChecklistItemMetadata {
  id: string;
  text: string;
  checked: boolean;
  depth?: number;
}

export interface ContactMetadataShape {
  name: string;
  phone: string;
  email: string;
  note: string;
}

export interface FolderMetadataShape {
  isCollapsed: boolean;
}

const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseJsonRecord = (raw: unknown): JsonRecord => {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") {
        try {
          const reparsed = JSON.parse(parsed);
          return isJsonRecord(reparsed) ? reparsed : {};
        } catch {
          return {};
        }
      }
      return isJsonRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  if (isJsonRecord(raw)) return raw;
  return {};
};

export const parseOptionalJsonRecord = (raw: unknown): JsonRecord | null => {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  const parsed = parseJsonRecord(raw);
  return Object.keys(parsed).length > 0 ? parsed : null;
};

const parseStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
};

const parseChecklistItems = (value: unknown): ChecklistItemMetadata[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!isJsonRecord(item)) return null;

      const id = item.id;
      const text = item.text;
      const checked = item.checked;
      const depth = item.depth;

      if (
        typeof id !== "string" ||
        typeof text !== "string" ||
        typeof checked !== "boolean"
      ) {
        return null;
      }

      const parsedDepth =
        typeof depth === "number" && Number.isFinite(depth)
          ? Math.max(0, depth)
          : undefined;

      return {
        id,
        text,
        checked,
        ...(parsedDepth !== undefined ? { depth: parsedDepth } : {}),
      };
    })
    .filter((item): item is ChecklistItemMetadata => item !== null);
};

export const parsePaletteMetadata = (
  raw: unknown,
): JsonRecord & {
  colors: string[];
} => {
  const parsed = parseJsonRecord(raw);
  return {
    ...parsed,
    colors: parseStringArray(parsed.colors),
  };
};

export const parseChecklistMetadata = (
  raw: unknown,
): JsonRecord & {
  items: ChecklistItemMetadata[];
} => {
  const parsed = parseJsonRecord(raw);
  return {
    ...parsed,
    items: parseChecklistItems(parsed.items),
  };
};

export const parseContactMetadata = (
  raw: unknown,
): JsonRecord & ContactMetadataShape => {
  const parsed = parseJsonRecord(raw);

  return {
    ...parsed,
    name: typeof parsed.name === "string" ? parsed.name : "",
    phone: typeof parsed.phone === "string" ? parsed.phone : "",
    email: typeof parsed.email === "string" ? parsed.email : "",
    note: typeof parsed.note === "string" ? parsed.note : "",
  };
};

export const parseFolderMetadata = (
  raw: unknown,
): JsonRecord & FolderMetadataShape => {
  const parsed = parseJsonRecord(raw);

  return {
    ...parsed,
    isCollapsed:
      typeof parsed.isCollapsed === "boolean" ? parsed.isCollapsed : false,
  };
};

export const normalizeMetadataForBlockType = (
  blockType: string,
  raw: unknown,
): JsonRecord => {
  if (blockType === "palette") {
    return parsePaletteMetadata(raw);
  }

  if (blockType === "checklist") {
    return parseChecklistMetadata(raw);
  }

  if (blockType === "folder") {
    return parseFolderMetadata(raw);
  }

  return parseJsonRecord(raw);
};
