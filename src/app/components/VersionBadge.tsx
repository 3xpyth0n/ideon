"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@providers/I18nProvider";

interface VersionBadgeProps {
  currentVersion: string;
}

export function VersionBadge({ currentVersion }: VersionBadgeProps) {
  const { dict } = useI18n();
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const isHoveringRef = useRef(false);

  useEffect(() => {
    fetch("/api/system/version")
      .then((res) => res.json())
      .then((data) => {
        if (data.latest) {
          setLatestVersion(data.latest);
          checkUpdate(currentVersion, data.latest);
        }
      })
      .catch((err) => console.error("Failed to check version:", err));
  }, [currentVersion]);

  const checkUpdate = (current: string, latest: string) => {
    const cleanCurrent = current.replace(/^v/, "");
    const cleanLatest = latest.replace(/^v/, "");

    const v1 = cleanCurrent.split(".").map(Number);
    const v2 = cleanLatest.split(".").map(Number);

    for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
      const num1 = v1[i] || 0;
      const num2 = v2[i] || 0;
      if (num2 > num1) {
        setHasUpdate(true);
        return;
      }
      if (num1 > num2) {
        setHasUpdate(false);
        return;
      }
    }
    setHasUpdate(false);
  };

  useEffect(() => {
    if (isMounted && isHoveringRef.current) {
      const timer = setTimeout(() => {
        setShowTooltip(true);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isMounted]);

  const handleMouseEnter = (e: React.MouseEvent) => {
    isHoveringRef.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      top: rect.bottom + 6,
      left: rect.left + rect.width / 2,
    });

    if (!isMounted) {
      setIsMounted(true);
    } else {
      // If already mounted (e.g. fading out), show immediately to cancel fade out
      setShowTooltip(true);
    }
  };

  const handleMouseLeave = () => {
    isHoveringRef.current = false;
    setShowTooltip(false);
  };

  const handleTransitionEnd = () => {
    if (!showTooltip) {
      setIsMounted(false);
    }
  };

  return (
    <>
      <a
        href="https://github.com/3xpyth0n/ideon/releases"
        target="_blank"
        rel="noopener noreferrer"
        className="version-badge"
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <span className="version-text">
          v{currentVersion.replace(/^v/, "")}
        </span>
        <span className={`version-dot ${hasUpdate ? "update" : "latest"}`} />
      </a>

      {isMounted &&
        createPortal(
          <div
            className={`version-tooltip fixed -translate-x-1/2 z-[9999] transition-all ease-in-out ${
              showTooltip
                ? "duration-500 opacity-100 visible translate-y-0"
                : "duration-200 opacity-0 invisible translate-y-1"
            }`}
            style={{
              top: tooltipPos.top,
              left: tooltipPos.left,
              transform: "translateX(-50%)",
            }}
            onTransitionEnd={handleTransitionEnd}
          >
            {hasUpdate
              ? dict.system.updateAvailable.replace(
                  "{version}",
                  latestVersion || "",
                )
              : dict.system.upToDate}
            <div className="version-tooltip-arrow" />
          </div>,
          document.body,
        )}
    </>
  );
}
