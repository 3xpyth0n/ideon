"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import "@excalidraw/excalidraw/index.css";
import { X } from "lucide-react";
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
  onClose,
}: ExcalidrawModalProps) {
  const { dict } = useI18n();
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  useEffect(() => {
    document.body.classList.add("sketch-modal-open");
    return () => {
      document.body.classList.remove("sketch-modal-open");
    };
  }, []);

  const handleSave = useCallback(async () => {
    const api = apiRef.current;
    if (!api) {
      onClose(null);
      return;
    }

    const { exportToSvg } = await import("@excalidraw/excalidraw");
    const currentElements = api.getSceneElements();
    const currentFiles = api.getFiles();
    const currentAppState = api.getAppState();

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
  }, [onClose]);

  const handleDiscard = useCallback(() => {
    onClose(null);
  }, [onClose]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <div className="sketch-modal-backdrop" onClick={handleDiscard}>
      <div className="sketch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sketch-modal-header">
          <button
            onClick={handleDiscard}
            className="sketch-modal-btn sketch-modal-btn-close"
          >
            <X size={16} />
            <span>{dict.common.close}</span>
          </button>
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
      </div>
    </div>,
    document.body,
  );
}
