import { authenticatedAction } from "@lib/server-utils";
import { getVercelCredentials, getVercelParams } from "@lib/vercel";

export const GET = authenticatedAction(
  async (_req, { user, params }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };
    const { projectId } = params;

    const credentials = await getVercelCredentials(user.id);
    if (!credentials) throw { status: 400, message: "Vercel not connected" };

    const vParams = getVercelParams(credentials);
    // Vercel doesn't have a single "previews" endpoint, we filter deployments
    // We'll get deployments and filter by preview state and branch
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&state=READY&limit=20&${vParams.toString()}`,
      {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      },
    );

    if (!res.ok) {
      throw { status: res.status, message: "Failed to fetch deployments" };
    }

    const data = await res.json();

    // Group by branch and keep the latest preview for each
    const branchPreviews: Record<
      string,
      {
        id: string;
        url: string;
        branch: string;
        commitMessage?: string;
        githubPrId?: number;
        created: number;
      }
    > = {};

    (data.deployments || []).forEach(
      (d: {
        uid: string;
        url: string;
        meta?: {
          githubCommitRef?: string;
          githubCommitMessage?: string;
          githubPrId?: number;
        };
        created: number;
      }) => {
        const branch = d.meta?.githubCommitRef;
        if (
          branch &&
          branch !== "main" &&
          branch !== "master" &&
          !branchPreviews[branch]
        ) {
          branchPreviews[branch] = {
            id: d.uid,
            url: d.url,
            branch,
            commitMessage: d.meta?.githubCommitMessage,
            githubPrId: d.meta?.githubPrId,
            created: d.created,
          };
        }
      },
    );

    return Object.values(branchPreviews);
  },
  { requireUser: true },
);
