
import { NextResponse } from "next/server";
import { getDb } from "@lib/db";
import { authenticatedAction } from "@lib/server-utils";
import crypto from "crypto";

export const POST = authenticatedAction<{ error?: string; status?: string }>(async (req, { params, user }) => {
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = params.id;
  const db = await getDb();

  // Check if project exists
  try {
    const project = await db
      .selectFrom("projects")
      .selectAll()
      .where("id", "=", projectId)
      .executeTakeFirst();
      
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check if user is owner
    if (project.ownerId === user.id) {
      return NextResponse.json(
        { error: "You are the owner of this project" },
        { status: 400 },
      );
    }
  } catch (e) {
    console.error("[RequestAccess] Error checking project:", e);
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
    console.error("[RequestAccess] Error checking collaborator:", e);
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
    console.error("[RequestAccess] Error checking existing request:", e);
    throw e;
  }

  try {
    const newId = crypto.randomUUID();
    
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
    if (global.updateProjectRequests) {
      await global.updateProjectRequests(projectId);
    }

    return NextResponse.json({ status: "pending" });
  } catch (error) {
    console.error("[RequestAccess] Insert failed:", error);
    // Rethrow to let authenticatedAction handle it, or return 500 explicitly
    throw error;
  }
}, { requireUser: true });

export const GET = authenticatedAction(async (req, { params, user }) => {
  if (!user) return NextResponse.json({ status: null });

  const db = await getDb();
  const request = await db
    .selectFrom("projectRequests")
    .select("status")
    .where("projectId", "=", params.id)
    .where("userId", "=", user.id)
    .executeTakeFirst();

  return NextResponse.json({ status: request?.status || null });
}, { requireUser: true });
