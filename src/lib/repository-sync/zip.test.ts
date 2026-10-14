import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createRepositorySyncBundle } from "./manifest";
import { unzipRepositorySyncBundle } from "./zip";

describe("repository sync ZIP extraction", () => {
  it("streams a valid bundle and preserves all file bytes", async () => {
    const content = new TextEncoder().encode("# Note\n");
    const bundle = createRepositorySyncBundle(
      {
        format: "ideon-repository",
        version: 1,
        project: {
          id: "10000000-0000-4000-8000-000000000001",
          name: "Project",
          description: null,
        },
        blocks: [],
        links: [],
        canvasStatesPath: null,
      },
      [{ path: "assets/note.md", kind: "asset", content }],
    );

    const extracted = await unzipRepositorySyncBundle(zipSync(bundle));

    expect(Object.keys(extracted).sort()).toEqual(Object.keys(bundle).sort());
    expect(extracted[".ideon/assets/note.md"]).toEqual(content);
  });

  it("rejects a non-ZIP payload", async () => {
    await expect(
      unzipRepositorySyncBundle(new TextEncoder().encode("not a zip")),
    ).rejects.toMatchObject({ code: "invalid_manifest" });
  });
});
