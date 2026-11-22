import { preview } from "linkpeek";
import { safeFetch } from "@lib/ssrf";
import { getDb } from "@lib/db";
import { nanoid } from "nanoid";

export interface LinkMetadata {
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
  url: string;
}

/**
 * Fetches OpenGraph metadata for a given URL.
 */
export async function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  // Normalize URL to ensure it has a scheme
  const targetUrl = url.startsWith("http") ? url : `https://${url}`;

  try {
    // linkpeek resolves relative URLs, keeps only http(s) links, detects the
    // charset and caps the body; safeFetch still checks every hop for SSRF.
    const metadata = await preview(targetUrl, {
      timeout: 10000,
      userAgent: "IdeonBot/1.0",
      fetch: (input, init) => safeFetch(String(input), init),
    });

    if (metadata.statusCode < 200 || metadata.statusCode >= 300) {
      throw new Error(`Failed to fetch ${targetUrl}: ${metadata.statusCode}`);
    }

    return {
      title: metadata.title || "",
      description: metadata.description || "",
      image: metadata.image || "",
      favicon: `https://www.google.com/s2/favicons?domain=${
        new URL(targetUrl).hostname
      }&sz=64`,
      url: targetUrl,
    };
  } catch (error) {
    console.error("Error fetching metadata:", error);

    // Attempt to extract hostname safely for the fallback favicon
    let hostname = "";
    try {
      hostname = new URL(targetUrl).hostname;
    } catch {
      // If even targetUrl is invalid, leave hostname empty
    }

    return {
      url: targetUrl,
      favicon: hostname
        ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`
        : undefined,
    };
  }
}

export async function getLinkPreview(blockId: string) {
  const db = getDb();
  return db
    .selectFrom("linkPreviews")
    .selectAll()
    .where("blockId", "=", blockId)
    .executeTakeFirst();
}

export async function saveLinkPreview(
  blockId: string,
  url: string,
  metadata: Partial<LinkMetadata>,
) {
  const db = getDb();
  const now = new Date();

  // Check if exists
  const existing = await db
    .selectFrom("linkPreviews")
    .select("id")
    .where("blockId", "=", blockId)
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable("linkPreviews")
      .set({
        url,
        title: metadata.title || null,
        description: metadata.description || null,
        imageUrl: metadata.image || null,
        fetchedAt: now,
      })
      .where("id", "=", existing.id)
      .execute();
  } else {
    await db
      .insertInto("linkPreviews")
      .values({
        id: nanoid(),
        blockId,
        url,
        title: metadata.title || null,
        description: metadata.description || null,
        imageUrl: metadata.image || null,
        fetchedAt: now,
      })
      .execute();
  }
}
