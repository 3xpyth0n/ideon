"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@providers/I18nProvider";
import { toast } from "sonner";
import { Plus, Trash2, Copy, Check, Eye, EyeOff } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import "./git-token-manager.css";

interface ApiKey {
  id: string;
  name: string;
  keyHint: string;
  lastUsedAt: number | null;
  createdAt: number;
}

interface NewKeyResult extends ApiKey {
  key: string;
}

export function ApiKeyManager() {
  const { dict } = useI18n();
  const tr = dict.apiKeys;
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [newKey, setNewKey] = useState<NewKeyResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/user/api-keys");
      if (res.ok) setKeys(await res.json());
    } catch {
      toast.error(dict.common.error);
    } finally {
      setLoading(false);
    }
  }, [dict.common.error]);

  useEffect(() => {
    void fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        throw new Error(err.message);
      }
      const data = (await res.json()) as NewKeyResult;
      setNewKey(data);
      setKeys((prev) => [
        {
          id: data.id,
          name: data.name,
          keyHint: data.keyHint,
          lastUsedAt: null,
          createdAt: data.createdAt,
        },
        ...prev,
      ]);
      setName("");
      setIsCreateOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : dict.common.error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/user/api-keys/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setKeys((prev) => prev.filter((k) => k.id !== deleteTarget.id));
      toast.success(tr.deleted);
    } catch {
      toast.error(dict.common.error);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <p className="text-xs opacity-40 animate-pulse">
          {dict.common.loading}
        </p>
      ) : keys.length === 0 ? (
        <div className="empty-state">{tr.noKeys}</div>
      ) : (
        <div className="flex flex-col divide-y divide-border/10 border border-border/20">
          {keys.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between px-4 py-3 gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{k.name}</p>
                <p className="text-[11px] font-mono opacity-40 mt-0.5">
                  {k.keyHint}
                </p>
                <p className="text-[10px] opacity-30 mt-0.5">
                  {k.lastUsedAt
                    ? `${tr.lastUsed} ${formatDate(k.lastUsedAt)}`
                    : tr.neverUsed}
                  {" · "}
                  {tr.created} {formatDate(k.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setDeleteTarget(k)}
                className="shrink-0 opacity-30 hover:opacity-80 hover:text-red-500 transition-all"
                aria-label={tr.revoke}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setIsCreateOpen(true)}
        className="btn-primary flex items-center gap-2 self-start"
      >
        <Plus size={13} />
        {tr.generate}
      </button>

      {/* Create modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setName("");
        }}
        title={tr.generateTitle}
        subtitle={tr.generateSubtitle}
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <label className="zen-label ml-0">{tr.keyName}</label>
            <input
              className="zen-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr.keyNamePlaceholder}
              autoFocus
              maxLength={60}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="btn-primary"
            >
              {submitting ? dict.common.loading : tr.generate}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreateOpen(false);
                setName("");
              }}
              className="btn-secondary"
            >
              {dict.common.cancel}
            </button>
          </div>
        </form>
      </Modal>

      {/* New key reveal modal */}
      <Modal
        isOpen={!!newKey}
        onClose={() => {
          setNewKey(null);
          setRevealed(false);
          setCopied(false);
        }}
        title={tr.keyCreated}
        subtitle={tr.keyCreatedWarning}
      >
        <div className="flex flex-col gap-4 pt-2">
          <div className="bg-black/10 border border-border/20 p-3 flex items-center gap-2">
            <code className="text-xs font-mono flex-1 break-all select-all opacity-80">
              {revealed ? newKey?.key : "sk-ideon-" + "•".repeat(32)}
            </code>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setRevealed((r) => !r)}
                className="p-1.5 opacity-40 hover:opacity-80 transition-opacity"
                aria-label={revealed ? tr.hide : tr.reveal}
              >
                {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button
                onClick={() => newKey && void handleCopy(newKey.key)}
                className="p-1.5 opacity-40 hover:opacity-80 transition-opacity"
                aria-label={dict.common.copy}
              >
                {copied ? (
                  <Check size={13} className="text-green-500" />
                ) : (
                  <Copy size={13} />
                )}
              </button>
            </div>
          </div>
          <p className="text-xs opacity-50 leading-relaxed">
            {tr.keyCreatedHint}
          </p>
          <button
            className="btn-primary self-start"
            onClick={() => {
              setNewKey(null);
              setRevealed(false);
              setCopied(false);
            }}
          >
            {tr.done}
          </button>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={tr.revokeTitle}
        subtitle={deleteTarget?.name}
      >
        <div className="flex flex-col gap-4 pt-2">
          <p className="text-sm opacity-60">{tr.revokeWarning}</p>
          <div className="flex gap-2">
            <button onClick={handleDelete} className="btn-danger">
              {tr.revoke}
            </button>
            <button
              onClick={() => setDeleteTarget(null)}
              className="btn-secondary"
            >
              {dict.common.cancel}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
