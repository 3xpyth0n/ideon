import dns from "dns";
import { promisify } from "util";

const lookup = promisify(dns.lookup);

/**
 * Validates if a URL is safe to fetch (SSRF Protection).
 * Blocks private/internal IP ranges and localhost.
 */
export async function validateSafeUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    // 1. Block common local hostnames immediately
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.endsWith(".local")
    ) {
      return false;
    }

    // 2. Resolve DNS to get the actual IP
    // family: 4 means IPv4, 6 means IPv6. 0 means both.
    const { address } = await lookup(hostname, { family: 0 });

    // 3. Check against private IP ranges
    if (isPrivateIP(address)) {
      return false;
    }

    return true;
  } catch (_error) {
    // If DNS resolution fails or URL is invalid, treat as unsafe
    return false;
  }
}

/**
 * Checks if an IP address is private/internal.
 * Supports IPv4 and IPv6.
 */
function isPrivateIP(ip: string): boolean {
  // IPv4 Private Ranges
  // 10.0.0.0/8
  // 172.16.0.0/12
  // 192.168.0.0/16
  // 127.0.0.0/8 (Loopback)
  // 169.254.0.0/16 (Link-local)
  if (ip.includes(".")) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4) return false;

    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
  }

  // IPv6 Private Ranges
  // ::1 (Loopback)
  // fc00::/7 (Unique Local Address)
  // fe80::/10 (Link-local)
  if (ip.includes(":")) {
    if (ip === "::1") return true;
    if (ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd"))
      return true;
    if (ip.toLowerCase().startsWith("fe80")) return true;
  }

  return false;
}

/**
 * Performs a fetch request with SSRF protection by manually handling redirects
 * and validating the URL at each step.
 */
export async function safeFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  let currentUrl = url;
  const maxRedirects = 5;
  let redirectCount = 0;

  while (redirectCount < maxRedirects) {
    const isSafe = await validateSafeUrl(currentUrl);
    if (!isSafe) {
      throw new Error("Invalid or restricted URL detected");
    }

    const response = await fetch(currentUrl, {
      ...options,
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Redirect response missing Location header");
      }

      // Resolve relative URLs against the current URL
      currentUrl = new URL(location, currentUrl).toString();
      redirectCount++;
      continue;
    }

    return response;
  }

  throw new Error(`Too many redirects (max: ${maxRedirects})`);
}
