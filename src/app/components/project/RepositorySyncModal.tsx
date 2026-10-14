"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@providers/I18nProvider";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Select } from "@components/ui/Select";
import { GitBranch, RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface RepositorySyncConflict {
  path: string;
  kind: "project" | "block" | "link" | "file";
}

type ConflictMode = "manual" | "git-wins" | "ideon-wins";

interface SyncSettings {
  configured: boolean;
  repositoryUrl: string | null;
  repositoryUsername: string | null;
  branch: string | null;
  repositoryPath: string;
  lastSyncedCommit: string | null;
  updatedAt: string | null;
}

interface RepositorySyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export function RepositorySyncModal({
  isOpen,
  onClose,
  projectId,
}: RepositorySyncModalProps) {
  const { dict } = useI18n();

  const [activeTab, setActiveTab] = useState<"configure" | "status">(
    "configure",
  );
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [conflicts, setConflicts] = useState<RepositorySyncConflict[]>([]);

  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [repositoryUsername, setRepositoryUsername] = useState("");
  const [mode, setMode] = useState<ConflictMode>("manual");

  const [lastSyncedCommit, setLastSyncedCommit] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);

  const applySettings = useCallback((data: SyncSettings) => {
    setIsConfigured(data.configured);
    setRepositoryUrl(data.repositoryUrl ?? "");
    setBranch(data.branch ?? "main");
    setRepositoryPath(data.repositoryPath ?? "");
    setRepositoryUsername(data.repositoryUsername ?? "");
    setLastSyncedCommit(data.lastSyncedCommit);
    setUpdatedAt(data.updatedAt);
  }, []);

  const fetchSettings = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/repository-sync`);
      if (res.ok) {
        applySettings(await res.json());
      }
    } catch {
      // silent — modal will show empty state
    } finally {
      setLoading(false);
    }
  }, [isOpen, projectId, applySettings]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (isOpen) {
      setConflicts([]);
    }
  }, [isOpen]);

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/repository-sync`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryUrl,
          branch,
          repositoryPath,
          repositoryUsername: repositoryUsername.trim() || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        applySettings({ ...data, configured: true });
        toast.success(dict.repositorySync.settingsSaved);
      } else {
        const data = await res.json();
        toast.error(data.error || dict.repositorySync.settingsFailed);
      }
    } catch {
      toast.error(dict.common.error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (overrideMode?: ConflictMode) => {
    setSyncing(true);
    setConflicts([]);
    const syncMode = overrideMode ?? mode;
    try {
      const res = await fetch(
        `/api/projects/${projectId}/repository-sync/remote?mode=${syncMode}`,
        { method: "POST" },
      );
      const data = await res.json();
      if (res.ok) {
        toast.success(dict.repositorySync.syncSuccess);
        await fetchSettings();
        setActiveTab("status");
      } else if (res.status === 409 && Array.isArray(data.conflicts)) {
        setConflicts(data.conflicts);
        setActiveTab("status");
      } else {
        const errorKey = resolveErrorKey(data.code);
        toast.error(dict.repositorySync[errorKey] ?? dict.common.error);
      }
    } catch {
      toast.error(dict.common.error);
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm(dict.repositorySync.disconnectConfirm)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/repository-sync`, {
        method: "DELETE",
      });
      if (res.ok) {
        setIsConfigured(false);
        setRepositoryUrl("");
        setBranch("main");
        setRepositoryPath("");
        setRepositoryUsername("");
        setLastSyncedCommit(null);
        setUpdatedAt(null);
        setConflicts([]);
        toast.success(dict.repositorySync.disconnected);
      } else {
        toast.error(dict.common.error);
      }
    } catch {
      toast.error(dict.common.error);
    } finally {
      setLoading(false);
    }
  };

  const conflictLabel = (conflict: RepositorySyncConflict): string => {
    if (conflict.kind === "file") {
      return conflict.path.replace(/^\.ideon\//, "");
    }
    const parts = conflict.path.split("/");
    const entityMap: Record<string, string> = {
      block: dict.repositorySync.conflictEntityBlock,
      link: dict.repositorySync.conflictEntityLink,
      project: dict.repositorySync.conflictEntityProject,
    };
    const entity = entityMap[conflict.kind] ?? conflict.kind;
    const id =
      conflict.kind === "block" || conflict.kind === "link"
        ? parts[1].slice(0, 8)
        : null;
    const fieldPath = parts.slice(id ? 2 : 1).join("/");
    const fieldMap: Record<string, string> = {
      name: dict.repositorySync.conflictFieldName,
      description: dict.repositorySync.conflictFieldDescription,
      content: dict.repositorySync.conflictFieldContent,
      metadata: dict.repositorySync.conflictFieldMetadata,
      position: dict.repositorySync.conflictFieldPosition,
      dimensions: dict.repositorySync.conflictFieldDimensions,
      canvasId: dict.repositorySync.conflictFieldCanvasId,
      blockType: dict.repositorySync.conflictFieldBlockType,
      parentBlockId: dict.repositorySync.conflictFieldParentBlockId,
      dataPath: dict.repositorySync.conflictFieldDataPath,
      contentPath: dict.repositorySync.conflictFieldContentPath,
      noteDocumentPath: dict.repositorySync.conflictFieldNoteDocumentPath,
      source: dict.repositorySync.conflictFieldSource,
      target: dict.repositorySync.conflictFieldTarget,
      canvasStatesPath: dict.repositorySync.conflictFieldCanvasStatesPath,
    };
    const fieldKey =
      fieldPath === "position/x" || fieldPath === "position/y"
        ? "position"
        : fieldPath === "dimensions/width" || fieldPath === "dimensions/height"
          ? "dimensions"
          : fieldPath;
    const fieldLabel = fieldPath ? fieldMap[fieldKey] ?? fieldKey : "";
    const segments = id
      ? [`${entity} ${id}`, fieldLabel]
      : [entity, fieldLabel];
    return segments.filter(Boolean).join(" — ");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={dict.repositorySync.title}
      subtitle={dict.repositorySync.subtitle}
      className="max-w-lg w-full"
    >
      <div className="flex gap-6 border-b border-white/5 mb-6 mt-8">
        {(["configure", "status"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 px-1 text-sm transition-colors flex items-center gap-2 ${
              activeTab === tab
                ? "text-white font-extrabold underline underline-offset-8 decoration-2 decoration-primary"
                : "text-white/40 font-normal hover:text-white/60"
            }`}
          >
            {tab === "configure"
              ? dict.repositorySync.configureTab
              : dict.repositorySync.statusTab}
            {tab === "status" && conflicts.length > 0 && (
              <span className="px-1.5 py-0.5 bg-yellow-500 text-[10px] rounded-full text-black font-bold leading-none">
                {conflicts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "configure" && (
        <div className="space-y-4">
          <div>
            <label className="input-label">
              {dict.repositorySync.repositoryUrl}
            </label>
            <input
              className="zen-input"
              value={repositoryUrl}
              onChange={(e) => setRepositoryUrl(e.target.value)}
              placeholder={dict.repositorySync.repositoryUrlPlaceholder}
              disabled={loading}
            />
          </div>

          <div>
            <label className="input-label">{dict.repositorySync.branch}</label>
            <input
              className="zen-input"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder={dict.repositorySync.branchPlaceholder}
              disabled={loading}
            />
          </div>

          <div>
            <label className="input-label">
              {dict.repositorySync.repositoryPath}
            </label>
            <input
              className="zen-input"
              value={repositoryPath}
              onChange={(e) => setRepositoryPath(e.target.value)}
              placeholder={dict.repositorySync.repositoryPathPlaceholder}
              disabled={loading}
            />
            <p className="text-xs opacity-40 mt-1">
              {dict.repositorySync.repositoryPathHint}
            </p>
          </div>

          <div>
            <label className="input-label">
              {dict.repositorySync.username}
            </label>
            <input
              className="zen-input"
              value={repositoryUsername}
              onChange={(e) => setRepositoryUsername(e.target.value)}
              placeholder={dict.repositorySync.usernamePlaceholder}
              disabled={loading}
            />
            <p className="text-xs opacity-40 mt-1">
              {dict.repositorySync.usernameHint}
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            {isConfigured && (
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                <Trash2 size={13} />
                {dict.repositorySync.disconnectRepo}
              </button>
            )}
            <Button
              onClick={handleSaveSettings}
              className="btn-primary ml-auto"
              disabled={loading || !repositoryUrl.trim() || !branch.trim()}
            >
              {dict.repositorySync.saveSettings}
            </Button>
          </div>
        </div>
      )}

      {activeTab === "status" && (
        <div className="space-y-6">
          {!isConfigured ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <GitBranch size={32} className="opacity-20" />
              <p className="text-sm opacity-40">
                {dict.repositorySync.notConfigured}
              </p>
              <p className="text-xs opacity-30">
                {dict.repositorySync.notConfiguredHint}
              </p>
              <Button
                onClick={() => setActiveTab("configure")}
                className="btn-secondary mt-2"
              >
                {dict.repositorySync.configureTab}
              </Button>
            </div>
          ) : (
            <>
              <div className="p-4 border rounded-lg border-border bg-bg-island space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="opacity-40 uppercase font-bold tracking-widest">
                    {dict.repositorySync.lastSynced}
                  </span>
                  <span className="font-mono opacity-80">
                    {lastSyncedCommit
                      ? lastSyncedCommit.slice(0, 8)
                      : dict.repositorySync.neverSynced}
                  </span>
                </div>
                {updatedAt && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="opacity-40 uppercase font-bold tracking-widest">
                      {dict.repositorySync.lastUpdated}
                    </span>
                    <span className="opacity-80">
                      {new Date(updatedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="opacity-40 uppercase font-bold tracking-widest">
                    {dict.repositorySync.modeLabel}
                  </span>
                  <div className="w-44">
                    <Select
                      value={mode}
                      onChange={(v) => setMode(v as ConflictMode)}
                      options={[
                        {
                          value: "manual",
                          label: dict.repositorySync.modeManual,
                        },
                        {
                          value: "git-wins",
                          label: dict.repositorySync.modeGitWins,
                        },
                        {
                          value: "ideon-wins",
                          label: dict.repositorySync.modeIdeonWins,
                        },
                      ]}
                    />
                  </div>
                </div>
              </div>

              {conflicts.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-yellow-400" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-yellow-400">
                      {dict.repositorySync.conflictsDetected}
                    </h3>
                  </div>
                  <p className="text-xs opacity-50">
                    {dict.repositorySync.conflictsDescription}
                  </p>
                  <p className="text-xs opacity-40">
                    {dict.repositorySync.conflictResolutionPending}
                  </p>
                  <ul className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {conflicts.map((conflict) => (
                      <li
                        key={conflict.path}
                        className="text-xs font-mono opacity-60 px-3 py-1.5 rounded bg-white/5"
                      >
                        {conflictLabel(conflict)}
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2 pt-1">
                    <Button
                      onClick={() => handleSync("git-wins")}
                      disabled={syncing}
                      className="btn-secondary flex-1"
                    >
                      {dict.repositorySync.resolveGitWins}
                    </Button>
                    <Button
                      onClick={() => handleSync("ideon-wins")}
                      disabled={syncing}
                      className="btn-secondary flex-1"
                    >
                      {dict.repositorySync.resolveIdeonWins}
                    </Button>
                  </div>
                </div>
              )}

              <Button
                onClick={() => handleSync()}
                className="btn-primary w-full"
                disabled={syncing}
              >
                <RefreshCw
                  size={14}
                  className={`mr-2 ${syncing ? "animate-spin" : ""}`}
                />
                {syncing
                  ? dict.repositorySync.syncing
                  : dict.repositorySync.triggerSync}
              </Button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

type RepositorySyncDictKey =
  | "errorCredentials"
  | "errorRemote"
  | "errorRejected"
  | "errorInvalidBundle"
  | "errorMerge"
  | "errorPersistence"
  | "errorStateChanged"
  | "syncFailed";

function resolveErrorKey(code: string | undefined): RepositorySyncDictKey {
  switch (code) {
    case "credentials_unavailable":
      return "errorCredentials";
    case "remote_unavailable":
    case "unsafe_host":
    case "invalid_url":
    case "invalid_branch":
    case "remote_tree_invalid":
      return "errorRemote";
    case "branch_update_rejected":
      return "errorRejected";
    case "missing_file":
    case "invalid_manifest":
    case "invalid_path":
    case "unexpected_file":
    case "invalid_size":
    case "checksum_mismatch":
    case "invalid_reference":
      return "errorInvalidBundle";
    case "different_project":
    case "inconsistent_graph":
      return "errorMerge";
    case "persistence_unavailable":
      return "errorPersistence";
    case "sync_state_changed":
      return "errorStateChanged";
    default:
      return "syncFailed";
  }
}
