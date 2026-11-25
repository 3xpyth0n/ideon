import dns, { type LookupAddress } from "dns";
import type { LookupFunction } from "net";
import {
  Agent,
  fetch as undiciFetch,
  type RequestInit as UndiciInit,
} from "undici";

/**
 * Resolves a URL to its addresses (SSRF Protection).
 * Returns null if the URL or any resolved address is private/internal.
 */
export async function resolveSafeAddresses(
  url: string,
): Promise<LookupAddress[] | null> {
  try {
    const { protocol, hostname } = new URL(url);

    if (protocol !== "http:" && protocol !== "https:") return null;
    if (hostname === "localhost" || hostname.endsWith(".local")) return null;

    const addresses = await dns.promises.lookup(hostname, { all: true });

    if (addresses.length === 0) return null;
    if (addresses.some(({ address }) => isPrivateIP(address))) return null;

    return addresses;
  } catch {
    // If DNS resolution fails or URL is invalid, treat as unsafe
    return null;
  }
}

// Connects only to the validated addresses so DNS cannot rebind between check and use
export function createPinnedLookup(addresses: LookupAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, addresses);
      return;
    }
    callback(null, addresses[0].address, addresses[0].family);
  };
}

/**
 * Checks if an IP address is private/internal.
 * Supports IPv4 and all IPv6 transition mechanisms (mapped, NAT64, 6to4, Teredo).
 */
export function isPrivateIP(ip: string): boolean {
  // IPv4 private ranges — pure IPv4 only (no colon)
  if (ip.includes(".") && !ip.includes(":")) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p))) return false;

    if (parts[0] === 0) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    // CGNAT (RFC 6598), IETF assignments, benchmarking, multicast and reserved
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) return true;
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
    if (parts[0] >= 224) return true;
    return false;
  }

  if (ip.includes(":")) {
    const lower = ip.toLowerCase();

    // Unspecified / loopback
    if (lower === "::" || lower === "::0" || lower === "::1") return true;

    // ULA (fc00::/7) and link-local (fe80::/10)
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(lower)) return true;

    // Multicast (ff00::/8)
    if (lower.startsWith("ff")) return true;

    // IPv4-mapped ::ffff:x.x.x.x or ::ffff:xxxx:xxxx
    if (lower.startsWith("::ffff:")) {
      const tail = lower.slice(7);
      if (tail.includes(".")) return isPrivateIP(tail);
      const parts = tail.split(":");
      if (parts.length === 2) {
        const hi = parseInt(parts[0], 16);
        const lo = parseInt(parts[1], 16);
        return isPrivateIP(
          `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`,
        );
      }
    }

    // NAT64 well-known 64:ff9b::/96 (RFC 6052) and local-use 64:ff9b:1::/48 (RFC 8215)
    const nat64Match = lower.match(
      /^64:ff9b(?::1)?::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/,
    );
    if (nat64Match) {
      const hi = parseInt(nat64Match[1], 16);
      const lo = parseInt(nat64Match[2], 16);
      return isPrivateIP(
        `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`,
      );
    }

    // 6to4 2002::/16 (RFC 3056) — IPv4 embedded in bits 16–47
    const sixto4Match = lower.match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4}):/);
    if (sixto4Match) {
      const hi = parseInt(sixto4Match[1], 16);
      const lo = parseInt(sixto4Match[2], 16);
      return isPrivateIP(
        `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`,
      );
    }

    // Teredo 2001:0000::/32 (RFC 4380) — block entire prefix
    if (lower.startsWith("2001:0000:") || lower.startsWith("2001:0:")) {
      return true;
    }
  }

  return false;
}

/**
 * Performs a fetch request with SSRF protection by manually handling redirects,
 * validating the URL at each step and pinning the connection to the checked IP.
 */
export async function safeFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  let currentUrl = url;
  let requestOptions = options;
  const maxRedirects = 5;
  let redirectCount = 0;

  while (redirectCount < maxRedirects) {
    const addresses = await resolveSafeAddresses(currentUrl);
    if (!addresses) {
      throw new Error("Invalid or restricted URL detected");
    }

    const dispatcher = new Agent({
      connect: { lookup: createPinnedLookup(addresses) },
    });

    let response: Response;
    try {
      // The global fetch and the undici package types differ nominally only
      response = (await undiciFetch(currentUrl, {
        ...(requestOptions as UndiciInit),
        redirect: "manual",
        dispatcher,
      })) as unknown as Response;
    } finally {
      // Graceful close: waits for the response body before releasing sockets
      void dispatcher.close();
    }

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Redirect response missing Location header");
      }

      const nextUrl = new URL(location, currentUrl);
      // Matches native fetch: credentials never follow a redirect to another origin
      if (nextUrl.origin !== new URL(currentUrl).origin) {
        const headers = new Headers(requestOptions.headers);
        headers.delete("authorization");
        headers.delete("proxy-authorization");
        headers.delete("cookie");
        requestOptions = { ...requestOptions, headers };
      }
      currentUrl = nextUrl.toString();
      redirectCount++;
      continue;
    }

    return response;
  }

  throw new Error(`Too many redirects (max: ${maxRedirects})`);
}
