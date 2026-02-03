import ogs from "open-graph-scraper";
import { validateSafeUrl } from "@lib/ssrf";

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
    const isSafe = await validateSafeUrl(targetUrl);
    if (!isSafe) {
      throw new Error("Invalid or restricted URL");
    }

    const { result } = await ogs({ url: targetUrl });

    return {
      title: result.ogTitle || result.twitterTitle || "",
      description: result.ogDescription || result.twitterDescription || "",
      image: result.ogImage?.[0]?.url || result.twitterImage?.[0]?.url || "",
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
