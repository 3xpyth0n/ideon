import { projectAction } from "@lib/server-utils";
import { getProjectAuditEvents } from "@lib/audit-trail";

export const dynamic = "force-dynamic";

export const GET = projectAction<unknown>(
  async (req, { project }) => {
    const searchParams = req.nextUrl.searchParams;
    const rawLimit = Number.parseInt(searchParams.get("limit") || "", 10);
    const limit = Math.min(
      Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 50,
      200,
    );
    const before = searchParams.get("before");
    const action = searchParams.get("action");
    const userId = searchParams.get("userId");

    const { events, hasMore } = await getProjectAuditEvents(project.id, {
      limit,
      before,
      action,
      userId,
    });

    return { events, hasMore };
  },
  { minRole: "owner" },
);
