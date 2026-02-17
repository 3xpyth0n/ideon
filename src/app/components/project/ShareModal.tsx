"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@providers/I18nProvider";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Copy, RefreshCw, Check, Globe, Lock } from "lucide-react";
import { toast } from "sonner";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  isOwner: boolean;
  onRegenerate?: (updateContent: boolean) => Promise<void>;
}

export function ShareModal({
  isOpen,
  onClose,
  projectId,
  isOwner,
  onRegenerate,
}: ShareModalProps) {
  const { dict } = useI18n();
  const [loading, setLoading] = useState(false);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [updateContent, setUpdateContent] = useState(true);

  useEffect(() => {
    if (isOpen && projectId) {
      fetchShareSettings();
    }
  }, [isOpen, projectId]);

  const fetchShareSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/share`);
      if (res.ok) {
        const data = await res.json();
        setShareEnabled(data.shareEnabled);
        setShareUrl(data.shareUrl);
      }
    } catch (error) {
      console.error("Failed to fetch share settings", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleShare = async () => {
    setLoading(true);
    try {
      // If enabling and no URL exists, generate one first
      if (!shareEnabled && !shareUrl) {
        if (onRegenerate) {
          await onRegenerate(true);
        }
        const res = await fetch(`/api/projects/${projectId}/share`, {
          method: "POST",
        });
        if (res.ok) {
          const data = await res.json();
          setShareUrl(data.shareUrl);
          setShareEnabled(true);
        }
      } else {
        // Just toggle
        const res = await fetch(`/api/projects/${projectId}/share`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !shareEnabled }),
        });
        if (res.ok) {
          const data = await res.json();
          setShareEnabled(data.shareEnabled);
        }
      }
    } catch (_) {
      toast.error(dict.common.error || "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (
      !confirm(
        dict.project.regenerateConfirm ||
          "Are you sure? Old link will stop working.",
      )
    )
      return;

    setLoading(true);
    try {
      if (updateContent && onRegenerate) {
        await onRegenerate(true);
      }

      const res = await fetch(`/api/projects/${projectId}/share`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setShareUrl(data.shareUrl);
        setShareEnabled(true);
        toast.success(dict.common.success || "Success");
      }
    } catch (_) {
      toast.error(dict.common.error || "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(dict.common.copied || "Copied!");
    }
  };

  if (!isOwner) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={dict.project.shareProject || "Share Project"}
      subtitle={
        dict.project.shareSubtitle || "Share this project via a public link"
      }
    >
      <div className="space-y-6 share-modal-custom-layout">
        <div className="flex items-center justify-between p-4 border rounded-lg dark:border-white/10">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-full ${
                shareEnabled
                  ? "bg-green-500/10 text-green-500"
                  : "bg-gray-500/10 text-gray-500"
              }`}
            >
              {shareEnabled ? <Globe size={20} /> : <Lock size={20} />}
            </div>
            <div className="text-group">
              <h3>{dict.project.shareEnabled || "Enable public link"}</h3>
              <p>
                {shareEnabled
                  ? dict.project.publicLinkActive ||
                    "Anyone with the link can view"
                  : dict.project.publicLinkInactive ||
                    "Only you can access this project"}
              </p>
            </div>
          </div>
          <div className="flex items-center self-center">
            <button
              className={`zen-switch ${shareEnabled ? "active" : ""}`}
              onClick={handleToggleShare}
              disabled={loading}
            >
              <div className="switch-thumb" />
            </button>
          </div>
        </div>

        {shareEnabled && shareUrl && (
          <div className="animate-in fade-in slide-in-from-top-2">
            <label className="input-label">
              {dict.project.shareLink || "Public Link"}
            </label>
            <div className="flex gap-2 items-center">
              <input readOnly value={shareUrl} className="zen-input" />
              <Button
                onClick={handleCopy}
                className="btn-secondary"
                title={dict.common.copy || "Copy"}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-4 mt-6 p-4 border rounded-lg dark:border-white/5 bg-black/5 dark:bg-white/5">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="update-content"
                  checked={updateContent}
                  onChange={(e) => setUpdateContent(e.target.checked)}
                  className="mt-3"
                />
                <label
                  htmlFor="update-content"
                  className="flex flex-col cursor-pointer"
                >
                  <span className="text-sm font-medium">
                    {dict.project.updateShareContent || "Update content"}
                  </span>
                  <span className="text-xs text-gray-500">
                    {dict.project.updateShareContentDescription ||
                      "Link will capture current state"}
                  </span>
                </label>
              </div>
              <Button
                onClick={handleRegenerate}
                variant="primary"
                disabled={loading}
              >
                <RefreshCw
                  size={12}
                  className={`mr-2 ${loading ? "animate-spin" : ""}`}
                />
                {dict.project.regenerate || "Regenerate Link"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
