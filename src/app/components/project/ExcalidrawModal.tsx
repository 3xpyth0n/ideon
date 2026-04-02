"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import "@excalidraw/excalidraw/index.css";
import { Download, X } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

const ExcalidrawCanvas = dynamic(
  () =>
    import("@excalidraw/excalidraw").then((mod) => ({
      default: mod.Excalidraw,
    })),
  { ssr: false },
);

export interface SketchModalResult {
  elements: readonly ExcalidrawElement[];
  files: BinaryFiles;
  svgLight: string;
  svgDark: string;
}

interface ExcalidrawModalProps {
  elements?: ExcalidrawElement[];
  files?: BinaryFiles;
  theme: "light" | "dark";
  fileNameBase?: string;
  onClose: (result: SketchModalResult | null) => void;
}

function serializeSvg(svg: SVGSVGElement): string {
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const xml = new XMLSerializer().serializeToString(svg);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
}

export function ExcalidrawModal({
  elements,
  files,
  theme,
  fileNameBase,
  onClose,
}: ExcalidrawModalProps) {
  const { dict } = useI18n();
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const initialSignature = useMemo(() => {
    return JSON.stringify({
      elements: elements ?? [],
      files: files ?? {},
    });
  }, [elements, files]);

  const sanitizeFilename = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return "sketch";
    return trimmed.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-");
  }, []);

  const getCurrentSceneData = useCallback(() => {
    const api = apiRef.current;
    if (!api) return null;
    return {
      elements: api.getSceneElements(),
      files: api.getFiles(),
      appState: api.getAppState(),
    };
  }, []);

  const handleCloseRequest = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose(null);
  }, [isDirty, onClose]);

  useEffect(() => {
    document.body.classList.add("sketch-modal-open");
    return () => {
      document.body.classList.remove("sketch-modal-open");
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (showDiscardConfirm) {
          setShowDiscardConfirm(false);
          return;
        }
        handleCloseRequest();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [handleCloseRequest, showDiscardConfirm]);

  const handleSave = useCallback(async () => {
    const scene = getCurrentSceneData();
    if (!scene) {
      onClose(null);
      return;
    }

    const { exportToSvg } = await import("@excalidraw/excalidraw");
    const currentElements = scene.elements;
    const currentFiles = scene.files;
    const currentAppState = scene.appState;

    const lightSvgEl = await exportToSvg({
      elements: currentElements,
      appState: {
        ...currentAppState,
        exportBackground: true,
        exportWithDarkMode: false,
      },
      files: currentFiles,
    });

    const darkSvgEl = await exportToSvg({
      elements: currentElements,
      appState: {
        ...currentAppState,
        exportBackground: true,
        exportWithDarkMode: true,
      },
      files: currentFiles,
    });

    const MAX_SVG_SIZE = 1024 * 1024; // 1MB limit for SVG preview in Yjs
    const svgLight = serializeSvg(lightSvgEl);
    const svgDark = serializeSvg(darkSvgEl);

    onClose({
      elements: currentElements,
      files: currentFiles,
      svgLight: svgLight.length < MAX_SVG_SIZE ? svgLight : "",
      svgDark: svgDark.length < MAX_SVG_SIZE ? svgDark : "",
    });
  }, [getCurrentSceneData, onClose]);

  const handleDiscardWithoutSaving = useCallback(() => {
    setShowDiscardConfirm(false);
    onClose(null);
  }, [onClose]);

  const handleExportExcalidraw = useCallback(() => {
    const scene = getCurrentSceneData();
    if (!scene) return;

    const payload = {
      type: "excalidraw",
      version: 2,
      source: "https://ideon.app",
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sanitizeFilename(
      fileNameBase ?? "sketch",
    )}.excalidraw`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [fileNameBase, getCurrentSceneData, sanitizeFilename]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <div className="sketch-modal-backdrop" onClick={handleCloseRequest}>
      <div className="sketch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sketch-modal-header">
          <div className="sketch-modal-header-actions">
            <button
              onClick={handleCloseRequest}
              className="sketch-modal-btn sketch-modal-btn-close"
            >
              <X size={16} />
              <span>{dict.common.close}</span>
            </button>
            <button
              onClick={handleExportExcalidraw}
              className="sketch-modal-btn sketch-modal-btn-export"
            >
              <Download size={16} />
              <span>{dict.modals.exportExcalidraw}</span>
            </button>
          </div>
          <button
            onClick={handleSave}
            className="sketch-modal-btn sketch-modal-btn-save"
          >
            {dict.common.save}
          </button>
        </div>
        <div className="sketch-modal-canvas">
          <ExcalidrawCanvas
            excalidrawAPI={(api) => {
              apiRef.current = api;
            }}
            onChange={(nextElements, _nextAppState, nextFiles) => {
              const nextSignature = JSON.stringify({
                elements: nextElements,
                files: nextFiles,
              });
              setIsDirty(nextSignature !== initialSignature);
            }}
            initialData={{ elements, files }}
            theme={theme}
            detectScroll={false}
            UIOptions={{
              canvasActions: {
                toggleTheme: false,
                saveAsImage: false,
                loadScene: false,
                export: false,
              },
            }}
          />
        </div>
        {showDiscardConfirm && (
          <div
            className="sketch-discard-confirm-backdrop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sketch-discard-confirm">
              <h3>{dict.modals.sketchUnsavedTitle}</h3>
              <p>{dict.modals.sketchUnsavedDescription}</p>
              <div className="sketch-discard-confirm-actions">
                <button
                  onClick={() => setShowDiscardConfirm(false)}
                  className="sketch-modal-btn sketch-modal-btn-close"
                >
                  {dict.common.cancel}
                </button>
                <button
                  onClick={handleDiscardWithoutSaving}
                  className="sketch-modal-btn sketch-modal-btn-danger"
                >
                  {dict.modals.discardWithoutSaving}
                </button>
                <button
                  onClick={handleSave}
                  className="sketch-modal-btn sketch-modal-btn-save"
                >
                  {dict.common.save}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
