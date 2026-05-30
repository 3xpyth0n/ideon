"use client";

import { createContext, useContext } from "react";
import type { HelperLine } from "./utils/alignment";

export interface ActiveResizeSnap {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  handle: string;
}

interface HelperLinesContextValue {
  setHelperLines: (lines: HelperLine[]) => void;
  isShiftPressed: boolean;
  setActiveResizeSnap: (snap: ActiveResizeSnap | null) => void;
}

export const HelperLinesContext = createContext<HelperLinesContextValue | null>(
  null,
);

export function useHelperLines() {
  return useContext(HelperLinesContext);
}
