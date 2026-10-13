/**
 * Shared table data model for the database block type.
 *
 * Provides types, metadata parsing, and CSV/Markdown export helpers.
 * Importable from both client (DatabaseBlock) and server (MCP table tools)
 * — no React dependencies, no "use client" pragma.
 */

import { v4 as uuidv4 } from "uuid";

/** Cell value types supported by the database block. */
export type CellType =
  | "text"
  | "number"
  | "enum"
  | "url"
  | "relation"
  | "checkbox";

export interface TableColumnOption {
  id: string;
  label: string;
}

export interface TableColumn {
  id: string;
  name: string;
  type: CellType;
  options?: TableColumnOption[];
  width?: number;
}

export interface TableRelation {
  blockId: string;
}

export type TableCellValue = string | number | boolean | TableRelation | null;

export interface TableRow {
  id: string;
  cells: Record<string, TableCellValue>;
}

export interface ParsedTableMetadata {
  columns: TableColumn[];
  rows: TableRow[];
  sortColumnId?: string;
  sortDirection?: "asc" | "desc";
  filterColumnId?: string;
  filterValue?: string;
}

const VALID_CELL_TYPES: CellType[] = [
  "text",
  "number",
  "enum",
  "url",
  "relation",
  "checkbox",
];

/**
 * Safely parse raw metadata into a typed table structure.
 *
 * Handles corrupted or partial data gracefully:
 * - Missing columns → returns empty array
 * - Columns without id → generates one
 * - Columns with unknown type → defaults to "text"
 * - Cells with invalid structure → defaults to null
 * - Rows without id → generates one
 * - Duplicate ids → the later entry gets a fresh uuid
 * - Sort/filter fields that are malformed → omitted
 */
export function parseTableMetadata(raw: unknown): ParsedTableMetadata {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { columns: [], rows: [] };
    }

    const obj = data as Record<string, unknown>;

    // --- Columns ---
    let columns: TableColumn[] = [];
    if (Array.isArray(obj.columns)) {
      columns = [];
      const seenColumnIds = new Set<string>();
      for (const col of obj.columns) {
        if (!col || typeof col !== "object" || Array.isArray(col)) continue;
        const c = col as Record<string, unknown>;
        let id = typeof c.id === "string" && c.id ? c.id : uuidv4();
        while (seenColumnIds.has(id)) id = uuidv4();
        seenColumnIds.add(id);
        const name = typeof c.name === "string" ? c.name : "";
        const type =
          typeof c.type === "string" &&
          VALID_CELL_TYPES.includes(c.type as CellType)
            ? (c.type as CellType)
            : "text";
        const options =
          type === "enum" && Array.isArray(c.options)
            ? c.options
                .filter(
                  (o): o is TableColumnOption =>
                    o != null &&
                    typeof o === "object" &&
                    !Array.isArray(o) &&
                    typeof (o as Record<string, unknown>).id === "string" &&
                    typeof (o as Record<string, unknown>).label === "string",
                )
                .map((o) => o as TableColumnOption)
            : undefined;
        const width = typeof c.width === "number" ? c.width : undefined;
        columns.push({ id, name, type, options, width });
      }
    }

    // --- Rows ---
    let rows: TableRow[] = [];
    if (Array.isArray(obj.rows)) {
      rows = [];
      const seenRowIds = new Set<string>();
      for (const row of obj.rows) {
        if (!row || typeof row !== "object" || Array.isArray(row)) continue;
        const r = row as Record<string, unknown>;
        let id = typeof r.id === "string" && r.id ? r.id : uuidv4();
        while (seenRowIds.has(id)) id = uuidv4();
        seenRowIds.add(id);
        const cells = parseCells(r.cells);
        rows.push({ id, cells });
      }
    }

    // --- Sort / Filter ---
    const sortColumnId =
      typeof obj.sortColumnId === "string" && obj.sortColumnId
        ? obj.sortColumnId
        : undefined;
    const sortDirection =
      obj.sortDirection === "asc" || obj.sortDirection === "desc"
        ? obj.sortDirection
        : undefined;
    const filterColumnId =
      typeof obj.filterColumnId === "string" && obj.filterColumnId
        ? obj.filterColumnId
        : undefined;
    const filterValue =
      typeof obj.filterValue === "string" ? obj.filterValue : undefined;

    return {
      columns,
      rows,
      sortColumnId,
      sortDirection,
      filterColumnId,
      filterValue,
    };
  } catch {
    return { columns: [], rows: [] };
  }
}

const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function parseCells(raw: unknown): Record<string, TableCellValue> {
  const cells: Record<string, TableCellValue> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return cells;
  }
  const obj = raw as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) continue;
    cells[key] = parseCellValue(value);
  }
  return cells;
}

function parseCellValue(value: unknown): TableCellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.blockId === "string" && obj.blockId.trim() !== "") {
      return { blockId: obj.blockId };
    }
  }
  return null;
}

/**
 * Apply filter + sort to rows and return the visible, ordered result.
 */
export function getFilteredSortedRows(
  metadata: ParsedTableMetadata,
): TableRow[] {
  let result = [...metadata.rows];

  // Filter
  if (metadata.filterColumnId && metadata.filterValue) {
    const col = metadata.columns.find((c) => c.id === metadata.filterColumnId);
    if (col) {
      const filterVal = String(metadata.filterValue).toLowerCase();
      result = result.filter((row) => {
        const cellVal = row.cells[col.id];
        if (cellVal == null) return false;
        if (col.type === "enum") {
          const opt = col.options?.find((o) => o.id === cellVal);
          if (!opt) return false;
          return (
            opt.label.toLowerCase().includes(filterVal) ||
            opt.id.toLowerCase().includes(filterVal)
          );
        }
        if (col.type === "relation") {
          if (
            typeof cellVal !== "object" ||
            Array.isArray(cellVal) ||
            !("blockId" in cellVal)
          ) {
            return false;
          }
          return String((cellVal as { blockId: string }).blockId)
            .toLowerCase()
            .includes(filterVal);
        }
        return String(cellVal).toLowerCase().includes(filterVal);
      });
    }
  }

  // Sort
  if (metadata.sortColumnId) {
    const col = metadata.columns.find((c) => c.id === metadata.sortColumnId);
    if (col) {
      const direction = metadata.sortDirection === "desc" ? -1 : 1;
      result.sort((a, b) => {
        const aVal = a.cells[col.id];
        const bVal = b.cells[col.id];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        if (col.type === "number") {
          const aNum = typeof aVal === "number" ? aVal : Number(aVal);
          const bNum = typeof bVal === "number" ? bVal : Number(bVal);
          if (isNaN(aNum) && isNaN(bNum)) return 0;
          if (isNaN(aNum)) return 1;
          if (isNaN(bNum)) return -1;
          return aNum === bNum ? 0 : aNum < bNum ? -direction : direction;
        }
        return String(aVal).localeCompare(String(bVal)) * direction;
      });
    }
  }

  return result;
}

/**
 * Render a cell value as a string suitable for CSV / Markdown export.
 */
export function tableCellToCsv(
  cell: TableCellValue,
  column?: TableColumn,
): string {
  if (cell == null) return "";
  if (cell instanceof Object && "blockId" in cell) {
    return (cell as TableRelation).blockId;
  }
  if (column?.type === "enum" && typeof cell === "string" && column.options) {
    const option = column.options.find((o) => o.id === cell);
    if (option) return option.label;
  }
  return String(cell);
}

/**
 * Escape a value for CSV (comma, quote, newline handling per RFC 4180).
 *
 * When guardFormula is set, values starting with a formula trigger character
 * are prefixed with a single quote so spreadsheet applications treat them
 * as text instead of evaluating them.
 */
function csvEscape(value: string, guardFormula = false): string {
  if (!value) return "";
  const guarded =
    guardFormula && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  const needsQuoting = /[",\n\r]/.test(guarded);
  if (!needsQuoting) return guarded;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/**
 * Export the table as CSV text (RFC 4180).
 */
export function exportTableToCsv(
  columns: TableColumn[],
  rows: TableRow[],
): string {
  const header = columns
    .map((col) => csvEscape(col.name || col.id, true))
    .join(",");
  const lines = rows.map((row) =>
    columns
      .map((col) =>
        csvEscape(
          tableCellToCsv(row.cells[col.id], col),
          col.type !== "number",
        ),
      )
      .join(","),
  );
  return [header, ...lines].join("\n");
}

/**
 * Export the table as a GitHub-flavored Markdown table.
 */
export function exportTableToMarkdown(
  columns: TableColumn[],
  rows: TableRow[],
): string {
  const header = columns
    .map((col) => (col.name || col.id).replace(/\|/g, "\\|"))
    .join(" | ");
  const separator = columns.map(() => "---").join(" | ");
  const lines = rows.map((row) =>
    columns
      .map((col) => {
        const cell = tableCellToCsv(row.cells[col.id], col);
        return cell.replace(/\|/g, "\\|");
      })
      .join(" | "),
  );
  return [header, separator, ...lines].join("\n");
}

/**
 * Generate a new UUID for a column or row.
 */
export function generateRowId(): string {
  return uuidv4();
}

/**
 * Default cell value used when a row or column is created without an
 * explicit value for a given column type.
 */
export function defaultCellForType(type: CellType): TableCellValue {
  if (type === "number") return 0;
  if (type === "relation") return null;
  if (type === "checkbox") return false;
  return "";
}

/**
 * Re-map existing cell values so they stay readable after a column type
 * change. Enum ids leaving an enum column are resolved to their labels,
 * values that do not fit the new type fall back to that type's default,
 * and values that remain valid are kept.
 */
export function coerceRowsForColumnType(
  column: TableColumn,
  previousOptions: TableColumnOption[] | undefined,
  previousType: CellType,
  rows: TableRow[],
): TableRow[] {
  return rows.map((row) => {
    const current = row.cells[column.id];
    let next: TableCellValue;
    if (
      previousType === "enum" &&
      previousOptions &&
      typeof current === "string"
    ) {
      const option = previousOptions.find((o) => o.id === current);
      next = option ? option.label : current;
    } else {
      next = current;
    }
    try {
      next = validateCellValue(column, next);
    } catch {
      next = defaultCellForType(column.type);
    }
    return { ...row, cells: { ...row.cells, [column.id]: next } };
  });
}

/**
 * Error thrown when a cell value does not match its column type.
 *
 * Shared by the client UI and the MCP tools so both layers enforce
 * identical validation rules.
 */
export class TableValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TableValidationError";
  }
}

/**
 * Validate a cell value against its column type and return the value to
 * store. Throws TableValidationError on mismatch.
 *
 * existingBlockIds, when provided, is used to verify that relation cells
 * reference blocks that actually exist.
 */
export function validateCellValue(
  column: TableColumn,
  value: unknown,
  existingBlockIds?: ReadonlySet<string>,
): TableCellValue {
  if (value === null || value === undefined) return null;

  switch (column.type) {
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TableValidationError(
          `Column "${column.name}" expects a number value`,
        );
      }
      return value;
    }
    case "relation": {
      if (
        typeof value !== "object" ||
        Array.isArray(value) ||
        typeof (value as Record<string, unknown>).blockId !== "string"
      ) {
        throw new TableValidationError(
          `Column "${column.name}" expects a relation object like { blockId }`,
        );
      }
      const blockId = (value as TableRelation).blockId;
      if (blockId.trim() === "") {
        throw new TableValidationError(
          `Column "${column.name}" requires a non-empty block id`,
        );
      }
      if (existingBlockIds && !existingBlockIds.has(blockId)) {
        throw new TableValidationError(
          `Referenced block "${blockId}" does not exist`,
        );
      }
      return { blockId };
    }
    case "enum": {
      if (typeof value !== "string") {
        throw new TableValidationError(
          `Column "${column.name}" expects an option id`,
        );
      }
      if (
        column.options &&
        column.options.length > 0 &&
        !column.options.some((option) => option.id === value)
      ) {
        throw new TableValidationError(
          `Value "${value}" is not an option of column "${column.name}"`,
        );
      }
      return value;
    }
    case "checkbox": {
      if (typeof value !== "boolean") {
        throw new TableValidationError(
          `Column "${column.name}" expects a boolean value`,
        );
      }
      return value;
    }
    default: {
      if (typeof value !== "string") {
        throw new TableValidationError(
          `Column "${column.name}" expects a text value`,
        );
      }
      return value;
    }
  }
}

/**
 * Whether a cell value may be rendered as a link. Only http, https, and
 * mailto are allowed; anything else (javascript:, data:, vbscript:) must
 * be rendered as inert text.
 */
export function isSafeUrl(value: string): boolean {
  return /^(https?:|mailto:)/i.test(value.trim());
}
