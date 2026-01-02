import { randomUUID } from "crypto";
import { getDb } from "./db";

export interface GithubStats {
  stars: number;
  release: string;
  lastCommit: string;
  openIssues: number;
  openPulls: number;
  contributors: number;
}

export async function getGithubStats(url: string): Promise<{
  stats?: GithubStats;
  error?: string;
  status?: number;
}> {
  if (!url) {
    return { error: "URL is required", status: 400 };
  }

  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    return { error: "Invalid GitHub URL", status: 400 };
  }

  const owner = match[1];
  const repo = match[2].replace(".git", "");
  const cleanUrl = `https://github.com/${owner}/${repo}`; // Normalize URL for cache key

  const db = getDb();

  // 1. Check Cache
  const cached = await db
    .selectFrom("githubRepoStats")
    .select(["id", "data", "fetchedAt"])
    .where("url", "=", cleanUrl)
    .orderBy("fetchedAt", "desc")
    .executeTakeFirst();

  if (cached) {
    const fetchedAt = new Date(cached.fetchedAt).getTime();
    const now = Date.now();
    // 70 seconds = 70000 ms
    if (now - fetchedAt < 70000) {
      return { stats: JSON.parse(cached.data) };
    }
  }

  // 2. Fetch from GitHub
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
        // Fallback to cache if rate limited, even if stale
        if (cached) {
          return { stats: JSON.parse(cached.data) };
        }
        return {
          error: "GitHub API rate limit exceeded",
          status: 429,
        };
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

    const stats = {
      stars: repoData.stargazers_count,
      release: releaseData?.tag_name || "N/A",
      lastCommit: commitData[0]?.commit?.author?.date || "N/A",
      openIssues: repoData.open_issues_count,
      openPulls: getCountFromHeader(pullsRes),
      contributors: getCountFromHeader(contributorsRes),
    };

    // 3. Save or Update Cache
    const statsStr = JSON.stringify(stats);

    if (cached && cached.data === statsStr) {
      // Data hasn't changed, just update the timestamp of the existing entry
      // to reset the TTL
      await db
        .updateTable("githubRepoStats")
        .set({ fetchedAt: new Date().toISOString() })
        .where("id", "=", cached.id)
        .execute();
    } else {
      // New data (or no cache), insert new record to preserve history
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

    return { stats };
  } catch (error) {
    console.error("GitHub API error:", error);
    return { error: "Failed to fetch GitHub stats", status: 500 };
  }
}
