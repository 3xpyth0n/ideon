import { useEffect, useState, useCallback } from "react";
import * as Y from "yjs";

export interface Point {
  x: number;
  y: number;
  p: number;
}

export interface Stroke {
  points: Point[];
  color: string;
  size: number;
  isEraser: boolean;
}

export interface YjsStrokesApi {
  strokes: Stroke[];
  addStroke: (stroke: Stroke) => void;
  drafts: Record<string, Stroke>;
  setDraft: (userId: string, draft: Stroke | null) => void;
}

/**
 * useYjsStrokes - Hook for collaborative strokes and drafts via Yjs
 * @param yDoc Y.Doc instance
 * @param blockId string (unique block id)
 * @param userId string (current user id)
 */
export function useYjsStrokes(yDoc: Y.Doc, blockId: string): YjsStrokesApi {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Stroke>>({});

  useEffect(() => {
    if (!yDoc) return;
    const yArr = yDoc.getArray<Stroke>(`sketch-strokes-${blockId}`);
    const yDrafts = yDoc.getMap<Stroke>(`sketch-drafts-${blockId}`);

    const updateStrokes = () => setStrokes(yArr.toArray());
    const updateDrafts = () => {
      const obj: Record<string, Stroke> = {};
      yDrafts.forEach((v, k) => {
        if (v && v.points && v.points.length > 0) obj[k] = v;
      });
      setDrafts(obj);
    };
    yArr.observe(updateStrokes);
    yDrafts.observe(updateDrafts);
    updateStrokes();
    updateDrafts();
    return () => {
      yArr.unobserve(updateStrokes);
      yDrafts.unobserve(updateDrafts);
    };
  }, [yDoc, blockId]);

  const addStroke = useCallback(
    (stroke: Stroke) => {
      if (!yDoc) return;
      const yArr = yDoc.getArray<Stroke>(`sketch-strokes-${blockId}`);
      yArr.push([stroke]);
    },
    [yDoc, blockId],
  );

  const setDraft = useCallback(
    (uid: string, draft: Stroke | null) => {
      if (!yDoc) return;
      const yDrafts = yDoc.getMap<Stroke>(`sketch-drafts-${blockId}`);
      if (draft) {
        yDrafts.set(uid, draft);
      } else {
        yDrafts.delete(uid);
      }
    },
    [yDoc, blockId],
  );

  return { strokes, addStroke, drafts, setDraft };
}
