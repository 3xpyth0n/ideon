import { projectAction } from "@lib/server-utils";
import { verifyProjectChain } from "@lib/audit-trail";

export const dynamic = "force-dynamic";

export const GET = projectAction<unknown>(
  async (_req, { project }) => {
    return verifyProjectChain(project.id);
  },
  { minRole: "owner" },
);
