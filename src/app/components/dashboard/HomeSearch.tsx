"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { FileText, FolderOpen, Loader2, Search as SearchIcon } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import type {
  HomeSearchItem,
  HomeSearchResponse,
} from "@/api/home/search/route";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedText({
  text,
  highlight,
}: {
  text: string;
  highlight: string;
}) {
  if (!text) return null;
  if (!highlight.trim()) return <>{text}</>;

  const pattern = new RegExp(`(${escapeRegExp(highlight)})`, "gi");
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <mark key={`${part}-${index}`} className="dashboard-search-highlight">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}

function SearchResultGroup({
  heading,
  items,
  query,
  onSelect,
}: {
  heading: string;
  items: HomeSearchItem[];
  query: string;
  onSelect: (item: HomeSearchItem) => void;
}) {
  if (items.length === 0) return null;

  return (
    <Command.Group heading={heading}>
      {items.map((item) => (
        <Command.Item
          key={`${item.type}-${item.id}`}
          value={`${item.type}-${item.id}-${item.name}`}
          onSelect={() => onSelect(item)}
          className="dashboard-search-item"
        >
          <span className="dashboard-search-item-icon">
            {item.type === "folder" ? (
              <FolderOpen size={15} />
            ) : (
              <FileText size={15} />
            )}
          </span>
          <span className="dashboard-search-item-copy">
            <span className="dashboard-search-item-title">
              <HighlightedText text={item.name} highlight={query} />
            </span>
            {item.description ? (
              <span className="dashboard-search-item-subtitle">
                <HighlightedText text={item.description} highlight={query} />
              </span>
            ) : null}
          </span>
        </Command.Item>
      ))}
    </Command.Group>
  );
}

export function HomeSearch() {
  const { dict } = useI18n();
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<HomeSearchResponse>({
    projects: [],
    folders: [],
  });

  const trimmedQuery = query.trim();

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }

      if (event.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    if (trimmedQuery.length < 2) {
      setLoading(false);
      setResults({ projects: [], folders: [] });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/home/search?q=${encodeURIComponent(trimmedQuery)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error("Search failed");
        }

        const payload = (await response.json()) as HomeSearchResponse;
        if (!cancelled) {
          setResults(payload);
        }
      } catch {
        if (!cancelled) {
          setResults({ projects: [], folders: [] });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, trimmedQuery]);

  const hasResults = useMemo(
    () => results.projects.length > 0 || results.folders.length > 0,
    [results.folders.length, results.projects.length],
  );

  const handleSelect = (item: HomeSearchItem) => {
    setOpen(false);
    setQuery("");
    router.push(item.target);
  };

  return (
    <div ref={wrapperRef} className="dashboard-search">
      <Command shouldFilter={false} className="dashboard-search-command">
        <div className="dashboard-search-shell" cmdk-input-wrapper="">
          <SearchIcon className="dashboard-search-shell-icon" size={16} />
          <Command.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            onFocus={() => setOpen(true)}
            placeholder={dict.dashboard.homeSearchPlaceholder}
            className="dashboard-search-input"
          />
          <span className="dashboard-search-shortcut">Ctrl K</span>
        </div>

        {open ? (
          <div className="dashboard-search-popover">
            <Command.List className="dashboard-search-list">
              {loading ? (
                <div className="dashboard-search-status">
                  <Loader2 size={16} className="dashboard-search-spinner" />
                  <span>{dict.dashboard.homeSearchLoading}</span>
                </div>
              ) : trimmedQuery.length < 2 ? (
                <div className="dashboard-search-status">
                  {dict.dashboard.homeSearchStartTyping}
                </div>
              ) : hasResults ? (
                <>
                  <SearchResultGroup
                    heading={dict.dashboard.homeSearchFolders}
                    items={results.folders}
                    query={trimmedQuery}
                    onSelect={handleSelect}
                  />
                  <SearchResultGroup
                    heading={dict.dashboard.homeSearchProjects}
                    items={results.projects}
                    query={trimmedQuery}
                    onSelect={handleSelect}
                  />
                </>
              ) : (
                <div className="dashboard-search-status">
                  {dict.dashboard.homeSearchNoResults}
                </div>
              )}
            </Command.List>
          </div>
        ) : null}
      </Command>
    </div>
  );
}