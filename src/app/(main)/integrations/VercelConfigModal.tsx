"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@providers/I18nProvider";
import { Modal } from "@components/ui/Modal";
import { VercelIcon } from "@components/icons/VercelIcon";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@components/ui/Button";

interface VercelProject {
  vercelProjectId: string;
  vercelProjectName: string;
  enabled: boolean;
}

interface VercelConfigModalProps {
  onClose: () => void;
}

export default function VercelConfigModal({ onClose }: VercelConfigModalProps) {
  const { dict } = useI18n();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<VercelProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [authConfig, setAuthConfig] = useState<{
    oauthEnabled: boolean;
    patEnabled: boolean;
  } | null>(null);
  const [manualToken, setManualToken] = useState("");
  const [submittingToken, setSubmittingToken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkConnection = useCallback(async () => {
    try {
      const res = await fetch("/api/vercel/token");
      if (res.ok) {
        const data = await res.json();
        setConnected(data.connected);
        setAuthConfig(data.config);
        if (data.connected) {
          await fetchProjects();
        }
      }
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/vercel/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch {
      /* empty */
    }
  };

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const handleSignIn = () => {
    window.location.href = "/api/vercel/authorize";
  };

  const handleToggleProject = (vercelProjectId: string) => {
    setProjects((prev: VercelProject[]) =>
      prev.map((p: VercelProject) =>
        p.vercelProjectId === vercelProjectId
          ? { ...p, enabled: !p.enabled }
          : p,
      ),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/vercel/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projects),
      });
      onClose();
    } catch {
      /* empty */
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch("/api/vercel/token", { method: "DELETE" });
      setConnected(false);
      setProjects([]);
    } catch {
      /* empty */
    } finally {
      setDisconnecting(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;

    setSubmittingToken(true);
    setError(null);
    try {
      const res = await fetch("/api/vercel/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: manualToken.trim(), authMethod: "pat" }),
      });
      if (res.ok) {
        setConnected(true);
        await fetchProjects();
      } else {
        const data = await res.json();
        setError(data.message || "Failed to connect");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setSubmittingToken(false);
    }
  };

  const integrations = dict.integrations as Record<string, string>;

  return (
    <Modal
      isOpen
      onClose={onClose}
      className="w-full max-w-[480px] p-6 text-[var(--text-primary)]"
    >
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--border-color)]">
        <VercelIcon size={24} />
        <h2 className="text-lg font-semibold tracking-wide m-0">
          {integrations.vercelIntegration || "Vercel"}
        </h2>
      </div>

      {loading && (
        <div className="flex justify-center items-center py-12">
          <Loader2 size={24} className="animate-spin opacity-50" />
        </div>
      )}

      {!loading && !connected && (
        <div className="flex flex-col gap-6 py-4">
          <p className="text-sm text-[var(--text-secondary)] text-center leading-relaxed">
            {integrations.vercelIntegrationDesc ||
              "Deploy and monitor your Vercel projects from the canvas"}
          </p>

          <div className="flex flex-col gap-4">
            {authConfig?.oauthEnabled && (
              <button
                type="button"
                className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
                onClick={handleSignIn}
              >
                <VercelIcon size={16} />
                <span className="font-medium">
                  {integrations.vercelSignIn || "Sign in with Vercel"}
                </span>
                <ExternalLink size={14} className="opacity-70" />
              </button>
            )}

            {authConfig?.oauthEnabled && authConfig?.patEnabled && (
              <div className="flex items-center gap-4 py-2">
                <div className="h-px flex-1 bg-[var(--border-color)]" />
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-30">
                  OR
                </span>
                <div className="h-px flex-1 bg-[var(--border-color)]" />
              </div>
            )}

            {authConfig?.patEnabled && (
              <form
                onSubmit={handleManualSubmit}
                className="flex flex-col gap-3"
              >
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider opacity-60 px-1">
                    {integrations.manualTokenLabel || "Personal Access Token"}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      className={`zen-input flex-1 ${
                        error ? "border-red-500/50" : ""
                      }`}
                      placeholder="vcp_..."
                      value={manualToken}
                      onChange={(e) => setManualToken(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        handleManualSubmit(e as unknown as React.FormEvent)
                      }
                    />
                    <Button
                      type="submit"
                      disabled={submittingToken || !manualToken.trim()}
                      className="btn-primary px-6 h-auto min-w-[100px]"
                    >
                      {submittingToken ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        integrations.vercelConnect || "Connect"
                      )}
                    </Button>
                  </div>
                  {error && (
                    <span className="text-[10px] text-red-500 px-1 font-medium">
                      {error}
                    </span>
                  )}
                  <p className="text-[10px] opacity-40 px-1 italic">
                    {integrations.patHint ||
                      "Create one in your Vercel Account Settings under Tokens"}
                  </p>
                </div>
              </form>
            )}

            {!authConfig?.oauthEnabled && !authConfig?.patEnabled && (
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs text-center">
                Vercel integration is not configured by the administrator.
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && connected && (
        <div className="flex flex-col gap-4 pt-2">
          <p className="text-[13px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
            {integrations.vercelSelectProjects ||
              "Select projects visible in Ideon"}
          </p>

          {projects.length === 0 && (
            <div className="text-sm text-[var(--text-tertiary)] italic p-6 text-center border border-dashed border-[var(--border-color)] rounded-lg">
              {integrations.vercelNoProjects || "No projects found"}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 max-h-[340px] overflow-y-auto pr-2 custom-scrollbar">
            {projects.map((project) => (
              <div
                key={project.vercelProjectId}
                className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-200 ${
                  project.enabled
                    ? "border-[var(--text-main)] bg-[var(--text-main)]/5"
                    : "border-[var(--border-color)] bg-[var(--bg-secondary)] opacity-60 hover:opacity-100"
                }`}
                onClick={() => handleToggleProject(project.vercelProjectId)}
                role="button"
                tabIndex={0}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-bold tracking-tight">
                    {project.vercelProjectName}
                  </span>
                  <span className="text-[10px] opacity-40 font-mono">
                    {project.vercelProjectId}
                  </span>
                </div>
                <button
                  type="button"
                  className={`zen-switch-small flex-shrink-0 ${
                    project.enabled ? "active" : ""
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleProject(project.vercelProjectId);
                  }}
                >
                  <div className="switch-thumb" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 mt-4 pt-5 border-t border-[var(--border-color)]">
            <button
              type="button"
              className="btn-ghost"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {integrations.vercelDisconnect || "Disconnect"}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving
                ? dict.common.saving || "Saving..."
                : dict.common.save || "Save"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
