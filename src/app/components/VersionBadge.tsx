"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import * as semver from "semver";
import { useI18n } from "@providers/I18nProvider";
import { Modal } from "./ui/Modal";

interface VersionBadgeProps {
  currentVersion: string;
}

interface ChangelogSection {
  version: string;
  date: string;
  content: string;
  isNewer: boolean;
}

function isVersionNewer(version: string, current: string): boolean {
  const a = semver.clean(version) || version;
  const b = semver.clean(current) || current;
  if (!semver.valid(a) || !semver.valid(b)) return false;
  return semver.gt(a, b);
}

function parseChangelog(
  markdown: string,
  currentVersion: string,
): ChangelogSection[] {
  const sections: ChangelogSection[] = [];
  const versionRegex =
    /^## \[v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\]\s*-\s*(\d{4}-\d{2}-\d{2})/;
  const lines = markdown.split("\n");
  let current: ChangelogSection | null = null;

  for (const line of lines) {
    const match = line.match(versionRegex);
    if (match) {
      if (current) sections.push(current);
      current = {
        version: match[1],
        date: match[2],
        content: "",
        isNewer: isVersionNewer(match[1], currentVersion),
      };
    } else if (current) {
      current.content += line + "\n";
    }
  }
  if (current) sections.push(current);
  return sections;
}

function renderMarkdownBlock(content: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = content.trim().split("\n");
  let listItems: string[] = [];
  let listKey = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    nodes.push(
      <ul key={`list-${listKey++}`} className="changelog-list">
        {listItems.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sectionMatch = line.match(/^### (.+)/);
    const listMatch = line.match(/^- (.+)/);

    if (sectionMatch) {
      flushList();
      nodes.push(
        <h4 key={`h-${i}`} className="changelog-section-title">
          {sectionMatch[1]}
        </h4>,
      );
    } else if (listMatch) {
      listItems.push(listMatch[1]);
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      if (line.trim()) {
        nodes.push(
          <p key={`p-${i}`} className="changelog-paragraph">
            {renderInline(line)}
          </p>,
        );
      }
    }
  }
  flushList();
  return nodes;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|\[(.+?)\]\((.+?)\)|`(.+?)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      parts.push(<strong key={key++}>{match[1]}</strong>);
    } else if (match[2] && match[3]) {
      parts.push(
        <a
          key={key++}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="changelog-link"
        >
          {match[2]}
        </a>,
      );
    } else if (match[4]) {
      parts.push(
        <code key={key++} className="changelog-code">
          {match[4]}
        </code>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

export function VersionBadge({ currentVersion }: VersionBadgeProps) {
  const { dict } = useI18n();
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const isHoveringBadgeRef = useRef(false);
  const isHoveringTooltipRef = useRef(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showChangelog, setShowChangelog] = useState(false);
  const [changelogSections, setChangelogSections] = useState<
    ChangelogSection[]
  >([]);
  const [changelogLoading, setChangelogLoading] = useState(false);
  const [changelogError, setChangelogError] = useState(false);

  useEffect(() => {
    fetch("/api/system/version")
      .then((res) => res.json())
      .then((data) => {
        if (data.latest) {
          setLatestVersion(data.latest);
          const a = semver.clean(data.latest) || data.latest;
          const b = semver.clean(currentVersion) || currentVersion;
          const updated =
            semver.valid(a) && semver.valid(b) ? semver.gt(a, b) : false;
          setHasUpdate(updated);
        }
      })
      .catch((err) => console.error("Failed to check version:", err));
  }, [currentVersion]);

  const cancelHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimeoutRef.current = setTimeout(() => {
      if (!isHoveringBadgeRef.current && !isHoveringTooltipRef.current) {
        setShowTooltip(false);
      }
    }, 150);
  }, [cancelHide]);

  useEffect(() => {
    if (
      isMounted &&
      (isHoveringBadgeRef.current || isHoveringTooltipRef.current)
    ) {
      const timer = setTimeout(() => setShowTooltip(true), 50);
      return () => clearTimeout(timer);
    }
  }, [isMounted]);

  const handleBadgeMouseEnter = (e: React.MouseEvent) => {
    isHoveringBadgeRef.current = true;
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

  const handleBadgeMouseLeave = () => {
    isHoveringBadgeRef.current = false;
    if (hasUpdate) {
      scheduleHide();
    } else {
      setShowTooltip(false);
    }
  };

  const handleTooltipMouseEnter = () => {
    isHoveringTooltipRef.current = true;
    cancelHide();
  };

  const handleTooltipMouseLeave = () => {
    isHoveringTooltipRef.current = false;
    scheduleHide();
  };

  const handleTransitionEnd = () => {
    if (!showTooltip) {
      setIsMounted(false);
    }
  };

  const openChangelog = async () => {
    setShowTooltip(false);
    setIsMounted(false);
    setShowChangelog(true);
    setChangelogLoading(true);
    setChangelogError(false);

    try {
      const res = await fetch("/api/system/changelog");
      const data = await res.json();
      if (data.content) {
        setChangelogSections(parseChangelog(data.content, currentVersion));
      } else {
        setChangelogError(true);
      }
    } catch {
      setChangelogError(true);
    } finally {
      setChangelogLoading(false);
    }
  };

  return (
    <>
      <span
        className="version-badge"
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={handleBadgeMouseEnter}
        onMouseLeave={handleBadgeMouseLeave}
      >
        <span className="version-text">
          v{currentVersion.replace(/^v/, "")}
        </span>
        <span className={`version-dot ${hasUpdate ? "update" : "latest"}`} />
      </span>

      {isMounted &&
        createPortal(
          <div
            className={`version-tooltip fixed -translate-x-1/2 z-9999 transition-all ease-in-out ${
              hasUpdate ? "interactive" : ""
            } ${
              showTooltip
                ? "duration-500 opacity-100 visible translate-y-0"
                : "duration-200 opacity-0 invisible translate-y-1"
            }`}
            style={{
              top: tooltipPos.top,
              left: tooltipPos.left,
            }}
            onTransitionEnd={handleTransitionEnd}
            onMouseEnter={hasUpdate ? handleTooltipMouseEnter : undefined}
            onMouseLeave={hasUpdate ? handleTooltipMouseLeave : undefined}
          >
            <span>
              {hasUpdate
                ? dict.system.updateAvailable.replace(
                    "{version}",
                    latestVersion || "",
                  )
                : dict.system.upToDate}
            </span>
            {hasUpdate && (
              <button className="version-see-changes" onClick={openChangelog}>
                {dict.system.seeChanges}
              </button>
            )}
            <div className="version-tooltip-arrow" />
          </div>,
          document.body,
        )}

      <Modal
        isOpen={showChangelog}
        onClose={() => setShowChangelog(false)}
        title={dict.system.changelog}
        className="changelog-modal"
      >
        <div className="changelog-container">
          {changelogLoading && (
            <div className="changelog-loading">
              <div className="changelog-spinner" />
            </div>
          )}
          {changelogError && (
            <p className="changelog-error">{dict.system.changelogError}</p>
          )}
          {!changelogLoading &&
            !changelogError &&
            changelogSections.map((section) => (
              <div
                key={section.version}
                className={`changelog-version ${
                  section.isNewer ? "highlighted" : ""
                }`}
              >
                <div className="changelog-heading">
                  <span className="changelog-version-number">
                    v{section.version}
                  </span>
                  <span className="changelog-date">{section.date}</span>
                </div>
                {renderMarkdownBlock(section.content)}
              </div>
            ))}
        </div>
      </Modal>
    </>
  );
}
