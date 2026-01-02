import { getDb } from "@lib/db";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import crypto from "crypto";
import { authenticatedAction } from "@lib/server-utils";

export const POST = authenticatedAction(
  async (req, { user: auth }) => {
    if (!auth) throw { status: 401, message: "Unauthorized" };
    const userId = auth.id;

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      throw { status: 400, message: "No file uploaded" };
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      throw { status: 400, message: "Invalid file type" };
    }

    // Limit size to 5MB
    if (file.size > 5 * 1024 * 1024) {
      throw { status: 400, message: "File too large" };
    }

    const fileExtension = file.name.split(".").pop();
    const fileName = `${userId}_${crypto
      .randomBytes(8)
      .toString("hex")}.${fileExtension}`;
    const uploadDir = join(process.cwd(), "storage", "avatars");
    const filePath = join(uploadDir, fileName);

    await writeFile(filePath, buffer);

    const avatarUrl = `/api/avatar/${fileName}`;

    // Update user in DB
    const db = getDb();
    await db
      .updateTable("users")
      .set({ avatarUrl: avatarUrl })
      .where("id", "=", userId)
      .execute();

    return { avatarUrl: avatarUrl };
  },
  { requireUser: true },
);

export const DELETE = authenticatedAction(
  async (_req, { user: auth }) => {
    if (!auth) throw { status: 401, message: "Unauthorized" };
    const userId = auth.id;

    const db = getDb();
    const user = await db
      .selectFrom("users")
      .select("avatarUrl")
      .where("id", "=", userId)
      .executeTakeFirst();

    if (user?.avatarUrl) {
      // Handle both old /uploads/avatars and new /api/avatar paths
      let filePath;
      if (user.avatarUrl.startsWith("/api/avatar/")) {
        const fileName = user.avatarUrl.replace("/api/avatar/", "");
        filePath = join(process.cwd(), "storage", "avatars", fileName);
      } else {
        filePath = join(process.cwd(), "public", user.avatarUrl);
      }

      try {
        await unlink(filePath);
      } catch (_err) {
        // Ignore if file doesn't exist
      }
    }

    await db
      .updateTable("users")
      .set({ avatarUrl: null })
      .where("id", "=", userId)
      .execute();

    return { success: true };
  },
  { requireUser: true },
);
