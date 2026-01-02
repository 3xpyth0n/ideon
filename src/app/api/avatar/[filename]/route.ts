import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { authenticatedAction } from "@lib/server-utils";

export const GET = authenticatedAction(
  async (_req, { params }) => {
    const { filename } = await params;

    // Basic security: prevent path traversal
    if (filename.includes("..") || filename.includes("/")) {
      throw { status: 403, message: "Forbidden" };
    }

    const filePath = join(process.cwd(), "storage", "avatars", filename);

    if (!existsSync(filePath)) {
      throw { status: 404, message: "Not Found" };
    }

    const fileBuffer = await readFile(filePath);

    // Determine content type based on extension
    const ext = filename.split(".").pop()?.toLowerCase();
    let contentType = "image/jpeg";
    if (ext === "png") contentType = "image/png";
    else if (ext === "webp") contentType = "image/webp";
    else if (ext === "gif") contentType = "image/gif";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  },
  { requireUser: true },
);
