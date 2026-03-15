import { authenticatedAction } from "@lib/server-utils";
import { getVercelCredentials, getVercelParams } from "@lib/vercel";

export const GET = authenticatedAction(
  async (_req, { user, params }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };
    const { domain } = params;

    const credentials = await getVercelCredentials(user.id);
    if (!credentials) throw { status: 400, message: "Vercel not connected" };

    const vParams = getVercelParams(credentials);
    const res = await fetch(
      `https://api.vercel.com/v6/domains/${domain}/config?${vParams.toString()}`,
      {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      },
    );

    if (!res.ok) {
      throw { status: res.status, message: "Failed to fetch domain config" };
    }

    return await res.json();
  },
  { requireUser: true },
);
