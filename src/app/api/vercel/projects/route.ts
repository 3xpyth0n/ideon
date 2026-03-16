import { authenticatedAction } from "@lib/server-utils";
import { getDb } from "@lib/db";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { getVercelCredentials } from "@lib/vercel";

export const GET = authenticatedAction(
  async (_req, { user }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };

    const credentials = await getVercelCredentials(user.id);
    if (!credentials) throw { status: 400, message: "Vercel not connected" };

    const params = new URLSearchParams({ limit: "50" });
    if (credentials.teamId) params.set("teamId", credentials.teamId);

    const res = await fetch(
      `https://api.vercel.com/v9/projects?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      },
    );

    if (!res.ok) {
      throw { status: res.status, message: "Failed to fetch Vercel projects" };
    }

    const data = await res.json();

    // Fetch all possible scopes (user + all teams) to build an ID -> Slug map
    const [userRes, teamsRes] = await Promise.all([
      fetch("https://api.vercel.com/v2/user", {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      }),
      fetch("https://api.vercel.com/v2/teams", {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      }),
    ]);

    const scopeMap = new Map<string, string>();

    if (userRes.ok) {
      const userData = await userRes.json();
      scopeMap.set(userData.user.id, userData.user.username);
    }

    if (teamsRes.ok) {
      const teamsData = await teamsRes.json();
      (teamsData.teams || []).forEach((t: { id: string; slug: string }) => {
        scopeMap.set(t.id, t.slug);
      });
    }

    const vercelProjects = (
      data.projects as Array<{ id: string; name: string; accountId: string }>
    ).map((p) => ({
      vercelProjectId: p.id,
      vercelProjectName: p.name,
      scopeSlug: scopeMap.get(p.accountId) || null,
    }));

    const db = getDb();
    const enabledRows = await db
      .selectFrom("userVercelProjects")
      .select(["vercelProjectId", "enabled"])
      .where("userId", "=", user.id)
      .execute();

    const enabledMap = new Map(
      enabledRows.map((r) => [r.vercelProjectId, r.enabled === 1]),
    );

    return vercelProjects.map((p) => ({
      ...p,
      enabled: enabledMap.get(p.vercelProjectId) ?? false,
    }));
  },
  { requireUser: true },
);

const ProjectSelectionSchema = z.array(
  z.object({
    vercelProjectId: z.string(),
    vercelProjectName: z.string(),
    enabled: z.boolean(),
  }),
);

export const POST = authenticatedAction(
  async (_req, { user, body }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };

    const selections = ProjectSelectionSchema.parse(body);
    const db = getDb();

    await db
      .deleteFrom("userVercelProjects")
      .where("userId", "=", user.id)
      .execute();

    const toInsert = selections
      .filter((s: { enabled: boolean }) => s.enabled)
      .map(
        (s: {
          vercelProjectId: string;
          vercelProjectName: string;
          enabled: boolean;
        }) => ({
          id: uuidv4(),
          userId: user.id,
          vercelProjectId: s.vercelProjectId,
          vercelProjectName: s.vercelProjectName,
          enabled: 1,
          createdAt: new Date().toISOString(),
        }),
      );

    if (toInsert.length > 0) {
      await db.insertInto("userVercelProjects").values(toInsert).execute();
    }

    return { success: true };
  },
  { requireUser: true },
);
