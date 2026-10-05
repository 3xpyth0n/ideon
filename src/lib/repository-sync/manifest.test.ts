import { describe, expect, it } from "vitest";
import {
  createRepositorySyncBundle,
  parseRepositorySyncBundle,
  repositoryManifestPath,
  RepositorySyncFormatError,
} from "./manifest";

const projectId = "10000000-0000-4000-8000-000000000001";
const blockId = "20000000-0000-4000-8000-000000000001";
const linkId = "30000000-0000-4000-8000-000000000001";
const dataPath = `blocks/${blockId}.json`;
const contentPath = `notes/${blockId}.md`;

function createBundle() {
  const blockData = new TextEncoder().encode('{"content":"note"}');
  const noteContent = new TextEncoder().encode("# Note\n");
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
          position: { x: -10, y: 20 },
          dimensions: { width: 320, height: null },
          dataPath,
          contentPath,
          noteDocumentPath: null,
        },
      ],
      links: [],
      canvasStatesPath: null,
    },
    [
      { path: dataPath, kind: "block-data", content: blockData },
      { path: contentPath, kind: "note", content: noteContent },
    ],
  );
}

describe("repository sync bundle validation", () => {
  it("accepts a complete bundle with stable paths and canvas positions", () => {
    const manifest = parseRepositorySyncBundle(createBundle());

    expect(manifest.blocks[0]).toMatchObject({
      id: blockId,
      position: { x: -10, y: 20 },
      dimensions: { width: 320, height: null },
    });
  });

  it("creates stable manifests and sorted file paths", () => {
    const bundle = createBundle();
    const manifest = JSON.parse(
      new TextDecoder().decode(bundle[repositoryManifestPath]),
    ) as { files: Array<{ path: string; sha256: string }> };

    expect(manifest.files.map((file) => file.path)).toEqual([
      dataPath,
      contentPath,
    ]);
    expect(parseRepositorySyncBundle(bundle).files).toHaveLength(2);
    expect(
      manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)),
    ).toBe(true);
  });

  it("rejects path traversal before consuming the bundle", () => {
    const bundle = createBundle();
    const manifest = JSON.parse(
      new TextDecoder().decode(bundle[repositoryManifestPath]),
    ) as {
      files: Array<{ path: string }>;
      blocks: Array<{ dataPath: string }>;
    };
    manifest.files[0].path = "../outside.json";
    manifest.blocks[0].dataPath = "../outside.json";
    bundle[repositoryManifestPath] = new TextEncoder().encode(
      JSON.stringify(manifest),
    );

    expect(() => parseRepositorySyncBundle(bundle)).toThrow(
      RepositorySyncFormatError,
    );
  });

  it("rejects empty path segments", () => {
    const bundle = createBundle();
    const manifest = JSON.parse(
      new TextDecoder().decode(bundle[repositoryManifestPath]),
    ) as {
      files: Array<{ path: string }>;
      blocks: Array<{ dataPath: string }>;
    };
    manifest.files[0].path = "blocks//invalid.json";
    manifest.blocks[0].dataPath = "blocks//invalid.json";
    bundle[repositoryManifestPath] = new TextEncoder().encode(
      JSON.stringify(manifest),
    );

    expect(() => parseRepositorySyncBundle(bundle)).toThrow(
      expect.objectContaining({ code: "invalid_manifest" }),
    );
  });

  it("rejects block data paths that do not match stable block identities", () => {
    const bundle = createBundle();
    const manifest = JSON.parse(
      new TextDecoder().decode(bundle[repositoryManifestPath]),
    ) as { blocks: Array<{ dataPath: string }> };
    manifest.blocks[0].dataPath = "blocks/another-id.json";
    bundle[repositoryManifestPath] = new TextEncoder().encode(
      JSON.stringify(manifest),
    );

    expect(() => parseRepositorySyncBundle(bundle)).toThrow(
      expect.objectContaining({ code: "invalid_reference" }),
    );
  });

  it("rejects a modified file whose checksum no longer matches", () => {
    const bundle = createBundle();
    bundle[`.ideon/${contentPath}`] = new TextEncoder().encode("changed");

    expect(() => parseRepositorySyncBundle(bundle)).toThrow(
      expect.objectContaining({ code: "checksum_mismatch" }),
    );
  });

  it("rejects undeclared files instead of importing them implicitly", () => {
    const bundle = createBundle();
    bundle["README.md"] = new TextEncoder().encode("unmanaged");

    expect(() => parseRepositorySyncBundle(bundle)).toThrow(
      expect.objectContaining({ code: "unexpected_file" }),
    );
  });

  it("rejects duplicate block identities and broken link references", () => {
    const bundle = createBundle();
    const manifest = JSON.parse(
      new TextDecoder().decode(bundle[repositoryManifestPath]),
    ) as {
      blocks: Array<Record<string, unknown>>;
      links: Array<Record<string, unknown>>;
    };
    manifest.links = [
      {
        id: linkId,
        canvasId: "root",
        source: blockId,
        target: projectId,
        dataPath,
      },
    ];
    bundle[repositoryManifestPath] = new TextEncoder().encode(
      JSON.stringify(manifest),
    );

    expect(() => parseRepositorySyncBundle(bundle)).toThrow(
      expect.objectContaining({ code: "invalid_reference" }),
    );
  });
});
