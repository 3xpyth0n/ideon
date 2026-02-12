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
  token?: string,
): Promise<FetchResult> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Ideon-App",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
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
  token?: string,
): Promise<FetchResult> {
  const projectPath = encodeURIComponent(`${owner}/${repo}`);
  const baseUrl = `https://${host}/api/v4/projects/${projectPath}`;

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const [projectRes, releasesRes, commitsRes, mrsRes, contributorsRes] =
      await Promise.all([
        fetch(baseUrl, { headers }),
        fetch(`${baseUrl}/releases?per_page=1`, { headers }),
        fetch(`${baseUrl}/repository/commits?per_page=1`, { headers }),
        fetch(`${baseUrl}/merge_requests?state=opened&per_page=1`, { headers }),
        fetch(`${baseUrl}/repository/contributors?per_page=1`, { headers }),
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
  token?: string,
): Promise<FetchResult> {
  const baseUrl = `https://${host}/api/v1/repos/${owner}/${repo}`;

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  try {
    const [repoRes, releaseRes, commitsRes, pullsRes, contributorsRes] =
      await Promise.all([
        fetch(baseUrl, { headers }),
        fetch(`${baseUrl}/releases?limit=1`, { headers }),
        fetch(`${baseUrl}/commits?limit=1`, { headers }),
        fetch(`${baseUrl}/pulls?state=open&limit=1`, { headers }),
        fetch(`${baseUrl}/contributors?limit=1`, { headers }),
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
        repoUrl: url,
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
  let provider: GitProvider | null = null;
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

  if (provider === "github") {
    return fetchGithub(owner, repo, cleanUrl, token);
  } else if (provider === "gitlab") {
    return fetchGitlab(host, owner, repo, cleanUrl, token);
  } else {
    // Try probing for self-hosted
    let result = await fetchGitea(host, owner, repo, cleanUrl, token);
    if (result.error && result.status === 404) {
      result = await fetchGitlab(host, owner, repo, cleanUrl, token);
    }
    return result;
  }
}
