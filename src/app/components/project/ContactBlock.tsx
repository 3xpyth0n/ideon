"use client";

import { memo, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { User } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { BlockFooter } from "./BlockFooter";
import { useTouchGestures } from "./hooks/useTouchGestures";
import { useTouch } from "@providers/TouchProvider";
import {
  Handle,
  Position,
  type NodeProps,
  type Node,
  useReactFlow,
} from "@xyflow/react";
import { BlockData } from "./CanvasBlock";
import "./contact-block.css";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import CustomNodeResizer from "./CustomNodeResizer";

type ContactBlockProps = NodeProps<Node<BlockData>> & {
  isReadOnly?: boolean;
  isEditing?: boolean;
};

interface ContactMetadata {
  name: string;
  phone: string;
  email: string;
  note: string;
}

const ContactBlock = memo(({ id, data, selected }: ContactBlockProps) => {
  const { dict, lang } = useI18n();
  const { setNodes, getEdges } = useReactFlow();
  const { rippleRef } = useTouch();

  const currentUser = data.currentUser;
  const projectOwnerId = data.projectOwnerId;
  const ownerId = data.ownerId;
  const isPreviewMode = data.isPreviewMode;
  const isLocked = data.isLocked;

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

  const initialMetadata = useMemo((): ContactMetadata => {
    try {
      return JSON.parse(data.metadata || "{}");
    } catch {
      return { name: "", phone: "", email: "", note: "" };
    }
  }, [data.metadata]);

  const [localMeta, setLocalMeta] = useState<ContactMetadata>(initialMetadata);
  const [isEditing, setIsEditing] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);

  const onLongPress = useCallback(() => {
    if (!isReadOnly) {
      setIsEditing(true);
    }
  }, [isReadOnly]);

  const touchHandlers = useTouchGestures({
    rippleRef,
    onLongPress,
    stopPropagation: true,
  });

  // Title state
  const [title, setTitle] = useState(data.title || "");

  useEffect(() => {
    setLocalMeta(initialMetadata);
  }, [initialMetadata]);

  // Sync title
  useEffect(() => {
    if (data.title !== undefined && data.title !== title) {
      setTitle(data.title);
    }
  }, [data.title]);

  // Inputs are read-only if the block is locked/preview OR if not in edit mode
  const isInputReadOnly = isReadOnly || !isEditing;

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!isReadOnly) {
        e.preventDefault();
        setIsEditing(true);
      }
    },
    [isReadOnly],
  );

  useEffect(() => {
    if (!isEditing) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        setIsEditing(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        blockRef.current &&
        !blockRef.current.contains(e.target as globalThis.Node)
      ) {
        setIsEditing(false);
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isEditing]);

  const updateField = useCallback(
    (field: keyof ContactMetadata, value: string) => {
      if (isInputReadOnly) return;

      const newMeta = { ...localMeta, [field]: value };
      setLocalMeta(newMeta);

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
        JSON.stringify(newMeta),
        title,
        data.reactions,
      );
    },
    [id, data, localMeta, isInputReadOnly, currentUser, dict, title],
  );

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
    [id, data, currentUser, dict],
  );

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

  const edges = getEdges();
  const isHandleConnected = (handleId: string) =>
    edges.some(
      (e) =>
        (e.source === id && e.sourceHandle === handleId) ||
        (e.target === id && e.targetHandle === handleId),
    );

  const isLeftSourceConnected = isHandleConnected("left");
  const isRightSourceConnected = isHandleConnected("right");
  const isTopSourceConnected = isHandleConnected("top");
  const isBottomSourceConnected = isHandleConnected("bottom");

  return (
    <div
      ref={blockRef}
      onContextMenu={handleContextMenu}
      className={`block-card block-type-contact ${selected ? "selected" : ""} ${
        isBeingMoved ? "is-moving" : ""
      } ${isReadOnly ? "read-only" : ""} flex flex-col p-0!`}
      style={{ "--block-border-color": borderColor } as React.CSSProperties}
      {...touchHandlers}
    >
      <CustomNodeResizer
        minWidth={250}
        minHeight={180}
        isVisible={!isReadOnly}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        keepAspectRatio={false}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />

      <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
        <div className="flex items-center gap-2">
          <User size={16} />
          <span className="text-sm uppercase tracking-wider opacity-50 font-bold">
            {dict.blocks.blockTypeContact || "Contact"}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
          <input
            value={title}
            onChange={handleTitleChange}
            className="block-title"
            placeholder={dict.blocks.title || "..."}
            readOnly={isReadOnly}
          />
        </div>
      </div>

      <div className="block-content flex-1 flex flex-col min-h-0">
        <div className="contact-block-container nowheel nodrag h-full">
          <div className="contact-field">
            <label className="contact-field-label">
              {dict.blocks.contactName || "Name"}
            </label>
            <input
              type="text"
              className={`contact-input ${!isEditing ? "preview-mode" : ""}`}
              value={localMeta.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder={dict.blocks.namePlaceholder || "Full name"}
              readOnly={isInputReadOnly}
            />
          </div>

          <div className="contact-field">
            <label className="contact-field-label">
              {dict.blocks.contactPhone || "Phone"}
            </label>
            <input
              type="tel"
              className={`contact-input ${!isEditing ? "preview-mode" : ""}`}
              value={localMeta.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              placeholder={dict.blocks.phonePlaceholder || "+00 000 000 000"}
              readOnly={isInputReadOnly}
            />
          </div>

          <div className="contact-field">
            <label className="contact-field-label">
              {dict.blocks.contactEmail || "Email"}
            </label>
            <input
              type="email"
              className={`contact-input ${!isEditing ? "preview-mode" : ""}`}
              value={localMeta.email}
              onChange={(e) => updateField("email", e.target.value)}
              placeholder={dict.blocks.emailPlaceholder || "email@example.com"}
              readOnly={isInputReadOnly}
            />
          </div>

          <div className="contact-field">
            <label className="contact-field-label">
              {dict.blocks.contactNote || "Note"}
            </label>
            <textarea
              className={`contact-input contact-textarea ${
                !isEditing ? "preview-mode" : ""
              }`}
              value={localMeta.note}
              onChange={(e) => updateField("note", e.target.value)}
              placeholder={dict.blocks.notePlaceholder || "Add a note..."}
              readOnly={isInputReadOnly}
            />
          </div>
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
        {!isLeftSourceConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={true}
        className="block-handle block-handle-right z-50!"
      >
        {!isRightSourceConnected && <div className="handle-dot" />}
      </Handle>

      {/* Handles - Top Side */}
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        isConnectable={true}
        className="block-handle block-handle-top z-50!"
      >
        {!isTopSourceConnected && <div className="handle-dot" />}
      </Handle>

      {/* Handles - Bottom Side */}
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={true}
        className="block-handle block-handle-bottom z-50!"
      >
        {!isBottomSourceConnected && <div className="handle-dot" />}
      </Handle>
    </div>
  );
});

ContactBlock.displayName = "ContactBlock";

export default ContactBlock;
