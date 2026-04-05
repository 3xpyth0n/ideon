import { useEffect, useState, useCallback } from "react";
import * as Y from "yjs";
import { Node, Edge } from "@xyflow/react";
import { BlockData } from "@components/project/CanvasBlock";

export const CANVAS_TRANSIENT_ORIGIN = "local-react-update";
export const CANVAS_HISTORY_ORIGIN = "local-undoable-update";

export const useUndoRedo = (
  yDoc: Y.Doc | null,
  yBlocks: Y.Map<Node<BlockData>> | null,
  yLinks: Y.Map<Edge> | null,
  yContents: Y.Map<Y.Text> | null,
  isPreviewMode: boolean = false,
) => {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [undoManager, setUndoManager] = useState<Y.UndoManager | null>(null);

  useEffect(() => {
    if (!yDoc || !yBlocks || !yLinks || !yContents || isPreviewMode) {
      if (undoManager) {
        undoManager.destroy();
        setUndoManager(null);
      }
      setCanUndo(false);
      setCanRedo(false);
      return;
    }

    const manager = new Y.UndoManager([yBlocks, yLinks, yContents], {
      trackedOrigins: new Set([CANVAS_HISTORY_ORIGIN]),
      captureTimeout: 500,
    });

    const updateStack = () => {
      setCanUndo(manager.undoStack.length > 0);
      setCanRedo(manager.redoStack.length > 0);
    };

    setUndoManager(manager);
    manager.on("stack-item-added", updateStack);
    manager.on("stack-item-popped", updateStack);
    manager.on("stack-item-updated", updateStack);
    updateStack();

    return () => {
      manager.destroy();
      setUndoManager(null);
      setCanUndo(false);
      setCanRedo(false);
    };
  }, [yDoc, yBlocks, yLinks, yContents, isPreviewMode]);

  const stopCapturing = useCallback(() => {
    if (!undoManager) return;
    undoManager.stopCapturing();
    setCanUndo(undoManager.undoStack.length > 0);
    setCanRedo(undoManager.redoStack.length > 0);
  }, [undoManager]);

  const undo = useCallback(() => {
    if (!undoManager) return;
    undoManager.undo();
    setCanUndo(undoManager.undoStack.length > 0);
    setCanRedo(undoManager.redoStack.length > 0);
  }, [undoManager]);

  const redo = useCallback(() => {
    if (!undoManager) return;
    undoManager.redo();
    setCanUndo(undoManager.undoStack.length > 0);
    setCanRedo(undoManager.redoStack.length > 0);
  }, [undoManager]);

  const clear = useCallback(() => {
    if (!undoManager) return;
    undoManager.clear();
    setCanUndo(false);
    setCanRedo(false);
  }, [undoManager]);

  if (isPreviewMode) {
    return {
      undo: () => {},
      redo: () => {},
      clear: () => {},
      stopCapturing: () => {},
      canUndo: false,
      canRedo: false,
      undoManager: null,
    };
  }

  return {
    undo,
    redo,
    clear,
    stopCapturing,
    canUndo,
    canRedo,
    undoManager,
  };
};
