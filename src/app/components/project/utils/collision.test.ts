import { describe, expect, it } from "vitest";
import {
  clampBottomRightRect,
  clampCenteredRect,
  getAdjustedPosition,
  isOverlappingRestrictedZone,
} from "./collision";

describe("getAdjustedPosition", () => {
  it("snaps against the core rect and updates when the core rect changes", () => {
    const blockRect = { x: 330, y: 0, width: 100, height: 100 };

    const adjustedSmall = getAdjustedPosition(blockRect, {
      x: -320,
      y: -240,
      width: 640,
      height: 480,
    });
    expect(adjustedSmall).toEqual({ x: 340, y: 0 });

    const adjustedLarge = getAdjustedPosition(blockRect, {
      x: -400,
      y: -240,
      width: 800,
      height: 480,
    });
    expect(adjustedLarge).toEqual({ x: 420, y: 0 });
  });

  it("returns the original position when not overlapping the restricted zone", () => {
    const coreRect = { x: -320, y: -240, width: 640, height: 480 };
    const blockRect = { x: 600, y: 0, width: 100, height: 100 };

    expect(getAdjustedPosition(blockRect, coreRect)).toEqual({ x: 600, y: 0 });
  });
});

describe("clampCenteredRect", () => {
  it("stops centered core growth before a blocking rect on the right", () => {
    expect(
      clampCenteredRect({ x: -500, y: -300, width: 1000, height: 600 }, [
        { x: 520, y: -50, width: 120, height: 120 },
      ]),
    ).toEqual({ x: -500, y: -300, width: 1000, height: 600 });
  });

  it("keeps centered growth from overlapping a nearby block", () => {
    expect(
      clampCenteredRect({ x: -560, y: -300, width: 1120, height: 600 }, [
        { x: 520, y: -50, width: 120, height: 120 },
      ]),
    ).toEqual({ x: -500, y: -300, width: 1000, height: 600 });
  });

  it("clamps width without shrinking height when only the horizontal axis is blocked", () => {
    expect(
      clampCenteredRect({ x: -560, y: -340, width: 1120, height: 680 }, [
        { x: 520, y: -40, width: 120, height: 120 },
      ]),
    ).toEqual({ x: -500, y: -340, width: 1000, height: 680 });
  });
});

describe("clampBottomRightRect", () => {
  it("stops bottom-right growth at the left edge of a blocking rect", () => {
    expect(
      clampBottomRightRect(
        { x: -333.5, y: -250.5, width: 852, height: 501 },
        [{ x: 450, y: -420, width: 550, height: 400 }],
        24,
      ),
    ).toEqual({ x: -333.5, y: -250.5, width: 759.5, height: 501 });
  });

  it("keeps vertical growth available when only the horizontal axis is blocked", () => {
    expect(
      clampBottomRightRect(
        { x: -333.5, y: -250.5, width: 852, height: 700 },
        [
          { x: 450, y: -420, width: 550, height: 400 },
          { x: 450, y: 20, width: 550, height: 400 },
        ],
        24,
      ),
    ).toEqual({ x: -333.5, y: -250.5, width: 759.5, height: 700 });
  });
});

describe("isOverlappingRestrictedZone", () => {
  it("detects overlap with the core restricted zone", () => {
    const coreRect = { x: -320, y: -240, width: 640, height: 480 };
    const blockRect = { x: 300, y: 0, width: 100, height: 100 };
    expect(isOverlappingRestrictedZone(blockRect, coreRect, 20)).toBe(true);
  });

  it("does not report overlap when outside the restricted zone", () => {
    const coreRect = { x: -320, y: -240, width: 640, height: 480 };
    const blockRect = { x: 800, y: 0, width: 100, height: 100 };
    expect(isOverlappingRestrictedZone(blockRect, coreRect, 20)).toBe(false);
  });
});
