import { projectAction } from "@lib/server-utils";
import { buildDossier, buildDossierArchive } from "@lib/instrument";
import { renderDossierPdf, lockPdf } from "@lib/instrument-pdf";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const dossierSchema = z.object({
  sealId: z.string().uuid(),
  canvasImage: z.string().max(8_000_000).optional(),
});

export const POST = projectAction(
  async (_req, { project, body }) => {
    const dossier = await buildDossier(project.id, body.sealId);
    const pdf = await renderDossierPdf(dossier, body.canvasImage);
    const lockedPdf = await lockPdf(pdf);
    const archive = await buildDossierArchive(
      project.id,
      body.sealId,
      lockedPdf,
      dossier.certificate.projectName,
      dossier.certificate.sealedAt,
    );

    return new NextResponse(new Uint8Array(archive.content), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${archive.filename}"`,
      },
    });
  },
  { schema: dossierSchema, minRole: "editor" },
);
