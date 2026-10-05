import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { CanvasStateSnapshot } from "../yjs-canvas-state";
import { createRepositorySyncBundle } from "./manifest";
import { prepareRepositorySyncImport } from "./deserialize";
import { serializeRepositorySyncProject } from "./serialize";

const projectId = "10000000-0000-4000-8000-000000000001";
const localNoteId = "20000000-0000-4000-8000-000000000001";
const localDiagramId = "20000000-0000-4000-8000-000000000002";
const localLinkId = "30000000-0000-4000-8000-000000000001";
const stableNoteId = "40000000-0000-4000-8000-000000000001";
const stableDiagramId = "40000000-0000-4000-8000-000000000002";
const stableLinkId = "50000000-0000-4000-8000-000000000001";

describe("repository sync import preparation", () => {
  it("rehydrates content and geometry while remapping stable IDs locally", () => {
    const snapshots: CanvasStateSnapshot[] = [
      {
        canvasId: "root",
        blocks: [
          {
            id: localNoteId,
            type: "text",
            position: { x: 12, y: 34 },
            width: 360,
            height: 220,
            data: { blockType: "text", content: "# Sync note\n" },
          } as Node<Record<string, unknown>>,
          {
            id: localDiagramId,
            type: "mermaid",
            position: { x: 500, y: 34 },
            width: 420,
            height: 300,
            data: { blockType: "mermaid", content: "flowchart LR\nA-->B" },
          } as Node<Record<string, unknown>>,
        ],
        links: [
          {
            id: localLinkId,
            source: localNoteId,
            target: localDiagramId,
            data: { label: "source" },
          } as Edge,
        ],
        contents: {},
        noteDocuments: {},
      },
    ];
    const exported = serializeRepositorySyncProject({
      project: { id: projectId, name: "Project", description: null },
      blocks: [
        {
          id: localNoteId,
          blockType: "text",
          metadata: "{}",
          parentBlockId: null,
          positionX: 12,
          positionY: 34,
          width: 360,
          height: 220,
          content: "# Sync note\n",
          data: '{"blockType":"text"}',
        },
        {
          id: localDiagramId,
          blockType: "mermaid",
          metadata: "{}",
          parentBlockId: null,
          positionX: 500,
          positionY: 34,
          width: 420,
          height: 300,
          content: "flowchart LR\nA-->B",
          data: '{"blockType":"mermaid"}',
        },
      ],
      links: [
        {
          id: localLinkId,
          source: localNoteId,
          target: localDiagramId,
          sourceHandle: null,
          targetHandle: null,
          animated: 0,
          type: "connection",
          label: "source",
          sourceX: null,
          sourceY: null,
          targetX: null,
          targetY: null,
          sourceOrientation: null,
          targetOrientation: null,
          data: '{"label":"source"}',
        },
      ],
      snapshots,
      blockIdMap: {
        [stableNoteId]: localNoteId,
        [stableDiagramId]: localDiagramId,
      },
      linkIdMap: { [stableLinkId]: localLinkId },
    });

    const imported = prepareRepositorySyncImport(
      exported.bundle,
      "local-owner",
    );

    expect(imported.blocks).toHaveLength(2);
    expect(imported.blocks[0].id).not.toBe(stableNoteId);
    expect(
      imported.blocks.find((block) => block.blockType === "text"),
    ).toMatchObject({
      positionX: 12,
      positionY: 34,
      width: 360,
      content: "# Sync note\n",
    });
    expect(imported.links[0]).toMatchObject({
      source: imported.blocks.find((block) => block.blockType === "text")?.id,
      target: imported.blocks.find((block) => block.blockType === "mermaid")
        ?.id,
    });
    expect(
      imported.snapshots[0].blocks.map((block) => block.id).sort(),
    ).toEqual(imported.blocks.map((block) => block.id).sort());
    expect(imported.blockIdMap[stableNoteId]).toBe(
      imported.blocks.find((block) => block.blockType === "text")?.id,
    );
  });

  it("rejects metadata references to missing blocks before import", () => {
    const frameId = "20000000-0000-4000-8000-000000000003";
    const missingId = "60000000-0000-4000-8000-000000000001";
    const snapshot: CanvasStateSnapshot = {
      canvasId: "root",
      blocks: [
        {
          id: frameId,
          type: "frame",
          position: { x: 0, y: 0 },
          data: {
            blockType: "frame",
            metadata: { childBlockIds: [missingId] },
          },
        } as Node<Record<string, unknown>>,
      ],
      links: [],
      contents: {},
      noteDocuments: {},
    };
    const exported = serializeRepositorySyncProject({
      project: { id: projectId, name: "Project", description: null },
      blocks: [
        {
          id: frameId,
          blockType: "frame",
          metadata: JSON.stringify({ childBlockIds: [missingId] }),
          parentBlockId: null,
          positionX: 0,
          positionY: 0,
          width: 300,
          height: 200,
          content: null,
          data: JSON.stringify({
            blockType: "frame",
            metadata: { childBlockIds: [missingId] },
          }),
        },
      ],
      links: [],
      snapshots: [snapshot],
      blockIdMap: {},
      linkIdMap: {},
    });

    expect(() =>
      prepareRepositorySyncImport(exported.bundle, "local-owner"),
    ).toThrow(expect.objectContaining({ code: "invalid_reference" }));
  });

  it("rejects an unrecognized block type with a format error", () => {
    const localBlockId = "20000000-0000-4000-8000-000000000003";
    const bundle = createRepositorySyncBundle(
      {
        format: "ideon-repository",
        version: 1,
        project: {
          id: projectId,
          name: "Project",
          description: null,
        },
        blocks: [
          {
            id: localBlockId,
            canvasId: "root",
            blockType: "not-a-real-block-type",
            parentBlockId: null,
            position: { x: 0, y: 0 },
            dimensions: { width: 320, height: 240 },
            dataPath: `blocks/${localBlockId}.json`,
            contentPath: null,
            noteDocumentPath: null,
          },
        ],
        links: [],
        canvasStatesPath: null,
      },
      [
        {
          path: `blocks/${localBlockId}.json`,
          kind: "block-data",
          content: new TextEncoder().encode(
            JSON.stringify({ metadata: "{}", content: null, data: {} }),
          ),
        },
      ],
    );

    expect(() => prepareRepositorySyncImport(bundle, "local-owner")).toThrow(
      expect.objectContaining({ code: "invalid_manifest" }),
    );
  });
});
