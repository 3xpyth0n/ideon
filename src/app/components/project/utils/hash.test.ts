import { describe, expect, it } from "vitest";
import { generateStateHash } from "./hash";

const rootState = {
  canvasId: "root",
  blocks: [],
  links: [],
  contents: {},
  noteDocuments: {},
};

const childState = {
  canvasId: "subcanvas-1",
  blocks: [
    {
      id: "note-1",
      type: "text",
      position: { x: 10, y: 20 },
      data: { content: "hello", title: "Note", metadata: {} },
    },
  ],
  links: [],
  contents: { "note-1": "hello" },
  noteDocuments: {},
};

describe("generateStateHash", () => {
  it("detects a change isolated to a nested canvas", async () => {
    const original = await generateStateHash([], [], [rootState, childState]);
    const changedChild = {
      ...childState,
      contents: { "note-1": "changed" },
    };
    const changed = await generateStateHash([], [], [rootState, changedChild]);

    expect(changed).not.toBe(original);
  });

  it("ignores selection-only changes inside serialized canvas states", async () => {
    const original = await generateStateHash([], [], [rootState, childState]);
    const selectedChild = {
      ...childState,
      blocks: childState.blocks.map((block) => ({ ...block, selected: true })),
    };
    const selected = await generateStateHash(
      [],
      [],
      [rootState, selectedChild],
    );

    expect(selected).toBe(original);
  });
});
