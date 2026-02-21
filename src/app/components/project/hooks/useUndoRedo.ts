import { useEffect, useState, useCallback } from "react";
import * as Y from "yjs";
import { Node, Edge } from "@xyflow/react";
import { BlockData } from "@components/project/CanvasBlock";

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
      return;
    }

    // Initialize UndoManager tracking blocks, links and contents
    const manager = new Y.UndoManager([yBlocks, yLinks, yContents], {
      trackedOrigins: new Set([yDoc.clientID]),
      captureTimeout: 500,
    });

    setUndoManager(manager);

    const updateStack = () => {
      setCanUndo(manager.undoStack.length > 0);
      setCanRedo(manager.redoStack.length > 0);
    };

    manager.on("stack-item-added", updateStack);
    manager.on("stack-item-popped", updateStack);

    // Initial check
    updateStack();

    return () => {
      manager.destroy();
      setUndoManager(null);
    };
  }, [yDoc, yBlocks, yLinks, yContents, isPreviewMode]);

  const undo = useCallback(() => {
    if (undoManager) {
      undoManager.undo();
    }
  }, [undoManager]);

  const redo = useCallback(() => {
    if (undoManager) {
      undoManager.redo();
    }
  }, [undoManager]);

  const clear = useCallback(() => {
    if (undoManager) {
      undoManager.clear();
    }
  }, [undoManager]);

  if (isPreviewMode) {
    return {
      undo: () => {},
      redo: () => {},
      clear: () => {},
      canUndo: false,
      canRedo: false,
      undoManager: null,
    };
  }

  return {
    undo,
    redo,
    clear,
    canUndo,
    canRedo,
    undoManager,
  };
};
