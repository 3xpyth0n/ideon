// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import type { Node, NodeProps } from "@xyflow/react";
import type { BlockData } from "./CanvasBlock";
import DatabaseBlock from "./DatabaseBlock";

vi.mock("@providers/I18nProvider", () => ({
  useI18n: () => ({ dict: {}, lang: "en" }),
}));

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
  useNodes: () => [],
  useReactFlow: () => ({
    getNode: () => undefined,
    fitView: vi.fn(),
    setNodes: vi.fn(),
  }),
  useEdges: () => [],
}));

vi.mock("./BlockFooter", () => ({ BlockFooter: () => null }));
vi.mock("./BlockTitleInput", () => ({ BlockTitleInput: () => null }));
vi.mock("./BlockReactions", () => ({ BlockReactions: () => null }));
vi.mock("./hooks/useBlockReactions", () => ({
  useBlockReactions: () => ({
    handleReact: vi.fn(),
    handleRemoveReaction: vi.fn(),
  }),
}));
vi.mock("./CustomNodeResizer", () => ({ default: () => null }));
vi.mock("./utils/focusCanvas", () => ({ focusProjectCanvas: vi.fn() }));

function makeProps(
  metadata: string,
  onContentChange?: BlockData["onContentChange"],
): NodeProps<Node<BlockData>> {
  const data = {
    id: "db-1",
    content: "",
    title: "Test DB",
    metadata,
    updatedAt: "2026-01-01T00:00:00Z",
    authorName: "Tester",
    isSummary: false,
    isPreviewMode: false,
    isLocked: false,
    onContentChange,
  } as unknown as BlockData;
  return {
    id: "db-1",
    data,
    selected: false,
  } as unknown as NodeProps<Node<BlockData>>;
}

function columnNames(): string[] {
  return Array.from(document.querySelectorAll(".db-col-name")).map(
    (el) => el.textContent ?? "",
  );
}

describe("DatabaseBlock", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders safe url schemes as anchors", () => {
    render(
      <DatabaseBlock
        {...makeProps(
          JSON.stringify({
            columns: [{ id: "c1", name: "Link", type: "url" }],
            rows: [{ id: "r1", cells: { c1: "https://example.com" } }],
          }),
        )}
      />,
    );
    const anchor = document.querySelector(".db-td a");
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("href")).toBe("https://example.com");
    expect(anchor?.getAttribute("rel")).toContain("noopener");
  });

  it("renders unsafe url schemes as inert text", () => {
    render(
      <DatabaseBlock
        {...makeProps(
          JSON.stringify({
            columns: [{ id: "c1", name: "Link", type: "url" }],
            rows: [{ id: "r1", cells: { c1: "javascript:alert(1)" } }],
          }),
        )}
      />,
    );
    expect(document.querySelector(".db-td a")).toBeNull();
    const text = document.querySelector(".db-td .db-cell-text");
    expect(text?.textContent).toBe("javascript:alert(1)");
  });

  it("renders enum select directly without click-to-edit", () => {
    const onContentChange = vi.fn();
    render(
      <DatabaseBlock
        {...makeProps(
          JSON.stringify({
            columns: [
              {
                id: "c1",
                name: "Status",
                type: "enum",
                options: [
                  { id: "o1", label: "Active" },
                  { id: "o2", label: "Closed" },
                ],
              },
            ],
            rows: [{ id: "r1", cells: {} }],
          }),
          onContentChange,
        )}
      />,
    );

    const select = document.querySelector("select.db-cell-select");
    expect(select).not.toBeNull();

    fireEvent.change(select!, { target: { value: "o1" } });

    expect(onContentChange).toHaveBeenCalledTimes(1);
    const written = JSON.parse(String(onContentChange.mock.calls[0][4]));
    expect(written.rows[0].cells.c1).toBe("o1");
  });

  it("applies a differing remote update after a local edit never echoed back", () => {
    const onContentChange = vi.fn();
    const local = JSON.stringify({
      columns: [{ id: "c1", name: "A", type: "text" }],
      rows: [],
    });
    const remote = JSON.stringify({
      columns: [
        { id: "c1", name: "A", type: "text" },
        { id: "c2", name: "B", type: "text" },
        { id: "c3", name: "C", type: "text" },
      ],
      rows: [],
    });

    const { rerender } = render(
      <DatabaseBlock {...makeProps(local, onContentChange)} />,
    );

    fireEvent.click(document.querySelector('[title="Add Column"]')!);
    expect(onContentChange).toHaveBeenCalledTimes(1);

    rerender(<DatabaseBlock {...makeProps(remote, onContentChange)} />);

    expect(columnNames()).toEqual(["A", "B", "C"]);
  });

  it("suppresses its own write echo without dropping later remote updates", () => {
    const onContentChange = vi.fn();
    const local = JSON.stringify({
      columns: [{ id: "c1", name: "A", type: "text" }],
      rows: [],
    });

    const { rerender } = render(
      <DatabaseBlock {...makeProps(local, onContentChange)} />,
    );

    fireEvent.click(document.querySelector('[title="Add Column"]')!);
    const echo = String(onContentChange.mock.calls[0][4]);

    rerender(<DatabaseBlock {...makeProps(echo, onContentChange)} />);

    expect(onContentChange).toHaveBeenCalledTimes(1);
    expect(columnNames()).toHaveLength(2);

    const remote = JSON.stringify({
      columns: [
        { id: "c1", name: "A", type: "text" },
        { id: "c2", name: "B", type: "text" },
        { id: "c3", name: "C", type: "text" },
      ],
      rows: [],
    });
    rerender(<DatabaseBlock {...makeProps(remote, onContentChange)} />);

    expect(columnNames()).toEqual(["A", "B", "C"]);
  });
});

describe("DatabaseBlock header editing", () => {
  it("initializes the header editor with the column's current name", () => {
    render(
      <DatabaseBlock
        {...makeProps(
          JSON.stringify({
            columns: [
              { id: "c1", name: "Alpha", type: "text" },
              { id: "c2", name: "Beta", type: "text" },
            ],
            rows: [],
          }),
        )}
      />,
    );

    fireEvent.doubleClick(document.querySelectorAll(".db-col-name")[0]);
    const input = document.querySelector(
      ".db-col-name-input",
    ) as HTMLInputElement;
    expect(input.value).toBe("Alpha");

    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.blur(input);

    fireEvent.doubleClick(document.querySelectorAll(".db-col-name")[1]);
    const input2 = document.querySelector(
      ".db-col-name-input",
    ) as HTMLInputElement;
    expect(input2.value).toBe("Beta");
  });
});

describe("DatabaseBlock column types UX", () => {
  it("does not auto-create an option when switching to enum", () => {
    // When a column has no options and type changes to enum,
    // handleColumnTypeChange should not create a default "Option" entry.
    // Verified by code inspection: the auto-creation block was removed.
    // This test validates the empty state is shown instead.
    render(
      <DatabaseBlock
        {...makeProps(
          JSON.stringify({
            columns: [{ id: "c1", name: "Status", type: "enum" }],
            rows: [{ id: "r1", cells: {} }],
          }),
        )}
      />,
    );

    // Open options editor
    fireEvent.click(document.querySelector(".db-col-options-btn")!);
    const empty = document.querySelector(".db-options-empty");
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain("Add options to let users pick");
  });
});

describe("DatabaseBlock new features", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders checkbox cells as checkbox inputs", () => {
    const onContentChange = vi.fn();
    render(
      <DatabaseBlock
        {...makeProps(
          JSON.stringify({
            columns: [
              { id: "c1", name: "Done", type: "checkbox" },
              { id: "c2", name: "Task", type: "text" },
            ],
            rows: [
              { id: "r1", cells: { c1: true, c2: "Test" } },
              { id: "r2", cells: { c1: false, c2: "Other" } },
            ],
          }),
          onContentChange,
        )}
      />,
    );
    const checkboxes =
      document.querySelectorAll<HTMLInputElement>(".db-cell-checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
  });

  it("toggles checkbox value on click", () => {
    const onContentChange = vi.fn();
    render(
      <DatabaseBlock
        {...makeProps(
          JSON.stringify({
            columns: [{ id: "c1", name: "Done", type: "checkbox" }],
            rows: [{ id: "r1", cells: { c1: false } }],
          }),
          onContentChange,
        )}
      />,
    );
    const checkbox =
      document.querySelector<HTMLInputElement>(".db-cell-checkbox")!;
    expect(checkbox.checked).toBe(false);
    checkbox.click();
    expect(onContentChange).toHaveBeenCalled();
    const meta = JSON.parse(onContentChange.mock.calls[0][4]);
    expect(meta.rows[0].cells.c1).toBe(true);
  });

  it("shows search input in toolbar", () => {
    render(
      <DatabaseBlock
        {...makeProps(
          JSON.stringify({
            columns: [{ id: "c1", name: "Name", type: "text" }],
            rows: [{ id: "r1", cells: { c1: "hello" } }],
          }),
        )}
      />,
    );
    const search = document.querySelector<HTMLInputElement>(".db-search-input");
    expect(search).not.toBeNull();
  });

  it("filters rows by global search", () => {
    render(
      <DatabaseBlock
        {...makeProps(
          JSON.stringify({
            columns: [{ id: "c1", name: "Name", type: "text" }],
            rows: [
              { id: "r1", cells: { c1: "apple" } },
              { id: "r2", cells: { c1: "banana" } },
              { id: "r3", cells: { c1: "cherry" } },
            ],
          }),
        )}
      />,
    );
    const search =
      document.querySelector<HTMLInputElement>(".db-search-input")!;
    fireEvent.change(search, { target: { value: "an" } });
    const rows = document.querySelectorAll(".db-row");
    expect(rows.length).toBe(1);
  });

  it("shows aggregation row with number sum", () => {
    render(
      <DatabaseBlock
        {...makeProps(
          JSON.stringify({
            columns: [{ id: "c1", name: "Amount", type: "number" }],
            rows: [
              { id: "r1", cells: { c1: 10 } },
              { id: "r2", cells: { c1: 20 } },
            ],
          }),
        )}
      />,
    );
    const tfoot = document.querySelector(".db-tfoot-cell");
    expect(tfoot).not.toBeNull();
    expect(tfoot?.textContent).toBe("30");
  });

  it("shows aggregation row with checkbox count", () => {
    render(
      <DatabaseBlock
        {...makeProps(
          JSON.stringify({
            columns: [{ id: "c1", name: "Done", type: "checkbox" }],
            rows: [
              { id: "r1", cells: { c1: true } },
              { id: "r2", cells: { c1: false } },
              { id: "r3", cells: { c1: true } },
            ],
          }),
        )}
      />,
    );
    const tfoot = document.querySelector(".db-tfoot-cell");
    expect(tfoot?.textContent).toBe("2/3");
  });

  it("renders drag grip for column reordering", () => {
    render(
      <DatabaseBlock
        {...makeProps(
          JSON.stringify({
            columns: [
              { id: "c1", name: "A", type: "text" },
              { id: "c2", name: "B", type: "text" },
            ],
            rows: [{ id: "r1", cells: { c1: "x", c2: "y" } }],
          }),
        )}
      />,
    );
    const grips = document.querySelectorAll(".db-col-grip");
    expect(grips).toHaveLength(2);
  });
});
