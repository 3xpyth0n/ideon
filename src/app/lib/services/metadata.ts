import { parse } from "node-html-parser";
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await safeFetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "IdeonBot/1.0",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch ${targetUrl}: ${response.status}`);
    }

    const html = await response.text();
    const root = parse(html);

    const getMeta = (prop: string) => {
      return (
        root
          .querySelector(`meta[property="${prop}"]`)
          ?.getAttribute("content") ||
        root.querySelector(`meta[name="${prop}"]`)?.getAttribute("content")
      );
    };

    const title =
      getMeta("og:title") ||
      getMeta("twitter:title") ||
      root.querySelector("title")?.textContent ||
      "";

    const description =
      getMeta("og:description") ||
      getMeta("twitter:description") ||
      getMeta("description") ||
      "";

    const image =
      getMeta("og:image") || getMeta("twitter:image") || getMeta("image") || "";

    return {
      title,
      description,
      image,
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
