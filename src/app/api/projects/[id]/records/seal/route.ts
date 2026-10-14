import { projectAction } from "@lib/server-utils";
import { sealState } from "@lib/records";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const sealSchema = z.object({
  stateId: z.string().optional(),
  summary: z.string().max(500).optional(),
});

export const POST = projectAction(
  async (_req, { project, user, body }) => {
    const stateId = body.stateId ?? project.currentStateId;

    if (!stateId) {
      throw { status: 400, message: "This project has no saved state to seal" };
    }

    const seal = await sealState({
      projectId: project.id,
      stateId,
      authorId: user.id,
      summary: body.summary,
    });

    return NextResponse.json({ seal }, { status: 201 });
  },
  { schema: sealSchema, minRole: "editor" },
);
