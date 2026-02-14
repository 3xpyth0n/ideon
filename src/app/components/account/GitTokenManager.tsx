"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@providers/I18nProvider";
import { toast } from "sonner";
import { Modal } from "@components/ui/Modal";
import {
  PlusIcon,
  TrashIcon,
  GithubIcon,
  GitlabIcon,
  ServerIcon,
  ChevronDown,
  Check,
} from "lucide-react";
import "./git-token-manager.css";

interface GitToken {
  id: string;
  provider: string;
  host: string;
  token: string;
  enabled: number;
}

export function GitTokenManager() {
  const { dict } = useI18n();
  const [tokens, setTokens] = useState<GitToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [host, setHost] = useState("");
  const [token, setToken] = useState("");
  const [provider, setProvider] = useState("github");
  const [isProviderOpen, setIsProviderOpen] = useState(false);

  useEffect(() => {
    fetchTokens();
  }, []);

  const fetchTokens = async () => {
    try {
      const res = await fetch("/api/user/git-tokens");
      if (res.ok) {
        setTokens(await res.json());
      }
    } catch {
      toast.error(dict.common.error);
    } finally {
      setIsLoading(false);
    }
  };

  const cleanHost = (val: string) => {
    return val
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/$/, "")
      .toLowerCase();
  };

  const handleAddToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const cleanedHost = cleanHost(host);

    try {
      const res = await fetch("/api/user/git-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: cleanedHost, token, provider }),
      });

      if (!res.ok) {
        const err = await res.json();
        if (err.message === "TOKEN_EXISTS_FOR_HOST") {
          toast.error(dict.gitTokens.tokenExists);
          return;
        }
        throw new Error();
      }

      toast.success(dict.common.saved);
      setIsModalOpen(false);
      setHost("");
      setToken("");
      fetchTokens();
    } catch {
      toast.error(dict.modals.saveError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (id: string, currentEnabled: number) => {
    const newEnabled = currentEnabled === 1 ? 0 : 1;

    // Optimistic update
    setTokens((prev) =>
      prev.map((t) => (t.id === id ? { ...t, enabled: newEnabled } : t)),
    );

    try {
      const res = await fetch("/api/user/git-tokens", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled: newEnabled }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error(dict.modals.saveError);
      // Revert on error
      setTokens((prev) =>
        prev.map((t) => (t.id === id ? { ...t, enabled: currentEnabled } : t)),
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(dict.gitTokens.deleteWarning)) return;

    try {
      const res = await fetch(`/api/user/git-tokens?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success(dict.common.deleted);
      setTokens((prev) => prev.filter((t) => t.id !== id));
    } catch {
      toast.error(dict.modals.deleteError);
    }
  };

  const getIcon = (provider: string) => {
    switch (provider) {
      case "github":
        return <GithubIcon className="w-5 h-5" />;
      case "gitlab":
        return <GitlabIcon className="w-5 h-5" />;
      default:
        return <ServerIcon className="w-5 h-5" />;
    }
  };

  if (isLoading)
    return <div className="animate-pulse h-20 bg-border/5 rounded-lg" />;

  return (
    <div className="space-y-4">
      {tokens.length === 0 ? (
        <div className="empty-state">{dict.gitTokens.noTokens}</div>
      ) : (
        <div className="space-y-2">
          {tokens.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between p-3 border border-border/10 rounded-lg bg-background/50 hover:bg-background/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="text-muted-foreground">
                  {getIcon(t.provider)}
                </div>
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    {t.host}
                    {t.enabled === 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 font-medium">
                        {dict.gitTokens.disabled}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted font-mono opacity-60">
                    {t.token}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  className={`zen-switch ${t.enabled === 1 ? "active" : ""}`}
                  onClick={() => handleToggle(t.id, t.enabled)}
                >
                  <div className="switch-thumb" />
                </button>

                <button
                  onClick={() => handleDelete(t.id)}
                  className="p-2 text-muted hover:text-red-400 transition-colors"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6">
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
          <PlusIcon className="w-4 h-4 mr-2" />
          {dict.gitTokens.add}
        </button>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={dict.gitTokens.addTitle}
        className="max-w-md w-full"
      >
        <form onSubmit={handleAddToken} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted uppercase tracking-wider">
              {dict.gitTokens.provider}
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsProviderOpen(!isProviderOpen)}
                className="select-trigger w-full flex items-center justify-between px-3 py-2 text-sm border border-border/10 rounded bg-background hover:bg-background/80 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {getIcon(provider)}
                  <span className="capitalize">
                    {provider === "gitea"
                      ? "Gitea / Forgejo"
                      : provider === "github"
                        ? "GitHub"
                        : "GitLab"}
                  </span>
                </div>
                <ChevronDown
                  size={12}
                  className={`transition-transform duration-300 opacity-40 ${
                    isProviderOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isProviderOpen && (
                <div className="select-dropdown absolute top-full left-0 right-0 z-50 rounded-none overflow-hidden mt-2 border border-border/10 bg-background/80 backdrop-blur-xl shadow-2xl">
                  {[
                    { value: "github", label: "GitHub" },
                    { value: "gitlab", label: "GitLab" },
                    { value: "gitea", label: "Gitea / Forgejo" },
                  ].map((option, index) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setProvider(option.value);
                        setIsProviderOpen(false);
                      }}
                      className={`select-option w-full flex items-center justify-between py-3 px-4 hover:bg-white/5 text-left transition-colors ${
                        index > 0 ? "border-t border-border/5" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {getIcon(option.value)}
                        <span className="text-xs">{option.label}</span>
                      </div>
                      {provider === option.value && (
                        <Check size={10} className="text-text-main" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted uppercase tracking-wider">
              {dict.gitTokens.host}
            </label>
            <input
              type="text"
              required
              placeholder="github.com"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="zen-input w-full"
              autoComplete="off"
            />
            <p className="text-[10px] text-muted opacity-60">
              {dict.gitTokens.hostHint}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted uppercase tracking-wider">
              {dict.gitTokens.token}
            </label>
            <input
              type="password"
              required
              placeholder="ghp_..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="zen-input w-full"
              autoComplete="off"
            />
            <p className="text-[10px] text-muted opacity-60">
              {dict.gitTokens.tokenHint}
            </p>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
            >
              {isSubmitting ? "..." : dict.common.save}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
