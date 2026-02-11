"use client";

import { useEffect, useState } from "react";
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
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

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

  return (
    <>
      <a
        href="https://github.com/3xpyth0n/ideon/releases"
        target="_blank"
        rel="noopener noreferrer"
        className="version-badge"
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setTooltipPos({
            top: rect.bottom + 6,
            left: rect.left + rect.width / 2,
          });
          setShowTooltip(true);
        }}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <span className="version-text">
          v{currentVersion.replace(/^v/, "")}
        </span>
        <span className={`version-dot ${hasUpdate ? "update" : "latest"}`} />
      </a>

      {showTooltip &&
        createPortal(
          <div
            className="version-tooltip"
            style={{
              position: "fixed",
              top: tooltipPos.top,
              left: tooltipPos.left,
              transform: "translateX(-50%)",
              opacity: 1,
              visibility: "visible",
              zIndex: 9999,
            }}
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
