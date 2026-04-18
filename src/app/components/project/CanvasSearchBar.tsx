"use client";

import { Search, SlidersHorizontal, ListTodo } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useEffect, useMemo, useRef, useState } from "react";
import { HighlightedText, useCanvasSearch } from "./canvasSearchModel";

interface CanvasSearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  onOpenAdvanced: () => void;
}

export default function CanvasSearchBar({
  query,
  onQueryChange,
  onOpenAdvanced,
}: CanvasSearchBarProps) {
  const { dict } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [hasInlineInteraction, setHasInlineInteraction] = useState(false);
  const {
    blockGroups,
    filteredBlocks,
    filteredTasks,
    normalizedQuery,
    hasResults,
    selectBlock,
    selectTask,
  } = useCanvasSearch(query);

  useEffect(() => {
    if (!isDropdownOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof globalThis.Node)) return;
      if (rootRef.current?.contains(target)) return;
      setIsDropdownOpen(false);
      setHasInlineInteraction(false);
    };

    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("touchstart", handlePointerDown, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("touchstart", handlePointerDown, true);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    if (!hasInlineInteraction) return;

    if (normalizedQuery ? hasResults : filteredBlocks.length > 0) {
      setIsDropdownOpen(true);
    }
  }, [
    filteredBlocks.length,
    hasInlineInteraction,
    hasResults,
    normalizedQuery,
  ]);

  const showDropdown =
    isDropdownOpen &&
    (normalizedQuery.length > 0 ? hasResults : filteredBlocks.length > 0);
  const showBlocks = useMemo(
    () =>
      normalizedQuery.length > 0
        ? blockGroups.length > 0
        : filteredBlocks.length > 0,
    [blockGroups.length, filteredBlocks.length, normalizedQuery.length],
  );
  const showDefaultBlockList = normalizedQuery.length === 0;

  return (
    <div className="canvas-search-bar" ref={rootRef}>
      <div className="canvas-search-bar-shell">
        <Search className="canvas-search-bar-icon" size={14} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => {
            setHasInlineInteraction(true);
            onQueryChange(event.target.value);
          }}
          onFocus={() => {
            setHasInlineInteraction(true);
            if (normalizedQuery ? hasResults : filteredBlocks.length > 0) {
              setIsDropdownOpen(true);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsDropdownOpen(false);
              setHasInlineInteraction(false);
              inputRef.current?.blur();
            }
          }}
          placeholder={dict.canvas.canvasSearchPlaceholder}
          className="canvas-search-bar-input"
          aria-label={dict.canvas.canvasSearchLabel}
        />
        <button
          type="button"
          className="canvas-search-bar-advanced"
          onClick={() => {
            setIsDropdownOpen(false);
            setHasInlineInteraction(false);
            onOpenAdvanced();
          }}
          title={dict.canvas.canvasSearchAdvanced}
          aria-label={dict.canvas.canvasSearchAdvanced}
        >
          <SlidersHorizontal size={13} />
          <span>{dict.canvas.canvasSearchAdvanced}</span>
          <kbd>Ctrl + K</kbd>
        </button>
      </div>

      {showDropdown && (
        <div
          className={
            showDefaultBlockList
              ? "canvas-search-dropdown canvas-search-dropdown-preview"
              : "canvas-search-dropdown"
          }
        >
          {showBlocks && (
            <div className="canvas-search-dropdown-section">
              {showDefaultBlockList
                ? filteredBlocks.map((entry) => (
                    <button
                      key={`inline-block-${entry.id}`}
                      type="button"
                      className="canvas-search-dropdown-item"
                      onClick={() => {
                        selectBlock(entry.id, () => setIsDropdownOpen(false));
                        setHasInlineInteraction(false);
                      }}
                    >
                      <entry.icon
                        size={14}
                        className="canvas-search-item-icon"
                      />
                      <div className="canvas-search-item-content">
                        <span className="canvas-search-item-title">
                          <HighlightedText
                            text={entry.title}
                            highlight={query}
                          />
                        </span>
                        <span className="canvas-search-item-subtitle">
                          <HighlightedText
                            text={entry.subtitle}
                            highlight={query}
                          />
                        </span>
                      </div>
                    </button>
                  ))
                : blockGroups.map((group) => (
                    <div
                      key={group.key}
                      className="canvas-search-dropdown-group"
                    >
                      <div className="canvas-search-dropdown-heading">
                        {group.heading}
                      </div>
                      {group.items.map((entry) => (
                        <button
                          key={`inline-block-${entry.id}`}
                          type="button"
                          className="canvas-search-dropdown-item"
                          onClick={() => {
                            selectBlock(entry.id, () =>
                              setIsDropdownOpen(false),
                            );
                            setHasInlineInteraction(false);
                          }}
                        >
                          <entry.icon
                            size={14}
                            className="canvas-search-item-icon"
                          />
                          <div className="canvas-search-item-content">
                            <span className="canvas-search-item-title">
                              <HighlightedText
                                text={entry.title}
                                highlight={query}
                              />
                            </span>
                            <span className="canvas-search-item-subtitle">
                              <HighlightedText
                                text={entry.subtitle}
                                highlight={query}
                              />
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
            </div>
          )}

          {filteredTasks.length > 0 && (
            <div className="canvas-search-dropdown-section">
              <div className="canvas-search-dropdown-heading">
                {dict.canvas.canvasSearchTasks}
              </div>
              {filteredTasks.map((entry) => (
                <button
                  key={`inline-task-${entry.id}`}
                  type="button"
                  className="canvas-search-dropdown-item"
                  onClick={() => {
                    selectTask(entry, () => setIsDropdownOpen(false));
                    setHasInlineInteraction(false);
                  }}
                >
                  <span className="canvas-search-task-id">
                    {entry.taskIdLabel}
                  </span>
                  <ListTodo size={14} className="canvas-search-item-icon" />
                  <div className="canvas-search-item-content">
                    <span className="canvas-search-item-title">
                      <HighlightedText text={entry.title} highlight={query} />
                    </span>
                    <span className="canvas-search-item-subtitle">
                      <HighlightedText
                        text={entry.boardTitle}
                        highlight={query}
                      />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
