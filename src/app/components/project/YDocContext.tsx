import { createContext, useContext } from "react";
import * as Y from "yjs";

export const YDocContext = createContext<Y.Doc | null>(null);

export function useYDoc(): Y.Doc {
  const ctx = useContext(YDocContext);
  if (!ctx) throw new Error("YDocContext: yDoc is not provided");
  return ctx;
}
