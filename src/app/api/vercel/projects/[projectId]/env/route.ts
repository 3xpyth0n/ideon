import { authenticatedAction } from "@lib/server-utils";
import { getVercelCredentials, getVercelParams } from "@lib/vercel";
import { z } from "zod";

export const GET = authenticatedAction(
  async (_req, { user, params }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };
    const { projectId } = params;

    const credentials = await getVercelCredentials(user.id);
    if (!credentials) throw { status: 400, message: "Vercel not connected" };

    const vParams = getVercelParams(credentials);
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env?${vParams.toString()}`,
      {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      },
    );

    if (!res.ok) {
      throw {
        status: res.status,
        message: "Failed to fetch environment variables",
      };
    }

    const data = await res.json();
    // Return only keys as per requirements
    return (data.envs || []).map(
      (env: { id: string; key: string; type: string }) => ({
        id: env.id,
        key: env.key,
        type: env.type,
      }),
    );
  },
  { requireUser: true },
);

const EnvVarSchema = z.object({
  key: z.string(),
  value: z.string(),
  type: z.enum(["secret", "plain", "encrypted", "system"]).default("plain"),
  target: z.array(z.string()).default(["development", "preview", "production"]),
});

export const POST = authenticatedAction(
  async (_req, { user, params, body }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };
    const { projectId } = params;
    const { key, value, type, target } = EnvVarSchema.parse(body);

    const credentials = await getVercelCredentials(user.id);
    if (!credentials) throw { status: 400, message: "Vercel not connected" };

    const vParams = getVercelParams(credentials);
    const res = await fetch(
      `https://api.vercel.com/v10/projects/${projectId}/env?${vParams.toString()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key, value, type, target }),
      },
    );

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw {
        status: res.status,
        message:
          (error as { error?: { message?: string } })?.error?.message ||
          "Failed to add environment variable",
      };
    }

    return await res.json();
  },
  { requireUser: true },
);
