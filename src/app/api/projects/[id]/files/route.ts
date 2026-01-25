import { projectAction } from "@lib/server-utils";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { sanitizeFileName } from "@lib/file-utils";

export const POST = projectAction(async (req, { project }) => {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    throw { status: 400, message: "No file uploaded" };
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const projectStorageDir = join(
    process.cwd(),
    "storage",
    "uploads",
    `project-${project.id}`,
  );

  if (!existsSync(projectStorageDir)) {
    await mkdir(projectStorageDir, { recursive: true });
  }

  // Security: Sanitize filename to prevent directory traversal
  const safeFileName = sanitizeFileName(file.name);
  const filePath = join(projectStorageDir, safeFileName);

  await writeFile(filePath, buffer);

  return {
    success: true,
    name: safeFileName,
    size: file.size,
    type: file.type,
  };
});

export const GET = projectAction(async (req, { project }) => {
  const { searchParams } = new URL(req.url);
  const rawFileName = searchParams.get("name");

  if (!rawFileName) {
    throw { status: 400, message: "File name is required" };
  }

  // Security: Sanitize filename to prevent reading arbitrary files
  const fileName = sanitizeFileName(rawFileName);

  const filePath = join(
    process.cwd(),
    "storage",
    "uploads",
    `project-${project.id}`,
    fileName,
  );

  if (!existsSync(filePath)) {
    console.error(`File not found at path: ${filePath}`);
    throw { status: 404, message: "File not found" };
  }

  const fileBuffer = await readFile(filePath);

  const ext = fileName.split(".").pop()?.toLowerCase();
  let contentType = "application/octet-stream";

  switch (ext) {
    case "png":
      contentType = "image/png";
      break;
    case "jpg":
    case "jpeg":
      contentType = "image/jpeg";
      break;
    case "gif":
      contentType = "image/gif";
      break;
    case "svg":
      contentType = "image/svg+xml";
      break;
    case "webp":
      contentType = "image/webp";
      break;
    case "pdf":
      contentType = "application/pdf";
      break;
  }

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Content-Type": contentType,
    },
  });
});

export const DELETE = projectAction(async (req, { project }) => {
  const { searchParams } = new URL(req.url);
  const rawFileName = searchParams.get("name");

  if (!rawFileName) {
    throw { status: 400, message: "File name is required" };
  }

  // Security: Sanitize filename to prevent deleting arbitrary files
  const fileName = sanitizeFileName(rawFileName);

  const filePath = join(
    process.cwd(),
    "storage",
    "uploads",
    `project-${project.id}`,
    fileName,
  );

  try {
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
    return { success: true };
  } catch (error) {
    console.error("Error deleting file:", error);
    throw { status: 500, message: "Failed to delete file" };
  }
});
