import { describe, it, expect, vi, beforeEach } from "vitest";

const safeFetch = vi.hoisted(() => vi.fn());
vi.mock("@lib/ssrf", () => ({ safeFetch }));

import { fetchLinkMetadata } from "./metadata";

function htmlResponse(body: BodyInit, contentType: string) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": contentType },
  });
}

describe("fetchLinkMetadata", () => {
  beforeEach(() => {
    safeFetch.mockReset();
  });

  it("resolves a relative og:image and decodes entities in the title", async () => {
    safeFetch.mockResolvedValue(
      htmlResponse(
        `<html><head>
          <title>Tom&#39;s &amp; Jerry&#x27;s</title>
          <meta property="og:image" content="/og.png">
          <meta name="description" content="Caf&eacute; menu">
        </head><body></body></html>`,
        "text/html; charset=utf-8",
      ),
    );

    const metadata = await fetchLinkMetadata("https://example.com/blog/post");

    expect(metadata.title).toBe("Tom's & Jerry's");
    expect(metadata.description).toBe("Café menu");
    expect(metadata.image).toBe("https://example.com/og.png");
    expect(metadata.url).toBe("https://example.com/blog/post");
    expect(metadata.favicon).toBe(
      "https://www.google.com/s2/favicons?domain=example.com&sz=64",
    );
  });

  it("drops non-http image URLs", async () => {
    safeFetch.mockResolvedValue(
      htmlResponse(
        `<head><title>x</title><meta property="og:image" content="javascript:alert(1)"></head>`,
        "text/html",
      ),
    );

    const metadata = await fetchLinkMetadata("https://example.com");

    expect(metadata.image ?? "").toBe("");
  });

  it("decodes pages that are not UTF-8", async () => {
    // "Café" in windows-1252: é is 0xE9
    const bytes = new Uint8Array([
      ...new TextEncoder().encode("<head><title>Caf"),
      0xe9,
      ...new TextEncoder().encode("</title></head>"),
    ]);
    safeFetch.mockResolvedValue(
      htmlResponse(bytes, "text/html; charset=windows-1252"),
    );

    const metadata = await fetchLinkMetadata("https://example.com");

    expect(metadata.title).toBe("Café");
  });

  it("falls back to the favicon only when the fetch fails", async () => {
    safeFetch.mockRejectedValue(
      new Error("Invalid or restricted URL detected"),
    );

    const metadata = await fetchLinkMetadata("example.com");

    expect(metadata).toEqual({
      url: "https://example.com",
      favicon: "https://www.google.com/s2/favicons?domain=example.com&sz=64",
    });
  });
});
