import { describe, expect, it } from "vitest";
import {
  createRepositorySyncBundle,
  parseRepositorySyncBundle,
} from "./manifest";
import { mergeRepositorySyncBundles } from "./merge";

const projectId = "10000000-0000-4000-8000-000000000001";
const blockId = "20000000-0000-4000-8000-000000000001";
const blockPath = `blocks/${blockId}.json`;
const notePath = `notes/${blockId}.md`;

function makeBundle(note: string, positionX: number, positionY: number = 0) {
  return createRepositorySyncBundle(
    {
      format: "ideon-repository",
      version: 1,
      project: { id: projectId, name: "Project", description: null },
      blocks: [
        {
          id: blockId,
          canvasId: "root",
          blockType: "text",
          parentBlockId: null,
          position: { x: positionX, y: positionY },
          dimensions: { width: 320, height: 240 },
          dataPath: blockPath,
          contentPath: notePath,
          noteDocumentPath: null,
        },
      ],
      links: [],
      canvasStatesPath: null,
    },
    [
      {
        path: blockPath,
        kind: "block-data",
        content: new TextEncoder().encode("{}"),
      },
      { path: notePath, kind: "note", content: new TextEncoder().encode(note) },
    ],
  );
}

function emptyBundle() {
  return createRepositorySyncBundle(
    {
      format: "ideon-repository",
      version: 1,
      project: { id: projectId, name: "Project", description: null },
      blocks: [],
      links: [],
      canvasStatesPath: null,
    },
    [],
  );
}

function readFile(bundle: Record<string, Uint8Array>, path: string) {
  return new TextDecoder().decode(bundle[`.ideon/${path}`]);
}

describe("repository sync three-way merge", () => {
  it("combines independent layout and content changes", () => {
    const base = makeBundle("base\n", 0);
    const ideon = makeBundle("base\n", 40);
    const git = makeBundle("updated in Git\n", 0);

    const result = mergeRepositorySyncBundles(
      parseRepositorySyncBundle(base),
      ideon,
      git,
      "manual",
    );

    expect(result.conflicts).toEqual([]);
    expect(readFile(result.bundle, notePath)).toBe("updated in Git\n");
    const manifest = JSON.parse(readFile(result.bundle, "manifest.json")) as {
      blocks: Array<{ position: { x: number } }>;
    };
    expect(manifest.blocks[0].position.x).toBe(40);
  });

  it("reports a manual content conflict and preserves the current Ideon file", () => {
    const base = makeBundle("base\n", 0);
    const ideon = makeBundle("edited in Ideon\n", 0);
    const git = makeBundle("edited in Git\n", 0);

    const result = mergeRepositorySyncBundles(
      parseRepositorySyncBundle(base),
      ideon,
      git,
      "manual",
    );

    expect(result.conflicts).toEqual([
      { path: `.ideon/${notePath}`, kind: "file" },
    ]);
    expect(readFile(result.bundle, notePath)).toBe("edited in Ideon\n");
  });

  it("selects the requested side only for a conflicting file", () => {
    const base = makeBundle("base\n", 0);
    const ideon = makeBundle("edited in Ideon\n", 0);
    const git = makeBundle("edited in Git\n", 0);

    const result = mergeRepositorySyncBundles(
      parseRepositorySyncBundle(base),
      ideon,
      git,
      "git-wins",
    );

    expect(result.conflicts).toHaveLength(1);
    expect(readFile(result.bundle, notePath)).toBe("edited in Git\n");
  });

  it("merges independent positional changes on each axis without conflict", () => {
    const base = makeBundle("base\n", 0, 0);
    const ideon = makeBundle("base\n", 10, 0);
    const git = makeBundle("base\n", 0, 20);

    const result = mergeRepositorySyncBundles(
      parseRepositorySyncBundle(base),
      ideon,
      git,
      "manual",
    );

    expect(result.conflicts).toEqual([]);
    const manifest = JSON.parse(readFile(result.bundle, "manifest.json")) as {
      blocks: Array<{ position: { x: number; y: number } }>;
    };
    expect(manifest.blocks[0].position).toEqual({ x: 10, y: 20 });
  });

  it("reports a field-level positional conflict on the shared axis", () => {
    const base = makeBundle("base\n", 0, 0);
    const ideon = makeBundle("base\n", 10, 0);
    const git = makeBundle("base\n", 20, 0);

    const result = mergeRepositorySyncBundles(
      parseRepositorySyncBundle(base),
      ideon,
      git,
      "manual",
    );

    expect(result.conflicts).toEqual([
      { path: `blocks/${blockId}/position/x`, kind: "block" },
    ]);
    const manifest = JSON.parse(readFile(result.bundle, "manifest.json")) as {
      blocks: Array<{ position: { x: number } }>;
    };
    expect(manifest.blocks[0].position.x).toBe(10);
  });

  it("removes a block deleted on both sides", () => {
    const base = makeBundle("base\n", 0);
    const ideon = emptyBundle();
    const git = emptyBundle();

    const result = mergeRepositorySyncBundles(
      parseRepositorySyncBundle(base),
      ideon,
      git,
      "manual",
    );

    const manifest = JSON.parse(readFile(result.bundle, "manifest.json")) as {
      blocks: unknown[];
    };
    expect(manifest.blocks).toEqual([]);
  });
});
