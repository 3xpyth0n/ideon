"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { useI18n } from "@providers/I18nProvider";
import { Button } from "@components/ui/Button";
import {
  History,
  Clock,
  X,
  Save,
  ChevronDown,
  Trash2,
  Pencil,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { useTouchGestures } from "./hooks/useTouchGestures";
import { useTouch } from "@providers/TouchProvider";

interface TemporalState {
  id: string;
  parentId: string | null;
  authorId: string;
  intent: string;
  timestamp: string;
  isSnapshot: boolean;
  authorName?: string;
}

interface DecisionHistoryProps {
  projectId: string;
  onPreview: (stateId: string | null) => void;
  onApply: (stateId: string) => Promise<void>;
  onSave: (intent?: string) => Promise<boolean>;
  onDelete?: (stateId: string) => Promise<void>;
  onRename?: (stateId: string, newIntent: string) => Promise<void>;
  isPreviewing: boolean;
  selectedStateId: string | null;
  projectOwnerId?: string | null;
  currentUserId?: string;
}

export function DecisionHistory({
  projectId,
  onPreview,
  onSave,
  onDelete,
  onRename,
  isPreviewing,
  selectedStateId,
  projectOwnerId,
  currentUserId,
}: DecisionHistoryProps) {
  const { dict, lang } = useI18n();
  const [history, setHistory] = useState<TemporalState[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(10);
  const [showBottomGradient, setShowBottomGradient] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    stateId: string;
    intent: string;
  } | null>(null);
  const [editingStateId, setEditingStateId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const menuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { rippleRef } = useTouch();

  const onLongPress = useCallback(
    (e: React.TouchEvent | TouchEvent, x: number, y: number) => {
      const target = e.target as HTMLElement;
      const historyItem = target.closest(".history-item");

      if (historyItem) {
        const stateId = historyItem.getAttribute("data-state-id");
        const intent = historyItem.getAttribute("data-intent");
        if (stateId && intent) {
          setContextMenu({
            x,
            y,
            stateId,
            intent,
          });
        }
      }
    },
    [],
  );

  const touchHandlers = useTouchGestures({
    rippleRef,
    onLongPress,
    stopPropagation: true,
  });

  // Adjust context menu position to prevent overflow
  useLayoutEffect(() => {
    if (contextMenu && contextMenuRef.current) {
      const el = contextMenuRef.current;
      const rect = el.getBoundingClientRect();
      const { innerWidth, innerHeight } = window;
      const margin = 10;

      let x = contextMenu.x;
      let y = contextMenu.y;

      // Horizontal: Flip to left if overflow
      if (x + rect.width + margin > innerWidth) {
        x = x - rect.width;
      }

      // Vertical: Shift up if overflow
      if (y + rect.height + margin > innerHeight) {
        y = innerHeight - rect.height - margin;
      }

      // Safety check for top/left edges
      if (x < margin) x = margin;
      if (y < margin) y = margin;

      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
  }, [contextMenu]);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // If clicking inside the context menu, don't close it here
      const target = event.target as HTMLElement;
      if (target.closest(".temporal-context-menu")) {
        return;
      }

      if (contextMenu) {
        setContextMenu(null);
        return;
      }
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen || contextMenu) {
      document.addEventListener("mousedown", handleClickOutside, true);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [isOpen, contextMenu]);

  const checkScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    setShowBottomGradient(scrollTop + clientHeight < scrollHeight - 1);
  };

  const fetchHistory = useCallback(async () => {
    if (!projectId || projectId === "undefined") return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/temporal?action=history`,
      );
      const data = await res.json();

      if (!res.ok) {
        toast.error(dict.common.error);
        setIsLoading(false);
        return;
      }

      setHistory(data.history || []);
      // Reset scroll check after data load
      setTimeout(checkScroll, 100);
    } catch {
      toast.error(dict.common.error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, dict.common.error]);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
      setVisibleHistoryCount(10);
    }
  }, [isOpen, fetchHistory]);

  const handleToggle = () => setIsOpen(!isOpen);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const success = await onSave();
      if (success) {
        toast.success(dict.modals.milestoneSuccess);
        fetchHistory();
      }
    } catch {
      toast.error(dict.modals.saveStateError);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadMore = () => {
    setVisibleHistoryCount((prev) => prev + 10);
    setTimeout(checkScroll, 100);
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(date)
      .replace(",", ""); // Remove comma if present
  };

  const handleSelectState = (stateId: string) => {
    if (editingStateId) return; // Prevent selection while editing
    onPreview(stateId);
  };

  const handleContextMenu = (
    e: React.MouseEvent,
    stateId: string,
    intent: string,
  ) => {
    if (!projectOwnerId || projectOwnerId === "null") return;
    e.preventDefault();
    e.stopPropagation();

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      stateId,
      intent,
    });
  };

  const handleRename = async (stateId: string, newIntent: string) => {
    if (!onRename || !newIntent.trim() || newIntent === contextMenu?.intent)
      return;

    try {
      await onRename(stateId, newIntent);
      fetchHistory();
    } catch {
      // Error handled in onRename
    }
  };

  const handleDelete = async (stateId: string) => {
    if (!onDelete) return;

    try {
      setContextMenu(null);
      await onDelete(stateId);
      fetchHistory();
    } catch {
      // Error handled in onDelete
    }
  };

  const displayedHistory = history.slice(0, visibleHistoryCount);
  const hasMoreHistory = history.length > visibleHistoryCount;
  // Activate overflow-y: auto only if more than 5 elements
  const shouldEnableScroll = history.length > 5;

  return (
    <div className="temporal-navigation-container" ref={menuRef}>
      <button
        className={`temporal-trigger outline-none ${isOpen ? "active" : ""}`}
        onClick={handleToggle}
        title={dict.canvas.temporalHistory}
      >
        <History className="w-5 h-5 transition-transform duration-300" />
      </button>

      {isOpen && (
        <div className="save-context-menu">
          {/* Header */}
          <div className="p-4 border-b border-border/50 flex items-center justify-between bg-muted/30 flex-shrink-0">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">
                {dict.canvas.temporalHistory}
              </h3>
            </div>
            <Button
              size="icon"
              noRipple
              className="h-8 w-8 rounded-full"
              onClick={handleToggle}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="p-3 border-b border-border/40 flex-shrink-0">
            <Button
              className="w-full h-10 rounded-xl flex items-center justify-center gap-2 shadow-sm temporal-save-btn"
              onClick={handleSave}
              disabled={isSaving || isPreviewing}
              noRipple
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin temporal-save-icon" />
              ) : (
                <Save className="w-4 h-4 temporal-save-icon" />
              )}
              <span className="text-xs font-medium">{dict.common.save}</span>
            </Button>
          </div>

          {/* History List Container with Scroll Indicators */}
          <div className="scroll-container">
            <div
              ref={listRef}
              className={`p-2 min-h-0 ${
                shouldEnableScroll ? "max-h-[400px]" : ""
              }`}
              onScroll={checkScroll}
            >
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Clock className="h-8 w-8 animate-pulse mb-3 opacity-20" />
                  <p className="text-xs uppercase tracking-widest font-medium animate-pulse">
                    {dict.common.loading}
                  </p>
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-10 text-xs text-muted-foreground">
                  {dict.modals.noHistory}
                </div>
              ) : (
                <>
                  {displayedHistory.map((state) => (
                    <div
                      key={state.id}
                      className="history-item-container relative group"
                    >
                      <button
                        onClick={() => handleSelectState(state.id)}
                        onContextMenu={(e) =>
                          handleContextMenu(e, state.id, state.intent)
                        }
                        data-state-id={state.id}
                        data-intent={state.intent}
                        {...touchHandlers}
                        className={`history-item w-full ${
                          selectedStateId === state.id ? "active" : ""
                        }`}
                        disabled={!!editingStateId}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                            <User className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            <span className="text-xs font-semibold truncate text-foreground">
                              {state.authorName || dict.project.anonymous}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground tabular-nums font-medium flex-shrink-0">
                            {formatDate(state.timestamp)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          {editingStateId === state.id ? (
                            <input
                              className="zen-input text-[10px] text-foreground bg-background border border-primary/50 rounded px-1 w-full outline-none"
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => {
                                handleRename(state.id, editValue);
                                setEditingStateId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleRename(state.id, editValue);
                                  setEditingStateId(null);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setEditingStateId(null);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                            />
                          ) : (
                            <span className="text-[10px] text-muted-foreground truncate opacity-70">
                              {state.intent || dict.project.noDescription}
                            </span>
                          )}
                          {state.isSnapshot && (
                            <div className="flex items-center gap-1 bg-primary/10 text-primary text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                              <Save className="w-2 h-2" />
                              <span>{dict.modals.milestone}</span>
                            </div>
                          )}
                        </div>
                        {selectedStateId === state.id && (
                          <div className="history-active-indicator animate-pulse" />
                        )}
                      </button>
                    </div>
                  ))}

                  {hasMoreHistory && (
                    <div className="pt-2 pb-4 flex justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleLoadMore}
                        noRipple
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 h-8 px-3"
                      >
                        <span>{dict.common.showMore}</span>
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>

            {showBottomGradient && <div className="viewport-gradient-bottom" />}
            {/* Static shadow as requested in 4.A */}
            {shouldEnableScroll && <div className="scroll-shadow-bottom" />}
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="temporal-context-menu fixed"
          style={{
            top: contextMenu.y,
            left: contextMenu.x,
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {projectOwnerId === currentUserId && (
            <div
              className="context-menu-item"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setEditingStateId(contextMenu.stateId);
                setEditValue(contextMenu.intent);
                setContextMenu(null);
              }}
            >
              <Pencil className="w-4 h-4" />
              <span>{dict.common.rename || "Rename"}</span>
            </div>
          )}
          <div
            className="context-menu-item danger"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDelete(contextMenu.stateId);
            }}
          >
            <Trash2 className="w-4 h-4" />
            <span>{dict.common.delete}</span>
          </div>
        </div>
      )}
    </div>
  );
}
