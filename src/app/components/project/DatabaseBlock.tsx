"use client";

import { memo, useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Plus,
  Trash2,
  Download,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
  Link as LinkIcon,
  Table as TableIcon,
  Settings,
} from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { BlockFooter } from "./BlockFooter";
import { BlockTitleInput } from "./BlockTitleInput";
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
  useNodes,
  useReactFlow,
  useEdges,
} from "@xyflow/react";
import { BlockData } from "./CanvasBlock";
import "./database-block.css";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import { isValidUrl, normalizeUrl } from "@lib/url-validation";
import CustomNodeResizer from "./CustomNodeResizer";
import {
  parseTableMetadata,
  exportTableToCsv,
  exportTableToMarkdown,
  getFilteredSortedRows,
  coerceRowsForColumnType,
  type TableColumn,
  type TableRow,
  type CellType,
  type ParsedTableMetadata,
  type TableRelation,
  type TableCellValue,
} from "./tableModel";
import { v4 as uuidv4 } from "uuid";
import { sanitizeFileName } from "@lib/file-utils";
import { focusProjectCanvas } from "./utils/focusCanvas";
import { getBlockTypeMeta } from "./blockTypeMeta";
import {
  computeLongestSideViewport,
  getNodesBoundsWithFallback,
  getReactFlowViewportSize,
} from "./utils/fitViewport";

function serializeMeta(next: TableMetadataState): string {
  return JSON.stringify({
    columns: next.columns,
    rows: next.rows,
    sortColumnId: next.sortColumnId,
    sortDirection: next.sortDirection,
    filterColumnId: next.filterColumnId,
    filterValue: next.filterValue,
  });
}

const DEFAULT_COLUMNS: TableColumn[] = [
  { id: "c1", name: "Name", type: "text", width: 200 },
  {
    id: "c2",
    name: "Status",
    type: "enum",
    options: [{ id: "o1", label: "Active" }],
  },
];

const CELL_TYPE_OPTIONS: {
  value: CellType;
  labelKey: string;
  descKey: string;
  icon: string;
}[] = [
  {
    value: "text",
    labelKey: "columnTypeText",
    descKey: "columnTypeTextDesc",
    icon: "T",
  },
  {
    value: "number",
    labelKey: "columnTypeNumber",
    descKey: "columnTypeNumberDesc",
    icon: "#",
  },
  {
    value: "enum",
    labelKey: "columnTypeSelect",
    descKey: "columnTypeSelectDesc",
    icon: "▾",
  },
  {
    value: "url",
    labelKey: "columnTypeUrl",
    descKey: "columnTypeUrlDesc",
    icon: "🔗",
  },
  {
    value: "checkbox",
    labelKey: "columnTypeCheckbox",
    descKey: "columnTypeCheckboxDesc",
    icon: "☑",
  },
  {
    value: "relation",
    labelKey: "columnTypeLink",
    descKey: "columnTypeLinkDesc",
    icon: "⇄",
  },
];

const DATABASE_MIN_WIDTH = 500;
const DATABASE_MIN_HEIGHT = 300;

type TableMetadataState = {
  columns: TableColumn[];
  rows: TableRow[];
  sortColumnId?: string;
  sortDirection?: "asc" | "desc";
  filterColumnId?: string;
  filterValue?: string;
};

type DatabaseBlockProps = NodeProps<Node<BlockData>>;

function DatabaseBlock({ id, data, selected }: DatabaseBlockProps) {
  const { dict, lang } = useI18n();
  const { getNode, fitView, setNodes, setViewport } = useReactFlow();
  const allNodes = useNodes() as Array<Node<BlockData>>;
  const edges = useEdges();

  const currentUser = data.currentUser;
  const projectOwnerId = data.projectOwnerId;
  const ownerId = data.ownerId;
  const isPreviewMode = data.isPreviewMode;
  const isLocked = data.isLocked;

  const isProjectOwner = currentUser?.id && projectOwnerId === currentUser?.id;
  const isOwner = currentUser?.id && ownerId === currentUser?.id;
  const isViewer = data.userRole === "viewer";
  const isReadOnly =
    isPreviewMode ||
    isViewer ||
    (isLocked ? !isOwner && !isProjectOwner : false);
  const canReact = !isPreviewMode || isViewer;

  const tr = (path: string, fallback: string): string => {
    const keys = path.split(".");
    let v: unknown = dict;
    for (const k of keys) {
      if (typeof v === "object" && v !== null) {
        v = (v as Record<string, unknown>)[k];
      } else {
        return fallback;
      }
    }
    return typeof v === "string" ? v : fallback;
  };

  const { handleReact, handleRemoveReaction } = useBlockReactions({
    id,
    data,
    currentUser,
    isReadOnly,
  });

  const getEditorName = () =>
    currentUser?.displayName ||
    currentUser?.username ||
    dict.project?.anonymous ||
    "unknown";

  const connected = (h: string) =>
    edges.some(
      (e) =>
        (e.source === id && e.sourceHandle === h) ||
        (e.target === id && e.targetHandle === h),
    );

  // ─── State ────────────────────────────────────────────────────────────────
  const [title, setTitle] = useState(data.title || "");
  const [columns, setColumns] = useState<TableColumn[]>(DEFAULT_COLUMNS);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [sortColumnId, setSortColumnId] = useState<string | undefined>(
    undefined,
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [filterColumnId, setFilterColumnId] = useState<string | undefined>(
    undefined,
  );
  const [filterValue, setFilterValue] = useState<string>("");
  const [typePickerColumnId, setTypePickerColumnId] = useState<string | null>(
    null,
  );
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState<string>("");
  const [optionsEditorColumnId, setOptionsEditorColumnId] = useState<
    string | null
  >(null);
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    colId: string;
  } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [columnNameInput, setColumnNameInput] = useState<string>("");

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastWrittenMetadata = useRef<string | null>(null);
  const isInitialSync = useRef(true);
  const [cellError, setCellError] = useState<{
    rowId: string;
    colId: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(e.target as unknown as Element)
      ) {
        setExportMenuOpen(false);
      }
    };
    if (exportMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [exportMenuOpen]);

  useEffect(() => {
    if (!optionsEditorColumnId) return;
    const handleOptionsClickOutside = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target && !target.closest(".db-options-editor")) {
        setOptionsEditorColumnId(null);
      }
    };
    document.addEventListener("mousedown", handleOptionsClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleOptionsClickOutside);
  }, [optionsEditorColumnId]);

  useEffect(() => {
    if (!typePickerColumnId) return;
    const handleTypePickerClickOutside = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target && !target.closest(".db-col-type-picker-wrap")) {
        setTypePickerColumnId(null);
      }
    };
    document.addEventListener("mousedown", handleTypePickerClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleTypePickerClickOutside);
  }, [typePickerColumnId]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handleContextMenu = (e: Event) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (
        target.closest(".db-header") ||
        target.closest(".db-footer-wrapper")
      ) {
        return;
      }
      e.stopPropagation();
    };

    root.addEventListener("contextmenu", handleContextMenu);

    return () => {
      root.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  // ─── Sync from data.metadata ──────────────────────────────────────────────
  useEffect(() => {
    if (
      typeof data.metadata === "string" &&
      lastWrittenMetadata.current === data.metadata
    ) {
      return;
    }
    const parsed: ParsedTableMetadata = parseTableMetadata(data.metadata);
    if (isInitialSync.current) {
      isInitialSync.current = false;
      if (parsed.columns.length === 0) {
        setColumns(DEFAULT_COLUMNS);
        const serialized = serializeMeta({
          columns: DEFAULT_COLUMNS,
          rows: parsed.rows,
          sortColumnId: parsed.sortColumnId,
          sortDirection: parsed.sortDirection,
          filterColumnId: parsed.filterColumnId,
          filterValue: parsed.filterValue,
        });
        lastWrittenMetadata.current = serialized;
        void data.onContentChange?.(
          id,
          data.content,
          new Date().toISOString(),
          getEditorName(),
          serialized,
          data.title,
          data.reactions,
        );
      } else {
        setColumns(parsed.columns);
      }
    } else {
      setColumns(parsed.columns);
    }
    setRows(parsed.rows);
    setSortColumnId(parsed.sortColumnId);
    setSortDirection(parsed.sortDirection ?? "desc");
    setFilterColumnId(parsed.filterColumnId);
    setFilterValue(parsed.filterValue ?? "");
  }, [data.metadata]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) return;
    const newTitle = e.target.value;
    setTitle(newTitle);
    void data.onContentChange?.(
      id,
      data.content,
      new Date().toISOString(),
      getEditorName(),
      data.metadata,
      newTitle,
      data.reactions,
    );
  };

  // ─── Save ─────────────────────────────────────────────────────────────────
  const updateMeta = useCallback(
    (next: TableMetadataState) => {
      const serialized = serializeMeta(next);
      lastWrittenMetadata.current = serialized;
      void data.onContentChange?.(
        id,
        data.content,
        new Date().toISOString(),
        getEditorName(),
        serialized,
        data.title,
        data.reactions,
      );
    },
    [id, data, getEditorName],
  );

  // ─── Column operations ────────────────────────────────────────────────────
  const handleReorderColumns = useCallback(
    (fromId: string, toId: string) => {
      if (isReadOnly || fromId === toId) return;
      const fromIndex = columns.findIndex((c) => c.id === fromId);
      const toIndex = columns.findIndex((c) => c.id === toId);
      if (fromIndex === -1 || toIndex === -1) return;
      const newColumns = [...columns];
      const [moved] = newColumns.splice(fromIndex, 1);
      newColumns.splice(toIndex, 0, moved);
      const next = {
        columns: newColumns,
        rows,
        sortColumnId,
        sortDirection,
        filterColumnId,
        filterValue,
      };
      setColumns(newColumns);
      updateMeta(next);
    },
    [
      columns,
      rows,
      sortColumnId,
      sortDirection,
      filterColumnId,
      filterValue,
      isReadOnly,
      updateMeta,
    ],
  );

  const handleAddColumn = useCallback(() => {
    if (isReadOnly) return;
    const newCol: TableColumn = {
      id: uuidv4(),
      name: tr("blocks.columnName", "Column Name"),
      type: "text",
      width: 200,
    };
    const next = {
      columns: [...columns, newCol],
      rows: rows.map((r) => ({
        ...r,
        cells: { ...r.cells, [newCol.id]: "" },
      })),
      sortColumnId,
      sortDirection,
      filterColumnId,
      filterValue,
    };
    setColumns(next.columns);
    setRows(next.rows);
    updateMeta(next);
  }, [
    columns,
    rows,
    sortColumnId,
    sortDirection,
    filterColumnId,
    filterValue,
    isReadOnly,
    updateMeta,
    tr,
  ]);

  const handleRenameColumn = useCallback(
    (colId: string, newName: string) => {
      if (isReadOnly) return;
      const next = {
        columns: columns.map((c) =>
          c.id === colId ? { ...c, name: newName } : c,
        ),
        rows,
        sortColumnId,
        sortDirection,
        filterColumnId,
        filterValue,
      };
      setColumns(next.columns);
      updateMeta(next);
      setEditingColumnId(null);
    },
    [
      columns,
      rows,
      sortColumnId,
      sortDirection,
      filterColumnId,
      filterValue,
      isReadOnly,
      updateMeta,
    ],
  );

  const handleColumnTypeChange = useCallback(
    (colId: string, newType: CellType) => {
      if (isReadOnly) return;
      const previousColumn = columns.find((c) => c.id === colId);
      if (!previousColumn) return;
      const nextColumn: TableColumn = { ...previousColumn, type: newType };

      const next = {
        columns: columns.map((c) => (c.id === colId ? nextColumn : c)),
        rows: coerceRowsForColumnType(
          nextColumn,
          previousColumn.options,
          previousColumn.type,
          rows,
        ),
        sortColumnId,
        sortDirection,
        filterColumnId,
        filterValue,
      };
      setColumns(next.columns);
      setRows(next.rows);
      updateMeta(next);
    },
    [
      columns,
      rows,
      sortColumnId,
      sortDirection,
      filterColumnId,
      filterValue,
      isReadOnly,
      updateMeta,
      tr,
    ],
  );

  const handleAddOption = useCallback(
    (colId: string) => {
      if (isReadOnly) return;
      const col = columns.find((c) => c.id === colId);
      if (!col) return;
      const newOptionId = `o${Date.now()}`;
      const nextOptions = [
        ...(col.options ?? []),
        { id: newOptionId, label: "" },
      ];
      const next = {
        columns: columns.map((c) =>
          c.id === colId ? { ...c, options: nextOptions } : c,
        ),
        rows,
        sortColumnId,
        sortDirection,
        filterColumnId,
        filterValue,
      };
      setColumns(next.columns);
      updateMeta(next);
    },
    [
      columns,
      rows,
      sortColumnId,
      sortDirection,
      filterColumnId,
      filterValue,
      isReadOnly,
      updateMeta,
    ],
  );

  const handleUpdateOptionLabel = useCallback(
    (colId: string, optionId: string, label: string) => {
      if (isReadOnly) return;
      const col = columns.find((c) => c.id === colId);
      if (!col || !col.options) return;
      const nextOptions = col.options.map((o) =>
        o.id === optionId ? { ...o, label } : o,
      );
      const next = {
        columns: columns.map((c) =>
          c.id === colId ? { ...c, options: nextOptions } : c,
        ),
        rows,
        sortColumnId,
        sortDirection,
        filterColumnId,
        filterValue,
      };
      setColumns(next.columns);
      updateMeta(next);
    },
    [
      columns,
      rows,
      sortColumnId,
      sortDirection,
      filterColumnId,
      filterValue,
      isReadOnly,
      updateMeta,
    ],
  );

  const handleDeleteOption = useCallback(
    (colId: string, optionId: string) => {
      if (isReadOnly) return;
      const col = columns.find((c) => c.id === colId);
      if (!col || !col.options) return;
      const nextOptions = col.options.filter((o) => o.id !== optionId);
      const nextRows = rows.map((r) => {
        if (r.cells[colId] === optionId) {
          const rest = { ...r.cells };
          delete rest[colId];
          return { ...r, cells: rest };
        }
        return r;
      });
      const next = {
        columns: columns.map((c) =>
          c.id === colId ? { ...c, options: nextOptions } : c,
        ),
        rows: nextRows,
        sortColumnId,
        sortDirection,
        filterColumnId,
        filterValue,
      };
      setColumns(next.columns);
      setRows(next.rows);
      updateMeta(next);
    },
    [
      columns,
      rows,
      sortColumnId,
      sortDirection,
      filterColumnId,
      filterValue,
      isReadOnly,
      updateMeta,
    ],
  );

  const handleDeleteColumn = useCallback(
    (colId: string) => {
      if (isReadOnly) return;
      const nextColumns = columns.filter((c) => c.id !== colId);
      const nextRows = rows.map((r) => {
        const rest = { ...r.cells };
        delete rest[colId];
        return { ...r, cells: rest };
      });
      const next = {
        columns: nextColumns,
        rows: nextRows,
        sortColumnId: sortColumnId === colId ? undefined : sortColumnId,
        sortDirection,
        filterColumnId: filterColumnId === colId ? undefined : filterColumnId,
        filterValue,
      };
      setColumns(next.columns);
      setRows(next.rows);
      setSortColumnId(next.sortColumnId);
      setFilterColumnId(next.filterColumnId);
      setEditingColumnId((current) => (current === colId ? null : current));
      setEditingCell((current) => (current?.colId === colId ? null : current));
      setCellError(null);
      updateMeta(next);
    },
    [
      columns,
      rows,
      sortColumnId,
      sortDirection,
      filterColumnId,
      filterValue,
      isReadOnly,
      updateMeta,
    ],
  );

  const handleResizeColumn = useCallback(
    (colId: string, newWidth: number) => {
      const clamped = Math.max(80, Math.min(600, newWidth));
      const next = {
        columns: columns.map((c) =>
          c.id === colId ? { ...c, width: clamped } : c,
        ),
        rows,
        sortColumnId,
        sortDirection,
        filterColumnId,
        filterValue,
      };
      setColumns(next.columns);
      updateMeta(next);
    },
    [
      columns,
      rows,
      sortColumnId,
      sortDirection,
      filterColumnId,
      filterValue,
      updateMeta,
    ],
  );

  // ─── Row operations ───────────────────────────────────────────────────────
  const handleAddRow = useCallback(() => {
    if (isReadOnly) return;
    const newRow: TableRow = { id: uuidv4(), cells: {} };
    for (const col of columns) {
      newRow.cells[col.id] = col.type === "number" ? 0 : "";
    }
    const next = {
      columns,
      rows: [...rows, newRow],
      sortColumnId,
      sortDirection,
      filterColumnId,
      filterValue,
    };
    setRows(next.rows);
    updateMeta(next);
  }, [
    columns,
    rows,
    sortColumnId,
    sortDirection,
    filterColumnId,
    filterValue,
    isReadOnly,
    updateMeta,
  ]);

  const handleDeleteRow = useCallback(
    (rowId: string) => {
      if (isReadOnly) return;
      const next = {
        columns,
        rows: rows.filter((r) => r.id !== rowId),
        sortColumnId,
        sortDirection,
        filterColumnId,
        filterValue,
      };
      setRows(next.rows);
      setEditingCell((current) => (current?.rowId === rowId ? null : current));
      setCellError(null);
      updateMeta(next);
    },
    [
      columns,
      rows,
      sortColumnId,
      sortDirection,
      filterColumnId,
      filterValue,
      isReadOnly,
      updateMeta,
    ],
  );

  // ─── Relation navigation ──────────────────────────────────────────────────
  const navigateToBlock = useCallback(
    (targetBlockId: string) => {
      const targetNode = getNode(targetBlockId);
      if (!targetNode) return;

      setNodes((nodes) =>
        nodes.map((n: Node) => ({
          ...n,
          selected: n.id === targetBlockId,
        })),
      );

      const bounds = getNodesBoundsWithFallback([targetNode]);
      const viewportSize = getReactFlowViewportSize();

      if (!bounds || !viewportSize) {
        void fitView({
          nodes: [targetNode],
          duration: 800,
          maxZoom: 2,
          padding: 0.12,
        });
      } else {
        const nextViewport = computeLongestSideViewport(bounds, viewportSize, {
          padding: 0.12,
          minZoom: 0.1,
          maxZoom: 2,
        });
        void setViewport(nextViewport, { duration: 800 });
      }

      focusProjectCanvas();
    },
    [getNode, fitView, setNodes, setViewport],
  );

  // ─── Cell editing ─────────────────────────────────────────────────────────
  const handleCellClick = useCallback(
    (rowId: string, colId: string) => {
      setCellError(null);
      if (isReadOnly) {
        const col = columns.find((c) => c.id === colId);
        if (col?.type === "relation") {
          const cell = rows.find((r) => r.id === rowId)?.cells[colId];
          if (
            cell &&
            typeof cell === "object" &&
            !Array.isArray(cell) &&
            "blockId" in cell
          ) {
            navigateToBlock((cell as TableRelation).blockId);
          }
        }
        return;
      }
      const col = columns.find((c) => c.id === colId);
      if (!col) return;

      setEditingCell({ rowId, colId });
      const cell = rows.find((r) => r.id === rowId)?.cells[colId];
      if (typeof cell === "string" || typeof cell === "number") {
        setEditValue(String(cell ?? ""));
      } else {
        setEditValue("");
      }
    },
    [columns, rows, isReadOnly, navigateToBlock],
  );

  const commitCellEdit = useCallback(
    (rowId: string, colId: string) => {
      if (isReadOnly) return;
      const col = columns.find((c) => c.id === colId);
      if (!col) return;

      let parsedValue: unknown = editValue;
      let hasError = false;
      if (col.type === "number") {
        parsedValue = editValue === "" ? null : Number(editValue);
      } else if (col.type === "url") {
        if (editValue && isValidUrl(editValue)) {
          parsedValue = normalizeUrl(editValue);
        } else if (editValue) {
          hasError = true;
          setCellError({
            rowId,
            colId,
            message: tr("blocks.urlInvalidError", "Invalid URL format"),
          });
        }
      } else if (col.type === "relation") {
        if (editValue) {
          const targetExists = allNodes.some((n) => n.id === editValue);
          if (!targetExists) {
            hasError = true;
            setCellError({
              rowId,
              colId,
              message: tr("blocks.relationNotFound", "Block not found"),
            });
          } else {
            parsedValue = { blockId: editValue };
          }
        } else {
          parsedValue = null;
        }
      }

      const next = {
        columns,
        rows: rows.map(
          (r): TableRow =>
            r.id === rowId
              ? {
                  ...r,
                  cells: { ...r.cells, [colId]: parsedValue as TableCellValue },
                }
              : r,
        ),
        sortColumnId,
        sortDirection,
        filterColumnId,
        filterValue,
      };
      setRows(next.rows);
      updateMeta(next);
      setEditingCell(null);
      setEditValue("");
      if (!hasError) {
        setCellError(null);
      }
    },
    [
      columns,
      rows,
      allNodes,
      editValue,
      sortColumnId,
      sortDirection,
      filterColumnId,
      filterValue,
      isReadOnly,
      updateMeta,
      tr,
    ],
  );

  // ─── Sort / Filter ────────────────────────────────────────────────────────
  const handleSortChange = useCallback(
    (colId: string, direction: "asc" | "desc") => {
      if (isReadOnly) return;
      const next = {
        columns,
        rows,
        sortColumnId: colId,
        sortDirection: direction,
        filterColumnId,
        filterValue,
      };
      setSortColumnId(colId);
      setSortDirection(direction);
      updateMeta(next);
    },
    [columns, rows, filterColumnId, filterValue, isReadOnly, updateMeta],
  );

  const handleFilterChange = useCallback(() => {
    if (isReadOnly) return;
    const next = {
      columns,
      rows,
      sortColumnId,
      sortDirection,
      filterColumnId: filterValue ? filterColumnId : undefined,
      filterValue: filterValue || undefined,
    };
    setFilterColumnId(next.filterColumnId);
    setFilterValue(next.filterValue ?? "");
    updateMeta(next);
  }, [
    columns,
    rows,
    sortColumnId,
    sortDirection,
    filterColumnId,
    filterValue,
    isReadOnly,
    updateMeta,
  ]);

  // ─── Export ───────────────────────────────────────────────────────────────
  const handleExport = useCallback(
    (format: "csv" | "markdown") => {
      const visibleRows = getFilteredSortedRows({
        columns,
        rows,
        sortColumnId,
        sortDirection,
        filterColumnId,
        filterValue,
      });
      let content: string;
      let filename: string;
      let mimeType: string;

      const safeTitle = sanitizeFileName(data.title || "") || "database";

      if (format === "csv") {
        content = exportTableToCsv(columns, visibleRows);
        filename = `${safeTitle}.csv`;
        mimeType = "text/csv;charset=utf-8;";
      } else {
        content = exportTableToMarkdown(columns, visibleRows);
        filename = `${safeTitle}.md`;
        mimeType = "text/markdown;charset=utf-8;";
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    [
      columns,
      rows,
      sortColumnId,
      sortDirection,
      filterColumnId,
      filterValue,
      data.title,
    ],
  );

  // ─── Render helpers ───────────────────────────────────────────────────────
  const getCellTypeLabel = (type: CellType): string => {
    switch (type) {
      case "text":
        return tr("blocks.columnTypeText", "Text");
      case "number":
        return tr("blocks.columnTypeNumber", "Number");
      case "enum":
        return tr("blocks.columnTypeSelect", "Select");
      case "url":
        return tr("blocks.columnTypeUrl", "URL");
      case "relation":
        return tr("blocks.columnTypeLink", "Link");
      case "checkbox":
        return tr("blocks.columnTypeCheckbox", "Checkbox");
      default:
        return type;
    }
  };

  const getCellTypeDesc = (type: CellType): string => {
    switch (type) {
      case "text":
        return tr("blocks.columnTypeTextDesc", "Free text input.");
      case "number":
        return tr("blocks.columnTypeNumberDesc", "Numeric values.");
      case "enum":
        return tr("blocks.columnTypeSelectDesc", "Choose from a list.");
      case "url":
        return tr("blocks.columnTypeUrlDesc", "Web links with validation.");
      case "relation":
        return tr("blocks.columnTypeLinkDesc", "Reference another block.");
      case "checkbox":
        return tr("blocks.columnTypeCheckboxDesc", "Boolean true or false.");
      default:
        return "";
    }
  };

  const getCellTypeIcon = (type: CellType): string => {
    const opt = CELL_TYPE_OPTIONS.find((o) => o.value === type);
    return opt?.icon ?? "?";
  };

  const getColumnLabel = (col: TableColumn): string =>
    getCellTypeLabel(col.type);

  const renderCell = (row: TableRow, col: TableColumn, isEditing: boolean) => {
    const cellValue = row.cells[col.id];
    const isRelation = col.type === "relation";

    if (col.type === "checkbox") {
      return (
        <input
          type="checkbox"
          className="db-cell-checkbox"
          checked={cellValue === true}
          disabled={isReadOnly}
          onChange={() => {
            const next = {
              columns,
              rows: rows.map((r) =>
                r.id === row.id
                  ? {
                      ...r,
                      cells: { ...r.cells, [col.id]: cellValue !== true },
                    }
                  : r,
              ),
              sortColumnId,
              sortDirection,
              filterColumnId,
              filterValue,
            };
            setRows(next.rows);
            updateMeta(next);
          }}
        />
      );
    }

    if (col.type === "enum") {
      return (
        <select
          className="db-cell-input db-cell-select"
          value={typeof cellValue === "string" ? cellValue : ""}
          onChange={(e) => {
            const next = {
              columns,
              rows: rows.map((r) =>
                r.id === row.id
                  ? {
                      ...r,
                      cells: { ...r.cells, [col.id]: e.target.value },
                    }
                  : r,
              ),
              sortColumnId,
              sortDirection,
              filterColumnId,
              filterValue,
            };
            setRows(next.rows);
            updateMeta(next);
            setEditingCell(null);
            setCellError(null);
          }}
        >
          <option value="" disabled>
            {tr("blocks.selectOption", "Select an option")}
          </option>
          {col.options?.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    if (isEditing) {
      if (col.type === "relation") {
        return (
          <select
            className="db-cell-input db-cell-select"
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              const next = {
                columns,
                rows: rows.map((r) =>
                  r.id === row.id
                    ? {
                        ...r,
                        cells: {
                          ...r.cells,
                          [col.id]: { blockId: e.target.value },
                        },
                      }
                    : r,
                ),
                sortColumnId,
                sortDirection,
                filterColumnId,
                filterValue,
              };
              setRows(next.rows);
              updateMeta(next);
              setEditingCell(null);
              setCellError(null);
            }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditingCell(null);
              }
            }}
          >
            <option value="" disabled>
              {tr("blocks.linkEmptyHint", "Pick a block to link to")}
            </option>
            {allNodes
              .filter((n) => n.id !== id)
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.data?.title || n.id.slice(0, 8)}
                </option>
              ))}
          </select>
        );
      }
      return (
        <input
          type={col.type === "number" ? "number" : "text"}
          className="db-cell-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => commitCellEdit(row.id, col.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitCellEdit(row.id, col.id);
            if (e.key === "Escape") {
              setEditingCell(null);
              setEditValue("");
              setCellError(null);
            }
          }}
          autoFocus
        />
      );
    }

    // Read mode
    if (
      isRelation &&
      cellValue &&
      typeof cellValue === "object" &&
      !Array.isArray(cellValue) &&
      "blockId" in cellValue
    ) {
      const rel = cellValue as TableRelation;
      const targetNode = allNodes.find((n) => n.id === rel.blockId);
      const blockType = targetNode?.data?.blockType;
      const meta = getBlockTypeMeta(blockType);
      const typeLabel = tr(`blocks.${meta.labelKey}`, "Block");
      const title = targetNode?.data?.title || rel.blockId.slice(0, 8);
      const Icon = meta.icon;
      return (
        <button
          type="button"
          className="db-relation-link"
          onClick={() => navigateToBlock(rel.blockId)}
          title={tr("blocks.columnTypeRelation", "Relation")}
        >
          <Icon size={14} />
          <span className="db-relation-type">{typeLabel}</span>
          <span className="db-relation-sep">·</span>
          <span className="db-relation-label">{title}</span>
        </button>
      );
    }

    if (isRelation && (!cellValue || cellValue === "")) {
      return (
        <span
          className="db-cell-text db-relation-empty"
          onClick={() => handleCellClick(row.id, col.id)}
        >
          <LinkIcon size={12} />
          <span className="db-relation-empty-hint">
            {tr("blocks.linkConfigurePrompt", "Click to configure link target")}
          </span>
        </span>
      );
    }

    if (col.type === "url" && cellValue) {
      const url = String(cellValue);
      if (isValidUrl(url)) {
        const href = normalizeUrl(url);
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="db-cell-link"
          >
            {url}
          </a>
        );
      }
      return (
        <span
          className="db-cell-text db-cell-url-invalid"
          onClick={() => handleCellClick(row.id, col.id)}
        >
          {url}
          {cellError &&
            cellError.rowId === row.id &&
            cellError.colId === col.id && (
              <span className="db-cell-error">{cellError.message}</span>
            )}
        </span>
      );
    }

    return (
      <span
        className="db-cell-text"
        onClick={() => handleCellClick(row.id, col.id)}
      >
        {cellValue === null || cellValue === undefined || cellValue === ""
          ? ""
          : String(cellValue)}
        {cellError &&
          cellError.rowId === row.id &&
          cellError.colId === col.id && (
            <span className="db-cell-error">{cellError.message}</span>
          )}
      </span>
    );
  };

  const visibleRows = useMemo(() => {
    const filtered = getFilteredSortedRows({
      columns,
      rows,
      sortColumnId,
      sortDirection,
      filterColumnId,
      filterValue,
    });
    if (!globalSearch.trim()) return filtered;
    const q = globalSearch.toLowerCase();
    return filtered.filter((row) =>
      columns.some((col) => {
        const val = row.cells[col.id];
        if (val === null || val === undefined) return false;
        if (typeof val === "object" && "blockId" in val) {
          return val.blockId.toLowerCase().includes(q);
        }
        return String(val).toLowerCase().includes(q);
      }),
    );
  }, [
    columns,
    rows,
    sortColumnId,
    sortDirection,
    filterColumnId,
    filterValue,
    globalSearch,
  ]);

  if (data.isSummary) {
    return null;
  }

  const isCellEditing = (rowId: string, colId: string) =>
    editingCell?.rowId === rowId && editingCell?.colId === colId;

  return (
    <>
      <div
        ref={rootRef}
        className={`block-card db-root ${selected ? "db-root-selected" : ""}`}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (
            target.closest(".db-toolbar") ||
            target.closest(".db-title-row") ||
            target.closest(".db-table-container") ||
            target.closest("button") ||
            target.closest("input") ||
            target.closest("select")
          ) {
            return;
          }
          setNodes((nodes) =>
            nodes.map((n: Node) => ({
              ...n,
              selected: n.id === id,
            })),
          );
        }}
      >
        <Handle
          id="left"
          type="source"
          position={Position.Left}
          isConnectable={true}
          className="block-handle block-handle-left z-50!"
        >
          {!connected("left") && <div className="handle-dot" />}
        </Handle>
        <Handle
          id="right"
          type="source"
          position={Position.Right}
          isConnectable={true}
          className="block-handle block-handle-right z-50!"
        >
          {!connected("right") && <div className="handle-dot" />}
        </Handle>
        <Handle
          id="top"
          type="source"
          position={Position.Top}
          isConnectable={true}
          className="block-handle block-handle-top z-50!"
        >
          {!connected("top") && <div className="handle-dot" />}
        </Handle>
        <Handle
          id="bottom"
          type="source"
          position={Position.Bottom}
          isConnectable={true}
          className="block-handle block-handle-bottom z-50!"
        >
          {!connected("bottom") && <div className="handle-dot" />}
        </Handle>

        <CustomNodeResizer
          minWidth={DATABASE_MIN_WIDTH}
          minHeight={DATABASE_MIN_HEIGHT}
          isVisible={!isReadOnly}
          lineClassName="resizer-line"
          handleClassName="resizer-handle"
          keepAspectRatio={false}
        />

        <div className="db-header">
          <div className="db-title-row" onClick={(e) => e.stopPropagation()}>
            <TableIcon size={14} />
            <span className="db-block-type-label">
              {tr("blocks.blockTypeDatabase", "Database")}
            </span>
            <BlockTitleInput
              value={title}
              onChange={handleTitleChange}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  (e.target as HTMLElement)?.blur?.();
                  focusProjectCanvas();
                }
              }}
              placeholder={tr("blocks.title", "...")}
              readOnly={isReadOnly}
            />
          </div>
          <div
            className="db-toolbar nodrag"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="db-toolbar-btn"
              onClick={handleAddColumn}
              disabled={isReadOnly}
              title={tr("blocks.addColumn", "Add Column")}
            >
              <Plus size={16} />
              <span>{tr("blocks.addColumn", "Add Column")}</span>
            </button>
            <button
              type="button"
              className="db-toolbar-btn"
              onClick={handleAddRow}
              disabled={isReadOnly}
              title={tr("blocks.addRow", "Add Row")}
            >
              <Plus size={16} />
              <span>{tr("blocks.addRow", "Add Row")}</span>
            </button>
            <input
              type="text"
              className="db-search-input"
              placeholder={tr("blocks.search", "Search...")}
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
            />
            {columns.length > 0 && (
              <>
                <Filter size={16} className="db-toolbar-icon" />
                <select
                  className="db-filter-select"
                  value={filterColumnId ?? ""}
                  onChange={(e) => {
                    setFilterColumnId(e.target.value || undefined);
                    setFilterValue("");
                  }}
                  disabled={isReadOnly}
                >
                  <option value="">
                    {tr("blocks.filterBy", "Filter by...")}
                  </option>
                  {columns.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.name}
                    </option>
                  ))}
                </select>
                {(() => {
                  const filterCol = columns.find(
                    (c) => c.id === filterColumnId,
                  );
                  if (filterCol?.type === "enum") {
                    return (
                      <select
                        className="db-filter-input"
                        value={filterValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFilterValue(val);
                          const next = {
                            columns,
                            rows,
                            sortColumnId,
                            sortDirection,
                            filterColumnId: val ? filterColumnId : undefined,
                            filterValue: val || undefined,
                          };
                          setFilterColumnId(next.filterColumnId);
                          setFilterValue(next.filterValue ?? "");
                          updateMeta(next);
                        }}
                        disabled={isReadOnly}
                      >
                        <option value="">
                          {tr("blocks.selectOption", "Select an option")}
                        </option>
                        {filterCol.options?.map((opt) => (
                          <option key={opt.id} value={opt.label}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    );
                  }
                  if (filterCol?.type === "relation") {
                    return (
                      <select
                        className="db-filter-input"
                        value={filterValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFilterValue(val);
                          const next = {
                            columns,
                            rows,
                            sortColumnId,
                            sortDirection,
                            filterColumnId: val ? filterColumnId : undefined,
                            filterValue: val || undefined,
                          };
                          setFilterColumnId(next.filterColumnId);
                          setFilterValue(next.filterValue ?? "");
                          updateMeta(next);
                        }}
                        disabled={isReadOnly}
                      >
                        <option value="">
                          {tr("blocks.selectOption", "Select an option")}
                        </option>
                        {allNodes
                          .filter((n) => n.id !== id)
                          .map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.data?.title || n.id.slice(0, 8)}
                            </option>
                          ))}
                      </select>
                    );
                  }
                  return (
                    <input
                      type="text"
                      className="db-filter-input"
                      placeholder={tr("blocks.enterValue", "Enter value...")}
                      value={filterValue}
                      onChange={(e) => setFilterValue(e.target.value)}
                      onBlur={handleFilterChange}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleFilterChange();
                      }}
                      disabled={isReadOnly}
                    />
                  );
                })()}

                <select
                  className="db-sort-select"
                  value={sortColumnId ?? ""}
                  onChange={(e) => {
                    const colId = e.target.value;
                    if (colId) {
                      handleSortChange(colId, sortDirection);
                    } else {
                      handleSortChange("", sortDirection);
                    }
                  }}
                  disabled={isReadOnly}
                >
                  <option value="">{tr("blocks.sortBy", "Sort by...")}</option>
                  {columns.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.name}
                    </option>
                  ))}
                </select>
                {sortColumnId && (
                  <button
                    type="button"
                    className="db-toolbar-btn"
                    onClick={() =>
                      handleSortChange(
                        sortColumnId,
                        sortDirection === "asc" ? "desc" : "asc",
                      )
                    }
                    disabled={isReadOnly}
                  >
                    {sortDirection === "asc" ? (
                      <ArrowUp size={16} />
                    ) : (
                      <ArrowDown size={16} />
                    )}
                  </button>
                )}
                <div className="db-export-dropdown" ref={exportMenuRef}>
                  <button
                    type="button"
                    className="db-toolbar-btn"
                    onClick={() => setExportMenuOpen(!exportMenuOpen)}
                    title={tr("blocks.export", "Export")}
                  >
                    <Download size={16} />
                    <ChevronDown size={14} />
                  </button>
                  {exportMenuOpen && (
                    <div className="db-export-menu">
                      <button
                        type="button"
                        className="db-export-menu-item"
                        onClick={() => {
                          handleExport("csv");
                          setExportMenuOpen(false);
                        }}
                      >
                        <Download size={14} />
                        {tr("blocks.exportCsv", "Export CSV")}
                      </button>
                      <button
                        type="button"
                        className="db-export-menu-item"
                        onClick={() => {
                          handleExport("markdown");
                          setExportMenuOpen(false);
                        }}
                      >
                        <Download size={14} />
                        {tr("blocks.exportMarkdown", "Export Markdown")}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="db-table-container">
          <table className="db-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.id}
                    className={`db-th nodrag ${
                      dragColId === col.id ? "db-th-dragging" : ""
                    } ${dragOverColId === col.id ? "db-th-drag-over" : ""}`}
                    style={col.width ? { width: col.width } : undefined}
                    data-col-id={col.id}
                  >
                    <div className="db-col-header-top">
                      {!isReadOnly && (
                        <span
                          className="db-col-grip"
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const grip = e.currentTarget;
                            grip.setPointerCapture(e.pointerId);
                            let isDragging = false;
                            let overId: string | null = null;
                            const startX = e.clientX;
                            let ghost: HTMLDivElement | null = null;

                            const onMove = (ev: PointerEvent) => {
                              if (
                                !isDragging &&
                                Math.abs(ev.clientX - startX) > 3
                              ) {
                                isDragging = true;
                                setDragColId(col.id);
                                ghost = document.createElement("div");
                                ghost.className = "db-drag-ghost";
                                ghost.textContent = col.name;
                                document.body.appendChild(ghost);
                              }
                              if (ghost) {
                                ghost.style.left = ev.clientX + 10 + "px";
                                ghost.style.top = ev.clientY - 10 + "px";
                              }
                              if (isDragging) {
                                const el = document.elementFromPoint(
                                  ev.clientX,
                                  ev.clientY,
                                );
                                const th = el?.closest(".db-th");
                                if (th) {
                                  const thId = th.getAttribute("data-col-id");
                                  if (thId && thId !== col.id) {
                                    overId = thId;
                                    setDragOverColId(thId);
                                  }
                                }
                              }
                            };

                            const onUp = () => {
                              grip.removeEventListener("pointermove", onMove);
                              grip.removeEventListener("pointerup", onUp);
                              if (ghost) {
                                ghost.remove();
                                ghost = null;
                              }
                              if (isDragging && overId) {
                                handleReorderColumns(col.id, overId);
                              }
                              setDragColId(null);
                              setDragOverColId(null);
                            };

                            grip.addEventListener("pointermove", onMove);
                            grip.addEventListener("pointerup", onUp);
                          }}
                        >
                          ⣿
                        </span>
                      )}
                      {editingColumnId === col.id ? (
                        <input
                          type="text"
                          className="db-col-name-input"
                          value={columnNameInput}
                          onChange={(e) => setColumnNameInput(e.target.value)}
                          onBlur={() =>
                            handleRenameColumn(col.id, columnNameInput)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              handleRenameColumn(col.id, columnNameInput);
                            if (e.key === "Escape") setEditingColumnId(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <span
                          onDoubleClick={() => {
                            if (!isReadOnly) {
                              setColumnNameInput(col.name);
                              setEditingColumnId(col.id);
                            }
                          }}
                          className="db-col-name"
                        >
                          {col.name}
                        </span>
                      )}
                    </div>
                    <div className="db-col-header-bottom">
                      <span className="db-col-type-badge">
                        {getColumnLabel(col)}
                      </span>
                      {col.type === "enum" && !isReadOnly && (
                        <button
                          type="button"
                          className="db-col-options-btn"
                          onClick={() =>
                            setOptionsEditorColumnId(
                              optionsEditorColumnId === col.id ? null : col.id,
                            )
                          }
                          title={tr("blocks.emptyOptionsTitle", "Edit options")}
                        >
                          <Settings size={12} />
                        </button>
                      )}
                      <div className="db-col-type-picker-wrap">
                        <button
                          type="button"
                          className="db-col-type-picker-btn"
                          onClick={() =>
                            setTypePickerColumnId(
                              typePickerColumnId === col.id ? null : col.id,
                            )
                          }
                          disabled={isReadOnly}
                          title={getCellTypeDesc(col.type)}
                        >
                          <span className="db-col-type-icon">
                            {getCellTypeIcon(col.type)}
                          </span>
                          <span className="db-col-type-label">
                            {getColumnLabel(col)}
                          </span>
                          <ChevronDown size={12} />
                        </button>
                        {typePickerColumnId === col.id && (
                          <div
                            className={`db-col-type-dropdown ${
                              columns[0]?.id === col.id
                                ? "db-col-type-dropdown-left"
                                : ""
                            }`}
                          >
                            {CELL_TYPE_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                className={`db-col-type-option ${
                                  col.type === opt.value ? "active" : ""
                                }`}
                                onClick={() => {
                                  handleColumnTypeChange(col.id, opt.value);
                                  setTypePickerColumnId(null);
                                }}
                              >
                                <span className="db-col-type-icon">
                                  {opt.icon}
                                </span>
                                <span className="db-col-type-option-text">
                                  <span className="db-col-type-option-label">
                                    {getCellTypeLabel(opt.value)}
                                  </span>
                                  <span className="db-col-type-option-desc">
                                    {getCellTypeDesc(opt.value)}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {optionsEditorColumnId === col.id && (
                        <div className="db-options-editor">
                          <div className="db-options-editor-header">
                            {tr("blocks.emptyOptionsTitle", "Options")}
                          </div>
                          {(!col.options || col.options.length === 0) && (
                            <div className="db-options-empty">
                              <p>
                                {tr(
                                  "blocks.emptyOptionsHint",
                                  "Add options to let users pick from a list.",
                                )}
                              </p>
                              <button
                                type="button"
                                className="db-options-add-btn"
                                onClick={() => handleAddOption(col.id)}
                              >
                                <Plus size={12} />
                                {tr(
                                  "blocks.addFirstOption",
                                  "Add your first option",
                                )}
                              </button>
                            </div>
                          )}
                          {col.options && col.options.length > 0 && (
                            <div className="db-options-list">
                              {col.options.map((opt) => (
                                <div key={opt.id} className="db-option-row">
                                  <input
                                    type="text"
                                    className="db-option-input"
                                    value={opt.label}
                                    onChange={(e) =>
                                      handleUpdateOptionLabel(
                                        col.id,
                                        opt.id,
                                        e.target.value,
                                      )
                                    }
                                    placeholder={tr(
                                      "blocks.defaultEnumOption",
                                      "Option",
                                    )}
                                  />
                                  <button
                                    type="button"
                                    className="db-option-delete"
                                    onClick={() =>
                                      handleDeleteOption(col.id, opt.id)
                                    }
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                className="db-options-add-btn"
                                onClick={() => handleAddOption(col.id)}
                              >
                                <Plus size={12} />
                                {tr("blocks.addOption", "Add option")}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        className="db-col-delete"
                        onClick={() => handleDeleteColumn(col.id)}
                        disabled={isReadOnly}
                        title={tr("blocks.deleteColumn", "Delete Column")}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {!isReadOnly && (
                      <div
                        className="db-col-resize"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const startX = e.clientX;
                          const startW = col.width || 200;
                          const onMove = (ev: MouseEvent) => {
                            handleResizeColumn(
                              col.id,
                              startW + ev.clientX - startX,
                            );
                          };
                          const onUp = () => {
                            document.removeEventListener("mousemove", onMove);
                            document.removeEventListener("mouseup", onUp);
                          };
                          document.addEventListener("mousemove", onMove);
                          document.addEventListener("mouseup", onUp);
                        }}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (isReadOnly ? 0 : 1)}
                    className="db-empty nodrag"
                  >
                    {tr("blocks.noRows", "No rows yet")}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.id} className="db-row">
                    {columns.map((col) => (
                      <td key={col.id} className="db-td nodrag">
                        {renderCell(row, col, isCellEditing(row.id, col.id))}
                      </td>
                    ))}
                    {!isReadOnly && (
                      <td className="db-td-row-delete">
                        <button
                          type="button"
                          className="db-row-delete"
                          onClick={() => handleDeleteRow(row.id)}
                          title={tr("blocks.deleteRow", "Delete Row")}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="db-tfoot-row">
                {columns.map((col) => {
                  let summary = "";
                  if (col.type === "number") {
                    const sum = visibleRows.reduce(
                      (acc, r) =>
                        acc +
                        (typeof r.cells[col.id] === "number"
                          ? (r.cells[col.id] as number)
                          : 0),
                      0,
                    );
                    summary = String(sum);
                  } else if (col.type === "checkbox") {
                    const count = visibleRows.filter(
                      (r) => r.cells[col.id] === true,
                    ).length;
                    summary = `${count}/${visibleRows.length}`;
                  }
                  return (
                    <td key={col.id} className="db-tfoot-cell nodrag">
                      {summary}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="db-footer-wrapper">
          <BlockFooter
            updatedAt={data.updatedAt}
            authorName={data.authorName}
            isContentLocked={data.isContentLocked}
            isPositionLocked={data.isPositionLocked}
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
        </div>
      </div>
    </>
  );
}

export default memo(DatabaseBlock);
