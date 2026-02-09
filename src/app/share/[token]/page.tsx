import { getDb } from "@lib/db";
import { transformBlock, transformLink, DbBlock } from "@lib/graph";
import { PublicProjectCanvas } from "@components/project/PublicProjectCanvas";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { Node } from "@xyflow/react";
import { BlockData } from "@components/project/CanvasBlock";

interface PageProps {
  params: Promise<{ token: string }>;
}

async function getProjectData(token: string) {
  const db = getDb();

  const project = await db
    .selectFrom("projects")
    .select(["id", "name", "description", "ownerId"])
    .where("shareToken", "=", token)
    .where("shareEnabled", "=", 1)
    .executeTakeFirst();

  if (!project) return null;

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

  const links = await db
    .selectFrom("links")
    .selectAll()
    .where("projectId", "=", project.id)
    .execute();

  return {
    project,
    blocks: blocks.map((b) => transformBlock(b as unknown as DbBlock)),
    links: links.map((l) => transformLink(l)),
  };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const data = await getProjectData(token);

  if (!data) return { title: "Project Not Found" };

  return {
    title: `${data.project.name} - Ideon`,
    description: data.project.description || "View this project on Ideon",
  };
}

export default async function SharedProjectPage({ params }: PageProps) {
  const { token } = await params;

  const data = await getProjectData(token);

  if (!data) {
    notFound();
  }

  return (
    <PublicProjectCanvas
      blocks={data.blocks as Node<BlockData>[]}
      links={data.links}
      projectName={data.project.name}
    />
  );
}
