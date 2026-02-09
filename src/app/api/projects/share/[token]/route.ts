import { getDb } from "@lib/db";
import { transformBlock, transformLink, DbBlock } from "@lib/graph";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const db = getDb();

  // Find project by token
  const project = await db
    .selectFrom("projects")
    .select(["id", "name", "description", "ownerId", "currentStateId"])
    .where("shareToken", "=", token)
    .where("shareEnabled", "=", 1)
    .executeTakeFirst();

  if (!project) {
    return NextResponse.json(
      { error: "Project not found or sharing disabled" },
      { status: 404 },
    );
  }

  // Fetch blocks
  const blocks = await db
    .selectFrom("blocks")
    .leftJoin("users", "users.id", "blocks.ownerId")
    .select([
      "blocks.id",
      "blocks.blockType",
      "blocks.positionX",
      "blocks.positionY",
      "blocks.width",
      "blocks.height",
      "blocks.selected",
      "blocks.content",
      "blocks.data",
      "blocks.metadata",
      "blocks.ownerId",
      "blocks.updatedAt",
      "users.username as authorName",
      "users.color as authorColor",
    ])
    .where("blocks.projectId", "=", project.id)
    .execute();

  // Fetch links
  const links = await db
    .selectFrom("links")
    .selectAll()
    .where("projectId", "=", project.id)
    .execute();

  return NextResponse.json({
    project: {
      name: project.name,
      description: project.description,
    },
    blocks: blocks.map((b) => transformBlock(b as unknown as DbBlock)),
    links: links.map((l) => transformLink(l)),
    projectOwnerId: project.ownerId,
    currentStateId: project.currentStateId,
  });
}
