import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const safeFetch = vi.hoisted(() => vi.fn());
vi.mock("../ssrf", () => ({ safeFetch }));

import { getRepoStats } from "./git-providers";

const originalAllowlist = process.env.GIT_ALLOWED_HOSTS;
const nativeFetch = vi.fn();

beforeEach(() => {
  safeFetch.mockReset();
  nativeFetch.mockReset();
  vi.stubGlobal("fetch", nativeFetch);
  delete process.env.GIT_ALLOWED_HOSTS;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalAllowlist === undefined) delete process.env.GIT_ALLOWED_HOSTS;
  else process.env.GIT_ALLOWED_HOSTS = originalAllowlist;
});

describe("getRepoStats outbound requests", () => {
  it("routes self-hosted hosts through safeFetch", async () => {
    safeFetch.mockRejectedValue(
      new Error("Invalid or restricted URL detected"),
    );

    const result = await getRepoStats("https://rebind.example/owner/repo");

    expect(result.stats).toBeUndefined();
    expect(safeFetch).toHaveBeenCalled();
    expect(nativeFetch).not.toHaveBeenCalled();
  });

  it("routes public providers through safeFetch", async () => {
    safeFetch.mockRejectedValue(new Error("network"));

    await getRepoStats("https://github.com/owner/repo", "token");

    expect(safeFetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
    expect(nativeFetch).not.toHaveBeenCalled();
  });

  it("keeps direct requests for hosts in GIT_ALLOWED_HOSTS", async () => {
    process.env.GIT_ALLOWED_HOSTS = "git.lan";
    nativeFetch.mockRejectedValue(new Error("network"));

    await getRepoStats("https://git.lan/owner/repo");

    expect(nativeFetch).toHaveBeenCalled();
    expect(safeFetch).not.toHaveBeenCalled();
  });
});
