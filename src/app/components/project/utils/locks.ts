import type { BlockData } from "@components/project/CanvasBlock";

type LockData = Pick<
  BlockData,
  "isLocked" | "isContentLocked" | "isPositionLocked"
>;

export const isBlockContentLocked = (data?: LockData) =>
  !!(data?.isContentLocked ?? data?.isLocked);

export const isBlockPositionLocked = (data?: LockData) =>
  !!(data?.isPositionLocked ?? data?.isLocked);
