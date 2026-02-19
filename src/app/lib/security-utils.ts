/**
 * Validates if a URL is safe to fetch (SSRF Protection).
 * Blocks private IP ranges, localhost, and metadata services.
 * Enforces HTTPS scheme.
 *
 * @param url The URL to validate
 * @returns boolean True if safe, false otherwise
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Enforce HTTPS
    if (parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname;

    // Block localhost and metadata services explicitly
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "metadata.google.internal" ||
      hostname === "169.254.169.254"
    ) {
      return false;
    }

    // IPv4 Private Ranges regex
    // 10.0.0.0/8
    // 172.16.0.0/12
    // 192.168.0.0/16
    // 127.0.0.0/8 (Loopback)
    // 169.254.0.0/16 (Link-local)
    const privateIpRegex =
      /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|127\.|169\.254\.)/;

    if (privateIpRegex.test(hostname)) {
      return false;
    }

    // IPv6 Private Ranges (FC00::/7 Unique Local, FE80::/10 Link-Local)
    const privateIpv6Regex = /^(fc|fd|fe[8-9a-b]).*:/i;
    if (privateIpv6Regex.test(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts the real client IP from headers, respecting trusted proxies.
 * Skips standard private networks (trusting them as proxies) to find the first public IP.
 *
 * @param headersObj Headers object (Next.js headers() or Request.headers)
 * @returns string The client IP or "127.0.0.1" if not found
 */
export function getClientIp(
  headersObj: Headers | Map<string, string> | Record<string, string>,
): string {
  let forwardedFor: string;

  if (typeof (headersObj as Headers).get === "function") {
    forwardedFor = (headersObj as Headers).get("x-forwarded-for") || "";
  } else {
    // Handle plain object or other structures if necessary
    forwardedFor =
      (headersObj as Record<string, string>)["x-forwarded-for"] || "";
  }

  if (!forwardedFor) {
    return "127.0.0.1";
  }

  const ips = forwardedFor.split(",").map((ip) => ip.trim());

  // Regex to identify private IPs (Trusted Proxies)
  // We treat these as infrastructure/proxies and look for the first IP *before* them (from right to left)
  const isPrivate = (ip: string) => {
    return (
      /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|127\.|169\.254\.)/.test(
        ip,
      ) ||
      ip === "::1" ||
      /^(fc|fd|fe[8-9a-b]).*:/i.test(ip)
    );
  };

  // Traverse from right to left (most recent proxy first)
  // Skip private IPs (trusted proxies)
  for (let i = ips.length - 1; i >= 0; i--) {
    const ip = ips[i];
    if (!isPrivate(ip)) {
      return ip;
    }
  }

  // If all IPs are private (e.g. internal access), return the first one (original client)
  return ips[0];
}
