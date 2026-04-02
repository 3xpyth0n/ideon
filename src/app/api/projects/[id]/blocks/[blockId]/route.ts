import { projectAction } from "@lib/server-utils";
import { getDb } from "@lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ metadata: z.any() });

export const PATCH = projectAction(async (req, { project, body, user }) => {
  const db = getDb();

  const parsed = bodySchema.parse(body);
  const { metadata } = parsed as z.infer<typeof bodySchema>;

  // extract blockId from pathname: /api/projects/:id/blocks/:blockId
  const parts = req.nextUrl.pathname.split("/").filter(Boolean);
  const blockId = parts[parts.length - 1];

  if (!blockId) throw { status: 400, message: "blockId required" };

  // Store metadata as string in DB
  const metadataString =
    typeof metadata === "string" ? metadata : JSON.stringify(metadata);

  await db
    .updateTable("blocks")
    .set({ metadata: metadataString, updatedAt: new Date().toISOString() })
    .where("id", "=", blockId)
    .where("projectId", "=", project.id)
    .execute();

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[blocks] PATCH metadata for project=${project.id} block=${blockId} by user=${user?.id}`,
    );
  }

  return { success: true };
});

export const POST = PATCH;
