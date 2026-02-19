import { Kysely } from "kysely";
import type { database } from "../../lib/types/db.ts";
import { nanoid } from "nanoid";

interface BlockMetadata {
  title?: string;
  description?: string;
  image?: string;
  imageUrl?: string;
  ogImage?: string;
  favicon?: string;
  error?: string;
  [key: string]: unknown;
}

export async function up(db: Kysely<database>): Promise<void> {
  // 1. Get all link blocks
  const blocks = await db
    .selectFrom("blocks")
    .selectAll()
    .where("blockType", "=", "link")
    .execute();

  for (const block of blocks) {
    if (!block.content) continue;

    let metadata: BlockMetadata = {};
    try {
      if (block.metadata) {
        metadata =
          typeof block.metadata === "string"
            ? JSON.parse(block.metadata)
            : block.metadata;
        // Handle double encoding if necessary
        if (typeof metadata === "string") {
          metadata = JSON.parse(metadata);
        }
      }
    } catch (e) {
      console.warn(`Failed to parse metadata for block ${block.id}`, e);
      continue;
    }

    // Check if we already have a preview for this block
    const existing = await db
      .selectFrom("linkPreviews")
      .select("id")
      .where("blockId", "=", block.id)
      .executeTakeFirst();

    if (existing) continue;

    // Prepare preview data
    const imageUrl = metadata.image || metadata.imageUrl || metadata.ogImage;
    const previewData = {
      id: nanoid(),
      blockId: block.id,
      url: block.content,
      title: metadata.title || null,
      description: metadata.description || null,
      imageUrl: imageUrl || null,
      fetchedAt: new Date().toISOString(),
    };

    // Insert into linkPreviews
    await db.insertInto("linkPreviews").values(previewData).execute();

    // Cleanup block metadata
    const keysToRemove = [
      "title",
      "description",
      "image",
      "imageUrl",
      "favicon",
      "error",
      "ogImage",
    ];

    let hasChanges = false;
    keysToRemove.forEach((key) => {
      if (key in metadata) {
        delete metadata[key];
        hasChanges = true;
      }
    });

    if (hasChanges) {
      await db
        .updateTable("blocks")
        .set({ metadata: JSON.stringify(metadata) })
        .where("id", "=", block.id)
        .execute();
    }
  }
}

export async function down(db: Kysely<database>): Promise<void> {
  // Restore metadata from linkPreviews back to blocks
  const previews = await db.selectFrom("linkPreviews").selectAll().execute();

  for (const preview of previews) {
    const block = await db
      .selectFrom("blocks")
      .select("metadata")
      .where("id", "=", preview.blockId)
      .executeTakeFirst();

    if (!block) continue;

    let metadata: BlockMetadata;
    try {
      metadata = block.metadata ? JSON.parse(block.metadata) : {};
    } catch {
      metadata = {};
    }

    // Merge back relevant fields
    if (preview.title) metadata.title = preview.title;
    if (preview.description) metadata.description = preview.description;
    if (preview.imageUrl) metadata.image = preview.imageUrl;

    await db
      .updateTable("blocks")
      .set({ metadata: JSON.stringify(metadata) })
      .where("id", "=", preview.blockId)
      .execute();
  }

  // Clear table (restored via down migration of 12AddLinkPreviews)
  await db.deleteFrom("linkPreviews").execute();
}
