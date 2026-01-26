import { randomUUID } from "crypto";
import { getDb } from "./db";

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

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, "").replace(".git", "");
}

async function fetchGithub(
  owner: string,
  repo: string,
  url: string,
): Promise<FetchResult> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };

  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const [repoRes, releaseRes, commitRes, pullsRes, contributorsRes] =
      await Promise.all([
        fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers }),
        fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
          headers,
        }),
        fetch(
          `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`,
          { headers },
        ),
        fetch(
          `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=1`,
          { headers },
        ),
        fetch(
          `https://api.github.com/repos/${owner}/${repo}/contributors?per_page=1&anon=true`,
          { headers },
        ),
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

    const getCountFromHeader = (res: Response) => {
      const link = res.headers.get("link");
      if (!link) return res.ok ? 1 : 0;
      const match = link.match(/&page=(\d+)>; rel="last"/);
      return match ? parseInt(match[1]) : res.ok ? 1 : 0;
    };

    return {
      stats: {
        stars: repoData.stargazers_count,
        release: releaseData?.tag_name || "N/A",
        lastCommit: commitData[0]?.commit?.author?.date || "N/A",
        openIssues: repoData.open_issues_count,
        openPulls: getCountFromHeader(pullsRes),
        contributors: getCountFromHeader(contributorsRes),
        provider: "github",
        repoUrl: url,
      },
    };
  } catch (error) {
    console.error("GitHub API error:", error);
    return { error: "Failed to fetch GitHub stats", status: 500 };
  }
}

async function fetchGitlab(
  host: string,
  owner: string,
  repo: string,
  url: string,
): Promise<FetchResult> {
  const projectPath = encodeURIComponent(`${owner}/${repo}`);
  const baseUrl = `https://${host}/api/v4/projects/${projectPath}`;

  try {
    const [projectRes, releasesRes, commitsRes, mrsRes, contributorsRes] =
      await Promise.all([
        fetch(baseUrl),
        fetch(`${baseUrl}/releases?per_page=1`),
        fetch(`${baseUrl}/repository/commits?per_page=1`),
        fetch(`${baseUrl}/merge_requests?state=opened&per_page=1`), // Just to check existence/count if headers
        fetch(`${baseUrl}/repository/contributors?per_page=1`),
      ]);

    if (!projectRes.ok) {
      return {
        error: `GitLab API error: ${projectRes.statusText}`,
        status: projectRes.status,
      };
    }

    const projectData = await projectRes.json();
    const releasesData = releasesRes.ok ? await releasesRes.json() : [];
    const commitsData = commitsRes.ok ? await commitsRes.json() : [];

    // GitLab exposes counts in headers x-total or x-total-pages usually, but basic plan:
    // For MRs and Contributors, we might need a separate call or rely on projectData if available.
    // projectData often has star_count, forks_count, etc.

    // GitLab pagination headers: x-total
    const getCountFromHeader = (res: Response) => {
      const total = res.headers.get("x-total");
      if (total) return parseInt(total, 10);
      // Fallback if no header (some instances disable it for perf)
      return 0; // Better handling might be needed
    };

    // Note: 'open_issues_count' is in projectData
    return {
      stats: {
        stars: projectData.star_count,
        release: releasesData[0]?.tag_name || "N/A",
        lastCommit: commitsData[0]?.created_at || "N/A",
        openIssues: projectData.open_issues_count || 0,
        openPulls: getCountFromHeader(mrsRes), // MRs
        contributors: getCountFromHeader(contributorsRes),
        provider: "gitlab",
        repoUrl: url,
      },
    };
  } catch (error) {
    console.error("GitLab API error:", error);
    return { error: "Failed to fetch GitLab stats", status: 500 };
  }
}

async function fetchGitea(
  host: string,
  owner: string,
  repo: string,
  url: string,
): Promise<FetchResult> {
  const baseUrl = `https://${host}/api/v1/repos/${owner}/${repo}`;

  try {
    const [repoRes, releaseRes, commitsRes, pullsRes, contributorsRes] =
      await Promise.all([
        fetch(baseUrl),
        fetch(`${baseUrl}/releases?limit=1`),
        fetch(`${baseUrl}/commits?limit=1`),
        fetch(`${baseUrl}/pulls?state=open&limit=1`),
        fetch(`${baseUrl}/contributors?limit=1`), // Gitea might not support this fully on all versions
      ]);

    if (!repoRes.ok) {
      return {
        error: `Gitea/Forgejo API error: ${repoRes.statusText}`,
        status: repoRes.status,
      };
    }

    const repoData = await repoRes.json();
    const releaseData = releaseRes.ok ? await releaseRes.json() : [];
    const commitsData = commitsRes.ok ? await commitsRes.json() : [];

    // Gitea uses X-Total-Count header
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
        provider: "gitea", // Or forgejo, functionally same API
        repoUrl: url,
      },
    };
  } catch (error) {
    console.error("Gitea API error:", error);
    return { error: "Failed to fetch Gitea stats", status: 500 };
  }
}

export async function getRepoStats(url: string): Promise<FetchResult> {
  if (!url) {
    return { error: "URL is required", status: 400 };
  }

  const cleanUrl = normalizeUrl(url);
  let provider: GitProvider | null = null;
  let owner = "";
  let repo = "";
  let host = "";

  // 1. Try to detect provider
  const githubMatch = cleanUrl.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+)/,
  );
  const gitlabMatch = cleanUrl.match(
    /^(?:https?:\/\/)?(?:www\.)?gitlab\.com\/([^/]+)\/([^/]+)/,
  );

  if (githubMatch) {
    provider = "github";
    owner = githubMatch[1];
    repo = githubMatch[2];
    host = "github.com";
  } else if (gitlabMatch) {
    provider = "gitlab";
    owner = gitlabMatch[1];
    repo = gitlabMatch[2];
    host = "gitlab.com";
  } else {
    // Self-hosted detection
    try {
      const u = new URL(
        cleanUrl.startsWith("http") ? cleanUrl : `https://${cleanUrl}`,
      );
      host = u.host;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        owner = parts[parts.length - 2];
        repo = parts[parts.length - 1];
      }
    } catch {
      return { error: "Invalid URL format", status: 400 };
    }
  }

  const db = getDb();
  // Check Cache
  const cached = await db
    .selectFrom("githubRepoStats")
    .select(["id", "data", "fetchedAt"])
    .where("url", "=", cleanUrl)
    .orderBy("fetchedAt", "desc")
    .executeTakeFirst();

  if (cached) {
    const fetchedAt = new Date(cached.fetchedAt).getTime();
    const now = Date.now();
    if (now - fetchedAt < 70000) {
      return { stats: JSON.parse(cached.data) };
    }
  }

  let result: FetchResult = { error: "Unknown provider" };

  if (provider === "github") {
    result = await fetchGithub(owner, repo, cleanUrl);
  } else if (provider === "gitlab") {
    result = await fetchGitlab(host, owner, repo, cleanUrl);
  } else {
    // Try probing for self-hosted
    // 1. Try Gitea/Forgejo
    result = await fetchGitea(host, owner, repo, cleanUrl);
    if (result.error && result.status === 404) {
      // 2. Try GitLab
      result = await fetchGitlab(host, owner, repo, cleanUrl);
    }
  }

  if (result.stats) {
    const statsStr = JSON.stringify(result.stats);
    if (cached) {
      await db
        .updateTable("githubRepoStats")
        .set({ fetchedAt: new Date().toISOString(), data: statsStr })
        .where("id", "=", cached.id)
        .execute();
    } else {
      await db
        .insertInto("githubRepoStats")
        .values({
          id: randomUUID(),
          url: cleanUrl,
          owner,
          repo,
          data: statsStr,
          fetchedAt: new Date().toISOString(),
        })
        .execute();
    }
  } else if (cached) {
    // Return cached data if fetch failed (e.g. rate limit or temporary network issue)
    return { stats: JSON.parse(cached.data) };
  }

  return result;
}
