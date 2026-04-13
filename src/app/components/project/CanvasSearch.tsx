"use client";

import { Command } from "cmdk";
import { Search as SearchIcon, ListTodo } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useMemo } from "react";
import { createPortal } from "react-dom";
import { HighlightedText, useCanvasSearch } from "./canvasSearchModel";

interface CanvasSearchProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (value: string) => void;
}

export default function CanvasSearch({
  isOpen,
  onClose,
  query,
  onQueryChange,
}: CanvasSearchProps) {
  const { dict } = useI18n();
  const {
    blockGroups,
    filteredTasks,
    normalizedQuery,
    selectBlock,
    selectTask,
  } = useCanvasSearch(query);

  const hasVisibleResults = useMemo(
    () => blockGroups.length > 0 || filteredTasks.length > 0,
    [blockGroups, filteredTasks],
  );

  if (!isOpen) return null;

  return createPortal(
    <div className="canvas-search-overlay" role="dialog" aria-modal="true">
      <div className="canvas-search-backdrop" onClick={onClose} />
      <div className="canvas-search-modal">
        <Command
          label={dict.canvas.canvasSearchLabel}
          shouldFilter={false}
          className="canvas-search-command"
        >
          <div className="canvas-search-input-wrap" cmdk-input-wrapper="">
            <SearchIcon className="canvas-search-input-icon" />
            <Command.Input
              placeholder={dict.canvas.canvasSearchPlaceholder}
              className="canvas-search-input"
              value={query}
              onValueChange={onQueryChange}
              autoFocus
            />
          </div>
          <Command.List className="canvas-search-list">
            <Command.Empty className="canvas-search-empty">
              {normalizedQuery
                ? dict.canvas.canvasSearchNoResults
                : dict.canvas.canvasSearchStartTyping}
            </Command.Empty>

            {blockGroups.map((group) => (
              <Command.Group key={group.key} heading={group.heading}>
                {group.items.map((entry) => (
                  <Command.Item
                    key={`block-${entry.id}`}
                    value={`block-${entry.id}-${entry.title}`}
                    onSelect={() => selectBlock(entry.id, onClose)}
                    className="canvas-search-item"
                  >
                    <entry.icon size={14} className="canvas-search-item-icon" />
                    <div className="canvas-search-item-content">
                      <span className="canvas-search-item-title">
                        <HighlightedText text={entry.title} highlight={query} />
                      </span>
                      <span className="canvas-search-item-subtitle">
                        <HighlightedText
                          text={entry.subtitle}
                          highlight={query}
                        />
                      </span>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}

            {hasVisibleResults && filteredTasks.length > 0 && (
              <Command.Group heading={dict.canvas.canvasSearchTasks}>
                {filteredTasks.map((entry) => (
                  <Command.Item
                    key={`task-${entry.id}`}
                    value={`task-${entry.id}-${entry.title}`}
                    onSelect={() => selectTask(entry, onClose)}
                    className="canvas-search-item"
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
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>,
    document.body,
  );
}
