import { describe, it, expect } from "vitest";
import { transformBlock, prepareBlockForDb, DbBlock } from "./graph";
import {
  CORE_BLOCK_X,
  CORE_BLOCK_Y,
} from "../components/project/utils/constants";
import { Node } from "@xyflow/react";

describe("graph library", () => {
  describe("transformBlock", () => {
    it("should correctly transform a standard text block", () => {
      const dbBlock: DbBlock = {
        id: "block-1",
        projectId: "project-1",
        blockType: "text",
        parentBlockId: null,
        positionX: 100,
        positionY: 200,
        width: 300,
        height: 150,
        selected: 0,
        content: "Hello Ideon",
        ownerId: "user-1",
        authorName: "Alice",
        authorColor: "#ff0000",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
        data: JSON.stringify({ custom: "value" }),
        metadata: "{}",
      };

      const node = transformBlock(dbBlock);

      expect(node).toEqual({
        id: "block-1",
        type: "text",
        position: { x: 100, y: 200 },
        width: 300,
        height: 150,
        selected: false,
        draggable: true,
        deletable: true,
        data: {
          custom: "value",
          blockType: "text",
          content: "Hello Ideon",
          ownerId: "user-1",
          authorName: "Alice",
          authorColor: "#ff0000",
          updatedAt: dbBlock.updatedAt,
          metadata: {},
        },
      });
    });

    it("should handle core blocks with fixed position and restricted interactions", () => {
      const dbBlock: DbBlock = {
        id: "core-1",
        projectId: "project-1",
        blockType: "core",
        parentBlockId: null,
        positionX: 0, // Should be ignored
        positionY: 0, // Should be ignored
        width: 500,
        height: 500,
        selected: 0,
        content: "Core",
        ownerId: "system",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
        data: "{}",
        metadata: "{}",
      };

      const node = transformBlock(dbBlock);

      expect(node.position).toEqual({ x: CORE_BLOCK_X, y: CORE_BLOCK_Y });
      expect(node.draggable).toBe(false);
      expect(node.deletable).toBe(false);
    });

    it("should handle null dimensions", () => {
      const dbBlock: DbBlock = {
        id: "block-2",
        projectId: "project-1",
        blockType: "file",
        parentBlockId: null,
        positionX: 10,
        positionY: 20,
        width: null,
        height: null,
        selected: 0,
        ownerId: "user-1",
        content: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        data: "{}",
        metadata: "{}",
      };

      const node = transformBlock(dbBlock);

      expect(node.width).toBeUndefined();
      expect(node.height).toBeUndefined();
    });

    it("should parse data if it is a string", () => {
      const dbBlock: DbBlock = {
        id: "block-3",
        projectId: "project-1",
        blockType: "text",
        parentBlockId: null,
        positionX: 0,
        positionY: 0,
        width: 100,
        height: 100,
        selected: 0,
        ownerId: "user-1",
        content: "",
        createdAt: new Date(),
        updatedAt: new Date(),
        data: '{"foo":"bar"}',
        metadata: "{}",
      };

      const node = transformBlock(dbBlock);

      expect(node.data).toMatchObject({ foo: "bar" });
    });
  });

  describe("prepareBlockForDb", () => {
    it("should prepare a node for DB insertion", () => {
      const node: Node = {
        id: "node-1",
        type: "text",
        position: { x: 50, y: 60 },
        data: {
          content: "Test Content",
          blockType: "text",
        },
        measured: { width: 200, height: 100 },
      };

      const projectId = "proj-1";
      const ownerId = "user-1";

      const result = prepareBlockForDb(node, projectId, ownerId);

      expect(result).toMatchObject({
        id: "node-1",
        projectId,
        blockType: "text",
        positionX: 50,
        positionY: 60,
        width: 200,
        height: 100,
        content: "Test Content",
        ownerId,
      });
    });

    it("should default to text type if not specified", () => {
      const node: Node = {
        id: "node-2",
        position: { x: 0, y: 0 },
        data: {},
      };

      const result = prepareBlockForDb(node, "p1", "u1");
      expect(result.blockType).toBe("text");
    });

    it("should serialize data correctly", () => {
      const node: Node = {
        id: "node-3",
        type: "file",
        position: { x: 0, y: 0 },
        data: {
          metadata: { size: 1024, mime: "image/png" },
        },
      };

      const result = prepareBlockForDb(node, "p1", "u1");
      const parsedData = JSON.parse(result.data);

      expect(parsedData).toEqual({
        metadata: { size: 1024, mime: "image/png" },
      });
    });
  });
});
