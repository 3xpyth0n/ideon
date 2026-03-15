"use client";

import {
  memo,
  useCallback,
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  forwardRef,
} from "react";
import { createPortal } from "react-dom";
import {
  Handle,
  Position,
  type NodeProps,
  type Node,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import {
  FileText,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  Link as LinkIcon,
  Unlink,
  Check,
  X,
  Table as TableIcon,
  CheckSquare,
  Rows2,
  Columns2,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import { Node as PMNode } from "@tiptap/pm/model";
import { useI18n } from "@providers/I18nProvider";
import { BlockData } from "./CanvasBlock";
import MarkdownEditor from "./MarkdownEditor";
import { BlockFooter } from "./BlockFooter";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import CustomNodeResizer from "./CustomNodeResizer";
import dynamic from "next/dynamic";
import { markdown } from "@codemirror/lang-markdown";
import "./markdown-editor.css";

const VimEditor = dynamic(() => import("./VimEditor"), { ssr: false });

type NoteBlockProps = NodeProps<Node<BlockData, "text">>;

interface BubbleMenuProps {
  editor: Editor;
  isEditingLink: boolean;
  linkUrl: string;
  setLinkUrl: (url: string) => void;
  openLinkModal: () => void;
  applyLink: () => void;
  removeLink: () => void;
  cancelLink: () => void;
  blockRect: DOMRect;
  zoom: number;
  editorStateVersion?: number;
}

const BubbleMenuComponent = forwardRef<HTMLDivElement, BubbleMenuProps>(
  (
    {
      editor,
      isEditingLink,
      linkUrl,
      setLinkUrl,
      openLinkModal,
      applyLink,
      removeLink,
      cancelLink,
      blockRect,
      zoom,
      editorStateVersion,
    },
    ref,
  ) => {
    const iconSize = 14;

    const style: React.CSSProperties = {
      position: "fixed",
      top: blockRect.top - 50,
      left: blockRect.left + blockRect.width / 2,
      transform: `translateX(-50%) scale(${zoom})`,
      transformOrigin: "bottom center",
      zIndex: 100000,
    };

    const handleDeleteRow = () => {
      if (!editor.isActive("table")) return;
      const { state } = editor;
      const { selection } = state;

      let tableNode: PMNode | null = null;

      state.doc.nodesBetween(selection.from, selection.to, (node) => {
        if (node.type.name === "table") {
          tableNode = node as unknown as PMNode;
          return false;
        }
      });

      if (tableNode) {
        const node = tableNode as PMNode;
        if (node.childCount <= 1) {
          editor.chain().focus().deleteTable().run();
        } else {
          editor.chain().focus().deleteRow().run();
        }
      }
    };

    return (
      <div
        ref={ref}
        className="bubble-menu"
        style={style}
        onMouseDown={(e) => {
          // Prevent focus loss from editor when clicking on menu, except for input
          if ((e.target as HTMLElement).tagName !== "INPUT") {
            e.preventDefault();
          }
        }}
      >
        {isEditingLink ? (
          <>
            <input
              type="text"
              className="bubble-menu-input"
              placeholder="https://..."
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                } else if (e.key === "Escape") {
                  cancelLink();
                }
              }}
              autoFocus
            />
            <button
              onClick={(e) => {
                e.preventDefault();
                applyLink();
              }}
              title="Apply"
              className="text-green-400 hover:text-green-300"
            >
              <Check size={iconSize} />
            </button>
            {editor.isActive("link") && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  removeLink();
                }}
                title="Unlink"
                className="text-red-400 hover:text-red-300"
              >
                <Unlink size={iconSize} />
              </button>
            )}
            <button
              onClick={(e) => {
                e.preventDefault();
                cancelLink();
              }}
              title="Cancel"
            >
              <X size={iconSize} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={editor.isActive("bold") ? "is-active" : ""}
              title="Bold"
            >
              <Bold size={iconSize} />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={editor.isActive("italic") ? "is-active" : ""}
              title="Italic"
            >
              <Italic size={iconSize} />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              className={editor.isActive("underline") ? "is-active" : ""}
              title="Underline"
            >
              <Underline size={iconSize} />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleStrike().run()}
              className={editor.isActive("strike") ? "is-active" : ""}
              title="Strikethrough"
            >
              <Strikethrough size={iconSize} />
            </button>

            <div className="tiptap-bubble-menu-separator" />

            <button
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 1 }).run()
              }
              className={
                editor.isActive("heading", { level: 1 }) ? "is-active" : ""
              }
              title="Heading 1"
            >
              <Heading1 size={iconSize} />
            </button>
            <button
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 2 }).run()
              }
              className={
                editor.isActive("heading", { level: 2 }) ? "is-active" : ""
              }
              title="Heading 2"
            >
              <Heading2 size={iconSize} />
            </button>
            <button
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 3 }).run()
              }
              className={
                editor.isActive("heading", { level: 3 }) ? "is-active" : ""
              }
              title="Heading 3"
            >
              <Heading3 size={iconSize} />
            </button>

            <div className="tiptap-bubble-menu-separator" />

            <button
              onClick={(e) => {
                e.preventDefault();
                openLinkModal();
              }}
              className={editor.isActive("link") ? "is-active" : ""}
              title={editor.isActive("link") ? "Edit Link" : "Add Link"}
            >
              <LinkIcon size={iconSize} />
            </button>

            <div className="tiptap-bubble-menu-separator" />

            <button
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .insertTable({ rows: 2, cols: 2, withHeaderRow: false })
                  .run()
              }
              title="Insert Table"
            >
              <TableIcon size={iconSize} />
            </button>

            <button
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              className={editor.isActive("taskList") ? "is-active" : ""}
              title="Task List"
            >
              <CheckSquare size={iconSize} />
            </button>

            {editor.isActive("table") && (
              <>
                <div className="tiptap-bubble-menu-separator" />
                <button
                  onClick={() => editor.chain().focus().addRowAfter().run()}
                  title="Add Row"
                >
                  <Rows2 size={iconSize} className="text-green-500" />
                </button>
                <button
                  onClick={() => editor.chain().focus().addColumnAfter().run()}
                  title="Add Column"
                >
                  <Columns2 size={iconSize} className="text-green-500" />
                </button>
                <button
                  onClick={handleDeleteRow}
                  title="Delete Row"
                  className="delete-button"
                >
                  <Rows2 size={iconSize} />
                </button>
                <button
                  onClick={() => editor.chain().focus().deleteColumn().run()}
                  title="Delete Column"
                  className="delete-button"
                >
                  <Columns2 size={iconSize} />
                </button>
              </>
            )}
          </>
        )}
      </div>
    );
  },
);

BubbleMenuComponent.displayName = "BubbleMenuComponent";

const NoteBlock = memo(({ data, selected, id }: NoteBlockProps) => {
  const { dict, lang } = useI18n();
  const { getEdges } = useReactFlow();
  const viewport = useViewport();

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

  const [editor, setEditor] = useState<Editor | null>(null);
  const [isEditing, setIsEditing] = useState(data.content ? false : true);
  const [showBubbleMenu, setShowBubbleMenu] = useState(false);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [isEditingLink, setIsEditingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const blockRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [blockRect, setBlockRect] = useState<DOMRect | null>(null);
  const [editorStateVersion, setEditorStateVersion] = useState(0);

  useEffect(() => {
    if (isReadOnly || !isEditing) {
      setShowBubbleMenu(false);
    }
  }, [isReadOnly, isEditing]);

  useEffect(() => {
    if (!currentUser?.vimMode && isEditing && !isReadOnly) {
      setShowBubbleMenu(true);
    }
  }, [currentUser?.vimMode, isEditing, isReadOnly]);

  useEffect(() => {
    const isNonVimEdit = !currentUser?.vimMode && isEditing && !isReadOnly;

    if (!editor) {
      if (!isNonVimEdit) setShowBubbleMenu(false);
      return;
    }

    const handleSelectionUpdate = () => {
      if (isNonVimEdit) return;
      const { from, head } = editor.state.selection;
      const hasSelection = from !== head;
      setShowBubbleMenu(
        hasSelection && !isTitleEditing && !isReadOnly && isEditing,
      );
    };

    const handleFocus = () => {
      if (isNonVimEdit) return;
      if (isReadOnly || !isEditing) return;
      const { from, head } = editor.state.selection;
      if (from !== head) setShowBubbleMenu(true);
    };

    const handleDomBlur = (e: FocusEvent) => {
      if (isNonVimEdit) return;

      const relatedTarget = e.relatedTarget;
      if (
        menuRef.current &&
        relatedTarget instanceof Node &&
        menuRef.current.contains(relatedTarget)
      ) {
        return;
      }
      setShowBubbleMenu(false);
    };

    const handleTransaction = () => {
      setEditorStateVersion((v) => v + 1);
    };

    editor.on("selectionUpdate", handleSelectionUpdate);
    editor.on("transaction", handleTransaction);
    editor.on("focus", handleFocus);
    if (editor.view && !editor.isDestroyed) {
      editor.view.dom.addEventListener("blur", handleDomBlur);
    }

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate);
      editor.off("transaction", handleTransaction);
      editor.off("focus", handleFocus);
      if (editor.view && !editor.isDestroyed && editor.view.dom) {
        editor.view.dom.removeEventListener("blur", handleDomBlur);
      }
    };
  }, [editor, isTitleEditing, isReadOnly, isEditing, currentUser?.vimMode]);

  useLayoutEffect(() => {
    if (showBubbleMenu && blockRef.current) {
      setBlockRect(blockRef.current.getBoundingClientRect());
    }
  }, [showBubbleMenu, viewport]);

  const [title, setTitle] = useState(data.title || "");

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

  // Sync with Yjs
  const syncToYjs = useCallback(
    (text: string) => {
      if (!data.yText) return;
      if (data.yText.toString() === text) return;
      data.yText.doc?.transact(() => {
        data.yText?.delete(0, data.yText.length);
        data.yText?.insert(0, text);
      });
    },
    [data.yText],
  );

  useEffect(() => {
    setTitle(data.title || "");
  }, [data.title]);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      setTitle(newTitle);
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.project.anonymous;

      data.onContentChange?.(
        id,
        data.content || "",
        now,
        editor,
        data.metadata ? JSON.stringify(data.metadata) : undefined,
        newTitle,
        data.reactions,
      );
    },
    [id, data, currentUser, dict],
  );

  const handleContentChange = useCallback(
    (newContent: string) => {
      syncToYjs(newContent);
      data.onContentChange?.(
        id,
        newContent,
        new Date().toISOString(),
        data.lastEditor,
        data.metadata ? JSON.stringify(data.metadata) : undefined,
        title,
        data.reactions,
      );
    },
    [
      id,
      data.onContentChange,
      data.lastEditor,
      data.metadata,
      title,
      syncToYjs,
    ],
  );

  const handleVimChange = useCallback(
    (value: string) => {
      syncToYjs(value);
      data.onContentChange?.(
        id,
        value,
        new Date().toISOString(),
        data.lastEditor,
        data.metadata ? JSON.stringify(data.metadata) : undefined,
        title,
        data.reactions,
      );
    },
    [
      id,
      data.onContentChange,
      data.lastEditor,
      data.metadata,
      title,
      syncToYjs,
    ],
  );

  const openLinkModal = useCallback(() => {
    if (!editor || isReadOnly) return;
    const previousUrl = editor.getAttributes("link").href;
    setLinkUrl(previousUrl || "");
    setIsEditingLink(true);
    setShowBubbleMenu(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    if (linkUrl) {
      let finalUrl = linkUrl.trim();
      // If the URL doesn't start with a protocol (http://, https://, mailto:, etc.), prepend https://
      if (
        finalUrl &&
        !/^https?:\/\//i.test(finalUrl) &&
        !/^mailto:/i.test(finalUrl) &&
        !/^tel:/i.test(finalUrl)
      ) {
        finalUrl = `https://${finalUrl}`;
      }

      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: finalUrl })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setIsEditingLink(false);
  }, [editor, linkUrl]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setIsEditingLink(false);
  }, [editor]);

  const cancelLink = useCallback(() => {
    setIsEditingLink(false);
    setLinkUrl("");
    editor?.commands.focus();
  }, [editor]);

  const handleResize = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      const { width, height, x, y } = params;
      const onResize = data.onResize;
      onResize?.(id, {
        width: Math.round(width),
        height: Math.round(height),
        x: Math.round(x),
        y: Math.round(y),
      });
    },
    [id, data],
  );

  const handleResizeEnd = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      const { width, height, x, y } = params;
      const onResizeEnd = data.onResizeEnd;
      onResizeEnd?.(id, {
        width: Math.round(width),
        height: Math.round(height),
        x: Math.round(x),
        y: Math.round(y),
      });
    },
    [id, data],
  );

  return (
    <>
      <CustomNodeResizer
        isVisible={!isReadOnly}
        minWidth={200}
        minHeight={180}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />
      <div
        ref={blockRef}
        className={`block-card block-type-note ${selected ? "selected" : ""} ${
          isReadOnly ? "read-only" : ""
        } flex flex-col p-0!`}
      >
        <div className="w-full h-full flex flex-col overflow-hidden rounded-[inherit]">
          <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
            <div className="flex items-center gap-2">
              <FileText size={16} />
              <span className="text-sm uppercase tracking-wider opacity-50 font-bold">
                {dict.blocks.blockTypeText || "Note"}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
              <input
                value={title}
                onChange={handleTitleChange}
                onFocus={() => setIsTitleEditing(true)}
                onBlur={() => setIsTitleEditing(false)}
                className="block-title"
                placeholder={dict.blocks.title || "..."}
                disabled={isReadOnly}
              />
            </div>
          </div>

          <div
            className="flex-1 min-h-0 relative px-4 overflow-y-auto nodrag nopan"
            onContextMenu={(e) => e.preventDefault()}
          >
            {isEditing && !isReadOnly ? (
              currentUser?.vimMode ? (
                <VimEditor
                  value={data.content || ""}
                  onChange={handleVimChange}
                  editable={!isReadOnly}
                  vimEnabled={true}
                  extensions={[markdown()]}
                  theme="dark"
                  className="h-full font-mono text-sm leading-relaxed"
                />
              ) : (
                <MarkdownEditor
                  key={data.yText ? `collab-edit-${id}` : `local-edit-${id}`}
                  content={data.content}
                  onChange={handleContentChange}
                  isReadOnly={false}
                  placeholder={dict.blocks.contentPlaceholder || "..."}
                  className="text-base prosemirror-full-height"
                  onEditorReady={setEditor}
                  onLinkShortcut={openLinkModal}
                />
              )
            ) : (
              <MarkdownEditor
                key={data.yText ? `collab-prev-${id}` : `local-prev-${id}`}
                content={data.content}
                onChange={handleContentChange}
                isReadOnly={true}
                placeholder=""
                className="text-base prosemirror-full-height"
                onEditorReady={setEditor}
                onLinkShortcut={openLinkModal}
              />
            )}
          </div>

          <BlockFooter
            updatedAt={data.updatedAt}
            authorName={data.authorName}
            isLocked={data.isLocked}
            dict={dict}
            lang={lang}
          >
            {!isReadOnly && (
              <div className="zen-switch">
                <button
                  onClick={() => setIsEditing(true)}
                  className={`zen-switch-btn ${isEditing ? "active" : ""}`}
                >
                  {dict.common.edit}
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className={`zen-switch-btn ${!isEditing ? "active" : ""}`}
                >
                  {dict.common.preview}
                </button>
              </div>
            )}
          </BlockFooter>
        </div>

        <BlockReactions
          reactions={data.reactions}
          onReact={handleReact}
          onRemoveReaction={handleRemoveReaction}
          currentUserId={currentUser?.id}
          isReadOnly={isReadOnly}
          canReact={canReact}
        />

        {/* Handles for connections - Left Side */}
        <Handle
          id="left"
          type="source"
          position={Position.Left}
          isConnectable={true}
          className="block-handle block-handle-left z-50!"
        >
          {!isLeftSourceConnected && <div className="handle-dot" />}
        </Handle>

        {/* Handles for connections - Right Side */}
        <Handle
          id="right"
          type="source"
          position={Position.Right}
          isConnectable={true}
          className="block-handle block-handle-right z-50!"
        >
          {!isRightSourceConnected && <div className="handle-dot" />}
        </Handle>

        {/* Handles for connections - Top Side */}
        <Handle
          id="top"
          type="source"
          position={Position.Top}
          isConnectable={true}
          className="block-handle block-handle-top z-50!"
        >
          {!isTopSourceConnected && <div className="handle-dot" />}
        </Handle>

        {/* Handles for connections - Bottom Side */}
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

      {showBubbleMenu &&
        editor &&
        blockRect &&
        createPortal(
          <BubbleMenuComponent
            ref={menuRef}
            editor={editor}
            isEditingLink={isEditingLink}
            linkUrl={linkUrl}
            setLinkUrl={setLinkUrl}
            openLinkModal={openLinkModal}
            applyLink={applyLink}
            removeLink={removeLink}
            cancelLink={cancelLink}
            blockRect={blockRect}
            zoom={viewport.zoom}
            editorStateVersion={editorStateVersion}
          />,
          document.body,
        )}
    </>
  );
});

NoteBlock.displayName = "NoteBlock";

export default NoteBlock;
