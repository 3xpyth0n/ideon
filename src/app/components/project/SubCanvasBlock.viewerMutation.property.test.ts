import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import * as Y from "yjs";
import {
  applyBlockMutationIfAllowed,
  isRoleReadOnly,
} from "./subcanvas/subCanvasUtils";

type MutationType = "create" | "update" | "delete" | "resize" | "move";

function mutationTypeArb(): fc.Arbitrary<MutationType> {
  return fc.constantFrom("create", "update", "delete", "resize", "move");
}

function roleArb(): fc.Arbitrary<string | null> {
  return fc.oneof(
    fc.constant("viewer"),
    fc.constant("owner"),
    fc.constant("member"),
    fc.constant("editor"),
    fc.constant(null),
  );
}

/** A stringified JSON snapshot of a Y.Map for structural comparison. */
function snapshot(blocksMap: Y.Map<unknown>): string {
  return JSON.stringify(Object.fromEntries(blocksMap.entries()));
}

/**
 * Property 9: Viewer Mutation Rejection
 *
 * Regardless of the mutation type, when the role is read-only (viewer or
 * preview mode) the yBlocks map must stay structurally unchanged. When the
 * role may write, the mutation is applied exactly once.
 */
describe("Property 9: Viewer Mutation Rejection", () => {
  it("a read-only role leaves the blocks map structurally unchanged for any mutation type", () => {
    fc.assert(
      fc.property(
        mutationTypeArb(),
        roleArb(),
        fc.boolean(),
        (mutation, role, isPreviewMode) => {
          const yDoc = new Y.Doc();
          const blocksMap = yDoc.getMap<unknown>("blocks");
          // Seed a handful of blocks so there is something to mutate.
          for (let i = 0; i < 5; i++) {
            blocksMap.set(`block-${i}`, { id: `block-${i}`, type: "text" });
          }

          const before = snapshot(blocksMap);
          const readOnly = isRoleReadOnly(role, isPreviewMode);

          const applied = applyBlockMutationIfAllowed(
            blocksMap,
            role,
            isPreviewMode,
            () => {
              // Perform the mutation against the Y.Map.
              switch (mutation) {
                case "create":
                  blocksMap.set("block-new", { id: "block-new", type: "text" });
                  break;
                case "update":
                  blocksMap.set("block-0", { id: "block-0", type: "link" });
                  break;
                case "delete":
                  blocksMap.delete("block-0");
                  break;
                case "resize": {
                  const b = blocksMap.get("block-1") as
                    | { width?: number }
                    | undefined;
                  blocksMap.set("block-1", { ...(b ?? {}), width: 400 });
                  break;
                }
                case "move": {
                  const b = blocksMap.get("block-2") as
                    | { x?: number }
                    | undefined;
                  blocksMap.set("block-2", { ...(b ?? {}), x: 250 });
                  break;
                }
              }
            },
          );

          if (readOnly) {
            expect(applied).toBe(false);
            expect(snapshot(blocksMap)).toBe(before);
          } else {
            expect(applied).toBe(true);
            expect(snapshot(blocksMap)).not.toBe(before);
          }
        },
      ),
      { numRuns: 200 },
    );
  }, 30_000);
});
