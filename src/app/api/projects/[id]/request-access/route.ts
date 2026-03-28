import { NextResponse } from "next/server";
import { getDb, getPool } from "@lib/db";
import { authenticatedAction } from "@lib/server-utils";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@lib/logger";

export const POST = authenticatedAction<{ error?: string; status?: string }>(
  async (req, { params, user }) => {
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projectId = params.id;
    const db = getDb();

    let project: { id: string; ownerId: string } | null;
    try {
      const pool = getPool();
      if (pool) {
        const result = await pool.query<{ id: string; ownerId: string }>(
          'SELECT id, "ownerId" FROM projects WHERE id = $1',
          [projectId],
        );
        project = result.rows[0] ?? null;
      } else {
        // SQLite fallback (no RLS)
        const row = await db
          .selectFrom("projects")
          .select(["id", "ownerId"])
          .where("id", "=", projectId)
          .executeTakeFirst();
        project = row ?? null;
      }

      if (!project) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 },
        );
      }

      // Check if user is owner
      if (project.ownerId === user.id) {
        return NextResponse.json(
          { error: "You are the owner of this project" },
          { status: 400 },
        );
      }
    } catch (e) {
      logger.error(
        { err: e, projectId },
        "[RequestAccess] Error checking project",
      );
      throw e;
    }

    // Check if user is already collaborator
    try {
      const collaborator = await db
        .selectFrom("projectCollaborators")
        .selectAll()
        .where("projectId", "=", projectId)
        .where("userId", "=", user.id)
        .executeTakeFirst();

      if (collaborator) {
        return NextResponse.json(
          { error: "You are already a collaborator" },
          { status: 400 },
        );
      }
    } catch (e) {
      logger.error(
        { err: e, projectId },
        "[RequestAccess] Error checking collaborator",
      );
      throw e;
    }

    // Check for existing request
    try {
      const existingRequest = await db
        .selectFrom("projectRequests")
        .selectAll()
        .where("projectId", "=", projectId)
        .where("userId", "=", user.id)
        .executeTakeFirst();

      if (existingRequest) {
        if (existingRequest.status === "rejected") {
          return NextResponse.json(
            { error: "Your request has been rejected", status: "rejected" },
            { status: 403 },
          );
        }
        return NextResponse.json(
          { error: "Request already pending", status: "pending" },
          { status: 409 },
        );
      }
    } catch (e) {
      logger.error(
        { err: e, projectId },
        "[RequestAccess] Error checking existing request",
      );
      throw e;
    }

    try {
      const newId = uuidv4();

      // Create request
      await db
        .insertInto("projectRequests")
        .values({
          id: newId,
          projectId,
          userId: user.id,
          status: "pending",
          createdAt: new Date().toISOString(),
        })
        .execute();

      // Notify WebSocket clients
      try {
        if (global.updateProjectRequests) {
          await global.updateProjectRequests(projectId);
        }
      } catch (wsError) {
        logger.error(
          { err: wsError, projectId },
          "WebSocket notification failed",
        );
      }

      return NextResponse.json({ status: "pending" });
    } catch (error) {
      logger.error({ err: error, projectId }, "[RequestAccess] Insert failed");
      // Rethrow to let authenticatedAction handle it, or return 500 explicitly
      throw error;
    }
  },
  { requireUser: true },
);

export const GET = authenticatedAction(
  async (req, { params, user }) => {
    if (!user) return NextResponse.json({ status: null });

    const db = getDb();
    const request = await db
      .selectFrom("projectRequests")
      .select("status")
      .where("projectId", "=", params.id)
      .where("userId", "=", user.id)
      .executeTakeFirst();

    return NextResponse.json({ status: request?.status || null });
  },
  { requireUser: true },
);
