import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { v4 as uuidv4 } from "uuid";

describe("Block id uniqueness — uuidv4", () => {
  it("generates N pairwise-distinct ids for any N in [2, 50]", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 50 }), (n) => {
        const ids: string[] = [];
        for (let i = 0; i < n; i++) {
          ids.push(uuidv4());
        }
        expect(new Set(ids).size).toBe(n);
      }),
      { numRuns: 100 },
    );
  });
});
