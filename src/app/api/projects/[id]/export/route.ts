import { projectAction } from "@lib/server-utils";
import { getDb } from "@lib/db";
import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { zipSync } from "fflate";

export const GET = projectAction(async (_req, { project, role }) => {
  if (role !== "creator" && role !== "owner") {
    throw { status: 403, message: "Only project owners can export" };
  }

  const db = getDb();

  const blocks = await db
    .selectFrom("blocks")
    .select([
      "id",
      "blockType",
      "metadata",
      "parentBlockId",
      "positionX",
      "positionY",
      "width",
      "height",
      "content",
      "data",
      "createdAt",
      "updatedAt",
    ])
    .where("projectId", "=", project.id)
    .execute();

  const links = await db
    .selectFrom("links")
    .select([
      "id",
      "source",
      "target",
      "sourceHandle",
      "targetHandle",
      "animated",
      "type",
      "label",
      "data",
      "createdAt",
      "updatedAt",
    ])
    .where("projectId", "=", project.id)
    .execute();

  const manifest = {
    version: "1",
    format: "ideon-project",
    exportedAt: new Date().toISOString(),
    blockCount: blocks.length,
    linkCount: links.length,
  };

  const projectMeta = {
    name: project.name,
    description: project.description,
  };

  const files: Record<string, Uint8Array> = {
    "manifest.json": Buffer.from(JSON.stringify(manifest, null, 2)),
    "project.json": Buffer.from(JSON.stringify(projectMeta, null, 2)),
    "blocks.json": Buffer.from(JSON.stringify(blocks, null, 2)),
    "links.json": Buffer.from(JSON.stringify(links, null, 2)),
  };

  const uploadsDir = join(
    process.cwd(),
    "storage",
    "uploads",
    `project-${project.id}`,
  );

  if (existsSync(uploadsDir)) {
    const fileNames = await readdir(uploadsDir);
    for (const fileName of fileNames) {
      const filePath = join(uploadsDir, fileName);
      const content = await readFile(filePath);
      files[`assets/${fileName}`] = content;
    }
  }

  const safeName = project.name.replace(/[^a-zA-Z0-9_\- ]/g, "_");
  const zip = Buffer.from(zipSync(files));

  return new NextResponse(zip, {
    headers: {
      "Content-Disposition": `attachment; filename="${safeName}.ideon"`,
      "Content-Type": "application/zip",
    },
  });
});
