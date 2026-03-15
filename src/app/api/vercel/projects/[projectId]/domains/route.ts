import { authenticatedAction } from "@lib/server-utils";
import { getVercelCredentials } from "@lib/vercel";

export const GET = authenticatedAction(
  async (req, { user, params }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };

    const { projectId } = params as { projectId: string };
    if (!projectId) throw { status: 400, message: "projectId required" };

    const credentials = await getVercelCredentials(user.id);
    if (!credentials) throw { status: 400, message: "Vercel not connected" };

    const searchParams = new URLSearchParams();
    if (credentials.teamId) searchParams.set("teamId", credentials.teamId);

    const res = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/domains?${searchParams.toString()}`,
      {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      },
    );

    if (!res.ok) {
      throw { status: res.status, message: "Failed to fetch project domains" };
    }

    const data = await res.json();
    return data.domains as Array<{
      name: string;
      apexName: string;
      verified: boolean;
    }>;
  },
  { requireUser: true },
);
