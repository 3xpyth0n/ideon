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
    content?: string | null;
  } | null;
};

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
    .map((id) => blocksById.get(id)?.data?.content)
    .filter((content): content is string => !!content && content.trim() !== "")
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
