"use client";

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "aframe";
// animation-mixer (GLTF animations) from aframe-extras; aframe must be imported first.
import "aframe-extras/loaders/animation-mixer";
import "./aframe-block.css";
import {
  useReactFlow,
  useStore,
  useStoreApi,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useI18n } from "@providers/I18nProvider";
import type { BlockData } from "./CanvasBlock";
import { BlockFooter } from "./BlockFooter";
import { BlockTitleInput } from "./BlockTitleInput";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import CustomNodeResizer from "./CustomNodeResizer";
import { focusProjectCanvas } from "./utils/focusCanvas";
import { parseJsonRecord } from "@lib/metadata-parsers";
import { Box, ChevronDown, ChevronRight, Settings, Trash2 } from "lucide-react";
import { Handle, Position } from "@xyflow/react";

// ── Types ────────────────────────────────────────────────────────────────────

interface AFramePrimitiveData {
  type: string;
  position?: [number, number, number];
  color?: string;
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  tubular?: number;
  [key: string]: unknown;
}

interface AFrameAssetData {
  id: string;
  url: string;
  type: "glb" | "gltf" | "image";
  label?: string;
  position?: [number, number, number];
  scale?: number;
}

interface AFrameHotspotData {
  id?: string;
  blockId: string;
  label?: string;
  position?: [number, number, number];
}

interface AFrameCameraData {
  fov?: number;
  position?: [number, number, number];
  lookAt?: [number, number, number];
}

interface AFrameMetadata {
  preset?: string;
  source?: string;
  primitives?: AFramePrimitiveData[];
  hotspots?: AFrameHotspotData[];
  assets?: AFrameAssetData[];
  camera?: AFrameCameraData;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const parseAFrameMetadata = (raw: unknown): AFrameMetadata => {
  if (!raw)
    return {
      preset: "none",
      primitives: [],
      hotspots: [],
      assets: [],
      camera: {},
    };
  const parsed = parseJsonRecord(raw);
  if (typeof parsed !== "object" || parsed === null) {
    return {
      preset: "none",
      primitives: [],
      hotspots: [],
      assets: [],
      camera: {},
    };
  }
  const m = parsed as Record<string, unknown>;
  return {
    preset: typeof m.preset === "string" ? m.preset : "none",
    source: typeof m.source === "string" ? m.source : "",
    primitives: Array.isArray(m.primitives)
      ? (m.primitives as AFramePrimitiveData[])
      : [],
    hotspots: Array.isArray(m.hotspots)
      ? (m.hotspots as AFrameHotspotData[])
      : [],
    assets: Array.isArray(m.assets) ? (m.assets as AFrameAssetData[]) : [],
    camera: m.camera as AFrameCameraData | undefined,
  };
};

const DEFAULT_PRIMITIVE_COLORS: Record<string, string> = {
  box: "#4CC3D9",
  sphere: "#EF2D5E",
  cylinder: "#4ECDC4",
  plane: "#FFD93D",
  torus: "#FF6B6B",
  cone: "#FF8A65",
};

// Spawn dimensions per primitive type; also the editor's size-field fallback for older items.
const DEFAULT_PRIMITIVE_SIZES: Record<string, Partial<AFramePrimitiveData>> = {
  box: { width: 1, height: 1, depth: 1 },
  sphere: { radius: 0.5 },
  cylinder: { radius: 0.5, height: 1 },
  cone: { radius: 0.5, height: 1 },
  plane: { width: 1, height: 1 },
  torus: { radius: 0.5, tubular: 0.1 },
};

// Plain literal union: AFramePrimitiveData's string index signature makes Extract<keyof AFramePrimitiveData, ...> resolve to never.
type PrimitiveSizeKey = "width" | "height" | "depth" | "radius" | "tubular";

// Size editor fields per primitive type; labels are neutral unit symbols (W/H/D/R/T).
const PRIMITIVE_SIZE_FIELDS: Record<
  string,
  Array<{ key: PrimitiveSizeKey; label: string }>
> = {
  box: [
    { key: "width", label: "W" },
    { key: "height", label: "H" },
    { key: "depth", label: "D" },
  ],
  sphere: [{ key: "radius", label: "R" }],
  cylinder: [
    { key: "radius", label: "R" },
    { key: "height", label: "H" },
  ],
  cone: [
    { key: "radius", label: "R" },
    { key: "height", label: "H" },
  ],
  plane: [
    { key: "width", label: "W" },
    { key: "height", label: "H" },
  ],
  torus: [
    { key: "radius", label: "R" },
    { key: "tubular", label: "T" },
  ],
};

// Default camera framing situates spawned primitives in front of the view.
const CAMERA_DEFAULT_POSITION: [number, number, number] = [0, 2, 2];
const CAMERA_DEFAULT_LOOKAT: [number, number, number] = [0, 0.5, 0];

const DEFAULT_ASSET_SCALE = 1;

// Referentially stable so the editor-closed selector never triggers re-renders.
const EMPTY_NODE_LIST: Node[] = [];

// API added at runtime by A-Frame, unknown to the DOM typings.
type AFrameSceneElement = HTMLElement & {
  hasLoaded?: boolean;
  isPlaying?: boolean;
  pause?(): void;
  play?(): void;
  resize?(): void;
  /** Active THREE camera, exposed once the scene has initialized. */
  camera?: unknown;
};

const isVec3 = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((n) => typeof n === "number" && !Number.isNaN(n));

const asVec3 = (
  value: unknown,
  fallback: [number, number, number],
): [number, number, number] => (isVec3(value) ? value : fallback);

// Spawn slots; new items take the first unoccupied one so shapes never merge.
const SCENE_SLOT_X = [-1.5, 0, 1.5] as const;

// Shapes and hotspots spawn on the camera-facing strip; assets on a lower, nearer one.
const SCENE_STRIP_Y = 1.6;
const SCENE_STRIP_Z = -4;
const ASSET_STRIP_Z = -2.5;
// Images render as 2x1.2 planes; this Y keeps their bottom edge on the floor.
const ASSET_IMAGE_Y = 0.6;
const SCENE_STRIP_ROW_STEP = 1.25;
const SCENE_STRIP_MAX_ROWS = 50;

const positionsEqual = (a: unknown, b: unknown, tolerance = 1e-2): boolean => {
  const va = asVec3(a, [0, 0, 0]);
  const vb = asVec3(b, [0, 0, 0]);
  return (
    Math.abs(va[0] - vb[0]) <= tolerance &&
    Math.abs(va[1] - vb[1]) <= tolerance &&
    Math.abs(va[2] - vb[2]) <= tolerance
  );
};

// First unoccupied spot; the 1e-2 tolerance guards against float noise, full strips wrap up a row.
const nextFreeSceneSpot = (
  occupied: readonly unknown[],
  y: number,
  z: number,
): [number, number, number] => {
  for (let row = 0; row < SCENE_STRIP_MAX_ROWS; row += 1) {
    const planeY = y + row * SCENE_STRIP_ROW_STEP;
    for (const slotX of SCENE_SLOT_X) {
      const spot: [number, number, number] = [slotX, planeY, z];
      const taken = occupied.some((item) => {
        const record = item as { position?: unknown } | undefined | null;
        return positionsEqual(record?.position, spot);
      });
      if (!taken) return spot;
    }
  }
  return [0, y, z];
};

interface EditorNumberFieldProps {
  value: number;
  /** Optional leading unit symbol (X/Y/Z/W/H/D…). */
  label?: string;
  title: string;
  /** Input class override (defaults to the column-style number input). */
  className?: string;
  /** Optional constraint; invalid drafts are never committed. */
  validate?: (value: number) => boolean;
  onCommit: (value: number) => void;
}

// Live commits; text input because type=number sanitizes partial drafts. Callers must use stable keys.
const EditorNumberField = ({
  value,
  label,
  title,
  className = "aframe-editor-number",
  validate,
  onCommit,
}: EditorNumberFieldProps) => {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="aframe-editor-field">
      {label && <span className="aframe-editor-axis">{label}</span>}
      <input
        type="text"
        inputMode="decimal"
        className={className}
        title={title}
        aria-label={title}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const parsed = Number.parseFloat(e.target.value);
          if (
            Number.isFinite(parsed) &&
            (!validate || validate(parsed)) &&
            parsed !== value
          ) {
            onCommit(parsed);
          }
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
};

interface AFrameGltfEntityProps {
  assetId: string;
  url: string;
  scale?: number;
  onLoaded: (assetId: string) => void;
  onError: (assetId: string, message: string) => void;
}

// GLTF load status surfaces as entity events; React props cannot observe it.
const AFrameGltfEntity = ({
  assetId,
  url,
  scale,
  onLoaded,
  onError,
}: AFrameGltfEntityProps) => {
  const gltfRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = gltfRef.current;
    if (!el) return;
    const handleError = () => onError(assetId, "model load failed");
    const handleLoaded = () => onLoaded(assetId);
    el.addEventListener("model-error", handleError);
    el.addEventListener("model-loaded", handleLoaded);
    return () => {
      el.removeEventListener("model-error", handleError);
      el.removeEventListener("model-loaded", handleLoaded);
    };
  }, [assetId, url, onError, onLoaded]);
  const modelScale = scale ?? DEFAULT_ASSET_SCALE;
  return (
    <a-entity
      ref={gltfRef}
      gltf-model={url}
      scale={`${modelScale} ${modelScale} ${modelScale}`}
      animation-mixer=""
    />
  );
};

interface AFrameImageProbeProps {
  assetId: string;
  url: string;
  onLoaded: (assetId: string) => void;
  onError: (assetId: string, message: string) => void;
}

// The flat shader drops failed textures silently (no event), so the URL is probed with an Image request instead.
const AFrameImageProbe = ({
  assetId,
  url,
  onLoaded,
  onError,
}: AFrameImageProbeProps) => {
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const probe = new Image();
    const handleLoaded = () => {
      if (!cancelled) onLoaded(assetId);
    };
    const handleError = () => {
      if (!cancelled) onError(assetId, "image load failed");
    };
    probe.onload = handleLoaded;
    probe.onerror = handleError;
    probe.src = url;
    return () => {
      cancelled = true;
      probe.onload = null;
      probe.onerror = null;
    };
  }, [assetId, url, onLoaded, onError]);
  return null;
};

// ── Component ────────────────────────────────────────────────────────────────

type AFrameBlockProps = NodeProps<Node<BlockData>>;

const AFrameBlock = memo((props: AFrameBlockProps) => {
  const { id, data, selected } = props;
  const { dict, lang } = useI18n();
  const { setNodes, getNodes, setCenter, getViewport } = useReactFlow();

  const dataRef = useRef(data);
  // Last composed-but-uncommitted write, so same-frame writes compose; cleared on new data.
  const pendingMetadataRef = useRef<AFrameMetadata | null>(null);
  useEffect(() => {
    dataRef.current = data;
    pendingMetadataRef.current = null;
  }, [data]);
  const [title, setTitle] = useState(data?.title ?? "");
  const [assetErrors, setAssetErrors] = useState<Record<string, string>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  // Panels keyed by item id, reset on close so deleted/reindexed rows never inherit one.
  const [openPanels, setOpenPanels] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const togglePanel = useCallback((key: string) => {
    setOpenPanels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);
  useEffect(() => {
    if (!isEditorOpen) setOpenPanels(new Set());
  }, [isEditorOpen]);
  // A-Frame scenes each hold a WebGL context (browser-capped); mount on first visibility only.
  const [isSceneMounted, setIsSceneMounted] = useState(false);

  // Handle asset load errors (A-Frame entity events, not DOM error events)
  const handleAssetError = useCallback((assetId: string, message: string) => {
    setAssetErrors((prev) => ({ ...prev, [assetId]: message }));
  }, []);

  const handleAssetLoaded = useCallback((assetId: string) => {
    setAssetErrors((prev) => {
      if (!(assetId in prev)) return prev;
      const next = { ...prev };
      delete next[assetId];
      return next;
    });
  }, []);

  const currentUser = data?.currentUser;
  const isOwner = Boolean(currentUser?.id && data?.ownerId === currentUser.id);
  const isProjectOwner = Boolean(
    currentUser?.id && data?.projectOwnerId === currentUser.id,
  );
  const isViewer = data?.userRole === "viewer";
  const isReadOnly =
    Boolean(data?.isPreviewMode) ||
    isViewer ||
    (data?.isLocked ? !isOwner && !isProjectOwner : false);
  const canReact = !(data?.isPreviewMode ?? false) || isViewer;

  const isBeingMoved = !!data?.movingUserColor;
  const borderColor = isBeingMoved
    ? data.movingUserColor
    : "var(--block-border-color)";

  const metadata = useMemo(() => {
    if (!data?.metadata) {
      return {
        preset: "none",
        primitives: [],
        hotspots: [],
        assets: [],
        camera: {},
      };
    }
    return parseAFrameMetadata(data.metadata);
  }, [data?.metadata]);

  useEffect(() => {
    if (data?.title !== undefined && data?.title !== title) {
      setTitle(data.title);
    }
  }, [data?.title, title]);

  const editor =
    currentUser?.displayName || currentUser?.username || dict.project.anonymous;

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isReadOnly) return;
      const currentData = dataRef.current;
      const newTitle = e.target.value;
      setTitle(newTitle);
      const pendingMetadata = pendingMetadataRef.current;
      currentData?.onContentChange?.(
        id,
        currentData?.content ?? "",
        new Date().toISOString(),
        editor,
        pendingMetadata
          ? JSON.stringify(pendingMetadata)
          : currentData?.metadata,
        newTitle,
        currentData?.reactions,
      );
    },
    [id, editor, isReadOnly],
  );

  const handleResize = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                width: Math.round(params.width),
                height: Math.round(params.height),
                position: { x: Math.round(params.x), y: Math.round(params.y) },
              }
            : n,
        ),
      );
    },
    [id, setNodes],
  );

  const handleResizeEnd = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      const currentData = dataRef.current;
      currentData?.onResizeEnd?.(id, {
        width: params.width,
        height: params.height,
        x: params.x,
        y: params.y,
      });
    },
    [id],
  );

  const { handleReact, handleRemoveReaction } = useBlockReactions({
    id,
    data,
    currentUser,
    isReadOnly,
    canReact,
  });

  const focusHotspotTarget = useCallback(
    (blockId?: string) => {
      const target = blockId
        ? getNodes().find((node) => node.id === blockId)
        : undefined;
      if (target) {
        setCenter(
          target.position.x + (target.width ?? 300) / 2,
          target.position.y + (target.height ?? 200) / 2,
          // Without an explicit zoom, setCenter falls back to maxZoom; pass
          // the current one so navigation keeps the user's zoom level.
          { duration: 800, zoom: getViewport().zoom },
        );
      }
      focusProjectCanvas();
    },
    [getNodes, getViewport, setCenter],
  );

  // All writers compose from the freshest state (pending uncommitted write first); null skips the write.
  const updateMetadata = useCallback(
    (build: (latest: AFrameMetadata) => AFrameMetadata | null) => {
      const current = dataRef.current;
      const latest =
        pendingMetadataRef.current ?? parseAFrameMetadata(current?.metadata);
      const next = build(latest);
      if (next === null) return;
      pendingMetadataRef.current = next;
      current?.onContentChange?.(
        id,
        current?.content ?? "",
        new Date().toISOString(),
        editor,
        JSON.stringify(next),
        current?.title ?? title,
        current?.reactions,
      );
    },
    [id, editor, title],
  );

  const addPrimitive = useCallback(
    (type: string) => {
      if (isReadOnly) return;
      updateMetadata((latest) => ({
        ...latest,
        primitives: [
          ...(latest.primitives ?? []),
          {
            id: `prim-${Date.now()}`,
            type,
            position: nextFreeSceneSpot(
              [
                ...(latest.primitives ?? []),
                ...(latest.hotspots ?? []),
                ...(latest.assets ?? []),
              ],
              SCENE_STRIP_Y,
              SCENE_STRIP_Z,
            ),
            color: DEFAULT_PRIMITIVE_COLORS[type] ?? "#888",
            ...(DEFAULT_PRIMITIVE_SIZES[type] ?? {}),
          } as AFramePrimitiveData,
        ],
      }));
    },
    [isReadOnly, updateMetadata],
  );

  const removePrimitive = useCallback(
    (index: number) => {
      if (isReadOnly) return;
      updateMetadata((latest) => {
        if (!latest.primitives?.[index]) return null;
        return {
          ...latest,
          primitives: latest.primitives?.filter((_, i) => i !== index),
        };
      });
    },
    [isReadOnly, updateMetadata],
  );

  const updatePrimitive = useCallback(
    (index: number, patch: Partial<AFramePrimitiveData>) => {
      if (isReadOnly) return;
      updateMetadata((latest) => {
        if (!latest.primitives?.[index]) return null;
        const primitives = [...latest.primitives];
        primitives[index] = {
          ...primitives[index],
          ...patch,
        } as AFramePrimitiveData;
        return { ...latest, primitives };
      });
    },
    [isReadOnly, updateMetadata],
  );

  const addHotspot = useCallback(() => {
    if (isReadOnly) return;
    updateMetadata((latest) => ({
      ...latest,
      hotspots: [
        ...(latest.hotspots ?? []),
        {
          id: `hotspot-${Date.now()}`,
          blockId: "",
          label: "",
          position: nextFreeSceneSpot(
            [
              ...(latest.primitives ?? []),
              ...(latest.hotspots ?? []),
              ...(latest.assets ?? []),
            ],
            SCENE_STRIP_Y,
            SCENE_STRIP_Z,
          ),
        } as AFrameHotspotData,
      ],
    }));
  }, [isReadOnly, updateMetadata]);

  const removeHotspot = useCallback(
    (index: number) => {
      if (isReadOnly) return;
      updateMetadata((latest) => {
        if (!latest.hotspots?.[index]) return null;
        return {
          ...latest,
          hotspots: latest.hotspots?.filter((_, i) => i !== index),
        };
      });
    },
    [isReadOnly, updateMetadata],
  );

  const updateHotspot = useCallback(
    (index: number, patch: Partial<AFrameHotspotData>) => {
      if (isReadOnly) return;
      updateMetadata((latest) => {
        if (!latest.hotspots?.[index]) return null;
        const hotspots = [...latest.hotspots];
        hotspots[index] = { ...hotspots[index], ...patch } as AFrameHotspotData;
        return { ...latest, hotspots };
      });
    },
    [isReadOnly, updateMetadata],
  );

  const updateAsset = useCallback(
    (index: number, patch: Partial<AFrameAssetData>) => {
      if (isReadOnly) return;
      updateMetadata((latest) => {
        if (!latest.assets?.[index]) return null;
        const assets = [...latest.assets];
        assets[index] = { ...assets[index], ...patch } as AFrameAssetData;
        return { ...latest, assets };
      });
    },
    [isReadOnly, updateMetadata],
  );

  // Commits one position axis (0=X, 1=Y, 2=Z) from the latest known state.
  const commitVectorComponent = useCallback(
    (
      listName: "primitives" | "hotspots" | "assets",
      index: number,
      axis: number,
      value: number,
    ) => {
      updateMetadata((latest) => {
        const list = latest[listName];
        const item = list?.[index];
        if (!item) return null;
        const current = isVec3(item.position)
          ? item.position
          : ([0, 0, 0] as const);
        const position: [number, number, number] =
          axis === 0
            ? [value, current[1], current[2]]
            : axis === 1
              ? [current[0], value, current[2]]
              : [current[0], current[1], value];
        const nextList = [...list];
        nextList[index] = { ...item, position } as (typeof list)[number];
        return { ...latest, [listName]: nextList } as AFrameMetadata;
      });
    },
    [updateMetadata],
  );

  // Also drops the asset's load-error state (no stale errors for deleted assets).
  const removeAsset = useCallback(
    (index: number) => {
      if (isReadOnly) return;
      const removedIds: string[] = [];
      updateMetadata((latest) => {
        const removed = latest.assets?.[index];
        if (!removed) return null;
        removedIds.push(removed.id);
        return {
          ...latest,
          assets: latest.assets?.filter((_, i) => i !== index),
        };
      });
      if (removedIds.length === 0) return;
      const removedAssetId = removedIds[0];
      setAssetErrors((prev) => {
        if (!(removedAssetId in prev)) return prev;
        const next = { ...prev };
        delete next[removedAssetId];
        return next;
      });
    },
    [isReadOnly, updateMetadata],
  );

  // Uploads serialize through this queue; each update composes via updateMetadata.
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const projectId = data?.initialProjectId;
      // Reset before queuing so picking the same file again re-triggers change.
      e.target.value = "";
      if (!file || !projectId || isReadOnly) return;

      const runUpload = async () => {
        setUploadError(null);
        try {
          const formData = new FormData();
          formData.append("file", file);

          const res = await fetch(`/api/projects/${projectId}/files`, {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            // Backend errors arrive as JSON; surface the message, not the object.
            const body = await res.text().catch(() => "");
            let detail = body;
            try {
              const parsed = JSON.parse(body) as { message?: unknown };
              if (typeof parsed?.message === "string") detail = parsed.message;
            } catch {
              detail = body;
            }
            throw new Error(detail || `HTTP ${res.status}`);
          }

          const fileData = (await res.json()) as { name?: unknown };
          if (typeof fileData?.name !== "string" || !fileData.name) {
            throw new Error("invalid upload response");
          }
          const fileName = fileData.name;
          const assetType = file.type.startsWith("image/")
            ? "image"
            : file.name.endsWith(".gltf")
              ? "gltf"
              : "glb";

          // Endpoint answers {success, name, size, type}; the file is served via the GET endpoint.
          updateMetadata((latest) => ({
            ...latest,
            assets: [
              ...(latest.assets ?? []),
              {
                id: `asset-${Date.now()}`,
                url: `/api/projects/${projectId}/files?name=${encodeURIComponent(
                  fileName,
                )}`,
                type: assetType,
                label: file.name,
                // Asset strip: models stand on the floor, images at plane mid-height.
                position: nextFreeSceneSpot(
                  latest.assets ?? [],
                  assetType === "image" ? ASSET_IMAGE_Y : 0,
                  ASSET_STRIP_Z,
                ),
              } as AFrameAssetData,
            ],
          }));
        } catch (error) {
          console.error("Upload failed:", error);
          setUploadError(
            error instanceof Error ? error.message : "Upload failed",
          );
        }
      };

      uploadQueueRef.current = uploadQueueRef.current.then(runUpload);
    },
    [data?.initialProjectId, isReadOnly, updateMetadata],
  );

  const primitives = metadata.primitives ?? [];
  const hotspots = metadata.hotspots ?? [];
  const assets = metadata.assets ?? [];
  const camera = metadata.camera ?? {};

  // Subscribed only while the editor is open: idle 3D blocks must not re-render on canvas churn.
  const activeCanvasNodes = useStore((state) =>
    isEditorOpen ? state.nodes : EMPTY_NODE_LIST,
  );
  const hotspotTargetBlocks = useMemo(
    () =>
      activeCanvasNodes
        .filter((n) => n.id !== id)
        .map((n) => ({
          id: n.id,
          title:
            ((n.data as BlockData | undefined)?.title ?? "").trim() || n.id,
        })),
    [activeCanvasNodes, id],
  );

  // Clicks arrive from A-Frame's cursor raycast; React onClick never fires on the WebGL canvas.
  const hotspotRefs = useRef(new Map<number, HTMLElement | null>());
  // Positioned imperatively by the projection loop (no React render per frame).
  const hotspotChipRefs = useRef(new Map<number, HTMLButtonElement | null>());
  const sceneRef = useRef<AFrameSceneElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const isSceneVisibleRef = useRef(true);
  const hotspotsRef = useRef(hotspots);
  hotspotsRef.current = hotspots;

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    hotspotRefs.current.forEach((el, index) => {
      if (!el) return;
      const handler = () =>
        focusHotspotTarget(hotspotsRef.current[index]?.blockId);
      el.addEventListener("click", handler);
      cleanups.push(() => el.removeEventListener("click", handler));
    });
    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [hotspots, focusHotspotTarget]);

  // Imperative store subscription: no re-render on canvas churn, only on dangling flips.
  const flowStore = useStoreApi();
  const [danglingHotspots, setDanglingHotspots] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  useEffect(() => {
    let lastNodes: Node[] | undefined;
    const recompute = () => {
      const { nodes } = flowStore.getState();
      // Comparisons anchor on the nodes-array reference (replaced on every write) so drag frames stay free.
      if (nodes === lastNodes) return;
      lastNodes = nodes;
      const nodeIds = new Set(nodes.map((node) => node.id));
      const next = new Set<number>();
      hotspotsRef.current.forEach((hotspot, index) => {
        if (hotspot.blockId && !nodeIds.has(hotspot.blockId)) {
          next.add(index);
        }
      });
      setDanglingHotspots((prev) => {
        if (prev.size === next.size) {
          let identical = true;
          for (const index of next) {
            if (!prev.has(index)) {
              identical = false;
              break;
            }
          }
          if (identical) return prev;
        }
        return next;
      });
    };
    recompute();
    const unsubscribe = flowStore.subscribe(recompute);
    return () => {
      unsubscribe();
    };
  }, [flowStore, hotspots]);

  // Global dismiss (KanbanBlock pattern); card-internal interactions keep it open.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isEditorOpen) return;
    const handleGlobalPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (cardRef.current?.contains(target)) return;
      if (editorRef.current?.contains(target)) return;
      setIsEditorOpen(false);
    };
    window.addEventListener("pointerdown", handleGlobalPointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", handleGlobalPointerDown, true);
    };
  }, [isEditorOpen]);

  // DOM chips over the canvas: in-scene a-text depends on A-Frame's CDN font and fails silently.
  useEffect(() => {
    if (!isSceneMounted) return;
    let frame = requestAnimationFrame(function update() {
      frame = requestAnimationFrame(update);
      const sceneEl = sceneRef.current;
      const camera = sceneEl?.camera as
        | {
            matrixWorldInverse: { elements: number[] };
            projectionMatrix: { elements: number[] };
          }
        | undefined;
      const contentEl = contentRef.current;
      if (!contentEl) return;
      const width = contentEl.clientWidth;
      const height = contentEl.clientHeight;
      hotspotChipRefs.current.forEach((chip, index) => {
        if (!chip) return;
        const entity = hotspotRefs.current.get(index) as
          | (HTMLElement & {
              object3D?: { matrixWorld?: { elements: number[] } };
            })
          | undefined;
        const world = entity?.object3D?.matrixWorld;
        if (!camera || !world || !(width > 0) || !(height > 0)) {
          chip.style.display = "none";
          return;
        }
        const e = world.elements;
        // Anchor above the marker bar, in world space.
        const wx = e[12];
        const wy = e[13] + 0.35;
        const wz = e[14];
        const inv = camera.matrixWorldInverse.elements;
        const vx = inv[0] * wx + inv[4] * wy + inv[8] * wz + inv[12];
        const vy = inv[1] * wx + inv[5] * wy + inv[9] * wz + inv[13];
        const vz = inv[2] * wx + inv[6] * wy + inv[10] * wz + inv[14];
        const vw = inv[3] * wx + inv[7] * wy + inv[11] * wz + inv[15];
        const p = camera.projectionMatrix.elements;
        const cx = p[0] * vx + p[4] * vy + p[8] * vz + p[12] * vw;
        const cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13] * vw;
        const cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15] * vw;
        if (cw <= 0) {
          chip.style.display = "none";
          return;
        }
        const x = ((cx / cw) * 0.5 + 0.5) * width;
        const y = (0.5 - (cy / cw) * 0.5) * height;
        const marginX = Math.max(40, width * 0.15);
        const marginY = Math.max(30, height * 0.2);
        if (
          x < -marginX ||
          x > width + marginX ||
          y < -marginY ||
          y > height + marginY
        ) {
          chip.style.display = "none";
          return;
        }
        chip.style.display = "flex";
        chip.style.left = `${x.toFixed(1)}px`;
        chip.style.top = `${y.toFixed(1)}px`;
      });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [isSceneMounted]);

  // look-at is not a core component: rotation derives from position→lookAt; degenerate poses fall back.
  const cameraPositionVec = asVec3(camera.position, CAMERA_DEFAULT_POSITION);
  const cameraLookAtVec = asVec3(camera.lookAt, CAMERA_DEFAULT_LOOKAT);
  const isDegeneratePose = cameraPositionVec.every(
    (value, index) => Math.abs(value - cameraLookAtVec[index]) < 1e-4,
  );
  const [camX, camY, camZ] = isDegeneratePose
    ? CAMERA_DEFAULT_POSITION
    : cameraPositionVec;
  const [lookX, lookY, lookZ] = isDegeneratePose
    ? CAMERA_DEFAULT_LOOKAT
    : cameraLookAtVec;
  const cameraYaw = (Math.atan2(camX - lookX, camZ - lookZ) * 180) / Math.PI;
  const cameraHorizontalDist = Math.hypot(lookX - camX, lookZ - camZ);
  const cameraPitch =
    cameraHorizontalDist > 1e-4
      ? (Math.atan2(lookY - camY, cameraHorizontalDist) * 180) / Math.PI
      : 0;
  const cameraPosition = `${camX} ${camY} ${camZ}`;
  const cameraRotation = `${cameraPitch.toFixed(2)} ${cameraYaw.toFixed(2)} 0`;

  const isEmpty =
    !data?.content &&
    primitives.length === 0 &&
    hotspots.length === 0 &&
    assets.length === 0;
  const isSceneRendered = !isEmpty;

  // Unmounting on empty resets the mount-on-visible gate.
  useEffect(() => {
    if (!isSceneRendered) {
      setIsSceneMounted(false);
    }
  }, [isSceneRendered]);

  // `embedded` stops A-Frame page hijacking; paused off-screen, resized with the block.
  useEffect(() => {
    if (!isSceneRendered) return;
    const contentEl = contentRef.current;
    if (!contentEl) return;

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => sceneRef.current?.resize?.());
      resizeObserver.observe(contentEl);
    }
    let visibilityObserver: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      visibilityObserver = new IntersectionObserver(
        (entries) => {
          const isVisible = entries.some((entry) => entry.isIntersecting);
          isSceneVisibleRef.current = isVisible;
          const sceneEl = sceneRef.current;
          if (!sceneEl) {
            if (isVisible) setIsSceneMounted(true);
            return;
          }
          // A-Frame only exposes pause/play once the scene is initialized.
          if (!sceneEl.hasLoaded) return;
          if (isVisible) {
            if (!sceneEl.isPlaying) sceneEl.play?.();
          } else {
            sceneEl.pause?.();
          }
        },
        { threshold: 0 },
      );
      visibilityObserver.observe(contentEl);
    } else {
      // No IntersectionObserver (test environments): mount eagerly.
      setIsSceneMounted(true);
    }
    return () => {
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
    };
  }, [isSceneRendered]);

  // A scene that finished loading while off-screen must not keep rendering.
  useEffect(() => {
    if (!isSceneMounted) return;
    const sceneEl = sceneRef.current;
    if (!sceneEl) return;
    const handleLoaded = () => {
      if (!isSceneVisibleRef.current) sceneEl.pause?.();
    };
    sceneEl.addEventListener("loaded", handleLoaded);
    return () => {
      sceneEl.removeEventListener("loaded", handleLoaded);
    };
  }, [isSceneMounted]);

  return (
    <>
      <CustomNodeResizer
        minWidth={250}
        minHeight={180}
        isVisible={!isReadOnly}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        keepAspectRatio={false}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />

      <div
        ref={cardRef}
        className={`block-card block-type-aframe ${
          selected ? "selected" : ""
        } ${isReadOnly ? "read-only" : ""} flex flex-col p-0! select-none`}
        style={
          {
            "--block-border-color": borderColor,
            zIndex: 101,
          } as React.CSSProperties
        }
      >
        <div className="w-full h-full flex flex-col overflow-hidden rounded-[inherit]">
          <div className="block-header relative z-[1] flex items-center justify-between pt-4 px-4 mb-2 handle-drag-target">
            <div className="flex items-center gap-2">
              <Box size={16} />
              <span className="text-sm uppercase tracking-wider opacity-50 font-bold">
                {dict.blocks.blockType3DScene}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
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
                placeholder={dict.blocks?.title || "Title"}
                readOnly={isReadOnly}
              />
              {!isReadOnly && (
                <button
                  type="button"
                  className="block-toolbar-button relative z-[2]"
                  onClick={() => setIsEditorOpen((v) => !v)}
                  title={dict.common.edit}
                >
                  <Settings size={14} />
                </button>
              )}
            </div>
          </div>

          <div
            ref={contentRef}
            className={`aframe-content flex-1 min-h-0 relative overflow-hidden rounded-[inherit] nodrag nopan nowheel`}
          >
            {isEmpty ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Box size={40} />
                <span className="text-sm mt-2">
                  {dict.blocks.blockType3DSceneEmpty}
                </span>
                <span className="text-xs mt-1">
                  {dict.blocks.blockType3DSceneFallback}
                </span>
              </div>
            ) : isSceneMounted ? (
              <div className="w-full h-full">
                <a-scene
                  ref={sceneRef}
                  embedded
                  renderer="antialias: true; alpha: true"
                >
                  {/* Base pose on the wrapping entity: look-controls rewrites camera rotation per tick. */}
                  <a-entity position={cameraPosition} rotation={cameraRotation}>
                    <a-camera
                      fov={camera.fov}
                      look-controls="magicWindowTrackingEnabled: false"
                      wasd-controls="enabled: false"
                    >
                      {/* Cursor: raycast only, no visible reticle */}
                      <a-entity cursor="rayOrigin: mouse; fuse: false" />
                    </a-camera>
                  </a-entity>

                  {primitives.map((primitive, i) => {
                    const attrs: Record<string, unknown> = {};
                    if (primitive.position)
                      attrs.position = primitive.position.join(" ");
                    if (primitive.color) attrs.color = primitive.color;

                    const defaultColor =
                      DEFAULT_PRIMITIVE_COLORS[primitive.type] ?? "#888";

                    let child: React.ReactNode;
                    switch (primitive.type) {
                      case "box":
                        child = (
                          <a-box
                            color={primitive.color ?? defaultColor}
                            width={primitive.width ?? 1}
                            height={primitive.height ?? 1}
                            depth={primitive.depth ?? 1}
                          />
                        );
                        break;
                      case "sphere":
                        child = (
                          <a-sphere
                            radius={primitive.radius ?? 0.5}
                            color={primitive.color ?? defaultColor}
                          />
                        );
                        break;
                      case "cylinder":
                        child = (
                          <a-cylinder
                            radius={primitive.radius ?? 0.5}
                            height={primitive.height ?? 1}
                            color={primitive.color ?? defaultColor}
                          />
                        );
                        break;
                      case "plane":
                        child = (
                          <a-plane
                            width={primitive.width ?? 1}
                            height={primitive.height ?? 1}
                            color={primitive.color ?? defaultColor}
                          />
                        );
                        break;
                      case "torus":
                        child = (
                          <a-torus
                            radius={primitive.radius ?? 0.5}
                            radius-tubular={`${primitive.tubular ?? 0.1}`}
                            color={primitive.color ?? defaultColor}
                          />
                        );
                        break;
                      case "cone":
                        child = (
                          <a-cone
                            radius={primitive.radius ?? 0.5}
                            height={primitive.height ?? 1}
                            color={primitive.color ?? defaultColor}
                          />
                        );
                        break;
                      default:
                        child = (
                          <a-box
                            color={defaultColor}
                            width={1}
                            height={1}
                            depth={1}
                          />
                        );
                    }
                    return (
                      <a-entity key={`${id}-prim-${i}`} {...attrs}>
                        {child}
                      </a-entity>
                    );
                  })}

                  {/* Hotspots. Dangling bindings are tinted red in-scene so the state is visible outside the editor. */}
                  {hotspots.map((h, i) => (
                    <a-entity
                      key={`${id}-hotspot-${i}`}
                      ref={(el) => {
                        hotspotRefs.current.set(i, el as HTMLElement | null);
                      }}
                      position={h.position?.join(" ") ?? "0 1.6 -4"}
                      geometry="primitive: box; width: 0.6; height: 0.12; depth: 0.12"
                      material={
                        danglingHotspots.has(i)
                          ? "color: #ef4444; shader: flat"
                          : "color: #3b82f6; shader: flat"
                      }
                    />
                  ))}

                  {assets.map((asset) => {
                    const isError = Boolean(assetErrors[asset.id]);
                    if (asset.type === "image") {
                      return (
                        <a-entity
                          key={asset.id}
                          position={asset.position?.join(" ") ?? "0 0 0"}
                        >
                          <AFrameImageProbe
                            assetId={asset.id}
                            url={asset.url}
                            onLoaded={handleAssetLoaded}
                            onError={handleAssetError}
                          />
                          {isError && (
                            <a-entity position="0 0 0" className="error-label">
                              <a-text
                                value={assetErrors[asset.id]}
                                color="#ff4444"
                                align="center"
                                width={2}
                              />
                            </a-entity>
                          )}
                          <a-plane
                            width={2}
                            height={1.2}
                            material={`shader: flat; side: double; src: ${asset.url}`}
                          />
                          <a-text
                            value={
                              isError
                                ? dict.common.error
                                : asset.label ?? asset.type
                            }
                            color={isError ? "#ff4444" : "#fff"}
                            align="center"
                            width={2}
                            position="0 0.02 0"
                          />
                        </a-entity>
                      );
                    }
                    if (asset.type === "glb" || asset.type === "gltf") {
                      return (
                        <a-entity
                          key={asset.id}
                          position={asset.position?.join(" ") ?? "0 0 0"}
                        >
                          {isError && (
                            <a-text
                              value={`${dict.common.error}: ${
                                assetErrors[asset.id]
                              }`}
                              color="#ff4444"
                              align="center"
                              width={2}
                              position="0 0.5 0"
                            />
                          )}
                          <AFrameGltfEntity
                            assetId={asset.id}
                            url={asset.url}
                            scale={asset.scale}
                            onLoaded={handleAssetLoaded}
                            onError={handleAssetError}
                          />
                        </a-entity>
                      );
                    }
                    return null;
                  })}
                </a-scene>
              </div>
            ) : null}

            {/* Hotspot label chips, positioned by the rAF projection loop above. */}
            {isSceneMounted && hotspots.length > 0 && (
              <div className="aframe-hotspot-overlay">
                {hotspots.map((h, i) => (
                  <button
                    key={`hotspot-chip-${i}`}
                    ref={(el) => {
                      hotspotChipRefs.current.set(i, el);
                    }}
                    type="button"
                    className={`aframe-hotspot-chip ${
                      danglingHotspots.has(i)
                        ? "aframe-hotspot-chip-dangling"
                        : ""
                    }`}
                    onClick={() => focusHotspotTarget(h.blockId)}
                  >
                    <span className="aframe-hotspot-dot" />
                    <span className="aframe-hotspot-label">
                      {h.label ?? ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <BlockFooter
            updatedAt={data?.updatedAt}
            authorName={data?.authorName}
            isContentLocked={data?.isContentLocked}
            isPositionLocked={data?.isPositionLocked}
            dict={dict}
            lang={lang}
          />
        </div>

        <Handle
          id="left"
          type="source"
          position={Position.Left}
          isConnectable={true}
          className="block-handle block-handle-left z-50!"
        />
        <Handle
          id="left-target"
          type="target"
          position={Position.Left}
          isConnectable={true}
          className="block-handle block-handle-left z-50!"
        />
        <Handle
          id="right"
          type="source"
          position={Position.Right}
          isConnectable={true}
          className="block-handle block-handle-right z-50!"
        />
        <Handle
          id="right-target"
          type="target"
          position={Position.Right}
          isConnectable={true}
          className="block-handle block-handle-right z-50!"
        />
        <Handle
          id="top"
          type="source"
          position={Position.Top}
          isConnectable={true}
          className="block-handle block-handle-top z-50!"
        />
        <Handle
          id="top-target"
          type="target"
          position={Position.Top}
          isConnectable={true}
          className="block-handle block-handle-top z-50!"
        />
        <Handle
          id="bottom"
          type="source"
          position={Position.Bottom}
          isConnectable={true}
          className="block-handle block-handle-bottom z-50!"
        />
        <Handle
          id="bottom-target"
          type="target"
          position={Position.Bottom}
          isConnectable={true}
          className="block-handle block-handle-bottom z-50!"
        />
      </div>

      <BlockReactions
        reactions={data?.reactions}
        onReact={handleReact}
        onRemoveReaction={handleRemoveReaction}
        currentUserId={data?.currentUser?.id}
        isReadOnly={isReadOnly}
        canReact={canReact}
      />

      {isEditorOpen && (
        <div ref={editorRef} className="aframe-editor nodrag nopan nowheel">
          <div className="aframe-editor-header">
            {dict.blocks.blockType3DSceneEditor}
          </div>
          <div className="aframe-editor-actions">
            <button
              type="button"
              className="aframe-editor-btn"
              onClick={() => addPrimitive("box")}
            >
              Box
            </button>
            <button
              type="button"
              className="aframe-editor-btn"
              onClick={() => addPrimitive("sphere")}
            >
              Sphere
            </button>
            <button
              type="button"
              className="aframe-editor-btn"
              onClick={() => addPrimitive("cylinder")}
            >
              Cylinder
            </button>
            <button
              type="button"
              className="aframe-editor-btn"
              onClick={() => addPrimitive("plane")}
            >
              Plane
            </button>
            <button
              type="button"
              className="aframe-editor-btn"
              onClick={addHotspot}
            >
              Hotspot
            </button>
            <label className="aframe-editor-btn aframe-editor-upload">
              <input
                type="file"
                className="hidden"
                accept=".glb,.gltf,image/*"
                onChange={handleFileUpload}
              />
              {dict.blocks.uploadFile}
            </label>
          </div>
          {uploadError && (
            <div
              className="aframe-editor-error"
              role="alert"
              title={uploadError}
            >
              {dict.blocks.uploadError}
            </div>
          )}
          <div className="aframe-editor-list">
            {primitives.map((item, idx) => {
              const panelKey = String(item.id ?? `idx-${idx}`);
              const isPanelOpen = openPanels.has(panelKey);
              const sizeFields = PRIMITIVE_SIZE_FIELDS[item.type] ?? [];
              return (
                <div key={`prim-${idx}`} className="aframe-editor-item">
                  <div className="aframe-editor-row">
                    <button
                      type="button"
                      className="aframe-editor-expand-btn"
                      title={dict.blocks.blockType3DSceneDetails}
                      aria-expanded={isPanelOpen}
                      onClick={() => togglePanel(panelKey)}
                    >
                      {isPanelOpen ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </button>
                    <span className="aframe-editor-label">{item.type}</span>
                    <input
                      className="aframe-editor-color"
                      value={item.color ?? ""}
                      onChange={(e) =>
                        updatePrimitive(idx, { color: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      className="aframe-editor-icon-btn"
                      title={dict.common.delete}
                      onClick={() => removePrimitive(idx)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {isPanelOpen && (
                    <div className="aframe-editor-detail">
                      <div className="aframe-editor-group">
                        <div className="aframe-editor-detail-title">
                          {dict.blocks.blockType3DScenePosition}
                        </div>
                        <div className="aframe-editor-fields">
                          {(["X", "Y", "Z"] as const).map(
                            (axisLabel, axisIndex) => (
                              <EditorNumberField
                                key={`${panelKey}-pos-${axisLabel}`}
                                label={axisLabel}
                                title={`${dict.blocks.blockType3DScenePosition} ${axisLabel}`}
                                value={item.position?.[axisIndex] ?? 0}
                                onCommit={(value) =>
                                  commitVectorComponent(
                                    "primitives",
                                    idx,
                                    axisIndex,
                                    value,
                                  )
                                }
                              />
                            ),
                          )}
                        </div>
                      </div>
                      {sizeFields.length > 0 && (
                        <div className="aframe-editor-group">
                          <div className="aframe-editor-detail-title">
                            {dict.blocks.blockType3DSceneSize}
                          </div>
                          <div className="aframe-editor-fields">
                            {sizeFields.map((field) => (
                              <EditorNumberField
                                key={`${panelKey}-size-${field.key}`}
                                label={field.label}
                                title={field.label}
                                value={
                                  item[field.key] ??
                                  DEFAULT_PRIMITIVE_SIZES[item.type]?.[
                                    field.key
                                  ] ??
                                  0
                                }
                                validate={(parsed) => parsed > 0}
                                onCommit={(value) =>
                                  updatePrimitive(idx, {
                                    [field.key]: value,
                                  } as Partial<AFramePrimitiveData>)
                                }
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {hotspots.map((item, idx) => {
              const panelKey = String(item.id ?? `idx-${idx}`);
              const isPanelOpen = openPanels.has(panelKey);
              return (
                <div key={`hot-${idx}`} className="aframe-editor-item">
                  <div className="aframe-editor-row">
                    <button
                      type="button"
                      className="aframe-editor-expand-btn"
                      title={dict.blocks.blockType3DSceneDetails}
                      aria-expanded={isPanelOpen}
                      onClick={() => togglePanel(panelKey)}
                    >
                      {isPanelOpen ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </button>
                    <input
                      className="aframe-editor-input"
                      value={item.label ?? ""}
                      onChange={(e) =>
                        updateHotspot(idx, { label: e.target.value })
                      }
                    />
                    <select
                      className="aframe-editor-input"
                      title={dict.blocks.blockType3DSceneHotspotTarget}
                      value={item.blockId ?? ""}
                      onChange={(e) =>
                        updateHotspot(idx, { blockId: e.target.value })
                      }
                    >
                      <option value="">
                        {dict.blocks.blockType3DSceneHotspotNoTarget}
                      </option>
                      {/* Deleted target block: keep its id visible behind a placeholder so the binding reads as dangling. */}
                      {item.blockId &&
                        !hotspotTargetBlocks.some(
                          (n) => n.id === item.blockId,
                        ) && (
                          <option
                            value={item.blockId}
                            className="aframe-editor-stale-option"
                          >
                            {dict.blocks.blockType3DSceneHotspotDeleted}
                          </option>
                        )}
                      {hotspotTargetBlocks.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="aframe-editor-icon-btn"
                      title={dict.common.delete}
                      onClick={() => removeHotspot(idx)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {isPanelOpen && (
                    <div className="aframe-editor-detail">
                      <div className="aframe-editor-group">
                        <div className="aframe-editor-detail-title">
                          {dict.blocks.blockType3DScenePosition}
                        </div>
                        <div className="aframe-editor-fields">
                          {(["X", "Y", "Z"] as const).map(
                            (axisLabel, axisIndex) => (
                              <EditorNumberField
                                key={`${panelKey}-pos-${axisLabel}`}
                                label={axisLabel}
                                title={`${dict.blocks.blockType3DScenePosition} ${axisLabel}`}
                                value={item.position?.[axisIndex] ?? 0}
                                onCommit={(value) =>
                                  commitVectorComponent(
                                    "hotspots",
                                    idx,
                                    axisIndex,
                                    value,
                                  )
                                }
                              />
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {assets.map((item, idx) => {
              const panelKey = String(item.id ?? `idx-${idx}`);
              const isPanelOpen = openPanels.has(panelKey);
              return (
                <div key={`asset-${idx}`} className="aframe-editor-item">
                  <div className="aframe-editor-row">
                    <button
                      type="button"
                      className="aframe-editor-expand-btn"
                      title={dict.blocks.blockType3DSceneDetails}
                      aria-expanded={isPanelOpen}
                      onClick={() => togglePanel(panelKey)}
                    >
                      {isPanelOpen ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </button>
                    <span className="aframe-editor-label">{item.type}</span>
                    <span className="aframe-editor-asset-label truncate">
                      {item.label}
                    </span>
                    {!isReadOnly &&
                      (item.type === "glb" || item.type === "gltf") && (
                        <EditorNumberField
                          key={`scale-${item.id}`}
                          title="Scale"
                          className="aframe-editor-scale"
                          value={item.scale ?? DEFAULT_ASSET_SCALE}
                          validate={(parsed) => parsed > 0}
                          onCommit={(value) =>
                            updateAsset(idx, { scale: value })
                          }
                        />
                      )}
                    {!isReadOnly && (
                      <button
                        type="button"
                        className="aframe-editor-icon-btn"
                        title={dict.common.delete}
                        onClick={() => removeAsset(idx)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {isPanelOpen && (
                    <div className="aframe-editor-detail">
                      <div className="aframe-editor-group">
                        <div className="aframe-editor-detail-title">
                          {dict.blocks.blockType3DScenePosition}
                        </div>
                        <div className="aframe-editor-fields">
                          {(["X", "Y", "Z"] as const).map(
                            (axisLabel, axisIndex) => (
                              <EditorNumberField
                                key={`${panelKey}-pos-${axisLabel}`}
                                label={axisLabel}
                                title={`${dict.blocks.blockType3DScenePosition} ${axisLabel}`}
                                value={item.position?.[axisIndex] ?? 0}
                                onCommit={(value) =>
                                  commitVectorComponent(
                                    "assets",
                                    idx,
                                    axisIndex,
                                    value,
                                  )
                                }
                              />
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
});

AFrameBlock.displayName = "AFrameBlock";
export default AFrameBlock;
