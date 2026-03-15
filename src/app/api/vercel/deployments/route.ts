import { authenticatedAction } from "@lib/server-utils";
import { z } from "zod";
import { getVercelCredentials } from "@lib/vercel";

export const GET = authenticatedAction(
  async (req, { user }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) throw { status: 400, message: "projectId required" };

    const credentials = await getVercelCredentials(user.id);
    if (!credentials) throw { status: 400, message: "Vercel not connected" };

    const params = new URLSearchParams({
      projectId,
      limit: "10",
    });
    if (credentials.teamId) params.set("teamId", credentials.teamId);

    const res = await fetch(
      `https://api.vercel.com/v6/deployments?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      },
    );

    if (!res.ok) {
      throw {
        status: res.status,
        message: "Failed to fetch deployments",
      };
    }

    const data = await res.json();

    return (
      data.deployments as Array<{
        uid: string;
        name: string;
        url: string;
        state: string;
        created: number;
        source?: string;
        meta?: {
          githubCommitMessage?: string;
          githubCommitRef?: string;
        };
        creator?: { username?: string };
        ready?: number;
      }>
    ).map((d) => ({
      id: d.uid,
      name: d.name,
      url: d.url,
      state: d.state,
      created: d.created,
      ready: d.ready,
      source: d.source || null,
      commitMessage: d.meta?.githubCommitMessage || null,
      branch: d.meta?.githubCommitRef || null,
      creator: d.creator?.username || null,
    }));
  },
  { requireUser: true },
);

const RedeploySchema = z.object({
  projectId: z.string(),
  deploymentId: z.string(),
  name: z.string(),
});

export const POST = authenticatedAction(
  async (_req, { user, body }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };

    const { deploymentId, name } = RedeploySchema.parse(body);

    const credentials = await getVercelCredentials(user.id);
    if (!credentials) throw { status: 400, message: "Vercel not connected" };

    const params = new URLSearchParams();
    if (credentials.teamId) params.set("teamId", credentials.teamId);

    const queryString = params.toString();
    const url = `https://api.vercel.com/v13/deployments${
      queryString ? `?${queryString}` : ""
    }`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        deploymentId,
        name,
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw {
        status: res.status,
        message:
          (error as { error?: { message?: string } })?.error?.message ||
          "Failed to trigger deployment",
      };
    }

    const deployment = await res.json();
    return {
      id: deployment.id,
      url: deployment.url,
      state: deployment.readyState || deployment.state,
    };
  },
  { requireUser: true },
);

const CancelSchema = z.object({
  deploymentId: z.string(),
});

export const DELETE = authenticatedAction(
  async (_req, { user, body }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };

    const { deploymentId } = CancelSchema.parse(body);

    const credentials = await getVercelCredentials(user.id);
    if (!credentials) throw { status: 400, message: "Vercel not connected" };

    const params = new URLSearchParams();
    if (credentials.teamId) params.set("teamId", credentials.teamId);

    const queryString = params.toString();
    const url = `https://api.vercel.com/v12/deployments/${deploymentId}/cancel${
      queryString ? `?${queryString}` : ""
    }`;

    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw {
        status: res.status,
        message:
          (error as { error?: { message?: string } })?.error?.message ||
          "Failed to cancel deployment",
      };
    }

    return await res.json();
  },
  { requireUser: true },
);

const PromoteSchema = z.object({
  deploymentId: z.string(),
  projectId: z.string(),
});

export const PATCH = authenticatedAction(
  async (_req, { user, body }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };

    const { deploymentId, projectId } = PromoteSchema.parse(body);

    const credentials = await getVercelCredentials(user.id);
    if (!credentials) throw { status: 400, message: "Vercel not connected" };

    const params = new URLSearchParams();
    if (credentials.teamId) params.set("teamId", credentials.teamId);

    // To promote, we add an alias (the production domain) to the deployment
    // First, we need to find the production domain for the project
    const domainRes = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/domains?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      },
    );

    if (!domainRes.ok) {
      throw {
        status: domainRes.status,
        message: "Failed to fetch project domains",
      };
    }

    const { domains } = await domainRes.json();
    const prodDomain = domains.find(
      (d: { isCurrent?: boolean; verified: boolean }) => d.verified,
    );

    if (!prodDomain) {
      throw {
        status: 404,
        message: "No verified domain found for this project",
      };
    }

    const aliasRes = await fetch(
      `https://api.vercel.com/v2/deployments/${deploymentId}/aliases?${params.toString()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ alias: prodDomain.name }),
      },
    );

    if (!aliasRes.ok) {
      const error = await aliasRes.json().catch(() => ({}));
      throw {
        status: aliasRes.status,
        message:
          (error as { error?: { message?: string } })?.error?.message ||
          "Failed to promote deployment",
      };
    }

    return await aliasRes.json();
  },
  { requireUser: true },
);
