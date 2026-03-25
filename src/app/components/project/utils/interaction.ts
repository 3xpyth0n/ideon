"use client";

export const MULTI_BLOCK_COPY_SEPARATOR = "\n\n";

const INTERACTIVE_NODE_CONTENT_SELECTOR = [
  ".ProseMirror",
  ".markdown-editor-container",
  ".bubble-menu",
  ".tiptap-bubble-menu",
  "input",
  "textarea",
  "button",
  "select",
  "a[href]",
  "[contenteditable='true']",
].join(", ");

type SelectionOrderBlock = {
  id: string;
  selected?: boolean;
};

type CopyableBlock = {
  id: string;
  data?: {
    title?: string | null;
    content?: string | null;
  } | null;
};

type NoteShortcutBlock = {
  id: string;
  selected?: boolean;
  type?: string | null;
  data?: {
    blockType?: string | null;
  } | null;
};

export type NoteModeShortcutKey = "e" | "p";
export type NoteModeShortcutAction =
  | "noop"
  | "passThrough"
  | "switchToEdit"
  | "switchToPreview"
  | "toggleInlineCode";
export type NoteModeShortcutHandlerResult = "handled" | "passThrough";
export type NoteModeShortcutHandler = (
  key: NoteModeShortcutKey,
) => NoteModeShortcutHandlerResult;

const NOTE_MODE_SHORTCUT_EDITING_SELECTOR = [
  ".markdown-editor-container",
  ".ProseMirror",
  ".bubble-menu",
  ".tiptap-bubble-menu",
  ".cm-editor",
  ".cm-content",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
].join(", ");

const getTargetElement = (target: EventTarget | null): Element | null => {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
};

export const isNoteContentEmpty = (content?: string | null) =>
  (content ?? "").trim().length === 0;

export const shouldStartNoteInEditMode = (
  content: string | null | undefined,
  isReadOnly: boolean,
) => !isReadOnly && isNoteContentEmpty(content);

export const shouldIgnoreNodeContextMenuShortcut = (
  target: EventTarget | null,
) => {
  const element = getTargetElement(target);
  return element?.closest(INTERACTIVE_NODE_CONTENT_SELECTOR) !== null;
};

export const shouldIgnoreNoteModeShortcut = (target: EventTarget | null) => {
  const element = getTargetElement(target);
  return element?.closest(NOTE_MODE_SHORTCUT_EDITING_SELECTOR) !== null;
};

export const getSelectedNoteBlockIdForShortcut = ({
  blocks,
  activeElement,
}: {
  blocks: readonly NoteShortcutBlock[];
  activeElement: EventTarget | null;
}) => {
  if (shouldIgnoreNoteModeShortcut(activeElement)) return null;

  const selectedBlocks = blocks.filter((block) => block.selected);
  if (selectedBlocks.length !== 1) return null;

  const [selectedBlock] = selectedBlocks;
  const isNoteBlock =
    selectedBlock.type === "text" || selectedBlock.data?.blockType === "text";

  return isNoteBlock ? selectedBlock.id : null;
};

export const resolveNoteModeShortcutAction = ({
  key,
  isEditing,
  isReadOnly,
  vimMode,
  hasRichTextEditor,
}: {
  key: NoteModeShortcutKey;
  isEditing: boolean;
  isReadOnly: boolean;
  vimMode: boolean;
  hasRichTextEditor: boolean;
}): NoteModeShortcutAction => {
  if (isReadOnly) return "passThrough";

  if (key === "p") {
    return isEditing ? "switchToPreview" : "passThrough";
  }

  if (!isEditing) {
    return "switchToEdit";
  }

  if (vimMode || !hasRichTextEditor) {
    return "noop";
  }

  return "toggleInlineCode";
};

export const updateSelectedBlockOrder = (
  previousOrder: readonly string[],
  blocks: readonly SelectionOrderBlock[],
) => {
  const blockIds = new Set(blocks.map((block) => block.id));
  const selectedIds = new Set(
    blocks.filter((block) => block.selected).map((block) => block.id),
  );
  const nextOrder = previousOrder.filter(
    (id) => blockIds.has(id) && selectedIds.has(id),
  );
  const orderedIds = new Set(nextOrder);

  blocks.forEach((block) => {
    if (!block.selected || orderedIds.has(block.id)) return;
    nextOrder.push(block.id);
    orderedIds.add(block.id);
  });

  return nextOrder;
};

export const buildMultiBlockCopyText = (
  blocks: readonly CopyableBlock[],
  selectionOrder: readonly string[],
  separator: string = MULTI_BLOCK_COPY_SEPARATOR,
) => {
  const blocksById = new Map(blocks.map((block) => [block.id, block]));

  return selectionOrder
    .map((id) => {
      const block = blocksById.get(id);
      const title = block?.data?.title?.trim() ?? "";
      const content = block?.data?.content?.trim() ?? "";

      if (title && content) {
        return `# ${title}\n\n${content}`;
      }

      if (title) {
        return `# ${title}`;
      }

      return content;
    })
    .filter((entry): entry is string => entry.trim() !== "")
    .join(separator);
};

export const shouldOverrideMultiBlockCopy = ({
  selectedBlockCount,
  activeElement,
  hasTextSelection,
}: {
  selectedBlockCount: number;
  activeElement: Element | null;
  hasTextSelection: boolean;
}) => {
  if (selectedBlockCount < 2 || hasTextSelection) return false;

  if (!(activeElement instanceof HTMLElement)) {
    return true;
  }

  if (
    ["INPUT", "TEXTAREA", "SELECT"].includes(activeElement.tagName) ||
    activeElement.isContentEditable
  ) {
    return false;
  }

  return activeElement.closest(INTERACTIVE_NODE_CONTENT_SELECTOR) === null;
};
