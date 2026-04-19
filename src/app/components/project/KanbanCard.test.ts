import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import KanbanCard from "./KanbanCard";
import type { Column, Task } from "./kanbanModel";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require("jsdom") as {
  JSDOM: new (html: string) => {
    window: Window & typeof globalThis;
  };
};

const dom = new JSDOM("<!doctype html><html><body></body></html>");

Object.defineProperty(globalThis, "window", {
  value: dom.window,
  configurable: true,
});
Object.defineProperty(globalThis, "document", {
  value: dom.window.document,
  configurable: true,
});
Object.defineProperty(globalThis, "Node", {
  value: dom.window.Node,
  configurable: true,
});
Object.defineProperty(globalThis, "HTMLElement", {
  value: dom.window.HTMLElement,
  configurable: true,
});
Object.defineProperty(globalThis, "HTMLAnchorElement", {
  value: dom.window.HTMLAnchorElement,
  configurable: true,
});
Object.defineProperty(globalThis, "HTMLInputElement", {
  value: dom.window.HTMLInputElement,
  configurable: true,
});

function buildTask(text: string, height?: number): Task {
  return {
    id: "task-1",
    text,
    checked: false,
    height,
  };
}

function renderCard(task: Task) {
  const column: Column = {
    id: "column-1",
    title: "To do",
    tasks: [task],
  };

  return render(
    React.createElement(KanbanCard, {
      task,
      taskIndex: 0,
      column,
      columns: [column],
      save: vi.fn(),
      fields: [],
      collaborators: [],
      isReadOnly: true,
      tr: (_path: string, fallback: string) => fallback,
      handleTaskDragStart: vi.fn(),
      handleTaskDragOver: vi.fn(),
      handleTaskDragEnter: vi.fn(),
      handleTaskDragLeave: vi.fn(),
      handleTaskDropOnTask: vi.fn(),
      handleDragEnd: vi.fn(),
      currentBlockId: "block-1",
    }),
  );
}

describe("KanbanCard", () => {
  it("renders markdown content on the board instead of a plain-text snippet", () => {
    const task = buildTask(
      [
        "Accessibility improvements",
        "## Text sizing",
        "A [documentation link](https://example.com/docs) and `inline code` stay visible.",
        "- [x] Existing setting",
        "- [ ] New card preview",
      ].join("\n"),
      180,
    );

    const { container, getByText, getByRole, getAllByRole } = renderCard(task);

    expect(getByText("Text sizing")).toBeTruthy();
    expect(getByRole("link", { name: "documentation link" })).toBeTruthy();
    expect(getByText("inline code").tagName).toBe("CODE");
    expect(getAllByRole("checkbox")).toHaveLength(2);
    expect(
      container.querySelector('[data-task-id="task-1"]')?.getAttribute("style"),
    ).toContain("height: 180px");
  });

  it("keeps long descriptions intact instead of slicing them near one hundred characters", () => {
    const trailingSentence =
      "The final sentence should still be visible on the board preview.";
    const task = buildTask(
      [
        "Board preview",
        "This description intentionally goes well beyond one hundred characters so the old snippet logic would have truncated it before reaching the ending.",
        trailingSentence,
      ].join("\n"),
      220,
    );

    const { queryAllByText, queryByText } = renderCard(task);

    expect(
      queryAllByText(
        (_content, node) =>
          node?.textContent?.includes(trailingSentence) ?? false,
      ).length,
    ).toBeGreaterThan(0);
    expect(queryByText(/\.\.\.$/)).toBeNull();
  });
});
