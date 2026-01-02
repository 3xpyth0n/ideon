"use client";

import { useState, useCallback, useRef } from "react";
import { Download, Upload, FileJson } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { Node, Edge as Link } from "@xyflow/react";
import { BlockData } from "./CanvasBlock";

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  blocks: Node<BlockData>[];
  links: Link[];
  projectId: string;
  onImport: (blocks: Node<BlockData>[], links: Link[]) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

interface ExportData {
  projectId: string;
  exportedAt: string;
  blocks: {
    id: string;
    type: string;
    position: { x: number; y: number };
    width?: number;
    height?: number;
    content: string;
    author: string;
    createdAt: string;
    updatedAt: string;
    data: Record<string, unknown>;
  }[];
  links: {
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
  }[];
}

interface ImportedBlock {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  width?: number;
  height?: number;
  content?: string;
  author?: string;
  updatedAt?: string;
  data?: {
    content?: string;
    authorName?: string;
    updatedAt?: string;
    blockType?: string;
    [key: string]: unknown;
  };
}

export function ImportExportModal({
  isOpen,
  onClose,
  blocks,
  links,
  projectId,
  onImport,
  onError,
  onSuccess,
}: ImportExportModalProps) {
  const { dict } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [importContent, setImportContent] = useState("");

  const handleExport = () => {
    const now = new Date();
    const timestamp =
      now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, "0") +
      now.getDate().toString().padStart(2, "0") +
      "_" +
      now.getHours().toString().padStart(2, "0") +
      now.getMinutes().toString().padStart(2, "0") +
      now.getSeconds().toString().padStart(2, "0");

    const exportData: ExportData = {
      projectId: projectId,
      exportedAt: now.toISOString(),
      blocks: blocks.map((block) => ({
        id: block.id,
        type: block.type || "text",
        position: block.position,
        width: block.width,
        height: block.height,
        content: (block.data.content as string) || "",
        author: (block.data.authorName as string) || dict.common.unknown,
        createdAt: (block.data.updatedAt as string) || now.toISOString(),
        updatedAt: (block.data.updatedAt as string) || now.toISOString(),
        data: block.data as unknown as Record<string, unknown>,
      })),
      links: links.map((link) => ({
        source: link.source,
        target: link.target,
        sourceHandle: link.sourceHandle || undefined,
        targetHandle: link.targetHandle || undefined,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ideon-project-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const processImport = (content: string) => {
    try {
      const data = JSON.parse(content);

      // Minimal validation - handle both links/edges and blocks/nodes
      const rawLinks = data.links || data.edges;
      const rawBlocks = (data.blocks || data.nodes) as ImportedBlock[];
      if (!Array.isArray(rawBlocks) || !Array.isArray(rawLinks)) {
        throw new Error(dict.common.errorImport);
      }

      // 1. Calculate Bounding Box of Imported Group
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;

      rawBlocks.forEach((b) => {
        const x = b.position?.x ?? 0;
        const y = b.position?.y ?? 0;
        const w = b.width ?? 320;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x + w);
        minY = Math.min(minY, y);
      });

      const groupWidth = maxX - minX;
      const groupCenterX = minX + groupWidth / 2;

      // 2. Find Bottom-most Point of Existing Content
      // Filter out core block to find "content" bottom
      const contentBlocks = blocks.filter((b) => b.type !== "core");
      let targetY = 0;

      if (contentBlocks.length > 0) {
        // If content blocks exist, place below the lowest one
        const maxY = Math.max(
          ...contentBlocks.map((b) => b.position.y + (b.height ?? 0)),
        );
        targetY = maxY + 50;
      } else {
        // If no content blocks, place below Core Block (or 0 if no core)
        const coreBlock = blocks.find((b) => b.type === "core");
        if (coreBlock) {
          targetY = coreBlock.position.y + (coreBlock.height ?? 480) + 50;
        } else {
          targetY = 0;
        }
      }

      // 3. Calculate Offsets
      // Horizontal: Shift so group center aligns with X=0
      const offsetX = 0 - groupCenterX;
      // Vertical: Shift so group top aligns with targetY
      const offsetY = targetY - minY;

      // ID Remapping map
      const idMap = new Map<string, string>();

      // Process Blocks
      const newBlocks: Node<BlockData>[] = rawBlocks.map((b) => {
        const newId = crypto.randomUUID();
        idMap.set(b.id, newId);

        // Apply calculated offsets
        const originalX = b.position?.x ?? 0;
        const originalY = b.position?.y ?? 0;

        return {
          id: newId,
          type: b.type || "text", // Preserve type or default to text
          position: {
            x: originalX + offsetX,
            y: originalY + offsetY,
          },
          width: b.width ?? 320,
          height: b.height ?? 240,
          data: {
            ...(b.data || {}),
            content: b.content || b.data?.content || "",
            authorName: b.author || dict.common.imported,
            updatedAt: b.updatedAt || new Date().toISOString(),
            lastEditor: dict.common.imported,
            blockType: (b.type ||
              b.data?.blockType ||
              "text") as BlockData["blockType"], // Ensure blockType is set in data
          },
          origin: [0, 0],
        } as Node<BlockData>;
      });

      // Process Links
      const newLinks: Link[] = rawLinks
        .filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (e: any) =>
            idMap.has(e.source || e.from) && idMap.has(e.target || e.to),
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((e: any) => ({
          id: crypto.randomUUID(),
          source: idMap.get(e.source || e.from)!,
          target: idMap.get(e.target || e.to)!,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          type: "connection",
          animated: false,
        }));

      onImport(newBlocks, newLinks);
      onSuccess(dict.common.successImport);
      onClose(); // Close immediately after success
    } catch (err) {
      console.error("Import error:", err);
      onError(dict.common.errorParsing);
      onClose(); // Close immediately even on error
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "application/json" || file.name.endsWith(".json")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          setImportContent(text);
          processImport(text);
        };
        reader.readAsText(file);
      }
    }
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    try {
      JSON.parse(text); // Check if it's valid JSON
      setImportContent(text);
    } catch (_e) {
      // Not JSON, ignore
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setImportContent(text);
        processImport(text);
      };
      reader.readAsText(file);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <FileJson className="w-5 h-5" />
          {dict.common.importExport}
        </div>
      }
      subtitle={dict.common.importExportDescription}
      className="max-w-2xl w-full"
    >
      <div className="flex flex-col gap-10">
        {/* Import Section */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 uppercase tracking-wider">
            {dict.common.import}
          </h3>

          <div
            className={`
                relative rounded-lg p-12 transition-all duration-200
                flex flex-col items-center justify-center text-center gap-6
                min-h-[200px] w-full
                bg-white/[0.02]
              `}
            style={{
              border: `3px dashed ${dragActive ? "#3b82f6" : "#666666"}`,
              borderRadius: "12px",
            }}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              accept=".json"
              onChange={handleFileChange}
            />
            <textarea
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
              value={importContent}
              onChange={(e) => setImportContent(e.target.value)}
              onPaste={handlePaste}
              onClick={() => fileInputRef.current?.click()}
              placeholder=" "
            />

            <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-full">
              <Upload className="w-6 h-6 text-gray-500 dark:text-gray-400" />
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {dragActive ? dict.common.dropzoneActive : dict.common.dropzone}
              </p>
            </div>

            {importContent && (
              <div className="z-20 w-full max-w-xs">
                <Button
                  onClick={() => processImport(importContent)}
                  className="w-full btn-primary"
                >
                  {dict.common.import}
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* Export Section */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 uppercase tracking-wider">
            {dict.common.export}
          </h3>
          <div className="flex flex-col gap-4">
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 flex items-center justify-between border border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white dark:bg-gray-700 rounded-md shadow-sm">
                  <FileJson className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                </div>
                <div className="text-sm">
                  <p className="font-medium text-gray-900 dark:text-white text-sm">
                    {dict.common.importExport}
                  </p>
                  <p className="text-gray-500 dark:text-gray-400 text-xs">
                    JSON •{" "}
                    {dict.common.blocksCount.replace(
                      "{count}",
                      blocks.length.toString(),
                    )}
                  </p>
                </div>
              </div>
              <Button onClick={handleExport} className="gap-2 btn-primary">
                <Download className="w-4 h-4" />
                {dict.common.export}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}
