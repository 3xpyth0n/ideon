import ogs from "open-graph-scraper";

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
  try {
    const { result } = await ogs({ url });

    return {
      title: result.ogTitle || result.twitterTitle || "",
      description: result.ogDescription || result.twitterDescription || "",
      image: result.ogImage?.[0]?.url || result.twitterImage?.[0]?.url || "",
      favicon: `https://www.google.com/s2/favicons?domain=${
        new URL(url).hostname
      }&sz=64`,
      url: url,
    };
  } catch (error) {
    console.error("Error fetching metadata:", error);
    return {
      url,
      favicon: `https://www.google.com/s2/favicons?domain=${
        new URL(url).hostname
      }&sz=64`,
    };
  }
}
