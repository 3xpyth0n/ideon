import { describe, it, expect } from "vitest";
import { getAvatarUrl, uniqueById, stringToColor } from "./utils";

describe("utils library", () => {
  describe("getAvatarUrl", () => {
    it("should return UI Avatars URL if no avatar provided", () => {
      const url = getAvatarUrl(null, "John Doe");
      expect(url).toContain("ui-avatars.com");
      expect(url).toContain("name=John+Doe");
    });

    it("should return the same URL if it is already a full URL", () => {
      const avatar = "https://example.com/avatar.png";
      const url = getAvatarUrl(avatar, "John Doe");
      expect(url).toBe(avatar);
    });

    it("should append version parameter if updatedAt is provided", () => {
      const avatar = "https://example.com/avatar.png";
      const updatedAt = new Date("2026-01-01T00:00:00Z");
      const url = getAvatarUrl(avatar, "John Doe", updatedAt);
      expect(url).toContain("v=" + updatedAt.getTime());
    });

    it("should handle data URLs", () => {
      const dataUrl = "data:image/png;base64,abc";
      const url = getAvatarUrl(dataUrl, "John Doe");
      expect(url).toBe(dataUrl);
    });
  });

  describe("uniqueById", () => {
    it("should remove duplicates by id keeping the last one", () => {
      const items = [
        { id: "1", val: "a" },
        { id: "2", val: "b" },
        { id: "1", val: "c" },
      ];
      const result = uniqueById(items);
      expect(result).toHaveLength(2);
      expect(result.find((i) => i.id === "1")?.val).toBe("c");
    });
  });

  describe("stringToColor", () => {
    it("should return a deterministic HSL color", () => {
      const color1 = stringToColor("test");
      const color2 = stringToColor("test");
      const color3 = stringToColor("other");

      expect(color1).toBe(color2);
      expect(color1).not.toBe(color3);
      expect(color1).toMatch(/^hsl\(\d+, 70%, 50%\)$/);
    });
  });
});
