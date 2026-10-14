import { projectAction } from "@lib/server-utils";
import { getCurrentSeal, computeDelta } from "@lib/records";

export const dynamic = "force-dynamic";

export const GET = projectAction(async (_req, { project }) => {
  const seal = await getCurrentSeal(project.id);
  if (!seal) {
    throw { status: 404, message: "No sealed state for this project" };
  }

  return computeDelta(project.id, seal);
});
