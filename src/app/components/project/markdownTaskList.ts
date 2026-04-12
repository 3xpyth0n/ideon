import type { Editor } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";

const EMPTY_TASK_PLACEHOLDER = "\u200B";
const TASK_MARKER_WITHOUT_TEXT_PATTERN =
  /^(\s*)(?:[-*+]\s*)?(\[(?: |x|X)?\])(?:\s*)$/gm;
const TASK_MARKER_WITH_TEXT_PATTERN =
  /^(\s*)(?:[-*+]\s*)?(\[(?: |x|X)?\])(\s+.+)$/gm;

function normalizeTaskMarker(marker: string): "[ ]" | "[x]" {
  return marker.toLowerCase() === "[x]" ? "[x]" : "[ ]";
}

export function normalizeMarkdownTaskList(content: string): string {
  return content
    .replaceAll(EMPTY_TASK_PLACEHOLDER, "")
    .replace(
      TASK_MARKER_WITHOUT_TEXT_PATTERN,
      (_match, indentation: string, marker: string) => {
        return `${indentation}- ${normalizeTaskMarker(
          marker,
        )} ${EMPTY_TASK_PLACEHOLDER}`;
      },
    )
    .replace(
      TASK_MARKER_WITH_TEXT_PATTERN,
      (
        _match,
        indentation: string,
        marker: string,
        trailingContent: string,
      ) => {
        return `${indentation}- ${normalizeTaskMarker(
          marker,
        )}${trailingContent}`;
      },
    );
}

export function stripMarkdownTaskPlaceholder(content: string): string {
  return content
    .replaceAll(EMPTY_TASK_PLACEHOLDER, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{2,}(?=\s*[-*+]\s+\[(?: |x|X)?\].*(?:\n|$))/g, "\n");
}

const TASK_MARKER_LINE_PATTERN = /^(\s*)(?:([-*+])\s+)?\[(?: |x|X)?\](.*)$/gm;

export function getTaskItemCheckedStates(editor: Editor): boolean[] {
  const checkedStates: boolean[] = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name === "taskItem") {
      checkedStates.push(Boolean(node.attrs.checked));
    }

    return true;
  });

  return checkedStates;
}

export function syncMarkdownTaskStates(
  content: string,
  checkedStates: boolean[],
): string {
  let stateIndex = 0;

  return content.replace(
    TASK_MARKER_LINE_PATTERN,
    (_match, indentation: string, bullet: string | undefined, trailing: string) => {
      const checked = checkedStates[stateIndex] ?? false;
      stateIndex += 1;
      const listMarker = bullet ? `${bullet} ` : "- ";
      const taskMarker = checked ? "[x]" : "[ ]";

      return `${indentation}${listMarker}${taskMarker}${trailing}`;
    },
  );
}

function updateReadonlyTaskItemChecked(
  editor: Editor,
  taskItemPos: number,
  checked: boolean,
): boolean {
  const node = editor.state.doc.nodeAt(taskItemPos);
  if (!node || node.type.name !== "taskItem") {
    return false;
  }

  editor.view.dispatch(
    editor.view.state.tr.setNodeMarkup(taskItemPos, undefined, {
      ...node.attrs,
      checked,
    }),
  );

  return true;
}

function findReadonlyTaskItemPosition(
  editor: Editor,
  matcher: (_node: ProseMirrorNode) => boolean,
): number {
  let taskItemPos = -1;

  editor.state.doc.descendants((node, pos) => {
    if (taskItemPos >= 0) {
      return false;
    }

    if (node.type.name !== "taskItem") {
      return true;
    }

    if (matcher(node)) {
      taskItemPos = pos;
      return false;
    }

    return true;
  });

  return taskItemPos;
}

export function setReadonlyTaskItemChecked(
  editor: Editor,
  taskItemNode: ProseMirrorNode,
  checked: boolean,
): boolean {
  const byReferencePos = findReadonlyTaskItemPosition(
    editor,
    (node) => node === taskItemNode,
  );

  if (byReferencePos >= 0) {
    return updateReadonlyTaskItemChecked(editor, byReferencePos, checked);
  }

  const byEqualityPos = findReadonlyTaskItemPosition(editor, (node) =>
    node.eq(taskItemNode),
  );

  if (byEqualityPos < 0) {
    return false;
  }

  return updateReadonlyTaskItemChecked(editor, byEqualityPos, checked);
}

export function toggleReadonlyTaskItem(
  editor: Editor,
  taskItemElement: HTMLElement,
): boolean {
  if (!taskItemElement.parentElement?.matches('ul[data-type="taskList"]')) {
    return false;
  }

  const taskItems = Array.from(
    editor.view.dom.querySelectorAll<HTMLElement>(
      'ul[data-type="taskList"] > li',
    ),
  );
  const taskItemIndex = taskItems.indexOf(taskItemElement);
  if (taskItemIndex < 0) {
    return false;
  }

  let currentTaskItemIndex = 0;
  const taskItemPos = findReadonlyTaskItemPosition(editor, () => {
    if (currentTaskItemIndex === taskItemIndex) {
      return true;
    }

    currentTaskItemIndex += 1;
    return false;
  });

  if (taskItemPos < 0) {
    return false;
  }

  const node = editor.state.doc.nodeAt(taskItemPos);
  if (!node || node.type.name !== "taskItem") {
    return false;
  }

  return updateReadonlyTaskItemChecked(
    editor,
    taskItemPos,
    !node.attrs.checked,
  );
}
