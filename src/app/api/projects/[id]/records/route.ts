import { projectAction } from "@lib/server-utils";
import { getCurrentSeal, verifySealIntegrity } from "@lib/records";

export const dynamic = "force-dynamic";

export const GET = projectAction(async (_req, { project }) => {
  const seal = await getCurrentSeal(project.id);
  if (!seal) {
    return { seal: null };
  }

  const integrity = await verifySealIntegrity(seal);

  return {
    seal: {
      id: seal.id,
      authorEmail: seal.authorEmail,
      sealedAt: seal.createdAt,
      stateHash: seal.stateHash,
      summary: seal.summary,
      integrity,
    },
  };
});
