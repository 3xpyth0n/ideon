import { authenticatedAction } from "@lib/server-utils";
import { getVercelCredentials, getVercelParams } from "@lib/vercel";

export const GET = authenticatedAction(
  async (req, { user, params }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };
    const { deploymentId } = params;

    const credentials = await getVercelCredentials(user.id);
    if (!credentials) throw { status: 400, message: "Vercel not connected" };

    const vParams = getVercelParams(credentials);

    // We'll proxy the events stream from Vercel
    const url = `https://api.vercel.com/v2/deployments/${deploymentId}/events?${vParams.toString()}`;

    // For simplicity in this environment, we'll use a standard fetch
    // but in a production Next.js app we might need to handle streaming response.
    // authenticatedAction expects a JSON response or a Response object.

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });

    if (!res.ok) {
      throw { status: res.status, message: "Failed to fetch deployment logs" };
    }

    // Return the stream directly
    return new Response(res.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  },
  { requireUser: true },
);
