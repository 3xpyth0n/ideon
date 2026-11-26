import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const safeFetch = vi.hoisted(() => vi.fn());
vi.mock("@lib/ssrf", () => ({ safeFetch }));

import { GET } from "./route";

const request = (url: string) =>
  new NextRequest(
    `http://localhost/api/proxy/image?url=${encodeURIComponent(url)}`,
  );

describe("GET /api/proxy/image", () => {
  beforeEach(() => {
    safeFetch.mockReset();
  });

  it("fetches through the SSRF guard", async () => {
    safeFetch.mockResolvedValue(
      new Response("png", { headers: { "content-type": "image/png" } }),
    );

    const response = await GET(request("https://example.com/a.png"));

    expect(response.status).toBe(200);
    expect(safeFetch).toHaveBeenCalledWith(
      "https://example.com/a.png",
      expect.anything(),
    );
  });

  it("rejects a non-HTTPS URL before fetching", async () => {
    const response = await GET(request("http://example.com/a.png"));

    expect(response.status).toBe(403);
    expect(safeFetch).not.toHaveBeenCalled();
  });
});
