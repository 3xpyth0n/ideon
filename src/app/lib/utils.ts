export function getAvatarUrl(
  avatarUrl: string | null | undefined,
  username: string | null | undefined,
  updatedAt?: string | Date | null,
) {
  if (avatarUrl?.trim()) {
    if (avatarUrl.startsWith("data:")) return avatarUrl;

    try {
      const url = new URL(avatarUrl, "http://localhost");
      if (updatedAt) {
        url.searchParams.set("v", new Date(updatedAt).getTime().toString());
      }

      if (/^(https?:)?\/\//i.test(avatarUrl)) {
        return url.toString();
      }

      return url.pathname + url.search;
    } catch {
      return avatarUrl;
    }
  }

  const name = username?.trim() || "A";
  const url = new URL("https://ui-avatars.com/api/");
  url.searchParams.set("name", name);
  url.searchParams.set("background", "000");
  url.searchParams.set("color", "fff");
  url.searchParams.set("bold", "true");
  url.searchParams.set("format", "svg");

  if (updatedAt) {
    url.searchParams.set("v", new Date(updatedAt).getTime().toString());
  }

  return url.toString();
}

/**
 * Deduplicates an array of objects by a specific property, keeping the last occurrence.
 */
export function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((i) => [i.id, i])).values());
}

/**
 * Generates a deterministic color from a string.
 */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Use HSL for better perception: specific Hue, 70% Saturation, 50% Lightness
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 50%)`;
}

/**
 * Returns a standard set of security headers including CSP and HSTS.
 */
export function getSecurityHeaders(nonce: string) {
  const appUrl = process.env.APP_URL || "";
  const isSecure = appUrl.startsWith("https://");

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}';
    style-src 'self' 'unsafe-inline' fonts.googleapis.com;
    img-src 'self' data: blob: https:;
    font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com;
    connect-src 'self' ws: wss: https:;
    frame-src 'self' https:;
    frame-ancestors 'none';
    base-uri 'self';
    form-action 'self';
    object-src 'none';
    ${isSecure ? "upgrade-insecure-requests;" : ""}
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const headers: Record<string, string> = {
    "Content-Security-Policy": cspHeader,
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-XSS-Protection": "1; mode=block",
  };

  if (isSecure) {
    headers["Strict-Transport-Security"] =
      "max-age=31536000; includeSubDomains; preload";
  }

  return headers;
}

export function safeJson<T>(input: string | null | undefined, fallback: T): T {
  if (!input) return fallback;
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

const RECENT_PROJECTS_KEY = "ideon_recent_projects";
const MAX_RECENT_PROJECTS = 5;

export function getRecentProjects(): string[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentProject(projectId: string) {
  if (typeof window === "undefined") return;
  const current = getRecentProjects();
  const updated = [
    projectId,
    ...current.filter((id) => id !== projectId),
  ].slice(0, MAX_RECENT_PROJECTS);
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
}

export function clearRecentProjects() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(RECENT_PROJECTS_KEY);
}
