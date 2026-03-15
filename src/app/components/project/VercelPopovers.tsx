"use client";

import { useState, useEffect } from "react";
import styles from "./VercelPopovers.module.css";
import { useI18n } from "@providers/I18nProvider";
import {
  Globe,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ShieldAlert,
  Link as LinkIcon,
  Loader2,
} from "lucide-react";

interface Domain {
  name: string;
  apexName: string;
  verified: boolean;
}

interface DomainsPopoverProps {
  projectId: string;
  onClose: () => void;
}

export function DomainsPopover({ projectId, onClose }: DomainsPopoverProps) {
  const { dict } = useI18n();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingDns, setCheckingDns] = useState<string | null>(null);
  const [dnsStatus, setDnsStatus] = useState<
    Record<
      string,
      {
        misconfigured: boolean;
        serviceType?: string;
        nameservers?: string[];
        aValues?: string[];
      }
    >
  >({});

  useEffect(() => {
    fetchDomains();
  }, [projectId]);

  const fetchDomains = async () => {
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}/domains`);
      if (res.ok) {
        setDomains(await res.json());
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const checkDns = async (domain: string) => {
    setCheckingDns(domain);
    try {
      const res = await fetch(
        `/api/vercel/projects/${projectId}/domains/${domain}/config`,
      );
      if (res.ok) {
        const data = await res.json();
        setDnsStatus((prev) => ({ ...prev, [domain]: data }));
      }
    } catch {
      /* ignore */
    } finally {
      setCheckingDns(null);
    }
  };

  return (
    <div
      className={styles.domainsPopover}
      onWheel={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between pb-2 border-b border-(--border)">
        <span className="text-[11px] font-semibold text-(--text-secondary)">
          {dict.blocks.projectDomains}
        </span>
        <button
          onClick={onClose}
          className="text-[10px] font-medium opacity-50 hover:opacity-100 transition-opacity"
        >
          {dict.common.close}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4 opacity-30">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : domains.length === 0 ? (
        <div className="text-center py-4 text-xs opacity-40 italic">
          {dict.blocks.noDomainsFound}
        </div>
      ) : (
        <div
          className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1 nopan nodrag nowheel"
          onWheel={(e) => e.stopPropagation()}
        >
          {domains.map((d) => (
            <div
              key={d.name}
              className="flex flex-col gap-1.5 p-2 rounded-lg bg-(--bg-secondary) border border-(--border-color) group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold truncate max-w-35">
                  {d.name}
                </span>
                <div className="flex items-center gap-1.5">
                  {d.verified ? (
                    <CheckCircle2 size={12} className="text-green-500" />
                  ) : (
                    <XCircle size={12} className="text-red-500" />
                  )}
                  <a
                    href={`https://${d.name}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-(--text-tertiary) hover:text-(--text-primary) transition-colors"
                  >
                    <ExternalLink size={10} />
                  </a>
                </div>
              </div>

              <button
                onClick={() => checkDns(d.name)}
                disabled={checkingDns === d.name}
                className="project-btn"
              >
                {checkingDns === d.name ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <Globe size={10} className="opacity-40" />
                )}
                {dict.blocks.checkDnsStatus}
              </button>

              {dnsStatus[d.name] &&
                (() => {
                  const status = dnsStatus[d.name];
                  const isExternal = status.serviceType === "external";
                  const isMisconfigured = status.misconfigured;

                  let statusLabel = isMisconfigured
                    ? dict.blocks.vercelDnsMisconfigured || "DNS Misconfigured"
                    : dict.blocks.vercelDnsHealthy || "DNS Healthy";
                  let statusColorClass = isMisconfigured
                    ? "bg-red-500/10 text-red-500"
                    : "bg-green-500/10 text-green-500";

                  if (isExternal && isMisconfigured) {
                    statusLabel =
                      dict.blocks.vercelDnsExternal || "External DNS";
                    statusColorClass = "bg-blue-500/10 text-blue-500";
                  }

                  return (
                    <div className="mt-1 flex flex-col gap-1">
                      <div
                        className={`p-1.5 rounded text-[9px] font-medium flex items-center justify-between ${statusColorClass}`}
                      >
                        <span>{statusLabel}</span>
                        {status.serviceType && (
                          <span className="opacity-60 font-black tracking-widest">
                            {status.serviceType}
                          </span>
                        )}
                      </div>

                      {isMisconfigured && (
                        <div className="p-1.5 bg-(--bg-island) border border-(--border) rounded text-[9px] flex flex-col gap-1 font-mono opacity-80">
                          {status.aValues && status.aValues.length > 0 && (
                            <div className="flex flex-col gap-0.5">
                              <span className="opacity-50 font-semibold text-[8px]">
                                {dict.blocks.vercelDnsARecords || "A Records"}
                              </span>
                              {status.aValues.map((v: string) => (
                                <div key={v}>{v}</div>
                              ))}
                            </div>
                          )}
                          {status.nameservers &&
                            status.nameservers.length > 0 && (
                              <div className="flex flex-col gap-0.5 mt-1 border-t border-(--border) pt-1">
                                <span className="opacity-50 font-semibold text-[8px]">
                                  {dict.blocks.vercelDnsNameservers ||
                                    "Nameservers"}
                                </span>
                                {status.nameservers
                                  .slice(0, 2)
                                  .map((v: string) => (
                                    <div key={v} className="truncate">
                                      {v}
                                    </div>
                                  ))}
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  );
                })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface BypassPopoverProps {
  projectId: string;
  onClose: () => void;
}

export function BypassPopover({ projectId, onClose }: BypassPopoverProps) {
  const { dict } = useI18n();
  const [loading, setLoading] = useState(false);
  const [bypassLink, setBypassLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBypass = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}/protection`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setBypassLink(data.link);
      } else {
        let message =
          dict.blocks.vercelBypassFailed || "Failed to generate link";
        try {
          const data = await res.json();
          if (data?.error?.includes("Deployment Protection is not enabled")) {
            message =
              dict.blocks.vercelBypassNotEnabled ||
              "Deployment Protection is not enabled for this Vercel project. Enable it in your Vercel dashboard to use bypass.";
          } else if (data?.error) {
            message = data.error;
          }
        } catch {
          // ignore JSON parsing errors
        }
        setError(message);
      }
    } catch {
      setError(dict.blocks.vercelBypassError || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="absolute top-full right-0 mt-2 w-64 bg-(--bg-island) border border-red-500/20 rounded-xl shadow-2xl z-100 p-4 flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-200 nopan nodrag nowheel cursor-auto select-text"
      onWheel={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 pb-2 border-b border-(--border-color)">
        <ShieldAlert size={14} className="text-red-500" />
        <span className="text-[11px] font-semibold text-red-500">
          {dict.blocks.vercelBypassProtection}
        </span>
      </div>

      {!bypassLink ? (
        <>
          <p className="text-[11px] opacity-60 m-0">
            {dict.blocks.vercelBypassDesc ||
              "Generate a link to bypass Vercel Authentication for 24 hours."}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleBypass}
              disabled={loading}
              className="btn-primary py-1.5 text-[11px] font-medium flex items-center justify-center gap-1.5"
              style={{ minWidth: 0 }}
            >
              {loading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <LinkIcon size={12} />
              )}
              {dict.blocks.vercelBypassGenerate || "Generate Link"}
            </button>
            <button
              onClick={onClose}
              className="btn-ghost py-1.5 text-[11px] font-medium"
              style={{ minWidth: 0 }}
            >
              {dict.blocks.vercelCancel || "Cancel"}
            </button>
          </div>
          {error && (
            <span className="text-[10px] text-red-500 font-medium">
              {error}
            </span>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="p-2 bg-green-500/10 border border-green-500/20 rounded-lg flex items-start gap-2">
            <CheckCircle2 size={12} className="text-green-500 mt-0.5" />
            <span className="text-[10px] font-bold text-green-600">
              {dict.blocks.vercelBypassSuccess || "Link Generated!"}
            </span>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(bypassLink);
              onClose();
            }}
            className="btn-primary py-2 text-[11px] font-medium"
          >
            {dict.blocks.vercelBypassCopyClose || "Copy Link & Close"}
          </button>
        </div>
      )}
    </div>
  );
}
