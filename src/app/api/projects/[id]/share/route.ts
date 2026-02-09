import { getDb } from "@lib/db";
import { projectAction } from "@lib/server-utils";
import * as crypto from "crypto";

// Helper to get full share URL
const getShareUrl = (token: string) => {
  const baseUrl = process.env.APP_URL || "http://localhost:3000";
  return `${baseUrl}/share/${token}`;
};

export const GET = projectAction(async (_req, { project, user }) => {
  // Only owner can manage sharing settings
  if (project.ownerId !== user.id) {
    throw { status: 403, message: "Forbidden" };
  }

  return {
    shareEnabled: !!project.shareEnabled,
    shareToken: project.shareToken,
    shareUrl: project.shareToken ? getShareUrl(project.shareToken) : null,
  };
});

export const POST = projectAction(async (_req, { project, user }) => {
  // Only owner can generate link
  if (project.ownerId !== user.id) {
    throw { status: 403, message: "Forbidden" };
  }

  const db = getDb();
  const token = crypto.randomBytes(12).toString("base64url");
  const now = new Date().toISOString();

  await db
    .updateTable("projects")
    .set({
      shareToken: token,
      shareEnabled: 1,
      shareCreatedAt: now,
    })
    .where("id", "=", project.id)
    .execute();

  return {
    shareToken: token,
    shareUrl: getShareUrl(token),
  };
});

export const PATCH = projectAction(async (_req, { project, user, body }) => {
  // Only owner can toggle sharing
  if (project.ownerId !== user.id) {
    throw { status: 403, message: "Forbidden" };
  }

  const { shareEnabled, enabled } = body as {
    shareEnabled?: boolean;
    enabled?: boolean;
  };
  const isEnabled = shareEnabled ?? enabled;
  const db = getDb();

  await db
    .updateTable("projects")
    .set({
      shareEnabled: isEnabled ? 1 : 0,
    })
    .where("id", "=", project.id)
    .execute();

  return {
    success: true,
    shareEnabled: isEnabled,
  };
});

export const DELETE = projectAction(async (_req, { project, user }) => {
  // Only owner can remove link
  if (project.ownerId !== user.id) {
    throw { status: 403, message: "Forbidden" };
  }

  const db = getDb();

  await db
    .updateTable("projects")
    .set({
      shareToken: null,
      shareEnabled: 0,
      shareCreatedAt: null,
    })
    .where("id", "=", project.id)
    .execute();

  return { success: true };
});
