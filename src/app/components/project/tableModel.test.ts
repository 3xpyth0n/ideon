import { describe, it, expect } from "vitest";
import {
  parseTableMetadata,
  getFilteredSortedRows,
  exportTableToCsv,
  exportTableToMarkdown,
  generateRowId,
  coerceRowsForColumnType,
  defaultCellForType,
  validateCellValue,
  TableValidationError,
  isSafeUrl,
  type TableColumn,
  type TableRow,
  type CellType,
} from "./tableModel";

const BASE_COLUMNS: TableColumn[] = [
  { id: "c1", name: "Tool", type: "text", width: 200 },
  {
    id: "c2",
    name: "License",
    type: "enum",
    options: [
      { id: "o1", label: "MIT" },
      { id: "o2", label: "Apache-2.0" },
    ],
  },
  { id: "c3", name: "Stars", type: "number" },
  { id: "c4", name: "Repo", type: "url" },
  { id: "c5", name: "Related", type: "relation" },
];

describe("parseTableMetadata", () => {
  it("parses valid metadata with all cell types", () => {
    const raw = {
      columns: BASE_COLUMNS,
      rows: [
        {
          id: "r1",
          cells: {
            c1: "Vitest",
            c2: "o1",
            c3: 25000,
            c4: "https://github.com/vitest-dev/vitest",
            c5: { blockId: "block-uuid-1" },
          },
        },
      ],
      sortColumnId: "c3",
      sortDirection: "desc",
      filterColumnId: "c2",
      filterValue: "o1",
    };

    const result = parseTableMetadata(raw);

    expect(result.columns).toHaveLength(5);
    expect(result.columns[0].name).toBe("Tool");
    expect(result.columns[1].type).toBe("enum");
    expect(result.columns[1].options).toHaveLength(2);
    expect(result.columns[4].type).toBe("relation");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].cells.c1).toBe("Vitest");
    expect(result.rows[0].cells.c2).toBe("o1");
    expect(result.rows[0].cells.c3).toBe(25000);
    expect(result.rows[0].cells.c4).toBe(
      "https://github.com/vitest-dev/vitest",
    );
    expect(result.rows[0].cells.c5).toEqual({ blockId: "block-uuid-1" });

    expect(result.sortColumnId).toBe("c3");
    expect(result.sortDirection).toBe("desc");
    expect(result.filterColumnId).toBe("c2");
    expect(result.filterValue).toBe("o1");
  });

  it("returns empty structure for null/undefined/non-object", () => {
    expect(parseTableMetadata(null)).toEqual({ columns: [], rows: [] });
    expect(parseTableMetadata(undefined)).toEqual({ columns: [], rows: [] });
    expect(parseTableMetadata("string")).toEqual({ columns: [], rows: [] });
    expect(parseTableMetadata(42)).toEqual({ columns: [], rows: [] });
    expect(parseTableMetadata([1, 2, 3])).toEqual({ columns: [], rows: [] });
  });

  it("generates IDs for columns without ids", () => {
    const raw = {
      columns: [{ name: "Col A", type: "text" }, { name: "Col B" }],
      rows: [],
    };
    const result = parseTableMetadata(raw);
    expect(result.columns).toHaveLength(2);
    expect(result.columns[0].id).toBeTruthy();
    expect(result.columns[1].id).toBeTruthy();
    // Missing type defaults to "text"
    expect(result.columns[1].type).toBe("text");
  });

  it("defaults unknown cell types to text", () => {
    const raw = {
      columns: [{ id: "c1", name: "Col", type: "unknown" as CellType }],
      rows: [],
    };
    const result = parseTableMetadata(raw);
    expect(result.columns[0].type).toBe("text");
  });

  it("ignores relation cells without blockId", () => {
    const raw = {
      columns: [{ id: "c1", name: "Rel", type: "relation" }],
      rows: [
        {
          id: "r1",
          cells: {
            c1: { notBlockId: "foo" },
          },
        },
      ],
    };
    const result = parseTableMetadata(raw);
    expect(result.rows[0].cells.c1).toBeNull();
  });

  it("generates IDs for rows without ids", () => {
    const raw = {
      columns: [{ id: "c1", name: "Col", type: "text" }],
      rows: [{ cells: { c1: "val" } }],
    };
    const result = parseTableMetadata(raw);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBeTruthy();
  });

  it("handles malformed rows gracefully", () => {
    const raw = {
      columns: [{ id: "c1", name: "Col", type: "text" }],
      rows: [
        "not-an-object",
        null,
        { cells: { c1: "ok" } },
        { cells: "not-an-object" },
        [],
      ],
    };
    const result = parseTableMetadata(raw);
    // Well-formed row survives; { cells: "not-an-object" } passes object check but yields empty cells
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].cells.c1).toBe("ok");
    expect(result.rows[1].cells).toEqual({});
  });

  it("handles malformed cells gracefully", () => {
    const raw = {
      columns: [{ id: "c1", name: "Col", type: "text" }],
      rows: [
        {
          id: "r1",
          cells: {
            c1: "ok",
            c2: [],
            c3: { notBlockId: "foo" },
          },
        },
      ],
    };
    const result = parseTableMetadata(raw);
    expect(result.rows[0].cells.c1).toBe("ok");
    // Arrays are not valid relation objects
    expect(result.rows[0].cells.c2).toBeNull();
    // Objects without blockId are nulled
    expect(result.rows[0].cells.c3).toBeNull();
  });

  it("ignores non-array columns/rows", () => {
    const raw = {
      columns: "not-an-array",
      rows: 42,
    };
    const result = parseTableMetadata(raw);
    expect(result.columns).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("ignores invalid sort/filter values", () => {
    const raw = {
      columns: [{ id: "c1", name: "Col", type: "text" }],
      rows: [],
      sortColumnId: 123,
      sortDirection: "invalid",
      filterColumnId: null,
      filterValue: 456,
    };
    const result = parseTableMetadata(raw);
    expect(result.sortColumnId).toBeUndefined();
    expect(result.sortDirection).toBeUndefined();
    expect(result.filterColumnId).toBeUndefined();
    expect(result.filterValue).toBeUndefined();
  });

  it("parses enum options array", () => {
    const raw = {
      columns: [
        {
          id: "c1",
          name: "Status",
          type: "enum",
          options: [
            { id: "o1", label: "Active" },
            { id: "o2", label: "Inactive" },
          ],
        },
      ],
      rows: [],
    };
    const result = parseTableMetadata(raw);
    expect(result.columns[0].options).toHaveLength(2);
    expect(result.columns[0].options?.[0]).toEqual({
      id: "o1",
      label: "Active",
    });
  });
});

describe("getFilteredSortedRows", () => {
  const columns = BASE_COLUMNS;
  const rows: TableRow[] = [
    {
      id: "r1",
      cells: { c1: "Vitest", c2: "o1", c3: 100, c4: "https://a", c5: null },
    },
    {
      id: "r2",
      cells: { c1: "Jest", c2: "o2", c3: 50, c4: "https://b", c5: null },
    },
    {
      id: "r3",
      cells: { c1: "Mocha", c2: "o1", c3: 25000, c4: "https://c", c5: null },
    },
  ];

  it("sorts numbers descending", () => {
    const result = getFilteredSortedRows({
      columns,
      rows,
      sortColumnId: "c3",
      sortDirection: "desc",
    });
    expect(result.map((r) => r.id)).toEqual(["r3", "r1", "r2"]);
  });

  it("sorts numbers ascending", () => {
    const result = getFilteredSortedRows({
      columns,
      rows,
      sortColumnId: "c3",
      sortDirection: "asc",
    });
    expect(result.map((r) => r.id)).toEqual(["r2", "r1", "r3"]);
  });

  it("sorts text alphabetically", () => {
    const result = getFilteredSortedRows({
      columns,
      rows,
      sortColumnId: "c1",
      sortDirection: "asc",
    });
    expect(result.map((r) => r.id)).toEqual(["r2", "r3", "r1"]);
  });

  it("filters by column value", () => {
    const result = getFilteredSortedRows({
      columns,
      rows,
      filterColumnId: "c2",
      filterValue: "o1",
    });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(["r1", "r3"]);
  });

  it("returns all rows when no filter/sort", () => {
    const result = getFilteredSortedRows({
      columns,
      rows,
    });
    expect(result).toHaveLength(3);
  });
});

describe("exportTableToCsv", () => {
  it("exports header + rows as CSV", () => {
    const columns: TableColumn[] = BASE_COLUMNS;
    const rows: TableRow[] = [
      {
        id: "r1",
        cells: {
          c1: "Hello, World",
          c2: "o1",
          c3: 42,
          c4: "https://example.com",
          c5: { blockId: "block-123" },
        },
      },
    ];

    const csv = exportTableToCsv(columns, rows);
    const lines = csv.split("\n");

    expect(lines[0]).toBe("Tool,License,Stars,Repo,Related");
    // Commas in values trigger quoting
    expect(lines[1]).toBe(
      '"Hello, World",MIT,42,https://example.com,block-123',
    );
  });

  it("handles empty table", () => {
    const csv = exportTableToCsv([], []);
    expect(csv).toBe("");
  });
});

describe("exportTableToMarkdown", () => {
  it("exports as GitHub-flavored Markdown table", () => {
    const rows: TableRow[] = [
      {
        id: "r1",
        cells: {
          c1: "Vitest",
          c2: "o1",
          c3: 25000,
          c4: "https://example.com",
          c5: { blockId: "block-123" },
        },
      },
    ];

    const md = exportTableToMarkdown(BASE_COLUMNS, rows);
    const lines = md.split("\n");

    expect(lines[0]).toBe("Tool | License | Stars | Repo | Related");
    expect(lines[1]).toBe("--- | --- | --- | --- | ---");
    expect(lines[2]).toBe(
      "Vitest | MIT | 25000 | https://example.com | block-123",
    );
  });

  it("escapes pipe characters in values", () => {
    const columns: TableColumn[] = [{ id: "c1", name: "Name", type: "text" }];
    const rows: TableRow[] = [{ id: "r1", cells: { c1: "A|B" } }];

    const md = exportTableToMarkdown(columns, rows);
    expect(md).toBe("Name\n---\nA\\|B");
  });
});

describe("generateRowId", () => {
  it("generates a unique ID", () => {
    const id1 = generateRowId();
    const id2 = generateRowId();
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });
});

describe("defaultCellForType", () => {
  it("returns 0 for number columns", () => {
    expect(defaultCellForType("number")).toBe(0);
  });

  it("returns null for relation columns", () => {
    expect(defaultCellForType("relation")).toBeNull();
  });

  it("returns an empty string for other types", () => {
    expect(defaultCellForType("text")).toBe("");
    expect(defaultCellForType("enum")).toBe("");
    expect(defaultCellForType("url")).toBe("");
  });
});

describe("validateCellValue", () => {
  const textColumn: TableColumn = { id: "c1", name: "Name", type: "text" };
  const numberColumn: TableColumn = { id: "c2", name: "Count", type: "number" };
  const enumColumn: TableColumn = {
    id: "c3",
    name: "Status",
    type: "enum",
    options: [{ id: "o1", label: "Active" }],
  };
  const relationColumn: TableColumn = {
    id: "c4",
    name: "Ref",
    type: "relation",
  };

  it("returns the value for matching column types", () => {
    expect(validateCellValue(textColumn, "hello")).toBe("hello");
    expect(validateCellValue(numberColumn, 42)).toBe(42);
    expect(validateCellValue(enumColumn, "o1")).toBe("o1");
    expect(validateCellValue(relationColumn, { blockId: "b1" })).toEqual({
      blockId: "b1",
    });
  });

  it("throws TableValidationError on type mismatch", () => {
    expect(() => validateCellValue(numberColumn, "5")).toThrow(
      TableValidationError,
    );
    expect(() => validateCellValue(textColumn, 5)).toThrow(
      TableValidationError,
    );
    expect(() => validateCellValue(enumColumn, 5)).toThrow(
      TableValidationError,
    );
    expect(() => validateCellValue(relationColumn, "b1")).toThrow(
      TableValidationError,
    );
  });

  it("rejects non-finite numbers", () => {
    expect(() => validateCellValue(numberColumn, NaN)).toThrow(
      TableValidationError,
    );
    expect(() => validateCellValue(numberColumn, Infinity)).toThrow(
      TableValidationError,
    );
  });

  it("rejects enum values that match no option", () => {
    expect(() => validateCellValue(enumColumn, "zzz")).toThrow(
      TableValidationError,
    );
  });

  it("accepts any string when an enum column has no options", () => {
    const noOptions: TableColumn = { id: "c3", name: "Status", type: "enum" };
    expect(validateCellValue(noOptions, "anything")).toBe("anything");
  });

  it("rejects empty and whitespace-only relation ids", () => {
    expect(() => validateCellValue(relationColumn, { blockId: "" })).toThrow(
      TableValidationError,
    );
    expect(() => validateCellValue(relationColumn, { blockId: "  " })).toThrow(
      TableValidationError,
    );
  });

  it("verifies relation targets when a block id set is provided", () => {
    expect(() =>
      validateCellValue(
        relationColumn,
        { blockId: "missing" },
        new Set(["b1"]),
      ),
    ).toThrow(TableValidationError);
    expect(
      validateCellValue(relationColumn, { blockId: "b1" }, new Set(["b1"])),
    ).toEqual({ blockId: "b1" });
  });

  it("accepts null to clear a cell of any type", () => {
    expect(validateCellValue(numberColumn, null)).toBeNull();
    expect(validateCellValue(relationColumn, null)).toBeNull();
    expect(validateCellValue(textColumn, null)).toBeNull();
  });
});

describe("coerceRowsForColumnType", () => {
  it("resolves enum ids to labels when leaving an enum column", () => {
    const column: TableColumn = { id: "c1", name: "Status", type: "text" };
    const rows: TableRow[] = [{ id: "r1", cells: { c1: "o1" } }];

    const result = coerceRowsForColumnType(
      column,
      [{ id: "o1", label: "Active" }],
      "enum",
      rows,
    );

    expect(result[0].cells.c1).toBe("Active");
  });

  it("falls back to the type default for values that do not fit", () => {
    const column: TableColumn = { id: "c1", name: "Count", type: "number" };
    const rows: TableRow[] = [{ id: "r1", cells: { c1: "not a number" } }];

    const result = coerceRowsForColumnType(column, undefined, "text", rows);

    expect(result[0].cells.c1).toBe(0);
  });

  it("replaces invalid relation values with null", () => {
    const column: TableColumn = { id: "c1", name: "Ref", type: "relation" };
    const rows: TableRow[] = [{ id: "r1", cells: { c1: "plain string" } }];

    const result = coerceRowsForColumnType(column, undefined, "text", rows);

    expect(result[0].cells.c1).toBeNull();
  });

  it("keeps values that remain valid for the new type", () => {
    const column: TableColumn = { id: "c1", name: "Name", type: "text" };
    const rows: TableRow[] = [{ id: "r1", cells: { c1: "keep me" } }];

    const result = coerceRowsForColumnType(column, undefined, "text", rows);

    expect(result[0].cells.c1).toBe("keep me");
  });

  it("keeps enum values that match an option of the new enum column", () => {
    const column: TableColumn = {
      id: "c1",
      name: "Status",
      type: "enum",
      options: [{ id: "o1", label: "Active" }],
    };
    const rows: TableRow[] = [{ id: "r1", cells: { c1: "o1" } }];

    const result = coerceRowsForColumnType(column, undefined, "text", rows);

    expect(result[0].cells.c1).toBe("o1");
  });
});

describe("parseTableMetadata resilience", () => {
  it("preserves boolean cell values", () => {
    const result = parseTableMetadata({
      columns: [{ id: "c1", name: "Done", type: "text" }],
      rows: [{ id: "r1", cells: { c1: true } }],
    });
    expect(result.rows[0].cells.c1).toBe(true);
  });

  it("nulls relation cells with empty or whitespace blockId", () => {
    const result = parseTableMetadata({
      columns: [{ id: "c1", name: "Ref", type: "relation" }],
      rows: [
        { id: "r1", cells: { c1: { blockId: "" } } },
        { id: "r2", cells: { c1: { blockId: "   " } } },
      ],
    });
    expect(result.rows[0].cells.c1).toBeNull();
    expect(result.rows[1].cells.c1).toBeNull();
  });

  it("treats empty sortColumnId and filterColumnId as absent", () => {
    const result = parseTableMetadata({
      columns: [],
      rows: [],
      sortColumnId: "",
      filterColumnId: "",
    });
    expect(result.sortColumnId).toBeUndefined();
    expect(result.filterColumnId).toBeUndefined();
  });

  it("skips malformed enum options without throwing", () => {
    const result = parseTableMetadata({
      columns: [
        {
          id: "c1",
          name: "Status",
          type: "enum",
          options: [null, "x", { id: "o1", label: "Active" }],
        },
      ],
      rows: [],
    });
    expect(result.columns[0].options).toEqual([{ id: "o1", label: "Active" }]);
  });

  it("drops options on non-enum columns", () => {
    const result = parseTableMetadata({
      columns: [
        {
          id: "c1",
          name: "Name",
          type: "text",
          options: [{ id: "o1", label: "L" }],
        },
      ],
      rows: [],
    });
    expect(result.columns[0].options).toBeUndefined();
  });

  it("deduplicates column ids", () => {
    const result = parseTableMetadata({
      columns: [
        { id: "c1", name: "A", type: "text" },
        { id: "c1", name: "B", type: "text" },
        { id: "c2", name: "C", type: "text" },
      ],
      rows: [],
    });
    expect(result.columns).toHaveLength(3);
    expect(new Set(result.columns.map((c) => c.id)).size).toBe(3);
    expect(result.columns[0].name).toBe("A");
    expect(result.columns[1].name).toBe("B");
  });

  it("deduplicates row ids", () => {
    const result = parseTableMetadata({
      columns: [],
      rows: [
        { id: "r1", cells: { c1: "first" } },
        { id: "r1", cells: { c1: "second" } },
      ],
    });
    expect(result.rows).toHaveLength(2);
    expect(new Set(result.rows.map((r) => r.id)).size).toBe(2);
    expect(result.rows[0].cells.c1).toBe("first");
    expect(result.rows[1].cells.c1).toBe("second");
  });

  it("guards csv against formula injection", () => {
    const columns: TableColumn[] = [{ id: "c1", name: "Name", type: "text" }];
    const rows: TableRow[] = [{ id: "r1", cells: { c1: "=SUM(1)" } }];
    expect(exportTableToCsv(columns, rows)).toBe("Name\n'=SUM(1)");
  });

  it("leaves numeric cells untouched in csv", () => {
    const columns: TableColumn[] = [
      { id: "c1", name: "Count", type: "number" },
    ];
    const rows: TableRow[] = [{ id: "r1", cells: { c1: -5 } }];
    expect(exportTableToCsv(columns, rows)).toBe("Count\n-5");
  });

  it("escapes pipes in markdown column headers", () => {
    const columns: TableColumn[] = [{ id: "c1", name: "a|b", type: "text" }];
    const md = exportTableToMarkdown(columns, []);
    expect(md.split("\n")[0]).toBe("a\\|b");
  });
});

describe("isSafeUrl", () => {
  it("allows http, https, and mailto", () => {
    expect(isSafeUrl("http://example.com")).toBe(true);
    expect(isSafeUrl("https://example.com")).toBe(true);
    expect(isSafeUrl("HTTPS://EXAMPLE.COM")).toBe(true);
    expect(isSafeUrl("mailto:someone@example.com")).toBe(true);
    expect(isSafeUrl("  https://example.com  ")).toBe(true);
  });

  it("rejects javascript, data, and vbscript schemes", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("JaVaScRiPt:alert(1)")).toBe(false);
    expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeUrl("example.com")).toBe(false);
  });
});

describe("parseTableMetadata security and filter semantics", () => {
  it("does not pollute the cells object via __proto__", () => {
    const maliciousCells = JSON.parse(
      '{"c1":"ok","__proto__":{"blockId":"attacker"}}',
    );
    const result = parseTableMetadata({
      columns: [{ id: "c1", name: "Name", type: "text" }],
      rows: [{ id: "r1", cells: maliciousCells }],
    });
    expect(Object.getPrototypeOf(result.rows[0].cells)).toBe(Object.prototype);
    expect(result.rows[0].cells.c1).toBe("ok");
    expect(
      (result.rows[0].cells as Record<string, unknown>).blockId,
    ).toBeUndefined();
  });

  it("ignores constructor and prototype keys in cells", () => {
    const result = parseTableMetadata({
      columns: [{ id: "c1", name: "Name", type: "text" }],
      rows: [
        {
          id: "r1",
          cells: { c1: "ok", constructor: "bad", prototype: "bad" },
        },
      ],
    });
    expect(result.rows[0].cells.c1).toBe("ok");
    expect(Object.keys(result.rows[0].cells)).toEqual(["c1"]);
  });

  it("treats an empty filterValue as no filter", () => {
    const result = parseTableMetadata({
      columns: [{ id: "c1", name: "Name", type: "text" }],
      rows: [
        { id: "r1", cells: { c1: "Alpha" } },
        { id: "r2", cells: { c1: null } },
      ],
      filterColumnId: "c1",
      filterValue: "",
    });
    expect(result.filterValue).toBe("");
    const visible = getFilteredSortedRows(result);
    expect(visible).toHaveLength(2);
  });

  it("applies a non-empty filterValue", () => {
    const result = parseTableMetadata({
      columns: [{ id: "c1", name: "Name", type: "text" }],
      rows: [
        { id: "r1", cells: { c1: "Alpha" } },
        { id: "r2", cells: { c1: "Beta" } },
      ],
      filterColumnId: "c1",
      filterValue: "alp",
    });
    const visible = getFilteredSortedRows(result);
    expect(visible).toHaveLength(1);
    expect(visible[0].cells.c1).toBe("Alpha");
  });
});
