import type { database } from "@lib/types/db";
import type { Kysely } from "kysely";

type JsonRecord = Record<string, unknown>;
type ChecklistItemRecord = {
  id: string;
  text: string;
  checked: boolean;
  depth?: number;
};

const parseJsonRecord = (raw: unknown): JsonRecord => {
  if (typeof raw !== "string") {
    return typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as JsonRecord)
      : {};
  }

  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as JsonRecord)
      : {};
  } catch {
    return {};
  }
};

const normalizePaletteMetadata = (raw: unknown): JsonRecord => {
  const parsed = parseJsonRecord(raw);
  const colors = Array.isArray(parsed.colors)
    ? parsed.colors.filter(
        (color): color is string => typeof color === "string",
      )
    : [];

  return {
    ...parsed,
    colors,
  };
};

const normalizeChecklistMetadata = (raw: unknown): JsonRecord => {
  const parsed = parseJsonRecord(raw);
  const items = Array.isArray(parsed.items)
    ? parsed.items
        .map((item) => {
          if (
            typeof item !== "object" ||
            item === null ||
            Array.isArray(item)
          ) {
            return null;
          }

          const value = item as JsonRecord;
          if (
            typeof value.id !== "string" ||
            typeof value.text !== "string" ||
            typeof value.checked !== "boolean"
          ) {
            return null;
          }

          const depth =
            typeof value.depth === "number" && Number.isFinite(value.depth)
              ? Math.max(0, value.depth)
              : undefined;

          return {
            id: value.id,
            text: value.text,
            checked: value.checked,
            ...(depth !== undefined ? { depth } : {}),
          };
        })
        .filter((item): item is ChecklistItemRecord => item !== null)
    : [];

  return {
    ...parsed,
    items,
  };
};

export async function up(db: Kysely<database>): Promise<void> {
  const blocks = await db
    .selectFrom("blocks")
    .select(["id", "blockType", "metadata"])
    .where("blockType", "in", ["palette", "checklist"])
    .execute();

  for (const block of blocks) {
    const normalizedMetadata =
      block.blockType === "palette"
        ? normalizePaletteMetadata(block.metadata)
        : normalizeChecklistMetadata(block.metadata);

    await db
      .updateTable("blocks")
      .set({ metadata: JSON.stringify(normalizedMetadata) })
      .where("id", "=", block.id)
      .execute();
  }
}

export async function down(db: Kysely<database>): Promise<void> {
  void db;
}
