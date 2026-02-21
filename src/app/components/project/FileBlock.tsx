"use client";
import { memo, useState, useEffect, useRef, useCallback } from "react";
import { Handle, Position, NodeResizer, useReactFlow } from "@xyflow/react";
import {
  File as FileIcon,
  Upload,
  X,
  Download,
  FileCode,
  FileAudio,
  FileVideo,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { CanvasBlockProps } from "./CanvasBlock";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import { BlockFooter } from "./BlockFooter";

interface BlockMetadata {
  name?: string;
  size?: number;
  type?: string;
  lastModified?: number;
  title?: string;
  description?: string;
  image?: string;
  error?: string;
  tempUrl?: string;
  status?: string;
  [key: string]: unknown;
}

const getFileIcon = (filename: string, mimeType?: string) => {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (
    mimeType?.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(
      ext || "",
    )
  ) {
    return FileImage;
  }
  if (
    mimeType?.startsWith("audio/") ||
    ["mp3", "wav", "ogg", "m4a", "flac"].includes(ext || "")
  ) {
    return FileAudio;
  }
  if (
    mimeType?.startsWith("video/") ||
    ["mp4", "mov", "avi", "webm", "mkv"].includes(ext || "")
  ) {
    return FileVideo;
  }

  switch (ext) {
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
    case "html":
    case "css":
    case "json":
    case "py":
    case "java":
    case "c":
    case "cpp":
    case "rs":
    case "go":
    case "php":
    case "rb":
      return FileCode;
    case "zip":
    case "rar":
    case "7z":
    case "tar":
    case "gz":
      return FileArchive;
    case "csv":
    case "xls":
    case "xlsx":
      return FileSpreadsheet;
    default:
      return FileIcon;
  }
};

const FileBlock = (props: CanvasBlockProps) => {
  const { id, data, selected, width, height } = props;
  const { dict, lang } = useI18n();
  const [title, setTitle] = useState(data.title || "");
  const isLocked = data.isLocked;
  const isPreviewMode = data.isPreviewMode;
  const initialProjectId = data.initialProjectId;

  const currentUser = data.currentUser;
  const projectOwnerId = data.projectOwnerId;
  const ownerId = data.ownerId;
  const { setNodes } = useReactFlow();

  const isProjectOwner = currentUser?.id && projectOwnerId === currentUser.id;
  const isOwner = currentUser?.id && ownerId === currentUser.id;

  const isViewer = data.userRole === "viewer";
  const isReadOnly =
    isPreviewMode ||
    isViewer ||
    (isLocked ? !isOwner && !isProjectOwner : false);
  const canReact = !isPreviewMode || isViewer;

  const { handleReact, handleRemoveReaction } = useBlockReactions({
    id,
    data,
    currentUser,
    isReadOnly,
    canReact,
  });

  const [content, setContent] = useState(data.content);

  useEffect(() => {
    if (data.title !== undefined) setTitle(data.title);
  }, [data.title]);

  const [metadata, setMetadata] = useState<BlockMetadata | null>(() => {
    try {
      if (!data.metadata) return null;
      return typeof data.metadata === "string"
        ? JSON.parse(data.metadata)
        : data.metadata;
    } catch {
      return null;
    }
  });

  const [previewImageError, setPreviewImageError] = useState(false);

  useEffect(() => {
    setPreviewImageError(false);
  }, [content, data.metadata]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const syncToYjs = useCallback(
    (newContent: string) => {
      const yText = data.yText;
      if (!yText) return;

      const currentYText = yText.toString();
      if (newContent === currentYText) return;

      yText.doc?.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, newContent);
      }, yText.doc.clientID);
    },
    [data.yText],
  );

  const updateMetadata = useCallback(
    (newMetadata: BlockMetadata | null) => {
      setMetadata(newMetadata);
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.project.anonymous;
      const metadataString = newMetadata
        ? JSON.stringify(newMetadata)
        : undefined;
      data.onContentChange?.(
        id,
        content,
        now,
        editor,
        metadataString,
        title,
        data.reactions,
      );

      if (setNodes) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    metadata: metadataString,
                    title: title,
                  },
                }
              : n,
          ),
        );
      }
    },
    [currentUser, dict.project.anonymous, data, id, content, title, setNodes],
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) return;
    const file = e.target.files?.[0];
    if (!file || !initialProjectId) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/projects/${initialProjectId}/files`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const fileData = await res.json();
        const newMetadata = {
          name: fileData.name,
          size: fileData.size,
          type: fileData.type,
          lastModified: file.lastModified,
        };

        updateMetadata(newMetadata);

        const now = new Date().toISOString();
        const editor =
          currentUser?.displayName ||
          currentUser?.username ||
          dict.project.anonymous;
        const metadataString = JSON.stringify(newMetadata);
        setContent(fileData.name);
        syncToYjs(fileData.name);
        data.onContentChange?.(
          id,
          fileData.name,
          now,
          editor,
          metadataString,
          title,
          data.reactions,
        );

        // Sync metadata to yNodes
        if (setNodes) {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === id
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      metadata: metadataString,
                      title: title,
                    },
                  }
                : n,
            ),
          );
        }
      } else {
        const err = await res.json();
        console.error("Upload failed:", err);
      }
    } catch (error) {
      console.error("Upload error:", error);
    }
  };

  const handleFileDownload = async () => {
    if (!metadata?.name || !initialProjectId) return;
    try {
      const url = `/api/projects/${initialProjectId}/files?name=${encodeURIComponent(
        metadata.name,
      )}`;
      const link = document.createElement("a");
      link.href = url;
      link.download = metadata.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Download error:", error);
    }
  };

  const handleFileDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly || !initialProjectId) return;

    if (metadata?.name) {
      try {
        await fetch(
          `/api/projects/${initialProjectId}/files?name=${encodeURIComponent(
            metadata.name,
          )}`,
          {
            method: "DELETE",
          },
        );
      } catch (error) {
        console.error("Delete physical file error:", error);
      }
    }

    updateMetadata(null);
    setContent("");
    syncToYjs("");
  };

  // Resize Handlers
  const handleResize = useCallback(
    (
      _: unknown,
      params: { width: number; height: number; x?: number; y?: number },
    ) => {
      data.onResize?.(id, params);
    },
    [data, id],
  );

  const handleResizeEnd = useCallback(
    (
      _: unknown,
      params: { width: number; height: number; x?: number; y?: number },
    ) => {
      data.onResizeEnd?.(id, params);
    },
    [data, id],
  );

  const Icon = getFileIcon(metadata?.name || "", metadata?.type as string);

  return (
    <div
      className={`block-card block-type-file ${selected ? "selected" : ""} ${
        isReadOnly ? "read-only" : ""
      } flex flex-col !p-0 relative w-full h-full`}
    >
      <NodeResizer
        minWidth={250}
        minHeight={180}
        isVisible={selected && !isReadOnly}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        keepAspectRatio={false}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />

      <div className="w-full h-full flex flex-col overflow-hidden rounded-[inherit] px-2">
        <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
          <div className="flex items-center gap-2">
            <FileIcon size={14} className="block-type-icon file" />
            <span className="text-sm uppercase tracking-wider opacity-50 font-bold">
              {dict.blocks.blockTypeFile || "FILE"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {metadata && (
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFileDownload();
                  }}
                  className="p-1 rounded hover:bg-white/10 opacity-40 hover:opacity-100 transition-all"
                  title={dict.blocks.download || "Download"}
                >
                  <Download size={14} />
                </button>
                {!isReadOnly && (
                  <button
                    onClick={handleFileDelete}
                    className="p-1 rounded hover:bg-white/10 opacity-40 hover:opacity-100 transition-all text-red-400"
                    title={dict.common.delete || "Delete"}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="block-content flex-1 flex flex-col min-h-0">
          {(() => {
            const isImage =
              metadata?.type?.startsWith("image/") ||
              [
                "jpg",
                "jpeg",
                "png",
                "gif",
                "webp",
                "svg",
                "bmp",
                "ico",
              ].includes(metadata?.name?.split(".").pop()?.toLowerCase() || "");

            const imageUrl =
              metadata?.tempUrl ||
              (metadata?.name && initialProjectId
                ? `/api/projects/${initialProjectId}/files?name=${encodeURIComponent(
                    metadata.name,
                  )}`
                : null);

            const isUploading = metadata?.status === "uploading";

            // Layout logic based on dimensions
            const isLargeBlock = (width ?? 0) >= 500 && (height ?? 0) >= 400;
            const isVerticalLayout =
              (width ?? 0) >= 400 || (height ?? 0) >= 300;
            const shouldUseVerticalLayout =
              isImage && imageUrl && isVerticalLayout;

            return (
              <div
                className={`block-file-container flex flex-col gap-2 h-full cursor-default select-none relative ${
                  isUploading ? "opacity-70" : ""
                }`}
              >
                {isUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10 z-20 rounded">
                    <Loader2 className="animate-spin text-white" size={24} />
                  </div>
                )}
                {!metadata ? (
                  <div
                    className={`block-file-upload-zone flex-1 flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded transition-colors ${
                      isReadOnly
                        ? "border-white/5 cursor-default"
                        : "border-white/10 hover:border-white/20 cursor-pointer"
                    }`}
                    onClick={() => !isReadOnly && fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden-input"
                      onChange={handleFileUpload}
                      disabled={isReadOnly}
                    />
                    <Upload size={32} className="opacity-20" />
                    <span className="text-xs opacity-40 text-center px-4">
                      {dict.blocks.clickToUpload}
                    </span>
                  </div>
                ) : (
                  <div
                    className={`block-file-widget flex-1 min-w-0 ${
                      shouldUseVerticalLayout
                        ? "flex flex-col gap-2"
                        : "flex items-center gap-3"
                    }`}
                  >
                    {isImage && imageUrl && !previewImageError ? (
                      <div
                        role="button"
                        tabIndex={0}
                        className={`block-file-thumbnail nodrag ${
                          isLargeBlock
                            ? "flex-1 min-h-0 w-full"
                            : shouldUseVerticalLayout
                              ? "w-full aspect-video"
                              : "h-12 w-16"
                        }`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                          }
                        }}
                      >
                        <img
                          src={imageUrl as string}
                          alt={metadata.name}
                          className={`w-full h-full select-none nodrag ${
                            isLargeBlock ? "object-contain" : "object-cover"
                          }`}
                          draggable={false}
                          crossOrigin="anonymous"
                          onError={() => setPreviewImageError(true)}
                        />
                      </div>
                    ) : (
                      <div className="block-file-icon-container p-3 rounded bg-white/5 flex-shrink-0">
                        <Icon size={32} className="opacity-60" />
                      </div>
                    )}
                    <div
                      className={`block-file-info min-w-0 ${
                        shouldUseVerticalLayout ? "w-full px-2 pb-2" : "flex-1"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <h4
                          className="block-file-name truncate font-bold text-sm flex-1 text-left"
                          title={metadata.name || content}
                        >
                          {metadata.name || content}
                        </h4>
                        <span className="block-file-size text-xs opacity-40 shrink-0 whitespace-nowrap text-right ml-2 leading-none">
                          {metadata.size
                            ? `${(metadata.size / 1024).toFixed(1)} KB`
                            : "Unknown size"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        <BlockFooter
          updatedAt={data.updatedAt}
          authorName={data.authorName}
          isLocked={isLocked}
          dict={dict}
          lang={lang}
        />
      </div>

      <BlockReactions
        reactions={data.reactions}
        onReact={handleReact}
        onRemoveReaction={handleRemoveReaction}
        currentUserId={currentUser?.id}
        isReadOnly={isReadOnly}
        canReact={canReact}
      />

      <Handle
        id="left"
        type="source"
        position={Position.Left}
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-left !z-50 ${
          isReadOnly ? "!opacity-0 !pointer-events-none" : ""
        }`}
      >
        <div className="handle-dot" />
      </Handle>

      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-right !z-50 ${
          isReadOnly ? "!opacity-0 !pointer-events-none" : ""
        }`}
      >
        <div className="handle-dot" />
      </Handle>

      <Handle
        id="top"
        type="source"
        position={Position.Top}
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-top !z-50 ${
          isReadOnly ? "!opacity-0 !pointer-events-none" : ""
        }`}
      >
        <div className="handle-dot" />
      </Handle>

      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-bottom !z-50 ${
          isReadOnly ? "!opacity-0 !pointer-events-none" : ""
        }`}
      >
        <div className="handle-dot" />
      </Handle>
    </div>
  );
};

export default memo(FileBlock);
