/**
 * Tests for shallowEqualBlockData function.
 *
 * Validates: Requirements 7.4, 11.3
 *
 * Verifies:
 * 1. The skipKeys set contains content, yText, yNoteDocument, yAwareness
 * 2. Two BlockData objects identical except for skipped fields return true
 * 3. No JSON.stringify is used on full BlockData objects for equality comparison
 */

import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { shallowEqualBlockData } from "./useProjectCanvasState";

describe("shallowEqualBlockData", () => {
  const baseBlockData: Record<string, unknown> = {
    title: "Test Note",
    updatedAt: "2024-01-01T00:00:00Z",
    lastEditor: "user-1",
    blockType: "text",
    label: "my-label",
  };

  describe("skipKeys completeness — content, yText, yNoteDocument, yAwareness are skipped", () => {
    it("returns true when only 'content' differs", () => {
      const a = { ...baseBlockData, content: "short content" };
      const b = {
        ...baseBlockData,
        content: "completely different content value",
      };

      expect(shallowEqualBlockData(a, b)).toBe(true);
    });

    it("returns true when only 'yText' differs", () => {
      const yText1 = new Y.Text();
      const yText2 = new Y.Text();

      const a = { ...baseBlockData, yText: yText1 };
      const b = { ...baseBlockData, yText: yText2 };

      expect(shallowEqualBlockData(a, b)).toBe(true);
    });

    it("returns true when only 'yNoteDocument' differs", () => {
      const frag1 = new Y.XmlFragment();
      const frag2 = new Y.XmlFragment();

      const a = { ...baseBlockData, yNoteDocument: frag1 };
      const b = { ...baseBlockData, yNoteDocument: frag2 };

      expect(shallowEqualBlockData(a, b)).toBe(true);
    });

    it("returns true when only 'yAwareness' differs", () => {
      const awareness1 = { getLocalState: () => null } as unknown as Awareness;
      const awareness2 = { getLocalState: () => ({}) } as unknown as Awareness;

      const a = { ...baseBlockData, yAwareness: awareness1 };
      const b = { ...baseBlockData, yAwareness: awareness2 };

      expect(shallowEqualBlockData(a, b)).toBe(true);
    });

    it("returns true when ALL skipped fields differ simultaneously", () => {
      const a = {
        ...baseBlockData,
        content: "content A - very long content ".repeat(1000),
        yText: new Y.Text(),
        yNoteDocument: new Y.XmlFragment(),
        yAwareness: { id: 1 } as unknown as Awareness,
      };
      const b = {
        ...baseBlockData,
        content: "content B - totally different",
        yText: new Y.Text(),
        yNoteDocument: new Y.XmlFragment(),
        yAwareness: { id: 2 } as unknown as Awareness,
      };

      expect(shallowEqualBlockData(a, b)).toBe(true);
    });
  });

  describe("detects real differences in non-skipped fields", () => {
    it("returns false when 'title' differs", () => {
      const a = { ...baseBlockData, title: "Title A" };
      const b = { ...baseBlockData, title: "Title B" };

      expect(shallowEqualBlockData(a, b)).toBe(false);
    });

    it("returns false when 'updatedAt' differs", () => {
      const a = { ...baseBlockData, updatedAt: "2024-01-01T00:00:00Z" };
      const b = { ...baseBlockData, updatedAt: "2024-06-15T12:00:00Z" };

      expect(shallowEqualBlockData(a, b)).toBe(false);
    });

    it("returns false when 'blockType' differs", () => {
      const a = { ...baseBlockData, blockType: "text" };
      const b = { ...baseBlockData, blockType: "link" };

      expect(shallowEqualBlockData(a, b)).toBe(false);
    });

    it("returns false when 'lastEditor' differs", () => {
      const a = { ...baseBlockData, lastEditor: "user-1" };
      const b = { ...baseBlockData, lastEditor: "user-2" };

      expect(shallowEqualBlockData(a, b)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns true for identical objects (same reference)", () => {
      expect(shallowEqualBlockData(baseBlockData, baseBlockData)).toBe(true);
    });

    it("returns true for equal objects (different references)", () => {
      const a = { ...baseBlockData };
      const b = { ...baseBlockData };

      expect(shallowEqualBlockData(a, b)).toBe(true);
    });

    it("returns false when comparing defined vs undefined", () => {
      expect(shallowEqualBlockData(baseBlockData, undefined)).toBe(false);
      expect(shallowEqualBlockData(undefined, baseBlockData)).toBe(false);
    });

    it("returns true when both are undefined", () => {
      expect(shallowEqualBlockData(undefined, undefined)).toBe(true);
    });
  });

  describe("no JSON.stringify on full BlockData — handles large content safely", () => {
    it("does not crash with extremely large content field", () => {
      // This tests that content is skipped and never stringified.
      // If JSON.stringify were called on the full object, this could crash
      // with "Invalid string length" for content approaching 512MB.
      const largeContent = "x".repeat(10_000_000); // 10MB string
      const a = { ...baseBlockData, content: largeContent };
      const b = { ...baseBlockData, content: "tiny" };

      // Should not throw and should return true (content is skipped)
      expect(() => shallowEqualBlockData(a, b)).not.toThrow();
      expect(shallowEqualBlockData(a, b)).toBe(true);
    });

    it("does not crash with circular Yjs references in skipped fields", () => {
      // Y.XmlFragment and Y.Text contain circular references that would
      // crash JSON.stringify. Since they're skipped, this should be fine.
      const doc = new Y.Doc();
      const yText = doc.getText("test");
      const yFrag = doc.getXmlFragment("test-frag");

      const a = {
        ...baseBlockData,
        content: "some content",
        yText,
        yNoteDocument: yFrag,
      };
      const b = {
        ...baseBlockData,
        content: "different content",
        yText: doc.getText("other"),
        yNoteDocument: doc.getXmlFragment("other-frag"),
      };

      // Should not throw (these fields are skipped entirely)
      expect(() => shallowEqualBlockData(a, b)).not.toThrow();
      expect(shallowEqualBlockData(a, b)).toBe(true);
    });
  });
});
