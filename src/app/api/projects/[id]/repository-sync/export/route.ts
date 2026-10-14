import { projectAction } from "@lib/server-utils";
import { zipSync } from "fflate";
import { NextResponse } from "next/server";
import { createProjectRepositoryBundle } from "../../../../../../lib/repository-sync/project";

export const dynamic = "force-dynamic";

export const GET = projectAction(
  async (_req, { project }) => {
    const { bundle } = await createProjectRepositoryBundle(project);
    const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, "_");

    return new NextResponse(Buffer.from(zipSync(bundle)), {
      headers: {
        "Content-Disposition": `attachment; filename="${safeName}-repository.zip"`,
        "Content-Type": "application/zip",
      },
    });
  },
  { minRole: "owner" },
);
