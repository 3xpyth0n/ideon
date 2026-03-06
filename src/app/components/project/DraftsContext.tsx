"use client";

import { createContext, useContext } from "react";

export type Draft = Record<string, unknown>;

export type DraftsMap = Record<string, Record<string, Draft>>;

export type DraftsContextValue = {
  draftsByBlock: DraftsMap;
  getDraftsForBlock: (blockId: string) => Record<string, Draft> | undefined;
  writeDraft: (blockId: string, clientId: string, draft: Draft | null) => void;
  deleteDraft: (blockId: string, clientId: string) => void;
};

const DraftsContext = createContext<DraftsContextValue | null>(null);

export const DraftsProvider = DraftsContext.Provider;

export function useDrafts() {
  const ctx = useContext(DraftsContext);
  if (!ctx) {
    throw new Error("useDrafts must be used within a DraftsProvider");
  }
  return ctx;
}

export default DraftsContext;
