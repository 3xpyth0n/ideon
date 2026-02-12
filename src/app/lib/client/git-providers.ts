export type GitProvider = "github" | "gitlab" | "gitea" | "forgejo";

export interface RepoStats {
  stars: number;
  release: string;
  lastCommit: string;
  openIssues: number;
  openPulls: number; // For GitLab this is Merge Requests
  contributors: number;
  provider: GitProvider;
  repoUrl: string;
}

interface FetchResult {
  stats?: RepoStats;
  error?: string;
  status?: number;
}

// SSRF Protection Configuration
const ALLOWED_PROVIDERS = {
  github: {
    domains: ["github.com", "api.github.com"],
    apiBase: "https://api.github.com",
  },
  gitlab: {
    domains: ["gitlab.com"],
    apiBase: "https://gitlab.com/api/v4",
  },
  gitea: {
    domains: ["gitea.io", "try.gitea.io"],
    apiBase: "https://gitea.io/api/v1",
  },
  forgejo: {
    domains: ["forgejo.org", "codeberg.org"],
    apiBase: "https://forgejo.org/api/v1",
  },
};

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
];

function isPrivateIp(hostname: string): boolean {
  if (!hostname || hostname === "localhost") return true;

  // Check if hostname is an IP address
  const ipv4Regex = /^\d+\.\d+\.\d+\.\d+$/;
  const ipv6Regex = /^[0-9a-fA-F:]+$/;

  if (ipv4Regex.test(hostname)) {
    return PRIVATE_IP_RANGES.some((range) => range.test(hostname));
  }

  if (ipv6Regex.test(hostname)) {
    return PRIVATE_IP_RANGES.some((range) => range.test(hostname));
  }

  return false;
}

function isAllowedDomain(hostname: string, provider: GitProvider): boolean {
  const allowedDomains = ALLOWED_PROVIDERS[provider]?.domains || [];
  return allowedDomains.includes(hostname.toLowerCase());
}

function validateUrl(
  url: string,
  provider?: GitProvider,
): { valid: boolean; error?: string } {
  try {
    const parsedUrl = new URL(url);

    // Check protocol
    if (parsedUrl.protocol !== "https:") {
      return { valid: false, error: "Only HTTPS protocol is allowed" };
    }

    // Check for private IP addresses
    if (isPrivateIp(parsedUrl.hostname)) {
      return { valid: false, error: "Private IP addresses are not allowed" };
    }

    // Check if domain is allowed for this provider (if specified)
    if (provider && !isAllowedDomain(parsedUrl.hostname, provider)) {
      return {
        valid: false,
        error: `Domain ${parsedUrl.hostname} is not allowed for ${provider}`,
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

function sanitizeRepoPath(path: string): string {
  return path.replace(/[^a-zA-Z0-9-_./]/g, "").replace(/\.\./g, "");
}

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, "").replace(/\.git$/, "");
}

/**
 * Ensure the given URL uses HTTPS and matches the expected host.
 * Returns the normalized URL string if valid, otherwise null.
 */
function ensureAllowedApiUrl(
  rawUrl: string,
  expectedHost: string,
): string | null {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const allowedHost = expectedHost.replace(/^www\./, "").toLowerCase();

    if (parsed.protocol !== "https:") {
      return null;
    }
    if (hostname !== allowedHost) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

// Basic SSRF protection: reject obvious local or private hosts.
function isPrivateOrLocalHost(host: string): boolean {
  const h = host.trim().toLowerCase();

  // Strip port if present
  const withoutPort = h.split(":")[0];

  if (
    withoutPort === "localhost" ||
    withoutPort === "127.0.0.1" ||
    withoutPort === "[::1]"
  ) {
    return true;
  }

  // Reject common local/internal domains
  if (
    withoutPort.endsWith(".local") ||
    withoutPort.endsWith(".localdomain") ||
    withoutPort.endsWith(".home") ||
    withoutPort.endsWith(".internal")
  ) {
    return true;
  }

  // Check IPv4 private and special ranges
  if (/^\d+\.\d+\.\d+\.\d+$/.test(withoutPort)) {
    const parts = withoutPort.split(".").map((p) => parseInt(p, 10));
    if (parts.length === 4 && parts.every((n) => n >= 0 && n <= 255)) {
      const [a, b] = parts;
      // 10.0.0.0/8
      if (a === 10) return true;
      // 172.16.0.0 - 172.31.0.0
      if (a === 172 && b >= 16 && b <= 31) return true;
      // 192.168.0.0/16
      if (a === 192 && b === 168) return true;
      // 127.0.0.0/8
      if (a === 127) return true;
      // 169.254.0.0/16 (link-local)
      if (a === 169 && b === 254) return true;
      // 100.64.0.0/10 (carrier-grade NAT)
      if (a === 100 && b >= 64 && b <= 127) return true;
    }
  }

  return false;
}

async function fetchGithub(
  urls: string[],
  repoUrl: string,
  token?: string,
): Promise<FetchResult> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Ideon-App",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Final safety check: ensure all URLs point to the expected GitHub API host.
  const safeUrls: string[] = [];
  for (const rawUrl of urls) {
    const validated = ensureAllowedApiUrl(rawUrl, "api.github.com");
    if (!validated) {
      return {
        error: "Invalid GitHub API URL",
        status: 400,
      };
    }
    safeUrls.push(validated);
  }

  try {
    const [repoRes, releaseRes, commitRes, pullsRes, contributorsRes] =
      await Promise.all([
        fetch(safeUrls[0], { headers }),
        fetch(safeUrls[1], { headers }),
        fetch(safeUrls[2], { headers }),
        fetch(safeUrls[3], { headers }),
        fetch(safeUrls[4], { headers }),
      ]);

    if (!repoRes.ok) {
      if (repoRes.status === 403 || repoRes.status === 429) {
        return { error: "GitHub API rate limit exceeded", status: 429 };
      }
      if (repoRes.status === 404) {
        return { error: "Repository not found", status: 404 };
      }
      return {
        error: `GitHub API error: ${repoRes.statusText}`,
        status: repoRes.status,
      };
    }

    const repoData = await repoRes.json();
    const releaseData = releaseRes.ok ? await releaseRes.json() : null;
    const commitData = commitRes.ok ? await commitRes.json() : [];

    const getCount = (res: Response, data: unknown[]) => {
      // If we have data, we have at least that many.
      // Check Link header for "last" page.
      const link = res.headers.get("link");
      if (link) {
        const match = link.match(/[?&]page=(\d+)[^>]*>; rel="last"/);
        if (match) {
          return parseInt(match[1], 10);
        }
      }
      // If no link header, it means we are on the only page.
      return Array.isArray(data) ? data.length : 0;
    };

    const pullsData = pullsRes.ok ? await pullsRes.json() : [];
    const contributorsData = contributorsRes.ok
      ? await contributorsRes.json()
      : [];

    return {
      stats: {
        stars: repoData.stargazers_count,
        release: releaseData?.tag_name || "N/A",
        lastCommit: commitData[0]?.commit?.author?.date || "N/A",
        openIssues: repoData.open_issues_count,
        openPulls: getCount(pullsRes, pullsData),
        contributors: getCount(contributorsRes, contributorsData),
        provider: "github",
        repoUrl: repoUrl,
      },
    };
  } catch (error) {
    console.error("GitHub API error:", error);
    return { error: "Failed to fetch GitHub stats", status: 500 };
  }
}

async function fetchGitlab(
  urls: string[],
  repoUrl: string,
  token?: string,
): Promise<FetchResult> {
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const [projectRes, releasesRes, commitsRes, mrsRes, contributorsRes] =
      await Promise.all([
        fetch(urls[0], { headers }),
        fetch(urls[1], { headers }),
        fetch(urls[2], { headers }),
        fetch(urls[3], { headers }),
        fetch(urls[4], { headers }),
      ]);

    if (!projectRes.ok) {
      if (projectRes.status === 401 || projectRes.status === 403) {
        return {
          error: "GitLab API: Unauthorized/Forbidden",
          status: projectRes.status,
        };
      }
      if (projectRes.status === 404) {
        return { error: "GitLab Repository not found", status: 404 };
      }
      return {
        error: `GitLab API error: ${projectRes.statusText}`,
        status: projectRes.status,
      };
    }

    const projectData = await projectRes.json();
    const releasesData = releasesRes.ok ? await releasesRes.json() : [];
    const commitsData = commitsRes.ok ? await commitsRes.json() : [];

    const getCountFromHeader = (res: Response) => {
      const total = res.headers.get("x-total");
      if (total) return parseInt(total, 10);
      return 0;
    };

    return {
      stats: {
        stars: projectData.star_count,
        release: releasesData[0]?.tag_name || "N/A",
        lastCommit: commitsData[0]?.created_at || "N/A",
        openIssues: projectData.open_issues_count || 0,
        openPulls: getCountFromHeader(mrsRes),
        contributors: getCountFromHeader(contributorsRes),
        provider: "gitlab",
        repoUrl: repoUrl,
      },
    };
  } catch (error) {
    console.error("GitLab API error:", error);
    return { error: "Failed to fetch GitLab stats", status: 500 };
  }
}

async function fetchGitea(
  urls: string[],
  repoUrl: string,
  token?: string,
): Promise<FetchResult> {
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  try {
    const [repoRes, releaseRes, commitsRes, pullsRes, contributorsRes] =
      await Promise.all([
        fetch(urls[0], { headers }),
        fetch(urls[1], { headers }),
        fetch(urls[2], { headers }),
        fetch(urls[3], { headers }),
        fetch(urls[4], { headers }),
      ]);

    if (!repoRes.ok) {
      if (repoRes.status === 401 || repoRes.status === 403) {
        return {
          error: "Gitea/Forgejo API: Unauthorized/Forbidden",
          status: repoRes.status,
        };
      }
      if (repoRes.status === 404) {
        return { error: "Gitea Repository not found", status: 404 };
      }
      return {
        error: `Gitea/Forgejo API error: ${repoRes.statusText}`,
        status: repoRes.status,
      };
    }

    const repoData = await repoRes.json();
    const releaseData = releaseRes.ok ? await releaseRes.json() : [];
    const commitsData = commitsRes.ok ? await commitsRes.json() : [];

    const getCountFromHeader = (res: Response) => {
      const total = res.headers.get("x-total-count");
      if (total) return parseInt(total, 10);
      return 0;
    };

    return {
      stats: {
        stars: repoData.stars_count,
        release: releaseData[0]?.tag_name || "N/A",
        lastCommit: commitsData[0]?.commit?.author?.date || "N/A",
        openIssues: repoData.open_issues_count,
        openPulls: repoData.open_pr_counter || getCountFromHeader(pullsRes),
        contributors: getCountFromHeader(contributorsRes),
        provider: "gitea",
        repoUrl: repoUrl,
      },
    };
  } catch (error) {
    console.error("Gitea API error:", error);
    return { error: "Failed to fetch Gitea stats", status: 500 };
  }
}

export async function getRepoStats(
  url: string,
  token?: string,
): Promise<FetchResult> {
  if (!url) {
    return { error: "URL is required", status: 400 };
  }

  const cleanUrl = normalizeUrl(url);

  // Preliminary security check for the input URL
  try {
    const parsedUrl = new URL(
      cleanUrl.startsWith("http") ? cleanUrl : `https://${cleanUrl}`,
    );
    const normalizedHost = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
    if (isPrivateIp(parsedUrl.hostname)) {
      return { error: "Private IP addresses are not allowed", status: 400 };
    }
    if (parsedUrl.protocol !== "https:") {
      return { error: "Only HTTPS protocol is allowed", status: 400 };
    }
    if (normalizedHost !== "github.com" && normalizedHost !== "gitlab.com") {
      return { error: "Unsupported host", status: 400 };
    }
  } catch {
    return { error: "Invalid URL format", status: 400 };
  }

  let owner = "";
  let repo = "";
  let host = "";

  const githubMatch = cleanUrl.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+)/,
  );
  const gitlabMatch = cleanUrl.match(
    /^(?:https?:\/\/)?(?:www\.)?gitlab\.com\/([^/]+)\/([^/]+)/,
  );

  if (githubMatch) {
    owner = sanitizeRepoPath(githubMatch[1]);
    repo = sanitizeRepoPath(githubMatch[2]);
    const apiUrls = [
      `https://api.github.com/repos/${owner}/${repo}`,
      `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`,
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=1`,
      `https://api.github.com/repos/${owner}/${repo}/contributors?per_page=1&anon=true`,
    ];

    for (const u of apiUrls) {
      const validation = validateUrl(u, "github");
      if (!validation.valid) return { error: validation.error, status: 400 };
    }
    return fetchGithub(apiUrls, cleanUrl, token);
  }

  if (gitlabMatch) {
    owner = sanitizeRepoPath(gitlabMatch[1]);
    repo = sanitizeRepoPath(gitlabMatch[2]);
    const projectPath = encodeURIComponent(`${owner}/${repo}`);
    const baseUrl = `https://gitlab.com/api/v4/projects/${projectPath}`;
    const apiUrls = [
      baseUrl,
      `${baseUrl}/releases?per_page=1`,
      `${baseUrl}/repository/commits?per_page=1`,
      `${baseUrl}/merge_requests?state=opened&per_page=1`,
      `${baseUrl}/repository/contributors?per_page=1`,
    ];

    for (const u of apiUrls) {
      const validation = validateUrl(u, "gitlab");
      if (!validation.valid) return { error: validation.error, status: 400 };
    }
    return fetchGitlab(apiUrls, cleanUrl, token);
  }

  // Self-hosted or unknown provider
  try {
    const u = new URL(
      cleanUrl.startsWith("http") ? cleanUrl : `https://${cleanUrl}`,
    );
    host = u.host;

    // Prevent SSRF by rejecting obvious local or private hosts
    if (isPrivateOrLocalHost(host)) {
      return { error: "Invalid or unsafe host", status: 400 };
    }

    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      owner = sanitizeRepoPath(parts[parts.length - 2]);
      repo = sanitizeRepoPath(parts[parts.length - 1]);
    }

    if (!owner || !repo)
      return { error: "Invalid repository path", status: 400 };

    // Try Gitea/Forgejo first
    const giteaBasePath = `https://${host}/api/v1/repos/${owner}/${repo}`;
    const giteaUrls = [
      giteaBasePath,
      `${giteaBasePath}/releases?limit=1`,
      `${giteaBasePath}/commits?limit=1`,
      `${giteaBasePath}/pulls?state=open&limit=1`,
      `${giteaBasePath}/contributors?limit=1`,
    ];

    let validGitea = true;
    for (const gu of giteaUrls) {
      const v = validateUrl(gu); // No provider = self-hosted friendly
      if (!v.valid) {
        validGitea = false;
        break;
      }
    }

    if (validGitea) {
      const result = await fetchGitea(giteaUrls, cleanUrl, token);
      if (result.stats) return result;
    }

    // Try GitLab self-hosted
    const projectPath = encodeURIComponent(`${owner}/${repo}`);
    const gitlabBaseUrl = `https://${host}/api/v4/projects/${projectPath}`;
    const gitlabUrls = [
      gitlabBaseUrl,
      `${gitlabBaseUrl}/releases?per_page=1`,
      `${gitlabBaseUrl}/repository/commits?per_page=1`,
      `${gitlabBaseUrl}/merge_requests?state=opened&per_page=1`,
      `${gitlabBaseUrl}/repository/contributors?per_page=1`,
    ];

    let validGitlab = true;
    for (const glu of gitlabUrls) {
      const v = validateUrl(glu);
      if (!v.valid) {
        validGitlab = false;
        break;
      }
    }

    if (validGitlab) {
      return fetchGitlab(gitlabUrls, cleanUrl, token);
    }

    return { error: "Unsupported or unreachable Git provider", status: 400 };
  } catch {
    return { error: "Invalid URL format", status: 400 };
  }
}
