import { getDb } from "@lib/db";
import { authenticatedAction } from "@lib/server-utils";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";
import { z } from "zod";

export const PATCH = authenticatedAction(
  async (_req, { params, user: auth, body }) => {
    if (!auth) throw { status: 401, message: "Unauthorized" };
    const db = getDb();

    // Check role in DB to avoid stale JWT issues
    const userRole = await db
      .selectFrom("users")
      .select("role")
      .where("id", "=", auth.id)
      .executeTakeFirst();

    if (
      !userRole ||
      (userRole.role !== "superadmin" && userRole.role !== "admin")
    ) {
      throw { status: 401, message: "Unauthorized" };
    }

    const { id } = z.object({ id: z.string() }).parse(params);
    const { role } = body as { role?: "admin" | "member" };

    if (role && userRole.role !== "superadmin") {
      throw { status: 403, message: "Forbidden" };
    }

    if (role && !["admin", "member"].includes(role)) {
      throw { status: 400, message: "Invalid role" };
    }

    // Prevent changing role of superadmin
    const targetUser = await db
      .selectFrom("users")
      .select("role")
      .where("id", "=", id)
      .executeTakeFirst();

    if (!targetUser) {
      throw { status: 404, message: "User not found" };
    }

    if (targetUser.role === "superadmin" && userRole.role !== "superadmin") {
      throw { status: 403, message: "Forbidden" };
    }

    await db.updateTable("users").set({ role }).where("id", "=", id).execute();

    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    await logSecurityEvent("userRoleUpdate", "success", {
      userId: auth.id,
      ip,
    });

    return { success: true };
  },
  { requireUser: true },
);

export const DELETE = authenticatedAction(
  async (_req, { params, user: auth }) => {
    if (!auth) throw { status: 401, message: "Unauthorized" };
    const db = getDb();
    const { id } = z.object({ id: z.string() }).parse(params);

    // Check role in DB to avoid stale JWT issues
    const userRole = await db
      .selectFrom("users")
      .select("role")
      .where("id", "=", auth.id)
      .executeTakeFirst();

    if (
      !userRole ||
      (userRole.role !== "superadmin" && userRole.role !== "admin")
    ) {
      throw { status: 401, message: "Unauthorized" };
    }

    if (auth.id === id) {
      throw { status: 400, message: "Cannot delete yourself" };
    }

    const targetUser = await db
      .selectFrom("users")
      .select("role")
      .where("id", "=", id)
      .executeTakeFirst();

    if (!targetUser) {
      throw { status: 404, message: "User not found" };
    }

    if (targetUser.role === "superadmin" && userRole.role !== "superadmin") {
      throw { status: 403, message: "Forbidden" };
    }

    await db.deleteFrom("users").where("id", "=", id).execute();

    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    await logSecurityEvent("userDelete", "success", {
      userId: auth.id,
      ip,
    });

    return { success: true };
  },
  { requireUser: true },
);
