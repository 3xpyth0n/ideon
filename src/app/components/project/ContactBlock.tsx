"use client";

import { memo, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { User, Lock } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import {
  Handle,
  Position,
  NodeResizer,
  type NodeProps,
  type Node,
  useReactFlow,
} from "@xyflow/react";
import { BlockData } from "./CanvasBlock";
import { DEFAULT_BLOCK_WIDTH, DEFAULT_BLOCK_HEIGHT } from "./utils/constants";
import "./contact-block.css";

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
  const { setNodes, getNode, getEdges } = useReactFlow();

  const initialMetadata = useMemo((): ContactMetadata => {
    const defaultMeta: ContactMetadata = {
      name: "",
      phone: "",
      email: "",
      note: "",
    };

    if (!data.metadata) return defaultMeta;

    try {
      const parsed =
        typeof data.metadata === "string"
          ? JSON.parse(data.metadata)
          : data.metadata;

      if (!parsed || typeof parsed !== "object") return defaultMeta;

      return {
        name: parsed.name ?? "",
        phone: parsed.phone ?? "",
        email: parsed.email ?? "",
        note: parsed.note ?? "",
      };
    } catch {
      return defaultMeta;
    }
  }, [data.metadata]);

  const [localMeta, setLocalMeta] = useState<ContactMetadata>(initialMetadata);
  const [isEditing, setIsEditing] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);

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

  const currentUser = data.currentUser;
  const projectOwnerId = data.projectOwnerId;
  const ownerId = data.ownerId;
  const isPreviewMode = data.isPreviewMode;
  const isLocked = data.isLocked;

  const isProjectOwner = currentUser?.id && projectOwnerId === currentUser.id;
  const isOwner = currentUser?.id && ownerId === currentUser.id;
  const isReadOnly =
    isPreviewMode || (isLocked ? !isOwner && !isProjectOwner : false);

  const isBeingMoved = !!data.movingUserColor;
  const borderColor = isBeingMoved ? data.movingUserColor : "var(--border)";

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
        dict.common.anonymous;

      data.onContentChange?.(
        id,
        data.content,
        now,
        editor,
        JSON.stringify(newMeta),
        title,
      );
    },
    [id, data, localMeta, isInputReadOnly, currentUser, dict, title],
  );

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      setTitle(newTitle);
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.common.anonymous;

      data.onContentChange?.(
        id,
        data.content,
        now,
        editor,
        data.metadata,
        newTitle,
      );
    },
    [id, data, currentUser, dict],
  );

  const formatDate = (isoString: string) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    const options: Intl.DateTimeFormatOptions = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    };

    const formatted = new Intl.DateTimeFormat(
      lang === "fr" ? "fr-FR" : "en-US",
      options,
    ).format(date);

    return formatted.replace(",", "").replace(" ", ` ${dict.common.at} `);
  };

  const handleResize = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      const { width, height, x, y } = params;

      const snapW =
        Math.abs(width - DEFAULT_BLOCK_WIDTH) <= DEFAULT_BLOCK_WIDTH * 0.1;
      const snapH =
        Math.abs(height - DEFAULT_BLOCK_HEIGHT) <= DEFAULT_BLOCK_HEIGHT * 0.1;

      const finalWidth = snapW ? DEFAULT_BLOCK_WIDTH : Math.round(width);
      const finalHeight = snapH ? DEFAULT_BLOCK_HEIGHT : Math.round(height);

      const currentBlock = getNode(id);
      if (!currentBlock) return;

      let finalX = Math.round(x);
      let finalY = Math.round(y);

      if (snapW && Math.abs(x - currentBlock.position.x) > 0.1) {
        finalX = Math.round(x + width - DEFAULT_BLOCK_WIDTH);
      }
      if (snapH && Math.abs(y - currentBlock.position.y) > 0.1) {
        finalY = Math.round(y + height - DEFAULT_BLOCK_HEIGHT);
      }

      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                width: finalWidth,
                height: finalHeight,
                position: { x: finalX, y: finalY },
              }
            : n,
        ),
      );
    },
    [id, getNode, setNodes],
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

  const isLeftTargetConnected = isHandleConnected("left-target");
  const isLeftSourceConnected = isHandleConnected("left");
  const isRightTargetConnected = isHandleConnected("right-target");
  const isRightSourceConnected = isHandleConnected("right");
  const isTopTargetConnected = isHandleConnected("top-target");
  const isTopSourceConnected = isHandleConnected("top");
  const isBottomTargetConnected = isHandleConnected("bottom-target");
  const isBottomSourceConnected = isHandleConnected("bottom");

  return (
    <div
      ref={blockRef}
      onContextMenu={handleContextMenu}
      className={`block-card block-type-contact ${selected ? "selected" : ""} ${
        isBeingMoved ? "is-moving" : ""
      } ${isReadOnly ? "read-only" : ""} flex flex-col !p-0`}
      style={{ "--block-border-color": borderColor } as React.CSSProperties}
    >
      <NodeResizer
        minWidth={250}
        minHeight={150}
        isVisible={selected && !isReadOnly}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        keepAspectRatio={false}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />

      <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
        <div className="flex items-center gap-2">
          <User size={16} />
          <span className="text-tiny uppercase tracking-wider opacity-50 font-bold">
            {dict.common.blockTypeContact || "Contact"}
          </span>
        </div>
        <div className="flex items-center gap-2 opacity-50">
          <input
            value={title}
            onChange={handleTitleChange}
            className="block-title text-[10px] font-bold tracking-widest text-right focus:opacity-100 transition-opacity"
            placeholder="..."
            readOnly={isReadOnly}
          />
        </div>
      </div>

      <div className="block-content flex-1 flex flex-col min-h-0">
        <div className="contact-block-container nowheel nodrag h-full">
          <div className="contact-field">
            <label className="contact-field-label">
              {dict.common.contactName || "Name"}
            </label>
            <input
              type="text"
              className={`contact-input ${!isEditing ? "preview-mode" : ""}`}
              value={localMeta.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder={dict.common.namePlaceholder || "Full name"}
              readOnly={isInputReadOnly}
            />
          </div>

          <div className="contact-field">
            <label className="contact-field-label">
              {dict.common.contactPhone || "Phone"}
            </label>
            <input
              type="tel"
              className={`contact-input ${!isEditing ? "preview-mode" : ""}`}
              value={localMeta.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              placeholder={dict.common.phonePlaceholder || "+00 000 000 000"}
              readOnly={isInputReadOnly}
            />
          </div>

          <div className="contact-field">
            <label className="contact-field-label">
              {dict.common.contactEmail || "Email"}
            </label>
            <input
              type="email"
              className={`contact-input ${!isEditing ? "preview-mode" : ""}`}
              value={localMeta.email}
              onChange={(e) => updateField("email", e.target.value)}
              placeholder={dict.common.emailPlaceholder || "email@example.com"}
              readOnly={isInputReadOnly}
            />
          </div>

          <div className="contact-field">
            <label className="contact-field-label">
              {dict.common.contactNote || "Note"}
            </label>
            <textarea
              className={`contact-input contact-textarea ${
                !isEditing ? "preview-mode" : ""
              }`}
              value={localMeta.note}
              onChange={(e) => updateField("note", e.target.value)}
              placeholder={dict.common.notePlaceholder || "Add a note..."}
              readOnly={isInputReadOnly}
            />
          </div>
        </div>
      </div>

      <div className="block-author-container mt-2 pt-3 px-4 pb-3">
        <div className="flex items-center justify-between w-full text-tiny opacity-40">
          <div className="block-timestamp">
            {formatDate(data.updatedAt || "")}
          </div>
          <div className="block-author-info flex items-center gap-1.5">
            {isLocked && <Lock size={10} className="block-lock-icon" />}
            <div className="author-name">
              {(data.authorName || dict.common.anonymous).toLowerCase()}
            </div>
          </div>
        </div>
      </div>

      <Handle
        id="left-target"
        type="source"
        position={Position.Left}
        isConnectable={true}
        className="block-handle block-handle-left !z-50 !top-[40%]"
      >
        {!isLeftTargetConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        isConnectable={true}
        className="block-handle block-handle-left !z-50 !top-[60%]"
      >
        {!isLeftSourceConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={true}
        className="block-handle block-handle-right !z-50 !top-[40%]"
      >
        {!isRightSourceConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="right-target"
        type="source"
        position={Position.Right}
        isConnectable={true}
        className="block-handle block-handle-right !z-50 !top-[60%]"
      >
        {!isRightTargetConnected && <div className="handle-dot" />}
      </Handle>

      {/* Handles - Top Side */}
      <Handle
        id="top-target"
        type="source"
        position={Position.Top}
        isConnectable={true}
        className="block-handle block-handle-top !z-50 !left-[40%]"
      >
        {!isTopTargetConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        isConnectable={true}
        className="block-handle block-handle-top !z-50 !left-[60%]"
      >
        {!isTopSourceConnected && <div className="handle-dot" />}
      </Handle>

      {/* Handles - Bottom Side */}
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={true}
        className="block-handle block-handle-bottom !z-50 !left-[60%]"
      >
        {!isBottomSourceConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="bottom-target"
        type="source"
        position={Position.Bottom}
        isConnectable={true}
        className="block-handle block-handle-bottom !z-50 !left-[40%]"
      >
        {!isBottomTargetConnected && <div className="handle-dot" />}
      </Handle>
    </div>
  );
});

ContactBlock.displayName = "ContactBlock";

export default ContactBlock;
