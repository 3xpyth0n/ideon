import { projectAction } from "@lib/server-utils";

export const POST = projectAction(async (_req, { project, params, role }) => {
  if (role !== "creator" && role !== "owner") {
    throw {
      status: 403,
      message: "Only project owners can trigger automation rules",
    };
  }

  const triggerRule = (
    global as {
      triggerRule?: (ruleId: string, projectId: string) => Promise<void>;
    }
  ).triggerRule;
  if (!triggerRule) throw { status: 503, message: "Trigger not available" };

  await triggerRule(params.ruleId, project.id);
  return { ok: true };
});
