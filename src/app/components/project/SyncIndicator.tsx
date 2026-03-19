"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@providers/I18nProvider";
import { Cloud, CloudOff } from "lucide-react";

type OnlineStatus = "online" | "offline";

const PING_INTERVAL_MS = 15_000;

/**
 * Checks server reachability with a lightweight HEAD request.
 * Returns true if the server responds (any status), false on network error.
 */
async function pingServer(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", {
      method: "HEAD",
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

interface SyncIndicatorProps {
  isSocketConnected?: boolean;
  isRemoteSynced?: boolean;
}

export function SyncIndicator({
  isSocketConnected = false,
  isRemoteSynced = false,
}: SyncIndicatorProps) {
  const { dict } = useI18n();

  // The page loaded → the server was reachable → start as "online".
  const [status, setStatus] = useState<OnlineStatus>("online");
  const [lastOnlineAt, setLastOnlineAt] = useState<Date>(() => new Date());

  const [showTooltip, setShowTooltip] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen to browser online/offline events + periodic HTTP ping
  useEffect(() => {
    let cancelled = false;

    const goOnline = () => {
      if (cancelled) return;
      setStatus("online");
      setLastOnlineAt(new Date());
    };

    const goOffline = () => {
      if (cancelled) return;
      setStatus("offline");
    };

    const checkConnectivity = async () => {
      if (cancelled) return;
      if (!navigator.onLine) {
        goOffline();
        return;
      }
      const reachable = await pingServer();
      if (cancelled) return;
      if (reachable) {
        goOnline();
      } else {
        goOffline();
      }
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // Periodic ping every 30s
    const interval = setInterval(checkConnectivity, PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(interval);
    };
  }, []);

  // Tick for time-ago refresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const cancelHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false);
    }, 150);
  }, [cancelHide]);

  const handleMouseEnter = (e: React.MouseEvent) => {
    cancelHide();
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      top: rect.bottom + 6,
      left: rect.left + rect.width / 2,
    });
    if (!isMounted) {
      setIsMounted(true);
    } else {
      setShowTooltip(true);
    }
  };

  const handleMouseLeave = () => {
    scheduleHide();
  };

  const handleTransitionEnd = () => {
    if (!showTooltip) {
      setIsMounted(false);
    }
  };

  useEffect(() => {
    if (isMounted) {
      const timer = setTimeout(() => setShowTooltip(true), 50);
      return () => clearTimeout(timer);
    }
  }, [isMounted]);

  const { label, dotClass, Icon } = useMemo(() => {
    if (status === "offline") {
      return {
        label: dict.canvas.offline,
        dotClass: "sync-dot sync-dot-offline",
        Icon: CloudOff,
      };
    }

    if (!isSocketConnected) {
      return {
        label: dict.canvas.connectionError,
        dotClass: "sync-dot sync-dot-offline animate-pulse",
        Icon: CloudOff,
      };
    }

    if (!isRemoteSynced) {
      return {
        label: dict.common.loading,
        dotClass: "sync-dot sync-dot-offline animate-pulse",
        Icon: Cloud,
      };
    }

    return {
      label: dict.canvas.synced,
      dotClass: "sync-dot sync-dot-synced",
      Icon: Cloud,
    };
  }, [status, isSocketConnected, isRemoteSynced, dict]);

  const timeAgo = useMemo(() => {
    const seconds = Math.floor((Date.now() - lastOnlineAt.getTime()) / 1000);
    if (seconds < 10) return dict.canvas.now;
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  }, [lastOnlineAt, dict]);

  const tooltipText = useMemo(() => {
    if (status === "offline") return dict.canvas.offline;
    if (!isSocketConnected) return dict.canvas.websocketError;
    if (!isRemoteSynced) return dict.common.loading;
    return `${dict.canvas.lastSynced}: ${timeAgo}`;
  }, [status, isSocketConnected, isRemoteSynced, lastOnlineAt, timeAgo, dict]);

  return (
    <>
      <div
        className="sync-indicator"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className={dotClass} />
        <Icon className="sync-indicator-icon" />
        <span className="sync-indicator-text">{label}</span>
      </div>

      {isMounted &&
        createPortal(
          <div
            className={`version-tooltip fixed -translate-x-1/2 z-9999 transition-all ease-in-out ${
              showTooltip
                ? "duration-500 opacity-100 visible translate-y-0"
                : "duration-200 opacity-0 invisible translate-y-1"
            }`}
            style={{
              top: tooltipPos.top,
              left: tooltipPos.left,
            }}
            onTransitionEnd={handleTransitionEnd}
          >
            <span>{tooltipText}</span>
            <div className="version-tooltip-arrow" />
          </div>,
          document.body,
        )}
    </>
  );
}
