import { authenticatedAction } from "@lib/server-utils";
import { getVercelCredentials, getVercelParams } from "@lib/vercel";

export const DELETE = authenticatedAction(
  async (_req, { user, params }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };
    const { projectId, envId } = params;

    const credentials = await getVercelCredentials(user.id);
    if (!credentials) throw { status: 400, message: "Vercel not connected" };

    const vParams = getVercelParams(credentials);
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env/${envId}?${vParams.toString()}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      },
    );

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw {
        status: res.status,
        message:
          (error as { error?: { message?: string } })?.error?.message ||
          "Failed to delete environment variable",
      };
    }

    return await res.json();
  },
  { requireUser: true },
);
