"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Folder, Minimize2, Maximize2 } from "lucide-react";
import {
  Handle,
  Position,
  type NodeProps,
  type Node,
  useReactFlow,
  useEdges,
} from "@xyflow/react";
import { useI18n } from "@providers/I18nProvider";
import { BlockData } from "./CanvasBlock";
import { BlockFooter } from "./BlockFooter";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import CustomNodeResizer from "./CustomNodeResizer";
import { parseFolderMetadata } from "@lib/metadata-parsers";
import "./folder-block.css";

type FolderBlockProps = NodeProps<Node<BlockData>>;

const FolderBlock = memo(({ id, data, selected }: FolderBlockProps) => {
  const { dict, lang } = useI18n();
  const { setNodes } = useReactFlow();
  const edges = useEdges();

  const currentUser = data.currentUser;
  const projectOwnerId = data.projectOwnerId;
  const ownerId = data.ownerId;
  const isPreviewMode = data.isPreviewMode;
  const isLocked = data.isLocked;
  const folderMetadata = useMemo(
    () => parseFolderMetadata(data.metadata),
    [data.metadata],
  );

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

  const isBeingMoved = !!data.movingUserColor;
  const borderColor = isBeingMoved ? data.movingUserColor : "var(--border)";

  const [title, setTitle] = useState(data.title || "");

  useEffect(() => {
    if (data.title !== undefined && data.title !== title) {
      setTitle(data.title);
    }
  }, [data.title, title]);

  const directChildrenCount = useMemo(() => {
    return edges.filter((edge) => edge.source === id).length;
  }, [edges, id]);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isReadOnly) return;
      const newTitle = e.target.value;
      setTitle(newTitle);
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.project.anonymous;

      data.onContentChange?.(
        id,
        data.content,
        now,
        editor,
        data.metadata,
        newTitle,
        data.reactions,
      );
    },
    [id, data, currentUser, dict.project.anonymous, isReadOnly],
  );

  const handleToggleCollapse = useCallback(() => {
    if (isReadOnly) return;
    const nextCollapsed = !folderMetadata.isCollapsed;

    data.onFolderToggle?.(id, nextCollapsed);

    if (!data.onFolderToggle) {
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.project.anonymous;

      data.onContentChange?.(
        id,
        data.content,
        now,
        editor,
        JSON.stringify({ ...folderMetadata, isCollapsed: nextCollapsed }),
        title,
        data.reactions,
      );
    }
  }, [
    isReadOnly,
    folderMetadata,
    data,
    id,
    currentUser?.displayName,
    currentUser?.username,
    dict.project.anonymous,
    title,
  ]);

  const handleResize = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                width: Math.round(params.width),
                height: Math.round(params.height),
                position: {
                  x: Math.round(params.x),
                  y: Math.round(params.y),
                },
              }
            : n,
        ),
      );
    },
    [id, setNodes],
  );

  const handleResizeEnd = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      const { width, height, x, y } = params;
      data.onResizeEnd?.(id, { width, height, x, y });
    },
    [data, id],
  );

  const isHandleConnected = (handleId: string) =>
    edges.some(
      (e) =>
        (e.source === id && e.sourceHandle === handleId) ||
        (e.target === id && e.targetHandle === handleId),
    );

  const isLeftConnected = isHandleConnected("left");
  const isRightConnected = isHandleConnected("right");
  const isTopConnected = isHandleConnected("top");
  const isBottomConnected = isHandleConnected("bottom");

  return (
    <div
      className={`block-card ${selected ? "selected" : ""} ${
        isBeingMoved ? "is-moving" : ""
      } ${isReadOnly ? "read-only" : ""} folder-block`}
      style={{ "--block-border-color": borderColor } as React.CSSProperties}
    >
      <CustomNodeResizer
        minWidth={250}
        minHeight={150}
        isVisible={!isReadOnly}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        keepAspectRatio={false}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />

      <div className="folder-block-shell">
        <div className="folder-block-type-pill">
          <Folder size={14} />
          <span>{dict.blocks.blockTypeFolder || "Folder"}</span>
        </div>

        <div className="folder-block-body">
          <input
            value={title}
            onChange={handleTitleChange}
            className="folder-block-name"
            placeholder={dict.blocks.title || "..."}
            readOnly={isReadOnly}
          />
        </div>

        <div className="folder-block-toolbar">
          <span className="folder-block-count">
            {dict.blocks.folderChildrenCount
              ? dict.blocks.folderChildrenCount.replace(
                  "{count}",
                  String(directChildrenCount),
                )
              : `${directChildrenCount} children`}
          </span>

          <button
            className="folder-block-toggle"
            onClick={handleToggleCollapse}
            disabled={isReadOnly}
          >
            {folderMetadata.isCollapsed ? (
              <Maximize2 size={15} />
            ) : (
              <Minimize2 size={15} />
            )}
            <span>
              {folderMetadata.isCollapsed
                ? dict.blocks.expandChildren || "Expand"
                : dict.blocks.collapseChildren || "Collapse"}
            </span>
          </button>
        </div>
      </div>

      <BlockFooter
        updatedAt={data.updatedAt}
        authorName={data.authorName}
        isLocked={isLocked}
        dict={dict}
        lang={lang}
      />

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
        isConnectable={true}
        className="block-handle block-handle-left z-50!"
      >
        {!isLeftConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={true}
        className="block-handle block-handle-right z-50!"
      >
        {!isRightConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        isConnectable={true}
        className="block-handle block-handle-top z-50!"
      >
        {!isTopConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={true}
        className="block-handle block-handle-bottom z-50!"
      >
        {!isBottomConnected && <div className="handle-dot" />}
      </Handle>
    </div>
  );
});

FolderBlock.displayName = "FolderBlock";

export default FolderBlock;
