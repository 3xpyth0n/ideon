import { authenticatedAction } from "@lib/server-utils";
import { getVercelCredentials, getVercelParams } from "@lib/vercel";

export const POST = authenticatedAction(
  async (_req, { user, params }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };
    const { projectId } = params;

    const credentials = await getVercelCredentials(user.id);
    if (!credentials) throw { status: 400, message: "Vercel not connected" };

    const vParams = getVercelParams(credentials);
    // Vercel API for bypassing protection (Deployment Protection)
    // POST /v1/projects/:idOrName/protection-bypass
    const res = await fetch(
      `https://api.vercel.com/v1/projects/${projectId}/protection-bypass?${vParams.toString()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!res.ok) {
      if (res.status === 404) {
        throw {
          status: 404,
          message:
            "Deployment Protection is not enabled for this Vercel project. Enable it in your Vercel dashboard to use bypass.",
        };
      }
      const error = await res.json().catch(() => ({}));
      throw {
        status: res.status,
        message:
          (error as { error?: { message?: string } })?.error?.message ||
          "Failed to generate bypass link",
      };
    }

    return await res.json();
  },
  { requireUser: true },
);
