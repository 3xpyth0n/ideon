import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { Node, Edge, useReactFlow } from "@xyflow/react";
import { toast } from "sonner";
import { useI18n } from "@providers/I18nProvider";
import { uniqueById } from "@lib/utils";
import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { useProjectCanvasGraph } from "./useProjectCanvasGraph";
import { useProjectCanvasRealtime } from "./useProjectCanvasRealtime";
import { useUndoRedo } from "./useUndoRedo";
import { useProjectData } from "./useProjectData";
import { BlockData } from "@components/project/CanvasBlock";
import type { DraftsMap } from "@components/project/DraftsContext";
import {
  CORE_BLOCK_X,
  CORE_BLOCK_Y,
  DEFAULT_BLOCK_HEIGHT,
  DEFAULT_BLOCK_WIDTH,
} from "@components/project/utils/constants";
import { generateStateHash } from "@components/project/utils/hash";
import {
  computeLongestSideViewport,
  getNodesBoundsWithFallback,
  getReactFlowViewportSize,
} from "@components/project/utils/fitViewport";
import { computeHiddenNodeIds } from "@components/project/utils/visibility";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

const FIT_PADDING = 0.12;
const FIT_DURATION = 800;
const FIT_MIN_ZOOM = 0.1;
const FIT_MAX_ZOOM_SELECTED = 2;
const FIT_MAX_ZOOM_ALL = 1;
const SKETCH_BLOCK_WIDTH = 600;
const SKETCH_BLOCK_HEIGHT = 450;
const FOLDER_BLOCK_WIDTH = 320;
const FOLDER_BLOCK_HEIGHT = 240;
const FILE_BLOCK_WIDTH = 300;
const FILE_BLOCK_HEIGHT = 220;
const DROP_COL_GAP = 420;
const DROP_ROW_GAP = 280;

type DropImportProgress = {
  isImporting: boolean;
  total: number;
  processed: number;
};

type ImportNodeKind = "folder" | "text" | "file" | "sketch";

type PlannedImportNode = {
  path: string;
  parentPath: string;
  name: string;
  kind: ImportNodeKind;
  content?: string;
  metadata?: Record<string, unknown>;
};

type DroppedFileEntry = {
  path: string;
  file: File;
};

type DroppedEntries = {
  files: DroppedFileEntry[];
  directories: string[];
  hadDirectory: boolean;
  usedFlatFallback: boolean;
};

type ExcalidrawPayload = {
  elements?: unknown;
  files?: unknown;
  appState?: unknown;
};

type LegacyFileSystemEntry = {
  isFile: boolean;
  isDirectory: boolean;
  fullPath?: string;
  name: string;
};

type LegacyFileSystemFileEntry = LegacyFileSystemEntry & {
  isFile: true;
  file: (success: (file: File) => void, error?: (err: unknown) => void) => void;
};

type LegacyFileSystemDirectoryReader = {
  readEntries: (
    success: (entries: LegacyFileSystemEntry[]) => void,
    error?: (err: unknown) => void,
  ) => void;
};

type LegacyFileSystemDirectoryEntry = LegacyFileSystemEntry & {
  isDirectory: true;
  createReader: () => LegacyFileSystemDirectoryReader;
};

type LegacyDataTransferItem = DataTransferItem & {
  webkitGetAsEntry?: () => LegacyFileSystemEntry | null;
};

const normalizeDropPath = (value: string) =>
  value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

const getParentPath = (path: string) => {
  const normalized = normalizeDropPath(path);
  const index = normalized.lastIndexOf("/");
  return index < 0 ? "" : normalized.slice(0, index);
};

const getBaseName = (path: string) => {
  const normalized = normalizeDropPath(path);
  const index = normalized.lastIndexOf("/");
  return index < 0 ? normalized : normalized.slice(index + 1);
};

const stripExtension = (name: string) => name.replace(/\.[^/.]+$/, "");

const isMarkdownPath = (path: string) =>
  normalizeDropPath(path).toLowerCase().endsWith(".md");

const isExcalidrawPath = (path: string) =>
  normalizeDropPath(path).toLowerCase().endsWith(".excalidraw");

const listDirectoryEntries = async (
  directoryEntry: LegacyFileSystemDirectoryEntry,
): Promise<LegacyFileSystemEntry[]> => {
  const reader = directoryEntry.createReader();
  const result: LegacyFileSystemEntry[] = [];

  while (true) {
    const chunk = await new Promise<LegacyFileSystemEntry[]>(
      (resolve, reject) => {
        reader.readEntries(resolve, reject);
      },
    );

    if (!chunk.length) break;
    result.push(...chunk);
  }

  return result;
};

const readDroppedEntry = async (
  entry: LegacyFileSystemEntry,
  parentPath = "",
): Promise<{ files: DroppedFileEntry[]; directories: string[] }> => {
  const localPath = normalizeDropPath(
    parentPath ? `${parentPath}/${entry.name}` : entry.name,
  );

  if (entry.isFile) {
    const fileEntry = entry as LegacyFileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });
    return {
      files: [{ path: localPath, file }],
      directories: [],
    };
  }

  if (!entry.isDirectory) {
    return { files: [], directories: [] };
  }

  const directoryEntry = entry as LegacyFileSystemDirectoryEntry;
  const children = await listDirectoryEntries(directoryEntry);
  const files: DroppedFileEntry[] = [];
  const directories: string[] = [localPath];

  for (const child of children) {
    const read = await readDroppedEntry(child, localPath);
    files.push(...read.files);
    directories.push(...read.directories);
  }

  return { files, directories };
};

const collectDroppedEntries = async (
  dataTransfer: DataTransfer,
): Promise<DroppedEntries> => {
  const files: DroppedFileEntry[] = [];
  const directories = new Set<string>();
  let hadDirectory = false;

  const items = Array.from(dataTransfer.items || []);
  const webkitEntries = items
    .map(
      (item) =>
        ((item as LegacyDataTransferItem).webkitGetAsEntry?.() ||
          null) as LegacyFileSystemEntry | null,
    )
    .filter((entry): entry is LegacyFileSystemEntry => entry !== null);

  if (webkitEntries.length > 0) {
    for (const entry of webkitEntries) {
      const read = await readDroppedEntry(entry);
      read.files.forEach((value) => files.push(value));
      read.directories.forEach((path) => {
        if (path) directories.add(path);
      });
      if (entry.isDirectory || read.directories.length > 0) {
        hadDirectory = true;
      }
    }

    return {
      files,
      directories: Array.from(directories),
      hadDirectory,
      usedFlatFallback: false,
    };
  }

  const droppedFiles = Array.from(dataTransfer.files || []);
  for (const file of droppedFiles) {
    const relativePath = normalizeDropPath(
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
        file.name,
    );
    files.push({ path: relativePath, file });

    const segments = relativePath.split("/").filter(Boolean);
    if (segments.length > 1) {
      hadDirectory = true;
      let cursor = "";
      segments.slice(0, -1).forEach((segment) => {
        cursor = cursor ? `${cursor}/${segment}` : segment;
        directories.add(cursor);
      });
    }
  }

  return {
    files,
    directories: Array.from(directories),
    hadDirectory,
    usedFlatFallback: true,
  };
};

const isExcalidrawPayload = (
  value: unknown,
): value is {
  elements: unknown[];
  files?: Record<string, unknown>;
  appState?: Record<string, unknown>;
} => {
  if (!value || typeof value !== "object") return false;
  const payload = value as ExcalidrawPayload;
  return Array.isArray(payload.elements);
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const serializeSvgDataUri = (svg: SVGSVGElement) => {
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const xml = new XMLSerializer().serializeToString(svg);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
};

const buildExcalidrawPreviewSvgs = async (payload: {
  elements: unknown[];
  files?: Record<string, unknown>;
  appState?: Record<string, unknown>;
}) => {
  try {
    const { exportToSvg } = await import("@excalidraw/excalidraw");
    const elements =
      payload.elements as unknown as readonly ExcalidrawElement[];
    const files = (payload.files || {}) as unknown as BinaryFiles;
    const appState = isObjectRecord(payload.appState) ? payload.appState : {};

    const lightSvg = await exportToSvg({
      elements,
      files,
      appState: {
        ...appState,
        exportBackground: true,
        exportWithDarkMode: false,
      },
    });

    const darkSvg = await exportToSvg({
      elements,
      files,
      appState: {
        ...appState,
        exportBackground: true,
        exportWithDarkMode: true,
      },
    });

    return {
      svgLight: serializeSvgDataUri(lightSvg),
      svgDark: serializeSvgDataUri(darkSvg),
    };
  } catch {
    return {
      svgLight: undefined,
      svgDark: undefined,
    };
  }
};

const cleanBlockDataForSync = (
  data: Partial<BlockData>,
): Partial<BlockData> => {
  const rest = { ...data };
  delete rest.content;
  delete rest.yText;
  delete rest.typingUsers;
  delete rest.movingUserColor;
  delete rest.onContentChange;
  delete rest.onFocus;
  delete rest.onBlur;
  delete rest.onCaretMove;
  delete rest.onResize;
  delete rest.onResizeEnd;
  delete rest.currentUser;
  delete rest.initialProjectId;
  delete rest.projectOwnerId;
  const restAny = rest as unknown as Record<string, unknown>;
  delete restAny.drafts;
  delete restAny._yDoc;
  return rest;
};

export interface UserPresence {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl: string | null;
  color?: string;
  vimMode?: boolean;
  cursor?: { x: number; y: number; index?: number };
  isTyping?: boolean;
  typingBlockId?: string | null;
  draggingBlockId?: string | null;
  caretPosition?: number | null;
}

export const useProjectCanvasState = (
  initialProjectId: string | undefined,
  currentUser: UserPresence | null,
  currentUserRole: string | undefined,
  yBlocks: Y.Map<Node<BlockData>> | null,
  yLinks: Y.Map<Edge> | null,
  yContents: Y.Map<Y.Text> | null,
  yDoc: Y.Doc | null,
  awareness: Awareness | null,
  isLocalSynced: boolean = false,
  isRemoteSynced: boolean = false,
  onGraphMutation?: (intent: string) => void,
) => {
  const { dict } = useI18n();
  const { fitView, getZoom, zoomTo, setViewport, screenToFlowPosition } =
    useReactFlow();

  const applyLongestSideFit = useCallback(
    (targetBlocks: Node<BlockData>[], maxZoom: number) => {
      if (targetBlocks.length === 0) {
        fitView({
          duration: FIT_DURATION,
          maxZoom,
          padding: FIT_PADDING,
        });
        return;
      }

      const bounds = getNodesBoundsWithFallback(targetBlocks);
      const viewportSize = getReactFlowViewportSize();

      if (!bounds || !viewportSize) {
        fitView({
          nodes: targetBlocks,
          duration: FIT_DURATION,
          maxZoom,
          padding: FIT_PADDING,
        });
        return;
      }

      const nextViewport = computeLongestSideViewport(bounds, viewportSize, {
        padding: FIT_PADDING,
        minZoom: FIT_MIN_ZOOM,
        maxZoom,
      });

      setViewport(nextViewport, { duration: FIT_DURATION });
    },
    [fitView, setViewport],
  );

  const [blocks, setBlocksState] = useState<Node<BlockData>[]>([]);
  const [links, setLinksState] = useState<Edge[]>([]);
  const [draftsByBlock, setDraftsByBlock] = useState<DraftsMap>({});
  const [projectOwnerId, setProjectOwnerId] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewModeState] = useState(false);
  const [isExternalDropActive, setIsExternalDropActive] = useState(false);
  const [dropImportProgress, setDropImportProgress] =
    useState<DropImportProgress>({
      isImporting: false,
      total: 0,
      processed: 0,
    });
  const isPreviewModeRef = useRef(false);
  const externalDragDepthRef = useRef(0);

  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ideon-onboarding-seen") === "true";
  });

  const markOnboardingSeen = useCallback(() => {
    setHasSeenOnboarding(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("ideon-onboarding-seen", "true");
    }
  }, []);

  const setIsPreviewMode = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setIsPreviewModeState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        isPreviewModeRef.current = next;
        return next;
      });
    },
    [],
  );

  const isInitialized = useRef(false);
  const lastProjectId = useRef<string | null>(null);
  const lastSnapshotHash = useRef<string | null>(null);

  const isReadOnly = isPreviewMode || currentUserRole === "viewer";

  const { undo, redo, canUndo, canRedo, clear } = useUndoRedo(
    yBlocks?.doc || null,
    yBlocks,
    yLinks,
    yContents,
    isReadOnly,
  );

  useEffect(() => {
    if (!yBlocks || !yLinks || !yContents || isReadOnly) return;

    // Drafts map (flat): keys are `${blockId}::${clientId}` -> stringified draft
    const yDrafts: Y.Map<string> | null = yDoc
      ? (yDoc.getMap("drafts") as Y.Map<string>)
      : null;

    const updateBlocksFromYjs = (
      event: Y.YMapEvent<Node<BlockData>>,
      transaction: Y.Transaction,
    ) => {
      if (transaction.local && !(transaction.origin instanceof Y.UndoManager))
        return;

      const changes: Array<{
        key: string;
        action: "add" | "update" | "delete";
      }> = [];
      event.keysChanged.forEach((key) => {
        const change = event.changes.keys.get(key);
        if (change) {
          changes.push({ key, action: change.action });
        }
      });

      setBlocksState((prev) => {
        const next = [...prev];
        let hasChanges = false;

        changes.forEach(({ key, action }) => {
          const index = next.findIndex((n) => n.id === key);

          if (action === "add" || action === "update") {
            const rn = yBlocks.get(key);
            if (rn) {
              const yText = yContents.get(key);
              const syncedBlock = {
                ...rn,
                draggable: rn.type !== "core",
                deletable: rn.type !== "core",
                position:
                  rn.type === "core"
                    ? { x: CORE_BLOCK_X, y: CORE_BLOCK_Y }
                    : rn.position,
                data: {
                  ...(rn.data as unknown as Record<string, unknown>),
                  yText,
                  content: yText
                    ? yText.toString()
                    : (rn.data as unknown as { content?: string }).content ||
                      "",
                },
              };

              if (index >= 0) {
                next[index] = {
                  ...syncedBlock,
                  selected: next[index].selected,
                } as unknown as Node<BlockData>;
              } else {
                next.push({
                  ...syncedBlock,
                  selected: false,
                } as unknown as Node<BlockData>);
              }
              hasChanges = true;
            }
          } else if (action === "delete" && index >= 0) {
            next.splice(index, 1);
            hasChanges = true;
          }
        });

        return hasChanges ? next : prev;
      });
      isInitialized.current = true;
    };

    const updateLinksFromYjs = (
      event: Y.YMapEvent<Edge>,
      transaction: Y.Transaction,
    ) => {
      if (transaction.local && !(transaction.origin instanceof Y.UndoManager))
        return;

      const changes: Array<{
        key: string;
        action: "add" | "update" | "delete";
      }> = [];
      event.keysChanged.forEach((key) => {
        const change = event.changes.keys.get(key);
        if (change) {
          changes.push({ key, action: change.action });
        }
      });

      setLinksState((prev) => {
        const next = [...prev];
        let hasChanges = false;

        changes.forEach(({ key, action }) => {
          const index = next.findIndex((l) => l.id === key);

          if (action === "add" || action === "update") {
            const rl = yLinks.get(key);
            if (rl) {
              if (index >= 0) {
                const localData = next[index].data as Record<string, unknown>;
                const remoteData = rl.data as Record<string, unknown>;
                next[index] = {
                  ...rl,
                  selected: next[index].selected,
                  data: {
                    ...remoteData,
                    isEditing: localData?.isEditing,
                    onLabelSubmit: localData?.onLabelSubmit,
                    onLabelCancel: localData?.onLabelCancel,
                  },
                };
              } else {
                next.push({ ...rl, selected: false } as Edge);
              }
              hasChanges = true;
            }
          } else if (action === "delete" && index >= 0) {
            next.splice(index, 1);
            hasChanges = true;
          }
        });

        return hasChanges ? next : prev;
      });
    };

    const updateContentsFromYjs = (
      event: Y.YMapEvent<Y.Text>,
      transaction: Y.Transaction,
    ) => {
      if (transaction.local && !(transaction.origin instanceof Y.UndoManager))
        return;

      const keys = Array.from(event.keysChanged);

      setBlocksState((prev) => {
        const next = [...prev];
        let hasChanges = false;

        keys.forEach((key) => {
          const index = next.findIndex((n) => n.id === key);
          if (index >= 0) {
            const yText = yContents.get(key);
            if (
              yText &&
              (next[index].data.yText !== yText ||
                next[index].data.content !== yText.toString())
            ) {
              next[index] = {
                ...next[index],
                data: {
                  ...next[index].data,
                  yText,
                  content: yText ? yText.toString() : next[index].data.content,
                },
              };
              hasChanges = true;
            }
          }
        });

        return hasChanges ? next : prev;
      });
    };

    const updateDraftsFromYjs = () => {
      const map: DraftsMap = {};
      if (yDrafts) {
        yDrafts.forEach((v, k) => {
          const parts = String(k).split("::");
          if (parts.length < 2) return;
          const blockId = parts[0];
          const clientId = parts[1];
          try {
            const parsed = typeof v === "string" ? JSON.parse(v) : v;
            map[blockId] = map[blockId] || {};
            map[blockId][clientId] = parsed;
          } catch {
            map[blockId] = map[blockId] || {};
            map[blockId][clientId] = v as unknown as Record<string, unknown>;
          }
        });
      }
      setDraftsByBlock(map);
    };

    yBlocks.observe(updateBlocksFromYjs);
    yLinks.observe(updateLinksFromYjs);
    yContents.observe(updateContentsFromYjs);
    if (yDrafts) yDrafts.observe(updateDraftsFromYjs);

    // Initial sync
    const initialBlocks = Array.from(yBlocks.values());
    const initialLinks = Array.from(yLinks.values());

    setBlocksState(
      initialBlocks.map((rn) => {
        const yText = yContents.get(rn.id);
        return {
          ...rn,
          selected: false,
          draggable: rn.type !== "core",
          deletable: rn.type !== "core",
          position:
            rn.type === "core"
              ? { x: CORE_BLOCK_X, y: CORE_BLOCK_Y }
              : rn.position,
          data: {
            ...(rn.data as unknown as Record<string, unknown>),
            yText,
            content: yText
              ? yText.toString()
              : (rn.data as unknown as { content?: string }).content || "",
          },
        } as Node<BlockData>;
      }),
    );

    setLinksState(initialLinks.map((rl) => ({ ...rl, selected: false })));

    // Initialize drafts state from Yjs drafts map
    const initialDrafts: DraftsMap = {};
    if (yDrafts) {
      yDrafts.forEach((v, k) => {
        const parts = String(k).split("::");
        if (parts.length < 2) return;
        const blockId = parts[0];
        const clientId = parts[1];
        try {
          const parsed = typeof v === "string" ? JSON.parse(v) : v;
          initialDrafts[blockId] = initialDrafts[blockId] || {};
          initialDrafts[blockId][clientId] = parsed;
        } catch {
          initialDrafts[blockId] = initialDrafts[blockId] || {};
          initialDrafts[blockId][clientId] = v as unknown as Record<
            string,
            unknown
          >;
        }
      });
    }
    setDraftsByBlock(initialDrafts);

    if (initialBlocks.length > 0 || initialLinks.length > 0) {
      isInitialized.current = true;
      setTimeout(() => {
        handleFitView();
      }, 100);
    }

    return () => {
      yBlocks.unobserve(updateBlocksFromYjs);
      yLinks.unobserve(updateLinksFromYjs);
      yContents.unobserve(updateContentsFromYjs);
      if (yDrafts) yDrafts.unobserve(updateDraftsFromYjs);
    };
  }, [yBlocks, yLinks, yContents, isPreviewMode, applyLongestSideFit]);

  const setBlocks = useCallback(
    (
      update:
        | Node<BlockData>[]
        | ((nds: Node<BlockData>[]) => Node<BlockData>[]),
    ) => {
      if (!yBlocks || !yContents) return;

      setBlocksState((prev) => {
        const nextBlocks = (
          typeof update === "function" ? update(prev) : update
        ).map((n) =>
          n.type === "core"
            ? { ...n, position: { x: CORE_BLOCK_X, y: CORE_BLOCK_Y } }
            : n,
        );

        const enrichedNextBlocks = nextBlocks;

        if (!isPreviewModeRef.current) {
          yBlocks.doc?.transact(() => {
            nextBlocks.forEach((block) => {
              const blockToSync = { ...block };

              if (currentUserRole === "viewer") {
                const existing = yBlocks.get(block.id);
                if (!existing) return;

                const existingData = existing.data || {};
                const newData = blockToSync.data || {};

                blockToSync.position = existing.position;
                blockToSync.width = existing.width;
                blockToSync.height = existing.height;
                blockToSync.type = existing.type;

                blockToSync.data = {
                  ...existingData,
                  reactions: newData.reactions,
                  updatedAt: newData.updatedAt,
                  lastEditor: newData.lastEditor,
                };
              }

              delete blockToSync.selected;

              if (!yContents.has(block.id)) {
                const yText = new Y.Text();
                const initialContent = (block.data?.content as string) || "";
                if (initialContent) {
                  yText.insert(0, initialContent);
                }
                yContents.set(block.id, yText);
              }

              const blockData = cleanBlockDataForSync(
                (blockToSync.data as Partial<BlockData>) || {},
              );

              const cleanBlockToSync = {
                ...blockToSync,
                data: blockData,
              };

              const existing = yBlocks.get(block.id);
              const isSummaryUpdate = !!cleanBlockToSync.data?.isSummary;
              const isExistingDetailed = existing && !existing.data?.isSummary;

              if (isSummaryUpdate && isExistingDetailed) {
                return;
              }
              const isUpgradeToDetailed =
                !isSummaryUpdate && existing?.data?.isSummary;
              if (isUpgradeToDetailed) {
                const currentYText = yContents.get(block.id);
                const newContent = (block.data?.content as string) || "";
                if (
                  currentYText &&
                  currentYText.toString() === "" &&
                  newContent !== ""
                ) {
                  currentYText.delete(0, currentYText.length);
                  currentYText.insert(0, newContent);
                }
              }

              const hasChanged =
                !existing ||
                existing.position.x !== cleanBlockToSync.position.x ||
                existing.position.y !== cleanBlockToSync.position.y ||
                existing.width !== cleanBlockToSync.width ||
                existing.height !== cleanBlockToSync.height ||
                JSON.stringify(existing.data) !==
                  JSON.stringify(cleanBlockToSync.data);

              if (hasChanged) {
                yBlocks.set(block.id, cleanBlockToSync as Node<BlockData>);
              }
            });
          }, yBlocks.doc.clientID);
        }

        // Return blocks
        return enrichedNextBlocks as unknown as Node<BlockData>[];
      });
    },
    [yBlocks, yContents],
  );

  const deleteBlocks = useCallback(
    (ids: string[]) => {
      if (!yBlocks || !yContents || isReadOnly) return;

      yBlocks.doc?.transact(() => {
        ids.forEach((id) => {
          yBlocks.delete(id);
          yContents.delete(id);
        });
      }, yBlocks.doc.clientID);

      setBlocksState((prev) => prev.filter((n) => !ids.includes(n.id)));
    },
    [yBlocks, yContents],
  );

  const setLinks = useCallback(
    (update: Edge[] | ((lks: Edge[]) => Edge[])) => {
      if (!yLinks) return;

      setLinksState((prev) => {
        const nextLinks = typeof update === "function" ? update(prev) : update;

        if (!isPreviewModeRef.current && currentUserRole !== "viewer") {
          yLinks.doc?.transact(() => {
            nextLinks.forEach((link) => {
              const linkToSync = { ...link };
              delete linkToSync.selected;

              const cleanData = {
                ...((link.data as Record<string, unknown>) || {}),
              };
              delete cleanData.isEditing;
              delete cleanData.onLabelSubmit;
              delete cleanData.onLabelCancel;

              linkToSync.data = cleanData;

              const existing = yLinks.get(link.id);
              const hasChanged =
                !existing ||
                JSON.stringify(existing) !== JSON.stringify(linkToSync);

              if (hasChanged) {
                yLinks.set(link.id, linkToSync as Edge);
              }
            });
          }, yLinks.doc.clientID);
        }

        return nextLinks;
      });
    },
    [yLinks],
  );

  const deleteLinks = useCallback(
    (ids: string[]) => {
      if (!yLinks || isReadOnly) return;

      yLinks.doc?.transact(() => {
        ids.forEach((id) => {
          yLinks.delete(id);
        });
      }, yLinks.doc.clientID);

      setLinksState((prev) => prev.filter((l) => !ids.includes(l.id)));
    },
    [yLinks],
  );

  const replaceGraph = useCallback(
    (newBlocks: Node<BlockData>[], newLinks: Edge[]) => {
      if (!yBlocks || !yLinks || !yContents || isReadOnly) return;

      yBlocks.doc?.transact(() => {
        // 1. Delete everything in Yjs
        Array.from(yBlocks.keys()).forEach((id) => yBlocks.delete(id));
        Array.from(yLinks.keys()).forEach((id) => yLinks.delete(id));
        Array.from(yContents.keys()).forEach((id) => yContents.delete(id));

        // 2. Set new blocks and links in local state first to avoid flickering
        const sanitizedBlocks = newBlocks.map((n) =>
          n.type === "core"
            ? { ...n, position: { x: CORE_BLOCK_X, y: CORE_BLOCK_Y } }
            : n,
        );
        setBlocksState(sanitizedBlocks);
        setLinksState(newLinks);

        // 3. Add new blocks to Yjs (setBlocks will be called by effects, but we can do it here for atomicity)
        sanitizedBlocks.forEach((block) => {
          const blockToSync = { ...block };
          delete blockToSync.selected;

          const yText = new Y.Text();
          const initialContent = (block.data?.content as string) || "";
          if (initialContent) {
            yText.insert(0, initialContent);
          }
          yContents.set(block.id, yText);

          const blockData = cleanBlockDataForSync(
            (blockToSync.data as Partial<BlockData>) || {},
          );

          const cleanBlockToSync = { ...blockToSync, data: blockData };
          yBlocks.set(block.id, cleanBlockToSync as Node<BlockData>);
        });

        newLinks.forEach((link) => {
          const linkToSync = { ...link };
          delete linkToSync.selected;
          yLinks.set(link.id, linkToSync as Edge);
        });
      }, yBlocks.doc.clientID);

      clear();
    },
    [yBlocks, yLinks, yContents, clear],
  );

  // Drafts API: keep drafts in separate state to avoid polluting BlockData
  const getDraftsForBlock = useCallback(
    (blockId: string) => draftsByBlock[blockId],
    [draftsByBlock],
  );

  // Refs for debounced draft commits
  const draftTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pendingDraftsRef = useRef<Map<string, string | null>>(new Map());

  // Flush any pending drafts on unmount to ensure final state is persisted.
  useEffect(() => {
    return () => {
      if (!yDoc) return;
      const yDrafts = yDoc.getMap("drafts") as Y.Map<string> | undefined;
      if (!yDrafts) return;
      pendingDraftsRef.current.forEach((payload, key) => {
        try {
          if (payload === null) {
            yDoc.transact(() => yDrafts.delete(key), yDoc.clientID);
          } else if (typeof payload === "string") {
            yDoc.transact(() => yDrafts.set(key, payload), yDoc.clientID);
          }
        } catch {
          // ignore
        }
      });
      pendingDraftsRef.current.clear();
      draftTimersRef.current.forEach((t) => clearTimeout(t));
      draftTimersRef.current.clear();
    };
  }, [yDoc]);

  const writeDraft = useCallback(
    (
      blockId: string,
      clientId: string,
      draft: Record<string, unknown> | null,
    ) => {
      if (!yDoc) return;
      // Debounced draft writer: batch frequent pointer-move updates to avoid
      // overwhelming the websocket with tiny updates. Deletes are applied
      // immediately to ensure ephemeral drafts are removed on pointerUp.
      try {
        const yDrafts = yDoc.getMap("drafts") as Y.Map<string> | undefined;
        if (!yDrafts) return;
        const key = `${blockId}::${clientId}`;

        // init refs for debounce timers and pending payloads
        if (!(draftTimersRef.current instanceof Map)) {
          draftTimersRef.current = new Map<string, NodeJS.Timeout>();
        }
        if (!(pendingDraftsRef.current instanceof Map)) {
          pendingDraftsRef.current = new Map<string, string | null>();
        }

        // If deleting, apply immediately and clear any pending timer.
        if (draft === null) {
          const timer = draftTimersRef.current.get(key);
          if (timer) {
            clearTimeout(timer);
            draftTimersRef.current.delete(key);
            pendingDraftsRef.current.delete(key);
          }
          yDoc.transact(() => {
            yDrafts.delete(key);
          }, yDoc.clientID);
          return;
        }

        // Otherwise schedule a short debounce before committing the draft.
        pendingDraftsRef.current.set(key, JSON.stringify(draft));
        const existing = draftTimersRef.current.get(key);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          const payload = pendingDraftsRef.current.get(key);
          pendingDraftsRef.current.delete(key);
          draftTimersRef.current.delete(key);
          if (typeof payload === "string") {
            try {
              yDoc.transact(() => {
                yDrafts.set(key, payload);
              }, yDoc.clientID);
            } catch {
              // ignore
            }
          }
        }, 10);
        draftTimersRef.current.set(key, timer);
      } catch {
        // ignore
      }
    },
    [yDoc],
  );

  const deleteDraft = useCallback(
    (blockId: string, clientId: string) => writeDraft(blockId, clientId, null),
    [writeDraft],
  );

  const [isLoading, setIsLoading] = useState(false);
  const [blockToDelete, setBlockToDelete] = useState<string | null>(null);
  const [blocksToDelete, setBlocksToDelete] = useState<string[]>([]);
  const [zoom, setZoom] = useState(100);
  const [contextMenu, setContextMenu] = useState<{
    id?: string;
    type: "block" | "pane" | "edge";
    top: number;
    left: number;
  } | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [transferBlock, setTransferBlock] = useState<Node<BlockData> | null>(
    null,
  );
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  const [shareCursor, setShareCursorState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("ideonShareCursor");
    return saved === null ? true : saved === "true";
  });

  const setShareCursor = useCallback((val: boolean) => {
    setShareCursorState(val);
    localStorage.setItem("ideonShareCursor", String(val));
  }, []);

  const handleExitPreview = useCallback(() => {
    setIsPreviewMode(false);

    if (yBlocks && yLinks && yContents) {
      const initialBlocks = Array.from(yBlocks.values());
      const initialLinks = Array.from(yLinks.values());

      setBlocksState(
        initialBlocks.map((rn) => {
          const yText = yContents.get(rn.id);
          return {
            ...rn,
            selected: false,
            draggable: rn.type !== "core",
            deletable: rn.type !== "core",
            position:
              rn.type === "core"
                ? { x: CORE_BLOCK_X, y: CORE_BLOCK_Y }
                : rn.position,
            data: {
              ...rn.data,
              yText,
              content: yText ? yText.toString() : rn.data?.content || "",
            },
          } as Node<BlockData>;
        }),
      );

      setLinksState(initialLinks.map((rl) => ({ ...rl, selected: false })));
    }
  }, [yBlocks, yLinks, yContents]);

  const handleSaveState = useCallback(
    async (
      intent?: string,
      overrideBlocks?: Node<BlockData>[],
      overrideLinks?: Edge[],
      options?: { isAuto?: boolean },
    ): Promise<boolean> => {
      if (!initialProjectId || isReadOnly) return false;
      const isAuto = options?.isAuto ?? false;
      try {
        const blocksToSave = (overrideBlocks || blocks).map((n) => ({
          ...n,
          data: {
            ...n.data,
            content: n.data.yText ? n.data.yText.toString() : n.data.content,
          },
        }));

        const currentHash = await generateStateHash(
          blocksToSave,
          overrideLinks || links,
        );

        if (lastSnapshotHash.current === currentHash) {
          if (!isAuto) {
            toast.info(dict.modals.noChanges || "No changes to save");
          }
          return false;
        }

        const res = await fetch(`/api/projects/${initialProjectId}/temporal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            blocks: blocksToSave,
            links: overrideLinks || links,
            intent,
            isAuto,
          }),
        });

        if (!res.ok) {
          if (!isAuto) {
            if (res.status === 403) {
              toast.error(dict.auth.unauthorized || "Unauthorized action");
            } else {
              toast.error(dict.modals.saveError || "Failed to save changes");
            }
          }
          return false;
        }

        lastSnapshotHash.current = currentHash;
        return true;
      } catch {
        if (!isAuto) {
          toast.error(dict.modals.saveError || "Failed to save changes");
        }
        return false;
      }
    },
    [initialProjectId, blocks, links],
  );

  const handleDeleteState = useCallback(
    async (stateId: string) => {
      if (!initialProjectId) return;
      try {
        const res = await fetch(`/api/projects/${initialProjectId}/temporal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "delete",
            stateId,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          toast.error(
            err.message ||
              dict.modals.deleteError ||
              "Failed to delete snapshot",
          );
          return;
        }

        toast.success(
          dict.modals.snapshotDeleted || "Snapshot deleted successfully",
        );
      } catch {
        toast.error(dict.modals.deleteError || "Failed to delete snapshot");
      }
    },
    [initialProjectId, dict.common],
  );

  const handleRenameState = useCallback(
    async (stateId: string, newIntent: string) => {
      if (!initialProjectId || !newIntent.trim()) return;
      try {
        const response = await fetch(
          `/api/projects/${initialProjectId}/temporal`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "update",
              stateId,
              intent: newIntent.trim(),
            }),
          },
        );

        if (!response.ok) {
          const err = await response.json();
          throw new Error(
            err.message || dict.common.error || "Failed to rename",
          );
        }
      } catch {
        toast.error(dict.common.error || "Failed to rename snapshot");
      }
    },
    [initialProjectId, dict.common],
  );

  const rt = useProjectCanvasRealtime(awareness, currentUser, shareCursor);

  const mousePosRef = useRef({ x: 0, y: 0 });

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
      rt.onPointerMove(e);
    },
    [rt.onPointerMove],
  );

  const graph = useProjectCanvasGraph({
    currentUser,
    blocks,
    links,
    setBlocks,
    setLinks,
    deleteBlocks,
    deleteLinks,
    updateMyPresence: rt.updateMyPresence,
    setContextMenu,
    contextMenu,
    isReadOnly: isPreviewMode || currentUserRole === "viewer",
  });

  const handleCreateBlockWrapper = useCallback(
    (
      ...args: Parameters<typeof graph.handleCreateBlock>
    ): ReturnType<typeof graph.handleCreateBlock> => {
      if (!hasSeenOnboarding) {
        markOnboardingSeen();
      }
      const id = graph.handleCreateBlock(...args);
      if (id) onGraphMutation?.("Block created");
      return id;
    },
    [graph, hasSeenOnboarding, markOnboardingSeen, onGraphMutation],
  );

  const buildImportBlock = useCallback(
    (
      planned: PlannedImportNode,
      position: { x: number; y: number },
      ownerName: string,
    ): Node<BlockData> => {
      const id = crypto.randomUUID();
      const isSketch = planned.kind === "sketch";
      const isFolder = planned.kind === "folder";
      const isFile = planned.kind === "file";

      const width = isSketch
        ? SKETCH_BLOCK_WIDTH
        : isFolder
          ? FOLDER_BLOCK_WIDTH
          : isFile
            ? FILE_BLOCK_WIDTH
            : DEFAULT_BLOCK_WIDTH;
      const height = isSketch
        ? SKETCH_BLOCK_HEIGHT
        : isFolder
          ? FOLDER_BLOCK_HEIGHT
          : isFile
            ? FILE_BLOCK_HEIGHT
            : DEFAULT_BLOCK_HEIGHT;

      const blockType = planned.kind === "folder" ? "folder" : planned.kind;
      const metadata = planned.metadata
        ? JSON.stringify(planned.metadata)
        : undefined;
      const content =
        planned.kind === "folder"
          ? planned.name
          : planned.content || planned.name;

      return {
        id,
        type: blockType,
        position,
        width,
        height,
        style: { width, height },
        data: {
          title: planned.name,
          content,
          metadata,
          ownerId: currentUser?.id,
          authorName: ownerName,
          authorColor: currentUser?.color,
          blockType,
          isLocked: false,
          updatedAt: new Date().toISOString(),
          lastEditor: ownerName,
          isEditingLink: false,
          isEditingGithub: false,
        },
      };
    },
    [currentUser],
  );

  const handleExternalDrop = useCallback(
    async (event: React.DragEvent) => {
      if (isReadOnly || !initialProjectId || !currentUser) return;

      const transfer = event.dataTransfer;
      if (!transfer) return;

      const transferTypes = Array.from(transfer.types || []);
      if (!transferTypes.includes("Files")) return;

      event.preventDefault();
      externalDragDepthRef.current = 0;
      setIsExternalDropActive(false);

      setDropImportProgress({
        isImporting: true,
        total: 0,
        processed: 0,
      });

      try {
        const dropPoint = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        const dropped = await collectDroppedEntries(transfer);
        if (!dropped.files.length && !dropped.directories.length) {
          return;
        }

        setDropImportProgress((prev) => ({
          ...prev,
          total: dropped.files.length,
          processed: 0,
        }));

        if (dropped.hadDirectory && dropped.usedFlatFallback) {
          toast.info(
            dict.canvas.dropFolderFallback ||
              "Folder recursion is limited in this browser; importing available files only.",
          );
        }

        const planned = new Map<string, PlannedImportNode>();
        const failedPaths: string[] = [];
        let processedCount = 0;

        for (const fileEntry of dropped.files) {
          const normalizedPath = normalizeDropPath(
            fileEntry.path || fileEntry.file.name,
          );
          if (!normalizedPath) {
            processedCount += 1;
            setDropImportProgress((prev) => ({
              ...prev,
              processed: processedCount,
            }));
            continue;
          }

          const baseName = getBaseName(normalizedPath);
          const displayName = stripExtension(baseName) || baseName;

          if (isMarkdownPath(normalizedPath)) {
            const content = await fileEntry.file.text();
            planned.set(normalizedPath, {
              path: normalizedPath,
              parentPath: getParentPath(normalizedPath),
              name: displayName,
              kind: "text",
              content,
              metadata: {
                sourcePath: normalizedPath,
                kind: "drop-markdown",
              },
            });
            processedCount += 1;
            setDropImportProgress((prev) => ({
              ...prev,
              processed: processedCount,
            }));
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            continue;
          }

          if (isExcalidrawPath(normalizedPath)) {
            try {
              const raw = await fileEntry.file.text();
              const parsed = JSON.parse(raw) as unknown;

              if (!isExcalidrawPayload(parsed)) {
                throw new Error("Invalid Excalidraw payload");
              }

              const previews = await buildExcalidrawPreviewSvgs(parsed);

              planned.set(normalizedPath, {
                path: normalizedPath,
                parentPath: getParentPath(normalizedPath),
                name: displayName,
                kind: "sketch",
                metadata: {
                  sourcePath: normalizedPath,
                  kind: "drop-excalidraw",
                  excalidrawElements: parsed.elements,
                  excalidrawFiles: parsed.files || {},
                  excalidrawSvg: previews.svgLight,
                  excalidrawSvgLight: previews.svgLight,
                  excalidrawSvgDark: previews.svgDark,
                },
              });
            } catch {
              failedPaths.push(normalizedPath);
            }

            processedCount += 1;
            setDropImportProgress((prev) => ({
              ...prev,
              processed: processedCount,
            }));
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            continue;
          }

          const formData = new FormData();
          formData.append("file", fileEntry.file);

          try {
            const res = await fetch(`/api/projects/${initialProjectId}/files`, {
              method: "POST",
              body: formData,
            });

            if (!res.ok) {
              throw new Error("upload-failed");
            }

            const uploaded = await res.json();
            planned.set(normalizedPath, {
              path: normalizedPath,
              parentPath: getParentPath(normalizedPath),
              name: uploaded.name || baseName,
              kind: "file",
              content: uploaded.name || baseName,
              metadata: {
                name: uploaded.name || baseName,
                size: uploaded.size ?? fileEntry.file.size,
                type: uploaded.type ?? fileEntry.file.type,
                lastModified: fileEntry.file.lastModified,
                status: "success",
                sourcePath: normalizedPath,
              },
            });
          } catch {
            failedPaths.push(normalizedPath);
          }

          processedCount += 1;
          setDropImportProgress((prev) => ({
            ...prev,
            processed: processedCount,
          }));
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }

        const folderPaths = new Set(
          dropped.directories
            .map((path) => normalizeDropPath(path))
            .filter(Boolean),
        );

        planned.forEach((node) => {
          let cursor = node.parentPath;
          while (cursor) {
            folderPaths.add(cursor);
            cursor = getParentPath(cursor);
          }
        });

        folderPaths.forEach((folderPath) => {
          if (planned.has(folderPath)) return;
          planned.set(folderPath, {
            path: folderPath,
            parentPath: getParentPath(folderPath),
            name: getBaseName(folderPath),
            kind: "folder",
            content: getBaseName(folderPath),
            metadata: {
              isCollapsed: false,
              sourcePath: folderPath,
              kind: "drop-folder",
            },
          });
        });

        const allNodes = Array.from(planned.values()).sort((left, right) => {
          if (left.parentPath === right.path) return 1;
          if (right.parentPath === left.path) return -1;
          if (left.kind === "folder" && right.kind !== "folder") return -1;
          if (right.kind === "folder" && left.kind !== "folder") return 1;
          return left.path.localeCompare(right.path);
        });

        const childrenByParent = new Map<string, PlannedImportNode[]>();
        allNodes.forEach((node) => {
          const key = node.parentPath;
          const group = childrenByParent.get(key) || [];
          group.push(node);
          childrenByParent.set(key, group);
        });

        const createdByPath = new Map<string, Node<BlockData>>();
        const newNodes: Node<BlockData>[] = [];
        const newLinks: Edge[] = [];
        const ownerName =
          currentUser.displayName ||
          currentUser.username ||
          dict.project.anonymous;
        let rowIndex = 0;

        const walk = (parentPath: string, depth: number) => {
          const children = childrenByParent.get(parentPath) || [];
          children.sort((a, b) => {
            if (a.kind === "folder" && b.kind !== "folder") return -1;
            if (b.kind === "folder" && a.kind !== "folder") return 1;
            return a.name.localeCompare(b.name);
          });

          children.forEach((node) => {
            const created = buildImportBlock(
              node,
              {
                x: dropPoint.x + depth * DROP_COL_GAP,
                y: dropPoint.y + rowIndex * DROP_ROW_GAP,
              },
              ownerName,
            );
            rowIndex += 1;

            createdByPath.set(node.path, created);
            newNodes.push(created);

            if (node.parentPath && createdByPath.has(node.parentPath)) {
              const parent = createdByPath.get(node.parentPath)!;
              const isRight = created.position.x >= parent.position.x;

              newLinks.push({
                id: crypto.randomUUID(),
                source: parent.id,
                target: created.id,
                type: "connection",
                sourceHandle: isRight ? "right" : "left",
                targetHandle: isRight ? "left" : "right",
                markerEnd: "connection-arrow",
                data: {
                  relationType:
                    parent.type === "folder" ? "folder" : "contains",
                },
              });
            }

            walk(node.path, depth + 1);
          });
        };

        walk("", 0);

        if (!newNodes.length) {
          toast.error(dict.canvas.dropImportError || "Import failed");
          return;
        }

        setBlocks((prev) => [...prev, ...newNodes]);
        setLinks((prev) => [...prev, ...newLinks]);

        if (!hasSeenOnboarding) {
          markOnboardingSeen();
        }

        const importedCount = newNodes.length;
        if (failedPaths.length > 0) {
          toast.warning(
            (
              dict.canvas.dropImportPartial ||
              "Imported {count} items. Some files could not be imported."
            ).replace("{count}", String(importedCount)),
          );
        } else {
          toast.success(
            (dict.canvas.dropImportSuccess || "Imported {count} items").replace(
              "{count}",
              String(importedCount),
            ),
          );
        }

        onGraphMutation?.("Dropped import created");
      } finally {
        setDropImportProgress({
          isImporting: false,
          total: 0,
          processed: 0,
        });
      }
    },
    [
      isReadOnly,
      initialProjectId,
      currentUser,
      screenToFlowPosition,
      dict,
      setBlocks,
      setLinks,
      buildImportBlock,
      hasSeenOnboarding,
      markOnboardingSeen,
      onGraphMutation,
    ],
  );

  const onExternalDragEnter = useCallback((event: React.DragEvent) => {
    const transfer = event.dataTransfer;
    if (!transfer) return;
    const hasFiles = Array.from(transfer.types || []).includes("Files");
    if (!hasFiles) return;

    event.preventDefault();
    externalDragDepthRef.current += 1;
    setIsExternalDropActive(true);
  }, []);

  const onExternalDragLeave = useCallback((event: React.DragEvent) => {
    const transfer = event.dataTransfer;
    if (!transfer) return;
    const hasFiles = Array.from(transfer.types || []).includes("Files");
    if (!hasFiles) return;

    externalDragDepthRef.current = Math.max(
      0,
      externalDragDepthRef.current - 1,
    );
    if (externalDragDepthRef.current === 0) {
      setIsExternalDropActive(false);
    }
  }, []);

  const onExternalDragOver = useCallback(
    (event: React.DragEvent) => {
      const transfer = event.dataTransfer;
      if (!transfer) return;
      const hasFiles = Array.from(transfer.types || []).includes("Files");
      if (!hasFiles) return;

      event.preventDefault();
      transfer.dropEffect = "copy";
      if (!isExternalDropActive) {
        setIsExternalDropActive(true);
      }
    },
    [isExternalDropActive],
  );

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          (activeElement as HTMLElement).isContentEditable)
      ) {
        return;
      }

      const pos = screenToFlowPosition({
        x: mousePosRef.current.x,
        y: mousePosRef.current.y,
      });

      // 3. Check for Files (Images)
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        e.preventDefault();
        const file = e.clipboardData.files[0];
        if (!initialProjectId) return;

        // Create block immediately with "uploading" state
        const tempUrl = URL.createObjectURL(file);
        const initialMetadata = {
          name: file.name,
          type: file.type,
          size: file.size,
          lastModified: file.lastModified,
          status: "uploading",
          tempUrl: tempUrl,
        };

        const blockId = handleCreateBlockWrapper(
          pos,
          undefined,
          "file",
          file.name,
          initialMetadata,
        );

        if (!blockId) return;

        // Upload in background
        const formData = new FormData();
        formData.append("file", file);

        try {
          const res = await fetch(`/api/projects/${initialProjectId}/files`, {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            const fileData = await res.json();
            const newMetadata = {
              name: fileData.name,
              size: fileData.size,
              type: fileData.type,
              lastModified: file.lastModified,
              status: "success",
              url: fileData.url,
            };

            // Update block with real data
            setBlocks((blocks) =>
              blocks.map((b) =>
                b.id === blockId
                  ? {
                      ...b,
                      data: {
                        ...b.data,
                        metadata: JSON.stringify(newMetadata),
                        content: fileData.name,
                      },
                    }
                  : b,
              ),
            );
          } else {
            toast.error(dict.blocks.uploadError || "Upload failed");
          }
        } catch (error) {
          console.error("Paste upload error:", error);
          toast.error(dict.blocks.uploadError || "Upload failed");
        }
        return;
      }

      // 4. Check for Text content
      const text = e.clipboardData?.getData("text");
      if (!text) return;

      e.preventDefault();

      // Git Provider Detection
      const gitRegex = /^https?:\/\/(github\.com|gitlab\.com)\/[\w-]+\/[\w.-]+/;
      if (gitRegex.test(text)) {
        handleCreateBlockWrapper(pos, undefined, "github", text);
        return;
      }

      // Generic URL Detection (Figma, etc.)
      const urlRegex = /^https?:\/\//;
      if (urlRegex.test(text)) {
        handleCreateBlockWrapper(pos, undefined, "link", text);
        return;
      }

      // Fallback: Text Block
      handleCreateBlockWrapper(pos, undefined, "text", text);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [
    handleCreateBlockWrapper,
    initialProjectId,
    dict,
    setBlocks,
    screenToFlowPosition,
  ]);

  // Effect to mark onboarding as seen if non-core blocks exist (e.g. from load or import)
  useEffect(() => {
    if (hasSeenOnboarding) return;

    const hasNonCoreContent = blocks.some((b) => b.type !== "core");
    if (hasNonCoreContent) {
      markOnboardingSeen();
    }
  }, [blocks, hasSeenOnboarding, markOnboardingSeen]);

  const blocksRef = useRef(blocks);
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  const io = useProjectData({
    initialProjectId,
    blocks,
    links,
    setBlocks,
    setLinks,
    replaceGraph,
    setIsPreviewMode,
    setSelectedStateId,
    setIsLoading,
    isInitialized,
    isPreviewMode,
    setProjectOwnerId,
    handleExitPreview,
  });

  const checkVisibleBlocks = useCallback(
    (viewport: { x: number; y: number; zoom: number }) => {
      if (typeof window === "undefined") return;

      const visibleIds: string[] = [];
      const vx = -viewport.x / viewport.zoom;
      const vy = -viewport.y / viewport.zoom;
      const vw = window.innerWidth / viewport.zoom;
      const vh = window.innerHeight / viewport.zoom;

      // Expand viewport slightly to pre-load
      const margin = 500;
      const rect = {
        x: vx - margin,
        y: vy - margin,
        w: vw + margin * 2,
        h: vh + margin * 2,
      };

      blocksRef.current.forEach((b) => {
        if (b.data?.isSummary) {
          if (
            b.position.x < rect.x + rect.w &&
            b.position.x + (b.width || DEFAULT_BLOCK_WIDTH) > rect.x &&
            b.position.y < rect.y + rect.h &&
            b.position.y + (b.height || 100) > rect.y // approx height if missing
          ) {
            visibleIds.push(b.id);
          }
        }
      });

      if (visibleIds.length > 0) {
        io.fetchBlockDetails(visibleIds);
      }
    },
    [io.fetchBlockDetails],
  );

  const debouncedCheckVisibleBlocks = useMemo(() => {
    let timeout: NodeJS.Timeout;
    return (v: { x: number; y: number; zoom: number }) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => checkVisibleBlocks(v), 300);
    };
  }, [checkVisibleBlocks]);

  const blocksWithPresence = useMemo(() => {
    const processedBlocks = blocks.map((block) => {
      const typingUsers = rt.presenceUsers.filter(
        (u) =>
          u.isTyping &&
          u.typingBlockId === block.id &&
          u.id !== currentUser?.id,
      );
      const movingUser = rt.presenceUsers.find(
        (u) => u.draggingBlockId === block.id && u.id !== currentUser?.id,
      );
      const isLocked = !!block.data?.isLocked;
      const isOwner = currentUser?.id && block.data?.ownerId === currentUser.id;
      const isProjectOwner =
        currentUser?.id && projectOwnerId === currentUser.id;
      const canManage = isOwner || isProjectOwner;
      const yText = yContents?.get(block.id);

      return {
        ...block,
        draggable: isPreviewMode ? false : isLocked ? !!isOwner : true,
        selectable: !isPreviewMode,
        deletable: isPreviewMode ? false : !!canManage,
        data: {
          ...block.data,
          isPreviewMode,
          yText,
          typingUsers: isPreviewMode ? [] : typingUsers,
          movingUserColor: movingUser?.color,
          projectOwnerId,
          initialProjectId,
          currentUser: currentUser
            ? { id: currentUser.id, username: currentUser.username }
            : undefined,
          onContentChange: isPreviewMode ? undefined : graph.onContentChange,
          onFocus: isPreviewMode ? undefined : rt.onFocus,
          onBlur: isPreviewMode ? undefined : rt.onBlur,
          onCaretMove: isPreviewMode ? undefined : rt.onCaretMove,
          onResize: isPreviewMode ? undefined : graph.onResizeCallback,
          onResizeEnd: isPreviewMode ? undefined : graph.onResizeEndCallback,
          onFolderToggle: isPreviewMode
            ? undefined
            : graph.handleToggleFolderCollapse,
        },
      };
    });

    return uniqueById(processedBlocks);
  }, [
    blocks,
    rt.presenceUsers,
    rt.onFocus,
    rt.onBlur,
    rt.onCaretMove,
    currentUser,
    isPreviewMode,
    graph,
    yContents,
    projectOwnerId,
  ]);

  const uniqueLinks = useMemo(() => {
    return uniqueById(links).filter(
      (e: Edge) => e && e.id && e.source && e.target,
    );
  }, [links]);

  useEffect(() => {
    if (
      initialProjectId &&
      lastProjectId.current !== initialProjectId &&
      yBlocks &&
      yContents &&
      isLocalSynced
    ) {
      if (yBlocks.size > 0) {
        isInitialized.current = true;
        lastProjectId.current = initialProjectId;
        io.fetchProjectMetadata();

        setTimeout(() => {
          const rawBlocks =
            blocks.length > 0
              ? blocks
              : (Array.from(yBlocks!.values()) as Node<BlockData>[]);
          const rawLinks =
            links.length > 0 ? links : Array.from(yLinks!.values());
          const initialHiddenIds = computeHiddenNodeIds(rawBlocks, rawLinks);

          const filteredRawBlocks = rawBlocks.filter(
            (b) => !b.hidden && !initialHiddenIds.has(b.id),
          );

          applyLongestSideFit(filteredRawBlocks, FIT_MAX_ZOOM_ALL);
        }, 100);

        return;
      }

      // If local Yjs is empty, wait for remote sync or timeout before fetching
      if (!isRemoteSynced) {
        const timer = setTimeout(() => {
          if (!isInitialized.current) {
            isInitialized.current = false;
            lastProjectId.current = initialProjectId;
            io.fetchGraph();
          }
        }, 2000); // 2s timeout for remote sync

        return () => clearTimeout(timer);
      }

      isInitialized.current = false;
      lastProjectId.current = initialProjectId;
      io.fetchGraph();
    }
  }, [
    blocks,
    initialProjectId,
    io.fetchGraph,
    io.fetchProjectMetadata,
    yBlocks,
    yContents,
    isLocalSynced,
    isRemoteSynced,
    applyLongestSideFit,
  ]);

  const handleFitView = useCallback(() => {
    const visibleBlocks = blocks.filter((b) => !b.hidden);
    const selectedBlocks = visibleBlocks.filter((n) => n.selected);
    if (selectedBlocks.length > 0)
      applyLongestSideFit(selectedBlocks, FIT_MAX_ZOOM_SELECTED);
    else if (visibleBlocks.length === 0)
      setViewport({ x: 0, y: 0, zoom: 1 }, { duration: FIT_DURATION });
    else applyLongestSideFit(visibleBlocks, FIT_MAX_ZOOM_ALL);
  }, [blocks, setViewport, applyLongestSideFit]);

  const handleZoomIn = useCallback(
    () =>
      zoomTo((Math.floor(getZoom() * 10 + 0.01) + 1) / 10, { duration: 200 }),
    [getZoom, zoomTo],
  );
  const handleZoomOut = useCallback(
    () =>
      zoomTo((Math.ceil(getZoom() * 10 - 0.01) - 1) / 10, { duration: 200 }),
    [getZoom, zoomTo],
  );

  const zoomRAF = useRef<number | null>(null);

  const onViewportChange = useCallback(
    (v: { x: number; y: number; zoom: number }) => {
      if (zoomRAF.current === null) {
        zoomRAF.current = requestAnimationFrame(() => {
          zoomRAF.current = null;
          setZoom(Math.round(v.zoom * 100));
        });
      }
      debouncedCheckVisibleBlocks(v);
    },
    [debouncedCheckVisibleBlocks],
  );

  const onMove = useCallback(
    (_e: unknown, v: { x: number; y: number; zoom: number }) => {
      if (v) debouncedCheckVisibleBlocks(v);
    },
    [debouncedCheckVisibleBlocks],
  );

  const handleToggleLock = useCallback(
    (blockId: string) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block || !currentUser) return;
      const isLocked = !!block.data?.isLocked;
      graph.handleToggleLock(blockId, !isLocked);
    },
    [blocks, currentUser, graph],
  );

  const handleTransferBlock = useCallback(
    (
      id: string,
      target: {
        id: string;
        username: string | null;
        displayName: string | null;
        color?: string;
      },
    ) => {
      graph.handleTransferBlock(id, target);
      toast.success(dict.blocks.blockTransferred);
      onGraphMutation?.("Block transferred");
    },
    [graph, dict.common, onGraphMutation],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditing =
        ["INPUT", "TEXTAREA"].includes(target.tagName) ||
        target.isContentEditable;

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !isEditing) {
        e.preventDefault();
        undo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "y" && !isEditing) {
        e.preventDefault();
        redo();
        return;
      }

      // Fit View
      if ((e.ctrlKey || e.metaKey) && e.key === "0" && !isEditing) {
        e.preventDefault();
        handleFitView();
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && !isEditing) {
        const selectedBlocks = blocks.filter((n) => n.selected);
        const selectedLinks = links.filter((l) => l.selected);

        if (selectedBlocks.length > 0) {
          // Check for "Don't ask again" preference
          const skipConfirm =
            typeof window !== "undefined" &&
            localStorage.getItem("ideon_skip_delete_confirm") === "true";

          const cannotDelete = selectedBlocks.some((n) => {
            const isOwner =
              currentUser?.id && n.data?.ownerId === currentUser.id;
            const isProjectOwner =
              currentUser?.id && projectOwnerId === currentUser.id;
            return !isOwner && !isProjectOwner;
          });

          if (cannotDelete) {
            toast.error(dict.blocks.cannotDeleteBlock);
            return;
          }

          if (skipConfirm) {
            graph.handleDeleteBlock(selectedBlocks.map((n) => n.id));
          } else {
            setBlocksToDelete(selectedBlocks.map((n) => n.id));
          }
        } else if (selectedLinks.length > 0) {
          graph.onLinksChange(
            selectedLinks.map((l) => ({ id: l.id, type: "remove" })),
          );
        }
      }

      // Handle Escape to unselect
      if (e.key === "Escape") {
        setBlocks((nds) => nds.map((n) => ({ ...n, selected: false })));
        setLinks((eds) => eds.map((e) => ({ ...e, selected: false })));
        return;
      }

      // Handle Enter to edit
      if (e.key === "Enter" && !isEditing) {
        const selectedBlocks = blocks.filter((n) => n.selected);
        if (selectedBlocks.length === 1) {
          e.preventDefault();
          const block = selectedBlocks[0];
          const blockId = block.id;

          // Use a slight timeout to ensure ReactFlow updates are settled if any
          setTimeout(() => {
            const blockEl = document.querySelector(`[data-id="${blockId}"]`);
            if (blockEl) {
              // Priority selection based on block type
              let input: HTMLElement | null = null;

              if (block.type === "checklist") {
                input = blockEl.querySelector(
                  "textarea.checklist-input",
                ) as HTMLElement;
              } else if (block.type === "text") {
                // NoteBlock
                // Focus the editor content
                input = blockEl.querySelector(".ProseMirror") as HTMLElement;
              }

              // Fallback to generic search if specific one failed
              if (!input) {
                // Exclude block-title from initial focus if possible, unless it's the only input
                const allInputs = Array.from(
                  blockEl.querySelectorAll(
                    'input, textarea, [contenteditable="true"]',
                  ),
                );
                const contentInput = allInputs.find(
                  (el) => !el.classList.contains("block-title"),
                );
                input = (contentInput || allInputs[0]) as HTMLElement;
              }

              if (input) {
                input.focus();
              }
            }
          }, 10);
        }
        return;
      }

      // Handle Arrow Keys (and Vim keys) for navigation
      const isArrowKey = [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ].includes(e.key);
      const isVimKey = ["h", "j", "k", "l"].includes(e.key);

      if ((isArrowKey || isVimKey) && !isEditing) {
        // Prevent default only if we actually navigate
        // e.preventDefault();

        const selectedBlocks = blocks.filter((n) => n.selected);
        const currentBlock =
          selectedBlocks.length > 0
            ? selectedBlocks[selectedBlocks.length - 1]
            : null;

        if (!currentBlock) {
          if (blocks.length > 0) {
            e.preventDefault();
            setBlocks((nds) =>
              nds.map((n, i) => ({ ...n, selected: i === 0 })),
            );
          }
          return;
        }

        e.preventDefault(); // valid navigation attempt

        const center = {
          x:
            currentBlock.position.x +
            (currentBlock.width || DEFAULT_BLOCK_WIDTH) / 2,
          y: currentBlock.position.y + (currentBlock.height || 100) / 2, // 100 is approx height
        };

        let bestCandidate: Node<BlockData> | null = null;
        let minDistance = Infinity;

        blocks.forEach((other) => {
          if (other.id === currentBlock.id) return;

          const otherCenter = {
            x: other.position.x + (other.width || DEFAULT_BLOCK_WIDTH) / 2,
            y: other.position.y + (other.height || 100) / 2,
          };

          const dx = otherCenter.x - center.x;
          const dy = otherCenter.y - center.y;

          // Check direction with cone logic (45 degrees)
          let isValid = false;

          // Right (ArrowRight or l)
          if (e.key === "ArrowRight" || e.key === "l")
            isValid = dx > 0 && Math.abs(dy) < dx * 1.5;

          // Left (ArrowLeft or h)
          if (e.key === "ArrowLeft" || e.key === "h")
            isValid = dx < 0 && Math.abs(dy) < -dx * 1.5;

          // Down (ArrowDown or j)
          if (e.key === "ArrowDown" || e.key === "j")
            isValid = dy > 0 && Math.abs(dx) < dy * 1.5;

          // Up (ArrowUp or k)
          if (e.key === "ArrowUp" || e.key === "k")
            isValid = dy < 0 && Math.abs(dx) < -dy * 1.5;

          if (isValid) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDistance) {
              minDistance = dist;
              bestCandidate = other;
            }
          }
        });

        if (bestCandidate) {
          setBlocks((nds) =>
            nds.map((n) => ({
              ...n,
              selected: n.id === (bestCandidate as Node<BlockData>).id,
            })),
          );

          applyLongestSideFit([bestCandidate], FIT_MAX_ZOOM_SELECTED);
        }
        return;
      }

      // Handle Tab to create child block
      if (e.key === "Tab" && !isEditing) {
        e.preventDefault();
        const selectedBlocks = blocks.filter((n) => n.selected);

        if (selectedBlocks.length === 1) {
          const parentBlock = selectedBlocks[0];
          // Determine direction based on parent's position relative to Core Block
          const isRightSide = parentBlock.position.x > CORE_BLOCK_X;

          // Calculate offset based on parent width to avoid overlap
          const parentWidth = parentBlock.width || DEFAULT_BLOCK_WIDTH;
          const gap = 150;
          const offset = parentWidth + gap;

          const newPos = {
            x: parentBlock.position.x + (isRightSide ? offset : -offset),
            y: parentBlock.position.y,
          };

          graph.handleCreateBlock(newPos, parentBlock.id, "text");
        }
      }
    },
    [
      blocks,
      links,
      currentUser,
      dict.common,
      graph,
      projectOwnerId,
      handleFitView,
    ],
  );

  const confirmDelete = useCallback(() => {
    const ids = blockToDelete ? [blockToDelete] : blocksToDelete;
    if (ids.length === 0) return;
    graph.handleDeleteBlock(ids);
    setBlockToDelete(null);
    setBlocksToDelete([]);
    onGraphMutation?.("Block deleted");
  }, [blockToDelete, blocksToDelete, graph, onGraphMutation]);

  return {
    blocks: blocksWithPresence,
    setBlocks,
    onBlocksChange: graph.onBlocksChange,
    links: uniqueLinks,
    setLinks,
    onLinksChange: graph.onLinksChange,
    isLoading,
    blockToDelete,
    setBlockToDelete,
    blocksToDelete,
    setBlocksToDelete,
    zoom,
    contextMenu,
    setContextMenu,
    isInviteModalOpen,
    setIsInviteModalOpen,
    transferBlock,
    setTransferBlock,
    isPreviewMode,
    setIsPreviewMode,
    selectedStateId,
    setSelectedStateId,
    isInitialized,
    handleFitView,
    handleZoomIn,
    handleZoomOut,
    onViewportChange,
    onMove,
    fetchGraph: io.fetchGraph,
    handleSaveState,
    handleDeleteState,
    handleRenameState,
    onBlockDragStart: graph.onBlockDragStart,
    onBlockDrag: graph.onBlockDrag,
    onBlockDragStop: graph.onBlockDragStop,
    onConnect: graph.onConnect,
    handleDeleteBlock: graph.handleDeleteBlock,
    deleteLinks,
    handleToggleLock,
    handleTransferBlock,
    confirmDelete,
    onKeyDown,
    onPointerMove,
    onPointerLeave: rt.onPointerLeave,
    helperLines: graph.helperLines,
    handlePreview: io.handlePreview,
    handleApplyState: async (stateId: string) => {
      if (!initialProjectId) return;

      // If in preview mode, we can check for duplicates
      if (isPreviewMode && yBlocks && yLinks && yContents) {
        // 1. Get Present State from Yjs
        const presentBlocks = Array.from(yBlocks.values()).map((b) => {
          const yText = yContents.get(b.id);
          return {
            ...b,
            data: {
              ...b.data,
              content: yText ? yText.toString() : b.data.content || "",
            },
          } as Node<BlockData>;
        });
        const presentLinks = Array.from(yLinks.values());

        // 2. Get Snapshot State (currently in 'blocks' and 'links' because isPreviewMode=true)
        const snapshotBlocks = blocks;
        const snapshotLinks = links;

        const presentHash = await generateStateHash(
          presentBlocks,
          presentLinks,
        );
        const snapshotHash = await generateStateHash(
          snapshotBlocks,
          snapshotLinks,
        );

        if (presentHash === snapshotHash) {
          toast.info(
            dict.modals.stateAlreadyApplied ||
              "This state is already applied to the present",
          );
          return;
        }
      }

      // Proceed
      await io.handleApplyState(stateId);
    },
    onBlockContextMenu: graph.onBlockContextMenu,
    onEdgeContextMenu: graph.onEdgeContextMenu,
    onPaneContextMenu: graph.onPaneContextMenu,
    onPaneClick: () => setContextMenu(null),
    onBlockClick: () => setContextMenu(null),
    onLinkClick: () => setContextMenu(null),
    handleCreateBlock: handleCreateBlockWrapper,
    onExternalDragEnter,
    onExternalDragLeave,
    onExternalDragOver,
    handleExternalDrop,
    isExternalDropActive,
    dropImportProgress,
    presenceUsers: rt.presenceUsers,
    remoteCursorsRef: rt.remoteCursorsRef,
    draftsByBlock,
    getDraftsForBlock,
    writeDraft,
    deleteDraft,
    shareCursor,
    setShareCursor,
    projectOwnerId,
    undo,
    redo,
    canUndo,
    canRedo,
    hasSeenOnboarding,
    markOnboardingSeen,
    updateMyPresence: rt.updateMyPresence,
  };
};
