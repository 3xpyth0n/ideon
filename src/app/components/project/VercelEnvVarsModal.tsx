"use client";

import { useState, useEffect } from "react";
import { Modal } from "@components/ui/Modal";
import { Key, Plus, Trash2, Check, Loader2, AlertCircle } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";

interface EnvVar {
  id: string;
  key: string;
  type: string;
}

interface VercelEnvVarsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export function VercelEnvVarsModal({
  isOpen,
  onClose,
  projectId,
}: VercelEnvVarsModalProps) {
  const { dict } = useI18n();
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const blocksDict = (dict.blocks || {}) as Record<string, string>;

  useEffect(() => {
    if (isOpen) {
      fetchEnvVars();
    }
  }, [isOpen, projectId]);

  const fetchEnvVars = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}/env`);
      if (res.ok) {
        setEnvVars(await res.json());
      }
    } catch {
      setError(
        blocksDict.vercelEnvFailedLoad ||
          "Failed to load environment variables",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey || !newValue) return;

    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}/env`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: newKey, value: newValue }),
      });

      if (res.ok) {
        setNewKey("");
        setNewValue("");
        fetchEnvVars();
      } else {
        const data = await res.json();
        setError(
          data.error ||
            blocksDict.vercelEnvFailedAdd ||
            "Failed to add variable",
        );
      }
    } catch {
      setError(
        blocksDict.vercelEnvErrorAdd ||
          "An error occurred while adding the variable",
      );
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}/env/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setEnvVars((prev) => prev.filter((v) => v.id !== id));
      } else {
        const data = await res.json();
        setError(
          data.error ||
            blocksDict.vercelEnvFailedDelete ||
            "Failed to delete variable",
        );
      }
    } catch {
      setError(
        blocksDict.vercelEnvErrorDelete ||
          "An error occurred while deleting the variable",
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="w-full max-w-2xl p-0 overflow-hidden bg-[var(--bg-island)] border border-[var(--border)] shadow-xl"
    >
      <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-[var(--brand-primary)]/10 rounded-2xl">
            <Key className="text-[var(--brand-primary)]" size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter m-0 lowercase first-letter:uppercase">
              {blocksDict.vercelEnvVars || "Environment Variables"}
            </h1>
            <p className="text-[var(--text-tertiary)] text-sm m-0 mt-1">
              {blocksDict.vercelEnvVarsDesc ||
                "Manage project environment variables."}
            </p>
          </div>
        </div>
      </div>

      <div
        className="px-6 pt-4 pb-8 overflow-y-auto max-h-[60vh] flex flex-col gap-6 nopan nodrag nowheel"
        onWheel={(e) => e.stopPropagation()}
      >
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-xs">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <form
          onSubmit={handleAdd}
          className="bg-[var(--bg-sidebar)] p-4 rounded-xl border border-[var(--border)] flex flex-col gap-4"
        >
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40">
            {blocksDict.vercelAddEnvVar || "Add New Variable"}
          </span>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              className="zen-input flex-1"
              placeholder={
                blocksDict.vercelEnvPlaceholderKey || "VARIABLE_NAME"
              }
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              disabled={adding}
            />
            <input
              type="password"
              className="zen-input flex-1"
              placeholder={blocksDict.vercelEnvPlaceholderValue || "value"}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              disabled={adding}
            />
            <button
              type="submit"
              disabled={adding || !newKey || !newValue}
              className="btn-primary px-4 flex items-center justify-center gap-2 whitespace-nowrap h-[42px]"
            >
              {adding ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Plus size={16} />
              )}
              {blocksDict.vercelEnvAdd || "Add"}
            </button>
          </div>
        </form>

        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40 px-1">
            {blocksDict.vercelEnvConfigured || "Configured Variables"}
          </span>
          {loading ? (
            <div className="flex justify-center py-10 opacity-30">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : envVars.length === 0 ? (
            <div className="text-center py-10 opacity-30 text-sm italic">
              {blocksDict.vercelEnvEmpty ||
                "No environment variables configured"}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {envVars.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between p-3 bg-[var(--bg-sidebar)] border border-[var(--border)] rounded-lg group"
                >
                  <div className="flex items-center gap-3">
                    <Check size={14} className="text-green-500 opacity-40" />
                    <span className="font-mono text-[13px] font-bold text-[var(--text-secondary)]">
                      {v.key}
                    </span>
                    <span className="text-[9px] uppercase font-bold tracking-tighter bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded border border-[var(--border-color)] opacity-40">
                      {v.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {deletingId === v.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <button
                        onClick={() => handleDelete(v.id)}
                        className="p-1.5 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all"
                        title={dict.common.delete || "Delete"}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
