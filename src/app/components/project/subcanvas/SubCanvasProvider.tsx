"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Y from "yjs";
import type { Viewport } from "@xyflow/react";
import { toast } from "sonner";
import { parseOptionalJsonRecord } from "@lib/metadata-parsers";
import {
  type CanvasFrame,
  type NavStack,
  type ViewportState,
  MAX_CANVAS_DEPTH,
} from "./subCanvasUtils";
import type { SubCanvasThumbnails } from "./thumbnailCapture";

// ---------------------------------------------------------------------------
// Pending viewport restore descriptor
// ---------------------------------------------------------------------------

/**
 * After a navigation action (push/pop/jump), the provider stores a
 * `PendingRestore` that `ProjectCanvas` (inside ReactFlow) consumes
 * to apply `setViewport` or `fitView` on the new active canvas.
 *
 * - `{ type: "viewport", viewport: ViewportState }` — restore saved state
 * - `{ type: "fitView" }` — no saved state; fit all blocks to viewport
 */
export type PendingRestore =
  | { type: "viewport"; viewport: ViewportState }
  | { type: "fitView" };

// ---------------------------------------------------------------------------
// Context value type
// ---------------------------------------------------------------------------

export interface SubCanvasContextValue {
  navStack: NavStack;
  activeCanvasId: string;
  activeDepth: number;
  pushCanvas: (
    blockId: string,
    title: string,
    currentViewport: Viewport,
    captureThumbnailOnExit: boolean,
  ) => void;
  popCanvas: () => Promise<CanvasFrame | undefined>;
  jumpToIndex: (index: number) => Promise<void>;
  /** Update the title of a nav-stack frame (used on title commit). */
  updateFrameTitle: (canvasId: string, title: string) => void;
  maxDepth: number;
  /**
   * Set by push/pop/jump after a canvas switch.
   * `ProjectCanvas` watches this and applies the viewport via `setViewport`
   * or `fitView`, then calls `clearPendingRestore()`.
   */
  pendingRestore: PendingRestore | null;
  /** Called by `ProjectCanvas` after it has applied the pending restore. */
  clearPendingRestore: () => void;
  setPreviewMode: (isPreviewMode: boolean) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const SubCanvasContext = createContext<SubCanvasContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface SubCanvasProviderProps {
  children: ReactNode;
  yDoc: Y.Doc | null;
  canMutate: boolean;
  /** Captures the active React Flow canvas before it is unmounted. */
  captureThumbnail?: () => Promise<SubCanvasThumbnails | null>;
}

const ROOT_FRAME: CanvasFrame = {
  canvasId: "root",
  title: "",
  viewport: null,
  captureThumbnailOnExit: true,
};

export function SubCanvasProvider({
  children,
  yDoc,
  canMutate,
  captureThumbnail,
}: SubCanvasProviderProps) {
  const [navStack, setNavStack] = useState<NavStack>([ROOT_FRAME]);
  const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(
    null,
  );
  const navigationInProgress = useRef(false);
  const previewModeRef = useRef(false);

  const canPersist = useCallback(
    () => canMutate && !previewModeRef.current,
    [canMutate],
  );

  const setPreviewMode = useCallback((isPreviewMode: boolean) => {
    previewModeRef.current = isPreviewMode;
  }, []);

  const clearPendingRestore = useCallback(() => {
    setPendingRestore(null);
  }, []);

  const captureAndStoreThumbnail = useCallback(
    async (canvasId: string, parentCanvasId: string) => {
      if (!canPersist()) return;
      const thumbnails = await captureThumbnail?.();
      if (!thumbnails || !yDoc) return;

      const mapName =
        parentCanvasId === "root" ? "blocks" : `blocks:${parentCanvasId}`;
      const blocks = yDoc.getMap(mapName) as Y.Map<{
        id: string;
        type?: string;
        data?: Record<string, unknown>;
      }>;
      const block = blocks.get(canvasId);
      if (!block || block.type !== "subcanvas" || !block.data) return;

      const metadata = parseOptionalJsonRecord(block.data.metadata) ?? {};
      blocks.set(canvasId, {
        ...block,
        data: {
          ...block.data,
          metadata: JSON.stringify({
            ...metadata,
            thumbnailLightDataUrl: thumbnails.light,
            thumbnailDarkDataUrl: thumbnails.dark,
            thumbnailUpdatedAt: new Date().toISOString(),
            thumbnailError: false,
          }),
        },
      });
    },
    [canPersist, captureThumbnail, yDoc],
  );

  // Update the title of a frame in the nav stack (used on title commit so the
  // breadcrumb reflects the new title without waiting for Yjs propagation).
  const updateFrameTitle = useCallback((canvasId: string, title: string) => {
    setNavStack((prev) =>
      prev.map((frame) =>
        frame.canvasId === canvasId ? { ...frame, title } : frame,
      ),
    );
  }, []);

  // Helpers to persist/restore viewports via yDoc
  const saveViewport = useCallback(
    (canvasId: string, viewport: ViewportState) => {
      if (!yDoc || !canPersist()) return;
      yDoc.getMap<ViewportState>("viewports").set(canvasId, viewport);
    },
    [canPersist, yDoc],
  );

  const loadViewport = useCallback(
    (canvasId: string): ViewportState | null => {
      if (!yDoc) return null;
      return yDoc.getMap<ViewportState>("viewports").get(canvasId) ?? null;
    },
    [yDoc],
  );

  // -------------------------------------------------------------------------
  // pushCanvas
  // Saves the departing canvas viewport, pushes a new frame, and queues a
  // restore for the entered canvas (or fitView if first visit).
  // -------------------------------------------------------------------------

  const pushCanvas = useCallback(
    (
      blockId: string,
      title: string,
      currentViewport: Viewport,
      captureThumbnailOnExit: boolean,
    ) => {
      const currentFrame = navStack[navStack.length - 1];
      const savedViewport = {
        x: currentViewport.x,
        y: currentViewport.y,
        zoom: currentViewport.zoom,
      };
      saveViewport(currentFrame.canvasId, savedViewport);

      setNavStack((prev) => {
        const newFrame: CanvasFrame = {
          canvasId: blockId,
          title,
          viewport: loadViewport(blockId),
          captureThumbnailOnExit,
        };

        return [
          ...prev.slice(0, -1),
          { ...prev[prev.length - 1], viewport: savedViewport },
          newFrame,
        ];
      });

      // Queue a restore for the newly entered canvas.
      // Read the saved state for the entered canvas (blockId).
      const saved = loadViewport(blockId);
      if (saved) {
        setPendingRestore({ type: "viewport", viewport: saved });
      } else {
        // First visit — fit all blocks to viewport (Req 3.2 / 8.4)
        setPendingRestore({ type: "fitView" });
      }
    },
    [navStack, saveViewport, loadViewport],
  );

  // -------------------------------------------------------------------------
  // popCanvas
  // Captures the departing canvas before changing the rendered React Flow tree,
  // then restores the parent viewport.
  // -------------------------------------------------------------------------

  const popCanvas = useCallback(async (): Promise<CanvasFrame | undefined> => {
    if (navStack.length <= 1 || navigationInProgress.current) return undefined;
    navigationInProgress.current = true;

    const parentFrame = navStack[navStack.length - 2];
    const departing = navStack[navStack.length - 1];

    try {
      if (departing.captureThumbnailOnExit) {
        await captureAndStoreThumbnail(
          departing.canvasId,
          parentFrame.canvasId,
        );
      }

      const saved = canPersist()
        ? loadViewport(parentFrame.canvasId)
        : parentFrame.viewport;

      if (saved) {
        setPendingRestore({ type: "viewport", viewport: saved });
      } else {
        setPendingRestore({ type: "fitView" });
        toast.info("Viewport position could not be restored");
      }

      setNavStack((prev) => prev.slice(0, -1));
      return departing;
    } finally {
      navigationInProgress.current = false;
    }
  }, [canPersist, captureAndStoreThumbnail, loadViewport, navStack]);

  // -------------------------------------------------------------------------
  // jumpToIndex
  // Captures the current canvas before jumping to any ancestor.
  // -------------------------------------------------------------------------

  const jumpToIndex = useCallback(
    async (index: number) => {
      if (
        index < 0 ||
        index >= navStack.length - 1 ||
        navigationInProgress.current
      ) {
        return;
      }
      navigationInProgress.current = true;

      const departing = navStack[navStack.length - 1];
      const parentFrame = navStack[navStack.length - 2];
      const targetFrame = navStack[index];
      try {
        if (departing.captureThumbnailOnExit) {
          await captureAndStoreThumbnail(
            departing.canvasId,
            parentFrame.canvasId,
          );
        }
        const saved = canPersist()
          ? loadViewport(targetFrame.canvasId)
          : targetFrame.viewport;

        if (saved) {
          setPendingRestore({ type: "viewport", viewport: saved });
        } else {
          setPendingRestore({ type: "fitView" });
          toast.info("Viewport position could not be restored");
        }

        setNavStack((prev) => prev.slice(0, index + 1));
      } finally {
        navigationInProgress.current = false;
      }
    },
    [canPersist, captureAndStoreThumbnail, loadViewport, navStack],
  );

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const activeCanvasId = navStack[navStack.length - 1].canvasId;
  const activeDepth = navStack.length - 1;

  const value: SubCanvasContextValue = {
    navStack,
    activeCanvasId,
    activeDepth,
    pushCanvas,
    popCanvas,
    jumpToIndex,
    updateFrameTitle,
    maxDepth: MAX_CANVAS_DEPTH,
    pendingRestore,
    clearPendingRestore,
    setPreviewMode,
  };

  return (
    <SubCanvasContext.Provider value={value}>
      {children}
    </SubCanvasContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useSubCanvasNavigation(): SubCanvasContextValue {
  const ctx = useContext(SubCanvasContext);
  if (!ctx) {
    throw new Error(
      "useSubCanvasNavigation must be used within a SubCanvasProvider",
    );
  }
  return ctx;
}

export default SubCanvasProvider;
