import { describe, expect, it } from "vitest";

import { classifySaveError } from "./classifySaveError";

describe("classifySaveError", () => {
  it("classifies allocation overflows explicitly", () => {
    const result = classifySaveError(
      new RangeError("Allocation size overflow while rendering canvas"),
    );

    expect(result.reason).toBe("allocation_size_overflow");
  });
});
