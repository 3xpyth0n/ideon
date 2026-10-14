import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { parseRepositorySyncBundle } from "./manifest";
import { serializeRepositorySyncProject } from "./serialize";
import type { CanvasStateSnapshot } from "../yjs-canvas-state";

const projectId = "10000000-0000-4000-8000-000000000001";
const localNoteId = "20000000-0000-4000-8000-000000000001";
const localDiagramId = "20000000-0000-4000-8000-000000000002";
const localLinkId = "30000000-0000-4000-8000-000000000001";
const stableNoteId = "40000000-0000-4000-8000-000000000001";
const stableDiagramId = "40000000-0000-4000-8000-000000000002";
const stableLinkId = "50000000-0000-4000-8000-000000000001";

describe("repository sync project serialization", () => {
  it("preserves stable identities, canvas geometry, content, links and assets", () => {
    const snapshots: CanvasStateSnapshot[] = [
      {
        canvasId: "root",
        blocks: [
          {
            id: localNoteId,
            type: "text",
            position: { x: -24, y: 68 },
            width: 360,
            height: 220,
            data: { blockType: "text", content: "# Architecture" },
          } as Node<Record<string, unknown>>,
          {
            id: localDiagramId,
            type: "mermaid",
            position: { x: 480, y: 68 },
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
            sourceHandle: "source",
            targetHandle: "target",
            data: { label: "documents" },
          } as Edge,
        ],
        contents: {},
        noteDocuments: {},
        viewport: { x: 14, y: -5, zoom: 0.9 },
      },
    ];

    const result = serializeRepositorySyncProject({
      project: { id: projectId, name: "Architecture", description: null },
      blocks: [
        {
          id: localNoteId,
          blockType: "text",
          metadata: "{}",
          parentBlockId: null,
          positionX: -24,
          positionY: 68,
          width: 360,
          height: 220,
          content: "# Architecture",
          data: '{"blockType":"text"}',
        },
        {
          id: localDiagramId,
          blockType: "mermaid",
          metadata: "{}",
          parentBlockId: null,
          positionX: 480,
          positionY: 68,
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
          sourceHandle: "source",
          targetHandle: "target",
          animated: 0,
          type: "connection",
          label: "documents",
          sourceX: null,
          sourceY: null,
          targetX: null,
          targetY: null,
          sourceOrientation: null,
          targetOrientation: null,
          data: '{"label":"documents"}',
        },
      ],
      snapshots,
      blockIdMap: {
        [stableNoteId]: localNoteId,
        [stableDiagramId]: localDiagramId,
      },
      linkIdMap: { [stableLinkId]: localLinkId },
      assets: {
        "architecture diagram.png": new TextEncoder().encode("image-data"),
      },
    });

    const manifest = parseRepositorySyncBundle(result.bundle);
    expect(manifest.blocks.map((block) => block.id)).toEqual([
      stableNoteId,
      stableDiagramId,
    ]);
    expect(
      manifest.blocks.find((block) => block.id === stableNoteId),
    ).toMatchObject({
      position: { x: -24, y: 68 },
      dimensions: { width: 360, height: 220 },
      contentPath: `notes/${stableNoteId}.md`,
    });
    expect(manifest.links[0]).toMatchObject({
      id: stableLinkId,
      source: stableNoteId,
      target: stableDiagramId,
    });
    expect(
      new TextDecoder().decode(
        result.bundle[`.ideon/notes/${stableNoteId}.md`],
      ),
    ).toBe("# Architecture");
    expect(
      new TextDecoder().decode(
        result.bundle[`.ideon/diagrams/${stableDiagramId}.mmd`],
      ),
    ).toBe("flowchart LR\nA-->B");
    expect(result.blockIdMap[stableNoteId]).toBe(localNoteId);
    expect(result.linkIdMap[stableLinkId]).toBe(localLinkId);
  });
});
