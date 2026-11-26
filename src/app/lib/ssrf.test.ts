import { beforeEach, describe, expect, it, vi } from "vitest";

const lookup = vi.hoisted(() => vi.fn());
const undiciFetch = vi.hoisted(() => vi.fn());
vi.mock("dns", () => ({ default: { promises: { lookup } } }));
vi.mock("undici", async (importOriginal) => ({
  ...(await importOriginal<typeof import("undici")>()),
  fetch: undiciFetch,
}));

import {
  createPinnedLookup,
  isPrivateIP,
  resolveSafeAddresses,
  safeFetch,
} from "./ssrf";

const PUBLIC = [{ address: "93.184.216.34", family: 4 }];
const LOOPBACK = [{ address: "127.0.0.1", family: 4 }];

beforeEach(() => {
  lookup.mockReset();
  undiciFetch.mockReset();
});

describe("isPrivateIP", () => {
  it.each([
    "127.0.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "100.127.255.255",
    "192.0.0.8",
    "198.18.0.1",
    "224.0.0.1",
    "::1",
    "fe90::1",
    "::ffff:127.0.0.1",
  ])("blocks %s", (ip) => {
    expect(isPrivateIP(ip)).toBe(true);
  });

  it.each(["93.184.216.34", "100.63.255.255", "100.128.0.1", "2606:4700::1"])(
    "allows %s",
    (ip) => {
      expect(isPrivateIP(ip)).toBe(false);
    },
  );
});

describe("resolveSafeAddresses", () => {
  it("rejects a host when any resolved address is private", async () => {
    lookup.mockResolvedValue([...PUBLIC, ...LOOPBACK]);
    expect(await resolveSafeAddresses("https://mixed.example")).toBeNull();
  });

  it("rejects non-HTTP protocols", async () => {
    expect(await resolveSafeAddresses("file:///etc/passwd")).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("createPinnedLookup", () => {
  it("always answers with the validated addresses", () => {
    const pinned = createPinnedLookup(PUBLIC);
    const single = vi.fn();
    const all = vi.fn();

    pinned("rebind.example", {}, single);
    pinned("rebind.example", { all: true }, all);

    expect(single).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    expect(all).toHaveBeenCalledWith(null, PUBLIC);
  });
});

describe("safeFetch", () => {
  it("resolves once per hop and pins the connection", async () => {
    lookup.mockResolvedValueOnce(PUBLIC).mockResolvedValue(LOOPBACK);
    undiciFetch.mockResolvedValue(new Response("ok"));

    await safeFetch("https://rebind.example");

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(undiciFetch.mock.calls[0][1].dispatcher).toBeDefined();
  });

  it("blocks a redirect to an internal host", async () => {
    lookup.mockResolvedValueOnce(PUBLIC).mockResolvedValue(LOOPBACK);
    undiciFetch.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://internal.example/" },
      }),
    );

    await expect(safeFetch("https://public.example")).rejects.toThrow(
      "Invalid or restricted URL detected",
    );
    expect(undiciFetch).toHaveBeenCalledTimes(1);
  });
});

describe("safeFetch credentials on redirect", () => {
  const redirectTo = (location: string) =>
    new Response(null, { status: 302, headers: { location } });
  const authHeaderOfCall = (index: number) =>
    new Headers(undiciFetch.mock.calls[index][1].headers).get("authorization");

  it("drops the Authorization header when the redirect changes origin", async () => {
    lookup.mockResolvedValue(PUBLIC);
    undiciFetch
      .mockResolvedValueOnce(redirectTo("https://other.example/target"))
      .mockResolvedValueOnce(new Response("ok"));

    await safeFetch("https://api.example/repo", {
      headers: { Authorization: "Bearer secret" },
    });

    expect(authHeaderOfCall(0)).toBe("Bearer secret");
    expect(authHeaderOfCall(1)).toBeNull();
  });

  it("keeps the Authorization header on a same-origin redirect", async () => {
    lookup.mockResolvedValue(PUBLIC);
    undiciFetch
      .mockResolvedValueOnce(redirectTo("/moved"))
      .mockResolvedValueOnce(new Response("ok"));

    await safeFetch("https://api.example/repo", {
      headers: { Authorization: "Bearer secret" },
    });

    expect(authHeaderOfCall(1)).toBe("Bearer secret");
  });
});
