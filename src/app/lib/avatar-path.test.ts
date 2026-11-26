import { join } from "path";
import { describe, expect, it } from "vitest";
import { resolveAvatarFilePath } from "./avatar-path";

describe("resolveAvatarFilePath", () => {
  it("resolves an uploaded avatar inside the avatar directory", () => {
    expect(resolveAvatarFilePath("/api/avatar/user-1_0a1b2c3d.png")).toBe(
      join(process.cwd(), "storage", "avatars", "user-1_0a1b2c3d.png"),
    );
  });

  it.each([
    "/api/avatar/../yjs/CURRENT",
    "/api/avatar/..",
    "/api/avatar/nested/file.png",
    "/../storage/yjs/CURRENT",
    "../storage/yjs/CURRENT",
    "/uploads/avatars/old.png",
    "https://example.com/avatar.png",
    "/api/avatar/file.png\n",
  ])("rejects %j", (avatarUrl) => {
    expect(resolveAvatarFilePath(avatarUrl)).toBeNull();
  });
});
