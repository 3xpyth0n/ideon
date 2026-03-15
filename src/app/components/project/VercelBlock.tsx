"use client";

import { memo, useState, useEffect, useRef, useCallback } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import {
  ExternalLink,
  GitBranch,
  GitCommit,
  Clock,
  RefreshCw,
  Square,
  Play,
  Terminal,
  MoreVertical,
  Key,
  Globe,
  ShieldAlert,
  Archive,
  ArrowUpCircle,
  Undo2,
  Loader2,
  CheckCircle2,
  Edit2,
} from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useTouchGestures } from "./hooks/useTouchGestures";
import { useTouch } from "@providers/TouchProvider";
import { CanvasBlockProps } from "./CanvasBlock";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import { BlockFooter } from "./BlockFooter";
import CustomNodeResizer from "./CustomNodeResizer";
import { parseOptionalJsonRecord } from "@lib/metadata-parsers";
import { VercelIcon } from "@components/icons/VercelIcon";
import { Select } from "@components/ui/Select";
import { VercelLogsModal } from "./VercelLogsModal";
import { VercelEnvVarsModal } from "./VercelEnvVarsModal";
import { VercelPreviewsModal } from "./VercelPreviewsModal";
import { DomainsPopover, BypassPopover } from "./VercelPopovers";
import { isRedeploy } from "@lib/vercel-shared";

interface VercelProject {
  vercelProjectId: string;
  vercelProjectName: string;
  scopeSlug?: string | null;
}

interface Deployment {
  id: string;
  name: string;
  url: string;
  state: "READY" | "BUILDING" | "ERROR" | "QUEUED" | "CANCELED" | string;
  created: number;
  source: string | null;
  commitMessage: string | null;
  branch: string | null;
  creator: string | null;
}

interface VercelMetadata {
  vercelProjectId?: string;
  vercelProjectName?: string;
  vercelScopeSlug?: string | null;
  connectedUserId?: string;
  connectedUserName?: string;
  [key: string]: unknown;
}

const VercelBlock = (props: CanvasBlockProps) => {
  const { id, data, selected } = props;
  const { dict } = useI18n();
  const isLocked = data.isLocked;
  const isPreviewMode = data.isPreviewMode;

  const currentUser = data.currentUser;
  const projectOwnerId = data.projectOwnerId;
  const ownerId = data.ownerId;
  const { setNodes } = useReactFlow();

  const { rippleRef } = useTouch();

  const isProjectOwner = currentUser?.id && projectOwnerId === currentUser.id;
  const isOwner = currentUser?.id && ownerId === currentUser.id;
  const isViewer = data.userRole === "viewer";
  const isReadOnly =
    isPreviewMode ||
    isViewer ||
    (isLocked ? !isOwner && !isProjectOwner : false);
  const canReact = !isPreviewMode || isViewer;

  const { handleReact, handleRemoveReaction } = useBlockReactions({
    id,
    data,
    currentUser,
    isReadOnly,
    canReact,
  });

  const [metadata, setMetadata] = useState<VercelMetadata | null>(() => {
    return parseOptionalJsonRecord(data.metadata) as VercelMetadata | null;
  });

  const metadataRef = useRef(metadata);
  useEffect(() => {
    metadataRef.current = metadata;
  }, [metadata]);

  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const incomingMetadata = parseOptionalJsonRecord(
      data.metadata,
    ) as VercelMetadata | null;

    if (JSON.stringify(incomingMetadata) !== JSON.stringify(metadata)) {
      setMetadata(incomingMetadata);
    }
  }, [data.metadata, metadata]);

  const [isEditing, setIsEditing] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<
    "loading" | "connected" | "disconnected"
  >("loading");
  const [availableProjects, setAvailableProjects] = useState<VercelProject[]>(
    [],
  );
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [projectDomains, setProjectDomains] = useState<string[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [cancelling] = useState(false);
  const [fetchingDeployments, setFetchingDeployments] = useState(false);
  const [title, setTitle] = useState(data.title || "");

  // UI States
  const [showMenu, setShowMenu] = useState(false);
  const [showLogs, setShowLogs] = useState<string | null>(null);
  const [showEnvVars, setShowEnvVars] = useState(false);
  const [showPreviews, setShowPreviews] = useState(false);
  const [showDomains, setShowDomains] = useState(false);
  const [showBypass, setShowBypass] = useState(false);
  const [confirmingAction, setConfirmingAction] = useState<{
    id: string;
    type: "rollback" | "cancel" | "promote";
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Close popovers and menus when block loses focus
  useEffect(() => {
    if (!selected) {
      setShowMenu(false);
      setShowDomains(false);
      setShowBypass(false);
      setConfirmingAction(null);
    }
  }, [selected]);

  // Connection check
  useEffect(() => {
    if (isReadOnly || isPreviewMode) return;

    fetch("/api/vercel/token")
      .then((res) => {
        if (!res.ok) throw new Error("Not connected");
        return res.json();
      })
      .then((data) => {
        setTokenStatus(data.connected ? "connected" : "disconnected");
        if (data.connected && isEditing) {
          fetchAvailableProjects();
        }
      })
      .catch(() => setTokenStatus("disconnected"));
  }, [isReadOnly, isPreviewMode, isEditing]);

  const fetchAvailableProjects = async () => {
    try {
      const res = await fetch("/api/vercel/projects");
      if (res.ok) {
        const data = await res.json();
        setAvailableProjects(
          data.filter((p: { enabled: boolean }) => p.enabled),
        );
      }
    } catch {
      /* empty */
    }
  };

  const fetchDeployments = useCallback(async () => {
    if (!metadata?.vercelProjectId) return;
    setFetchingDeployments(true);

    try {
      const res = await fetch(
        `/api/vercel/deployments?projectId=${metadata.vercelProjectId}`,
      );
      if (res.ok) {
        setDeployments(await res.json());
      }
    } catch {
      /* empty */
    } finally {
      setFetchingDeployments(false);
    }
  }, [metadata?.vercelProjectId]);

  const fetchProjectDomains = useCallback(async () => {
    if (!metadata?.vercelProjectId) return;

    try {
      const res = await fetch(
        `/api/vercel/projects/${metadata.vercelProjectId}/domains`,
      );
      if (res.ok) {
        const domains = await res.json();
        setProjectDomains(domains.map((d: { name: string }) => d.name));
      }
    } catch {
      /* empty */
    }
  }, [metadata?.vercelProjectId]);

  // Polling deployments
  useEffect(() => {
    if (metadata?.vercelProjectId && !isPreviewMode) {
      fetchDeployments();
      fetchProjectDomains();
      const interval = setInterval(fetchDeployments, 30000);
      return () => clearInterval(interval);
    }
  }, [
    metadata?.vercelProjectId,
    isPreviewMode,
    fetchDeployments,
    fetchProjectDomains,
  ]);

  const handleContentContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (isReadOnly) return;
      e.preventDefault();
      e.stopPropagation();

      setIsEditing(true);

      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, selected: true } : { ...n, selected: false },
        ),
      );
    },
    [id, isReadOnly, setNodes],
  );

  const onLongPress = useCallback(
    (e: React.TouchEvent | TouchEvent) => {
      handleContentContextMenu(e as unknown as React.MouseEvent);
    },
    [handleContentContextMenu],
  );

  const touchHandlers = useTouchGestures({
    rippleRef,
    onLongPress,
    stopPropagation: true,
  });

  const updateMetadata = useCallback(
    (newMetadata: VercelMetadata | null) => {
      setMetadata(newMetadata);
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.project.anonymous;
      const metadataString = newMetadata
        ? JSON.stringify(newMetadata)
        : undefined;
      const currentData = dataRef.current;

      currentData.onContentChange?.(
        id,
        currentData.content,
        now,
        editor,
        metadataString,
        currentData.title,
        currentData.reactions,
      );

      if (setNodes) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    metadata: metadataString,
                  },
                }
              : n,
          ),
        );
      }
    },
    [currentUser, dict.project.anonymous, id, setNodes, title],
  );

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      setTitle(newTitle);
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.project.anonymous;
      const metadataString = metadata ? JSON.stringify(metadata) : undefined;
      const currentData = dataRef.current;

      currentData.onContentChange?.(
        id,
        currentData.content,
        now,
        editor,
        metadataString,
        newTitle,
        currentData.reactions,
      );
    },
    [currentUser, dict.project.anonymous, id, metadata],
  );

  const handleProjectSelect = (projectId: string) => {
    const project = availableProjects.find(
      (p) => p.vercelProjectId === projectId,
    );
    if (!project) return;

    updateMetadata({
      ...metadata,
      vercelProjectId: project.vercelProjectId,
      vercelProjectName: project.vercelProjectName,
      vercelScopeSlug: project.scopeSlug,
      connectedUserId: currentUser?.id,
      connectedUserName: currentUser?.displayName || currentUser?.username,
    });
    setIsEditing(false);
  };

  const handleRedeploy = async () => {
    if (!metadata?.vercelProjectId || deployments.length === 0 || deploying)
      return;

    setDeploying(true);
    try {
      const res = await fetch("/api/vercel/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: metadata.vercelProjectId,
          deploymentId: deployments[0].id,
          name: metadata.vercelProjectName,
        }),
      });

      if (res.ok) {
        fetchDeployments();
      }
    } catch {
      /* empty */
    } finally {
      setDeploying(false);
    }
  };

  const handlePromote = async (deploymentId: string) => {
    if (!metadata?.vercelProjectId || actionLoading) return;

    setActionLoading(deploymentId);
    try {
      const res = await fetch("/api/vercel/deployments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: metadata.vercelProjectId,
          deploymentId,
        }),
      });

      if (res.ok) {
        fetchDeployments();
        setConfirmingAction(null);
      }
    } catch {
      /* empty */
    } finally {
      setActionLoading(null);
    }
  };

  const isBlockTokenOwner = currentUser?.id === metadata?.connectedUserId;

  const getStatusColor = (state: string) => {
    switch (state.toUpperCase()) {
      case "READY":
        return "#00fb9a";
      case "ERROR":
      case "CANCELED":
        return "#ff0050";
      case "BUILDING":
        return "#0070f3";
      case "QUEUED":
        return "#888888";
      default:
        return "#888888";
    }
  };

  const blocksDict = (dict.blocks || {}) as Record<string, string>;

  const getStateLabel = (state: string) => {
    switch (state.toUpperCase()) {
      case "INITIALIZING":
        return blocksDict.vercelDeploymentInitializing || "Initializing";
      case "QUEUED":
        return blocksDict.vercelDeploymentQueued || "Queued";
      case "BUILDING":
        return blocksDict.vercelDeploymentBuilding || "Building";
        return blocksDict.vercelDeploymentReady || "Ready";
      case "ERROR":
        return blocksDict.vercelDeploymentError || "Error";
      case "CANCELED":
        return blocksDict.vercelDeploymentCanceled || "Canceled";
      default:
        return state;
    }
  };

  return (
    <div
      ref={rippleRef as unknown as React.Ref<HTMLDivElement>}
      {...touchHandlers}
      className={`block-card block-type-vercel ${selected ? "selected" : ""} ${
        isReadOnly ? "read-only" : ""
      } flex flex-col p-0! relative w-full h-full`}
      onContextMenu={handleContentContextMenu}
    >
      <CustomNodeResizer
        isVisible={!isReadOnly}
        minWidth={300}
        minHeight={150}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        keepAspectRatio={false}
      />

      <div className="w-full h-full flex flex-col overflow-hidden rounded-[inherit] px-2 relative">
        {!isReadOnly && !isEditing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 transition-opacity">
            <span className="canvas-context-badge">
              {dict.canvas?.rightClickToEdit || "Right click to edit"}
            </span>
          </div>
        )}
        <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
          <div className="flex items-center gap-2">
            <VercelIcon size={14} className="block-type-icon vercel" />
            <span className="text-sm uppercase tracking-wider opacity-60 font-black overflow-hidden text-ellipsis whitespace-nowrap">
              VERCEL
            </span>
            <div className="w-px h-3 bg-(--border-color) opacity-30 mx-1" />
            <span className="text-[11px] opacity-40 font-medium truncate max-w-25 mr-2">
              {metadata?.vercelProjectName || blocksDict.project}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
            {metadata?.vercelProjectId && (
              <div className="flex items-center gap-2 mr-2">
                {deploying || fetchingDeployments || cancelling ? (
                  <RefreshCw size={14} className="animate-spin opacity-50" />
                ) : null}
              </div>
            )}
            <input
              value={title}
              onChange={handleTitleChange}
              className="block-title"
              placeholder={dict.blocks.title || "..."}
              readOnly={isReadOnly}
            />
            {!isReadOnly && metadata?.vercelProjectId && (
              <div className="relative">
                <button
                  onClick={() => {
                    if (!showMenu) {
                      setShowDomains(false);
                      setShowBypass(false);
                    }
                    setShowMenu(!showMenu);
                  }}
                  className={`p-1 rounded-md hover:bg-(--bg-sidebar) transition-colors ${
                    showMenu
                      ? "bg-(--bg-sidebar) text-(--brand-primary)"
                      : "opacity-40"
                  }`}
                >
                  <MoreVertical size={16} />
                </button>
                {showMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-80"
                      onClick={() => setShowMenu(false)}
                    />
                    <div className="absolute top-full right-0 mt-1 w-48 bg-(--bg-island) border border-(--border) rounded-xl shadow-2xl z-90 py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                      <button
                        onClick={() => {
                          setIsEditing(true);
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-[11px] font-medium hover:bg-(--bg-sidebar) transition-colors text-left"
                      >
                        <Edit2 size={14} className="opacity-40" />
                        {dict.common?.edit || "Edit"}
                      </button>
                      <button
                        onClick={() => {
                          setShowPreviews(true);
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-[11px] font-medium hover:bg-(--bg-sidebar) transition-colors text-left"
                      >
                        <Archive size={14} className="opacity-40" />
                        {blocksDict.vercelActivePreviews || "Active Previews"}
                      </button>
                      <button
                        onClick={() => {
                          setShowEnvVars(true);
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-[11px] font-medium hover:bg-(--bg-sidebar) transition-colors text-left"
                      >
                        <Key size={14} className="opacity-40" />
                        {blocksDict.vercelEnvVariables || "Env Variables"}
                      </button>
                      <div className="h-px bg-(--border) my-1 opacity-50" />
                      <button
                        onClick={() => {
                          setShowDomains(!showDomains);
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center justify-between px-4 py-2 text-[11px] font-medium hover:bg-(--bg-sidebar) transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <Globe size={14} className="opacity-40" />
                          {blocksDict.vercelDomains || "Domains & DNS"}
                        </div>
                        {showDomains && (
                          <div className="w-1.5 h-1.5 rounded-full bg-(--brand-primary)" />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setShowBypass(!showBypass);
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center justify-between px-4 py-2 text-[11px] font-medium hover:bg-(--bg-sidebar) transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <ShieldAlert
                            size={14}
                            className="opacity-40 text-red-500"
                          />
                          {blocksDict.vercelBypassProtection ||
                            "Bypass Protection"}
                        </div>
                        {showBypass && (
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        )}
                      </button>
                    </div>
                  </>
                )}
                {showDomains && (
                  <DomainsPopover
                    projectId={metadata.vercelProjectId}
                    onClose={() => setShowDomains(false)}
                  />
                )}
                {showBypass && (
                  <BypassPopover
                    projectId={metadata.vercelProjectId}
                    onClose={() => setShowBypass(false)}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div
          className="block-content flex-1 flex flex-col min-h-0 bg-(--bg-island) rounded-b-[inherit] overflow-y-auto nopan nodrag nowheel"
          onWheel={(e) => e.stopPropagation()}
        >
          {!metadata?.vercelProjectId && !isEditing ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <div className="bg-(--bg-island) border border-dashed border-(--border)ded-xl p-6 flex flex-col items-center w-full max-w-70">
                <VercelIcon
                  size={28}
                  className="mb-3 opacity-40 text-(--text-primary)"
                />
                <p className="text-sm font-semibold mb-1 text-(--text-primary)">
                  {blocksDict.vercelNotConfigured}
                </p>
                <span className="opacity-60 text-xs">
                  {blocksDict.vercelRightClick ||
                    "Right-click to configure Vercel"}
                </span>
              </div>
            </div>
          ) : isEditing ? (
            <div className="flex flex-col items-center justify-center gap-4 p-5 w-full h-full bg-(--bg-secondary) relative">
              <button
                onClick={() => setIsEditing(false)}
                className="absolute top-4 right-4 text-[10px] uppercase font-bold opacity-40 hover:opacity-100 transition-opacity"
              >
                {dict.common?.close || "Close"}
              </button>
              <div className="w-full max-w-70 flex flex-col gap-4">
                <p className="text-[12px] font-semibold text-(--text-secondary) uppercase tracking-wider text-center">
                  {blocksDict.vercelSelectProject || "Select Vercel Project"}
                </p>
                {tokenStatus === "loading" ? (
                  <div className="flex justify-center p-4">
                    <RefreshCw size={18} className="animate-spin opacity-50" />
                  </div>
                ) : tokenStatus === "disconnected" ? (
                  <div className="flex flex-col items-center justify-center p-5 text-center bg-(--bg-primary) border border-(--status-error) border-opacity-30 rounded-lg">
                    <span className="text-[13px] font-medium text-(--status-error) mb-1">
                      {blocksDict.vercelDisconnectedTitle || "Disconnected"}
                    </span>
                    <span className="text-[12px] opacity-70">
                      {blocksDict.vercelNoToken ||
                        "Connect your Vercel account in Integrations settings."}
                    </span>
                  </div>
                ) : availableProjects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-5 text-center bg-(--bg-primary) border border-(--status-warning) border-opacity-30 rounded-lg">
                    <span className="text-[13px] font-medium text-(--status-warning) mb-1">
                      {blocksDict.vercelNoProjectsTitle || "No Projects"}
                    </span>
                    <span className="text-[12px] opacity-70">
                      {blocksDict.vercelNoProjects ||
                        "No projects enabled. Configure in Integrations."}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Select
                      value={metadata?.vercelProjectId || ""}
                      options={availableProjects.map((p) => ({
                        value: p.vercelProjectId,
                        label: p.vercelProjectName,
                      }))}
                      onChange={handleProjectSelect}
                      className="w-full"
                      triggerClassName="w-full flex items-center justify-between px-3 py-2.5 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg hover:border-[var(--text-tertiary)] transition-colors focus:ring-2 focus:ring-[var(--brand-primary)] outline-none text-sm"
                      dropdownClassName="bg-[var(--bg-primary)] border border-[var(--border-color)] shadow-lg rounded-lg overflow-hidden py-1 mt-1 z-[9999]"
                      optionClassName="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[var(--bg-tertiary)] transition-colors text-sm"
                    />
                    {!metadata?.vercelProjectId && (
                      <p className="text-[11px] text-(--text-tertiary) italic px-1 pt-1 opacity-80 text-center">
                        {blocksDict.vercelPickProject ||
                          "Pick a project from the dropdown to continue."}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              className="flex flex-col gap-4 p-4 overflow-y-auto w-full h-full relative nopan nodrag nowheel"
              onWheel={(e) => e.stopPropagation()}
            >
              {!isReadOnly && (
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                  <span className="text-[9px] uppercase font-bold tracking-tighter bg-(--bg-primary) px-1.5 py-0.5 rounded border border-(--border-color) opacity-40">
                    {blocksDict.vercelRightClickEdit || "R-Click Edit"}
                  </span>
                </div>
              )}
              {deployments.length > 0 ? (
                <>
                  <div className="bg-(--bg-primary) border border-(--border-color) rounded-xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="relative flex items-center justify-center w-6 h-6">
                          {deploying ? (
                            <RefreshCw
                              size={14}
                              className="animate-spin opacity-50"
                            />
                          ) : (
                            <div
                              className={`w-2.5 h-2.5 rounded-full ring-2 ring-(--bg-primary) ${
                                deployments[0].state === "BUILDING"
                                  ? "animate-pulse"
                                  : ""
                              }`}
                              style={{
                                backgroundColor: getStatusColor(
                                  deployments[0].state,
                                ),
                              }}
                            />
                          )}
                        </div>
                        <span className="text-xs font-bold uppercase tracking-widest text-(--text-primary)">
                          {getStateLabel(deployments[0].state)}
                        </span>
                      </div>
                      <a
                        href={
                          projectDomains.length > 0
                            ? `https://${projectDomains[0]}`
                            : `https://${deployments[0].url}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-(--text-tertiary) flex items-center gap-1.5 hover:text-(--text-primary) transition-colors bg-(--bg-secondary) px-2 py-1 rounded-md"
                      >
                        <span className="max-w-30 truncate">
                          {projectDomains.length > 0
                            ? projectDomains[0]
                            : deployments[0].url}
                        </span>
                        <ExternalLink size={10} />
                      </a>
                    </div>

                    <div className="space-y-3 mb-5">
                      <div className="flex items-start gap-2 group">
                        <GitCommit
                          size={14}
                          className="mt-0.5 opacity-40 group-hover:opacity-70 transition-opacity shrink-0"
                        />
                        <span className="text-[13px] leading-tight font-medium text-(--text-secondary)">
                          {deployments[0].commitMessage ||
                            blocksDict.vercelManualDeployment ||
                            "Manual Deployment"}
                          {isRedeploy(deployments[0]) && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-(--brand-primary)/10 text-(--brand-primary) text-[9px] font-bold uppercase border border-(--brand-primary)/20 align-middle">
                              {blocksDict.vercelRedeployBadge || "Redeploy"}
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-[11px] opacity-50 font-medium">
                        {deployments[0].branch && (
                          <span className="flex items-center gap-1.5 bg-(--bg-secondary) px-2 py-0.5 rounded">
                            <GitBranch size={11} />
                            {deployments[0].branch}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <Clock size={11} />
                          {new Date(
                            deployments[0].created,
                          ).toLocaleDateString()}{" "}
                          {new Date(deployments[0].created).toLocaleTimeString(
                            [],
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                        </span>
                      </div>
                    </div>

                    {!isReadOnly && isBlockTokenOwner && (
                      <div className="grid grid-cols-2 gap-3 mt-4">
                        <button
                          className="zen-button-outline group flex items-center justify-center gap-2"
                          onClick={handleRedeploy}
                          disabled={deploying || cancelling}
                        >
                          <Play
                            size={12}
                            className={
                              deploying
                                ? "animate-spin"
                                : "opacity-70 group-hover:text-(--brand-primary) group-hover:opacity-100 transition-colors"
                            }
                          />
                          <span className="text-[11px] font-bold uppercase tracking-wider">
                            {blocksDict.vercelRedeploy || "Redeploy"}
                          </span>
                        </button>
                        {cancelling ? (
                          <button
                            className="zen-button-outline group flex items-center justify-center gap-2"
                            disabled
                          >
                            <Square
                              size={12}
                              fill="currentColor"
                              className="opacity-70"
                            />
                            <span className="text-[11px] font-bold uppercase tracking-wider">
                              {blocksDict.vercelCancel || "Cancel"}
                            </span>
                          </button>
                        ) : (
                          <button
                            className="zen-button-outline group flex items-center justify-center gap-2"
                            onClick={() => setShowLogs(deployments[0].id)}
                          >
                            <Terminal
                              size={12}
                              className="opacity-70 group-hover:text-(--brand-primary) group-hover:opacity-100 transition-colors"
                            />
                            <span className="text-[11px] font-bold uppercase tracking-wider">
                              {blocksDict.vercelLogs || "Logs"}
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {deployments.length > 1 && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-px flex-1 bg-(--border) opacity-20" />
                        <span className="text-[10px] uppercase tracking-widest font-black opacity-30">
                          {blocksDict.vercelDeploymentHistory || "History"}
                        </span>
                        <div className="h-px flex-1 bg-(--border) opacity-20" />
                      </div>
                      <div className="space-y-1">
                        {deployments.slice(0, 5).map((d, idx) => (
                          <div
                            key={d.id}
                            className={`flex flex-col rounded-lg transition-colors group/item ${
                              confirmingAction?.id === d.id
                                ? "bg-(--bg-tertiary) p-3 border border-(--border-color) my-1"
                                : "p-2 hover:bg-(--bg-primary)"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    d.state === "BUILDING"
                                      ? "animate-pulse"
                                      : ""
                                  }`}
                                  style={{
                                    backgroundColor: getStatusColor(d.state),
                                  }}
                                />
                                <span className="truncate text-[11px] font-medium text-(--text-secondary) group-hover/item:text-(--text-primary) transition-colors flex items-center gap-2">
                                  {d.commitMessage || d.url}
                                  {isRedeploy(d) && (
                                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-(--brand-primary)/10 text-(--brand-primary) text-[9px] font-bold uppercase border border-(--brand-primary)/20 align-middle">
                                      {blocksDict.vercelRedeployBadge ||
                                        "Redeploy"}
                                    </span>
                                  )}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 ml-2">
                                {!isReadOnly &&
                                  isBlockTokenOwner &&
                                  idx > 0 &&
                                  !confirmingAction && (
                                    <div className="flex items-center gap-1.5 opacity-60 group-hover/item:opacity-100 transition-opacity">
                                      <button
                                        onClick={() =>
                                          setConfirmingAction({
                                            id: d.id,
                                            type: "promote",
                                          })
                                        }
                                        className="flex items-center gap-1.5 px-2 py-1 rounded bg-(--bg-island) border border-(--border-color) shadow-sm hover:bg-(--bg-tertiary) hover:border-(--brand-primary) hover:text-(--brand-primary) transition-all text-[10px] font-medium text-(--text-secondary)"
                                        title={
                                          blocksDict.vercelPromoteRollback ||
                                          "Promote / Rollback"
                                        }
                                      >
                                        {idx === 1 ? (
                                          <ArrowUpCircle size={12} />
                                        ) : (
                                          <Undo2 size={12} />
                                        )}
                                        {idx === 1
                                          ? blocksDict.vercelPromote ||
                                            "Promote"
                                          : blocksDict.vercelRollback ||
                                            "Rollback"}
                                      </button>
                                    </div>
                                  )}
                                <span className="text-[9px] opacity-40 font-mono shrink-0">
                                  {new Date(d.created).toLocaleDateString([], {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                              </div>
                            </div>

                            {!isReadOnly &&
                              isBlockTokenOwner &&
                              confirmingAction?.id === d.id && (
                                <div className="mt-2 flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                  <span className="text-[10px] font-bold opacity-60 uppercase text-center">
                                    {confirmingAction.type === "promote"
                                      ? blocksDict.vercelConfirmPromotion ||
                                        "Confirm Promotion?"
                                      : blocksDict.vercelConfirmRollback ||
                                        "Confirm Rollback?"}
                                  </span>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handlePromote(d.id)}
                                      disabled={actionLoading === d.id}
                                      className="flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest bg-(--brand-primary) text-white rounded-md flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50"
                                    >
                                      {actionLoading === d.id ? (
                                        <Loader2
                                          size={10}
                                          className="animate-spin"
                                        />
                                      ) : (
                                        <CheckCircle2 size={10} />
                                      )}
                                      {blocksDict.vercelConfirm || "Confirm"}
                                    </button>
                                    <button
                                      onClick={() => setConfirmingAction(null)}
                                      className="flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest bg-(--bg-secondary) border border-(--border-color) hover:bg-(--bg-tertiary) hover:border-(--text-tertiary) transition-colors rounded-md text-(--text-secondary)"
                                    >
                                      {blocksDict.vercelCancel || "Cancel"}
                                    </button>
                                  </div>
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center p-5 text-center">
                  <span className="opacity-60 text-sm">
                    {fetchingDeployments
                      ? blocksDict.vercelLoadingDeployments ||
                        "Loading deployments..."
                      : blocksDict.vercelNoDeploymentsFound ||
                        "No deployments found."}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <BlockFooter
          updatedAt={
            typeof data.updatedAt === "string" ? data.updatedAt : undefined
          }
          authorName={
            typeof data.lastEditor === "string" ? data.lastEditor : undefined
          }
          isLocked={isLocked}
          dict={dict}
          lang={((dict as Record<string, unknown>).lang as string) || "en"}
        />
      </div>

      <VercelLogsModal
        isOpen={!!showLogs}
        onClose={() => setShowLogs(null)}
        deploymentId={showLogs || ""}
        deploymentUrl={deployments.find((d) => d.id === showLogs)?.url || ""}
      />

      <VercelEnvVarsModal
        isOpen={showEnvVars}
        onClose={() => setShowEnvVars(false)}
        projectId={metadata?.vercelProjectId || ""}
      />

      <VercelPreviewsModal
        isOpen={showPreviews}
        onClose={() => setShowPreviews(false)}
        projectId={metadata?.vercelProjectId || ""}
        projectName={metadata?.vercelProjectName || ""}
      />

      <BlockReactions
        reactions={data.reactions || []}
        onReact={handleReact}
        onRemoveReaction={handleRemoveReaction}
        currentUserId={currentUser?.id}
        isReadOnly={isReadOnly}
        canReact={canReact}
      />

      <Handle
        id="left"
        type="source"
        position={Position.Left}
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-left z-50! ${
          isReadOnly ? "opacity-0! pointer-events-none!" : ""
        }`}
      >
        <div className="handle-dot" />
      </Handle>

      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-right z-50! ${
          isReadOnly ? "opacity-0! pointer-events-none!" : ""
        }`}
      >
        <div className="handle-dot" />
      </Handle>

      <Handle
        id="top"
        type="source"
        position={Position.Top}
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-top z-50! ${
          isReadOnly ? "opacity-0! pointer-events-none!" : ""
        }`}
      >
        <div className="handle-dot" />
      </Handle>

      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-bottom z-50! ${
          isReadOnly ? "opacity-0! pointer-events-none!" : ""
        }`}
      >
        <div className="handle-dot" />
      </Handle>
    </div>
  );
};

export default memo(VercelBlock);
