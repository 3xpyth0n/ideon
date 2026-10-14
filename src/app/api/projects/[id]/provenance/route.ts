import { projectAction } from "@lib/server-utils";
import { getBlockProvenance } from "@lib/instrument";
import { NextRequest } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const provenanceQuerySchema = z.object({
  blockId: z.string().min(1),
});

export const GET = projectAction(async (req: NextRequest, { project }) => {
  const parsed = provenanceQuerySchema.safeParse({
    blockId: req.nextUrl.searchParams.get("blockId"),
  });
  if (!parsed.success) {
    throw { status: 400, message: "A valid blockId is required" };
  }

  const provenance = await getBlockProvenance(project.id, parsed.data.blockId);

  return {
    created: provenance.created,
    modifications: provenance.modifications,
    sealed: provenance.sealed,
  };
});
