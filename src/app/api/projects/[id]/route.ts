import { getDb, runTransaction } from "@lib/db";
import { projectAction } from "@lib/server-utils";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";

export const GET = projectAction(async (_req, { project }) => {
  return { project };
});

export const PATCH = projectAction(async (_req, { project, body }) => {
  const { name, description } = body as { name: string; description?: string };

  if (!name) {
    throw { status: 400, message: "Name is required" };
  }

  const db = getDb();

  await db
    .updateTable("projects")
    .set({
      name,
      description: description || null,
      updatedAt: new Date().toISOString(),
    })
    .where("id", "=", project.id)
    .execute();

  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
  await logSecurityEvent("projectUpdate", "success", {
    userId: project.ownerId,
    ip,
  });

  return { success: true };
});

export const DELETE = projectAction(async (_req, { project, user }) => {
  const db = getDb();

  // Use a transaction to ensure clean deletion
  await runTransaction(db, async (trx) => {
    await trx.deleteFrom("projects").where("id", "=", project.id).execute();
  });

  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
  await logSecurityEvent("projectDelete", "success", {
    userId: user.id,
    ip,
  });

  return { success: true };
});
