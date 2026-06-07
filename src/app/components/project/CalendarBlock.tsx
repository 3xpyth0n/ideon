"use client";

import {
  memo,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import {
  Calendar as CalendarIcon,
  Edit3,
  ArrowLeft,
  ArrowRight,
  Copy,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@providers/I18nProvider";
import { BlockFooter } from "./BlockFooter";
import { BlockTitleInput } from "./BlockTitleInput";
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
  useReactFlow,
} from "@xyflow/react";
import { BlockData } from "./CanvasBlock";
import "./calendar-block.css";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import CustomNodeResizer from "./CustomNodeResizer";
import { focusProjectCanvas } from "./utils/focusCanvas";
import FloatingMenu from "./FloatingMenu";
import EventModal from "@components/project/EventModal";
import {
  parseCalendarMetadata,
  getDaysInMonth,
  isToday,
  getEventsForDay,
  DEFAULT_EVENT_COLORS,
  parseIcsEvents,
  type CalendarEvent,
  type ParsedCalendarMetadata,
} from "./calendarModel";

type CalendarBlockProps = NodeProps<Node<BlockData>>;

type HoverCardState = {
  event: CalendarEvent;
  x: number;
  y: number;
  placement: "top" | "bottom";
};

const CalendarBlock = memo(({ id, data, selected }: CalendarBlockProps) => {
  const { dict, lang } = useI18n();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [title, setTitle] = useState(data.title || "");
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{
    x: number;
    y: number;
    right?: number;
  }>({ x: 0, y: 0 });
  const [isImportDragActive, setIsImportDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef(0);
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null);
  const hideHoverCardTimeoutRef = useRef<number | null>(null);
  const blockRef = useRef<HTMLDivElement>(null);

  const currentUser = data.currentUser;
  const projectOwnerId = data.projectOwnerId;
  const ownerId = data.ownerId;
  const isPreviewMode = data.isPreviewMode;
  const isLocked = data.isLocked;

  const isProjectOwner = currentUser?.id && projectOwnerId === currentUser.id;
  const isOwner = currentUser?.id && ownerId === currentUser.id;
  const isViewer = data.userRole === "viewer";
  const isReadOnly =
    isPreviewMode ||
    isViewer ||
    (isLocked ? !isOwner && !isProjectOwner : false);
  const canReact = !isPreviewMode || isViewer;

  const tr = (path: string, fallback: string): string => {
    const keys = path.split(".");
    let v: unknown = dict;
    for (const k of keys) {
      if (typeof v === "object" && v !== null) {
        v = (v as Record<string, unknown>)[k];
      } else {
        return fallback;
      }
    }
    return typeof v === "string" ? v : fallback;
  };

  const getEditorName = () =>
    currentUser?.displayName ||
    currentUser?.username ||
    dict.project?.anonymous ||
    "unknown";

  const formatEventMeta = useCallback(
    (event: CalendarEvent) => {
      const start = new Date(event.startDate);
      const end = event.endDate ? new Date(event.endDate) : undefined;
      const hourShort = tr("calendar.hourShort", "h");

      if (event.allDay) {
        if (!end) return tr("calendar.allDay", "All day");
        if (
          start.getFullYear() === end.getFullYear() &&
          start.getMonth() === end.getMonth() &&
          start.getDate() === end.getDate()
        ) {
          return tr("calendar.allDay", "All day");
        }
        const fmtDate = new Intl.DateTimeFormat(lang, {
          day: "2-digit",
          month: "2-digit",
        });
        return `${tr("calendar.allDay", "All day")} (${fmtDate.format(
          start,
        )} - ${fmtDate.format(end)})`;
      }

      const fmtTime = new Intl.DateTimeFormat(lang, {
        hour: "2-digit",
        minute: "2-digit",
      });
      if (!end) return fmtTime.format(start);

      const durationMinutes = Math.max(
        0,
        Math.round((end.getTime() - start.getTime()) / 60000),
      );
      const durationHours = Math.floor(durationMinutes / 60);
      const durationMinutesRemainder = durationMinutes % 60;
      const duration =
        durationMinutes > 0
          ? ` (${durationHours}${hourShort}${
              durationMinutesRemainder > 0
                ? String(durationMinutesRemainder).padStart(2, "0")
                : ""
            })`
          : "";

      const sameDay =
        start.getFullYear() === end.getFullYear() &&
        start.getMonth() === end.getMonth() &&
        start.getDate() === end.getDate();

      if (sameDay) {
        const startText = fmtTime.format(start);
        const endText = fmtTime.format(end);
        return `${startText} - ${endText}${duration}`;
      }

      const fmtDateTime = new Intl.DateTimeFormat(lang, {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const startText = fmtDateTime.format(start);
      const endText = fmtDateTime.format(end);
      return `${startText} - ${endText}${duration}`;
    },
    [lang, tr],
  );

  const clearHoverCardTimeout = useCallback(() => {
    if (hideHoverCardTimeoutRef.current === null) return;
    window.clearTimeout(hideHoverCardTimeoutRef.current);
    hideHoverCardTimeoutRef.current = null;
  }, []);

  const showHoverCard = useCallback(
    (event: CalendarEvent, el: HTMLElement) => {
      clearHoverCardTimeout();
      const rect = el.getBoundingClientRect();
      const placement: HoverCardState["placement"] =
        rect.top > 220 ? "top" : "bottom";
      setHoverCard({
        event,
        x: rect.left + rect.width / 2,
        y: placement === "top" ? rect.top : rect.bottom,
        placement,
      });
    },
    [clearHoverCardTimeout],
  );

  const scheduleHideHoverCard = useCallback(() => {
    clearHoverCardTimeout();
    hideHoverCardTimeoutRef.current = window.setTimeout(() => {
      setHoverCard(null);
      hideHoverCardTimeoutRef.current = null;
    }, 80);
  }, [clearHoverCardTimeout]);

  useEffect(() => {
    if (isEventModalOpen) setHoverCard(null);
  }, [isEventModalOpen]);

  useEffect(() => {
    if (!openMenuKey) return;

    const handleDocumentClick = (e: MouseEvent) => {
      if (!(e.target instanceof globalThis.Node)) return;
      if (blockRef.current && !blockRef.current.contains(e.target)) {
        setOpenMenuKey(null);
      }
    };

    document.addEventListener("click", handleDocumentClick);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, [openMenuKey]);

  useEffect(() => {
    return () => {
      clearHoverCardTimeout();
    };
  }, [clearHoverCardTimeout]);

  const { setNodes, getEdges } = useReactFlow();

  const handleResize = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                width: Math.round(params.width),
                height: Math.round(params.height),
                position: {
                  x: Math.round(params.x),
                  y: Math.round(params.y),
                },
                style: {
                  ...n.style,
                  width: Math.round(params.width),
                  height: Math.round(params.height),
                },
              }
            : n,
        ),
      );

      const onResize = data.onResize;
      onResize?.(id, {
        width: Math.round(params.width),
        height: Math.round(params.height),
        x: Math.round(params.x),
        y: Math.round(params.y),
      });
    },
    [id, data, setNodes],
  );

  const handleResizeEnd = useCallback(
    (
      _evt: unknown,
      params?: { width: number; height: number; x: number; y: number },
    ) => {
      if (!params) return;

      const onResizeEnd = data.onResizeEnd;
      onResizeEnd?.(id, {
        width: Math.round(params.width),
        height: Math.round(params.height),
        x: Math.round(params.x),
        y: Math.round(params.y),
      });
    },
    [id, data],
  );

  const isHandleConnected = useCallback(
    (handleId: string) => {
      const edges = getEdges();
      return edges.some(
        (e) =>
          (e.source === id && e.sourceHandle === handleId) ||
          (e.target === id && e.targetHandle === handleId),
      );
    },
    [getEdges, id],
  );

  const isLeftSourceConnected = isHandleConnected("left");
  const isRightSourceConnected = isHandleConnected("right");
  const isTopSourceConnected = isHandleConnected("top");
  const isBottomSourceConnected = isHandleConnected("bottom");

  const { handleReact, handleRemoveReaction } = useBlockReactions({
    id,
    data,
    currentUser,
    isReadOnly,
    canReact,
  });

  useEffect(() => {
    const meta = parseCalendarMetadata(data.metadata);
    setEvents(meta.events);
  }, [data.metadata]);

  useEffect(() => {
    if (data.title !== undefined && data.title !== title) {
      setTitle(data.title);
    }
  }, [data.title, title]);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      setTitle(newTitle);
      const now = new Date().toISOString();
      const editor = getEditorName();
      const metadata: ParsedCalendarMetadata = {
        events,
      };
      data.onContentChange?.(
        id,
        data.content,
        now,
        editor,
        JSON.stringify(metadata),
        newTitle,
        data.reactions,
      );
    },
    [id, data, events],
  );

  const saveMetadata = useCallback(
    (nextEvents: CalendarEvent[]) => {
      const now = new Date().toISOString();
      const editor = getEditorName();
      const metadata: ParsedCalendarMetadata = {
        events: nextEvents,
      };
      data.onContentChange?.(
        id,
        data.content,
        now,
        editor,
        JSON.stringify(metadata),
        title,
        data.reactions,
      );
    },
    [id, data, title],
  );

  const daysInMonth = useMemo(() => {
    return getDaysInMonth(currentDate);
  }, [currentDate]);

  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < daysInMonth.length; i += 7) {
      result.push(daysInMonth.slice(i, i + 7));
    }
    return result;
  }, [daysInMonth]);

  const isMultiDayEvent = useCallback((event: CalendarEvent): boolean => {
    if (!event.endDate) return false;
    const start = new Date(event.startDate);
    const end = new Date(event.endDate);
    return (
      start.getFullYear() !== end.getFullYear() ||
      start.getMonth() !== end.getMonth() ||
      start.getDate() !== end.getDate()
    );
  }, []);

  const weekLayouts = useMemo(() => {
    const toStartOfDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const toEndOfDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    const diffDays = (a: Date, b: Date) => {
      const ms = toStartOfDay(a).getTime() - toStartOfDay(b).getTime();
      return Math.floor(ms / 86400000);
    };

    return weeks.map((weekDays) => {
      const weekStart = toStartOfDay(weekDays[0]);
      const weekEnd = toEndOfDay(weekDays[weekDays.length - 1]);
      const segments: Array<{
        event: CalendarEvent;
        startCol: number;
        endCol: number;
        lane: number;
        clippedStart: boolean;
        clippedEnd: boolean;
      }> = [];

      const multiDayEvents = events.filter(
        (event) =>
          isMultiDayEvent(event) &&
          new Date(event.startDate) <= weekEnd &&
          new Date(event.endDate!) >= weekStart,
      );

      const sorted = [...multiDayEvents].sort((a, b) => {
        const aStart = new Date(a.startDate).getTime();
        const bStart = new Date(b.startDate).getTime();
        if (aStart !== bStart) return aStart - bStart;
        const aEnd = new Date(a.endDate!).getTime();
        const bEnd = new Date(b.endDate!).getTime();
        return aEnd - bEnd;
      });

      const laneEnds = [-1, -1, -1];
      let overflow = 0;

      for (const event of sorted) {
        const eventStart = new Date(event.startDate);
        const eventEnd = new Date(event.endDate!);
        const startCol = Math.max(
          0,
          Math.min(6, diffDays(eventStart, weekStart)),
        );
        const endCol = Math.max(0, Math.min(6, diffDays(eventEnd, weekStart)));
        const clippedStart = eventStart < weekStart;
        const clippedEnd = eventEnd > weekEnd;

        let laneIndex = -1;
        for (let i = 0; i < laneEnds.length; i++) {
          if (laneEnds[i] < startCol) {
            laneIndex = i;
            break;
          }
        }
        if (laneIndex === -1) {
          overflow += 1;
          continue;
        }
        laneEnds[laneIndex] = endCol;
        segments.push({
          event,
          startCol,
          endCol,
          lane: laneIndex + 1,
          clippedStart,
          clippedEnd,
        });
      }

      return { segments, overflow };
    });
  }, [events, isMultiDayEvent, weeks]);

  const handlePrevMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1),
    );
  };

  const handleNextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1),
    );
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleDayClick = (day: Date) => {
    if (isReadOnly) return;
    setSelectedDay(day);
    setEditingEvent(null);
    setIsEventModalOpen(true);
  };

  const importCalendarEvents = useCallback(
    async (file: File) => {
      if (isReadOnly) return;
      try {
        const fileName = file.name.toLowerCase();
        const isIcs =
          fileName.endsWith(".ics") || file.type === "text/calendar";
        if (!isIcs) {
          toast.error(
            tr(
              "calendar.importInvalidFile",
              "Only .ics files can be imported.",
            ),
          );
          return;
        }

        const raw = await file.text();
        const importedEvents = parseIcsEvents(raw);
        if (!importedEvents.length) {
          toast.error(
            tr(
              "calendar.importFailed",
              "No events were found in the imported file.",
            ),
          );
          return;
        }

        const nextEvents = [...events, ...importedEvents];
        setEvents(nextEvents);
        saveMetadata(nextEvents);
        toast.success(
          tr("calendar.importSuccess", "Imported calendar events."),
        );
      } finally {
        dragCounterRef.current = 0;
        setIsImportDragActive(false);
      }
    },
    [events, isReadOnly, parseIcsEvents, saveMetadata, tr],
  );

  const handleFileInputChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await importCalendarEvents(file);
      event.target.value = "";
    },
    [importCalendarEvents],
  );

  const handleCalendarDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (isReadOnly) return;
      setIsImportDragActive(true);
    },
    [isReadOnly],
  );

  const handleCalendarDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (isReadOnly) return;
      event.preventDefault();
    },
    [isReadOnly],
  );

  const handleCalendarDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (isReadOnly) return;
      event.preventDefault();
      const bounds = (
        event.currentTarget as HTMLElement
      ).getBoundingClientRect();
      const hasPointerCoords = event.clientX !== 0 || event.clientY !== 0;
      const isOutsideBounds =
        hasPointerCoords &&
        (event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom);

      if (isOutsideBounds) {
        dragCounterRef.current = 0;
        setIsImportDragActive(false);
      }
    },
    [isReadOnly],
  );

  const handleCalendarDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      try {
        if (isReadOnly) return;
        const file = event.dataTransfer.files?.[0];
        if (!file) return;
        await importCalendarEvents(file);
      } finally {
        dragCounterRef.current = 0;
        setIsImportDragActive(false);
        window.dispatchEvent(new CustomEvent("ideon:external-drop-reset"));
      }
    },
    [importCalendarEvents, isReadOnly],
  );

  useEffect(() => {
    const clear = () => {
      dragCounterRef.current = 0;
      setIsImportDragActive(false);
    };
    window.addEventListener("drop", clear);
    window.addEventListener("dragend", clear);
    window.addEventListener("dragleave", clear);
    return () => {
      window.removeEventListener("drop", clear);
      window.removeEventListener("dragend", clear);
      window.removeEventListener("dragleave", clear);
    };
  }, []);

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly) return;
    setEditingEvent(event);
    setIsEventModalOpen(true);
  };

  const handleEventContextMenu = (
    event: CalendarEvent,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (isReadOnly) return;
    setOpenMenuKey(event.id);
    setMenuPos({
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleAddEvent = (newEvent: Omit<CalendarEvent, "id">) => {
    const event: CalendarEvent = {
      ...newEvent,
      id: `e-${Math.random().toString(36).slice(2, 9)}`,
    };
    const nextEvents = [...events, event];
    setEvents(nextEvents);
    saveMetadata(nextEvents);
    setIsEventModalOpen(false);
    setEditingEvent(null);
    setSelectedDay(null);
  };

  const handleUpdateEvent = (updatedEvent: CalendarEvent) => {
    const nextEvents = events.map((e) =>
      e.id === updatedEvent.id ? updatedEvent : e,
    );
    setEvents(nextEvents);
    saveMetadata(nextEvents);
    setIsEventModalOpen(false);
    setEditingEvent(null);
  };

  const handleDeleteEvent = (eventId: string) => {
    const nextEvents = events.filter((e) => e.id !== eventId);
    setEvents(nextEvents);
    saveMetadata(nextEvents);
    setOpenMenuKey(null);
  };

  const handleDuplicateEvent = (event: CalendarEvent) => {
    if (isReadOnly) return;
    const duplicated: CalendarEvent = {
      ...event,
      id: `e-${Math.random().toString(36).slice(2, 9)}`,
    };
    const nextEvents = [...events, duplicated];
    setEvents(nextEvents);
    saveMetadata(nextEvents);
    setOpenMenuKey(null);
  };

  const currentMonthYear = useMemo(() => {
    const monthNames = [
      tr("calendar.months.january", "January"),
      tr("calendar.months.february", "February"),
      tr("calendar.months.march", "March"),
      tr("calendar.months.april", "April"),
      tr("calendar.months.may", "May"),
      tr("calendar.months.june", "June"),
      tr("calendar.months.july", "July"),
      tr("calendar.months.august", "August"),
      tr("calendar.months.september", "September"),
      tr("calendar.months.october", "October"),
      tr("calendar.months.november", "November"),
      tr("calendar.months.december", "December"),
    ];
    return `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  }, [currentDate, tr]);

  const dayNames = useMemo(() => {
    return [
      tr("calendar.days.monday", "Mon"),
      tr("calendar.days.tuesday", "Tue"),
      tr("calendar.days.wednesday", "Wed"),
      tr("calendar.days.thursday", "Thu"),
      tr("calendar.days.friday", "Fri"),
      tr("calendar.days.saturday", "Sat"),
      tr("calendar.days.sunday", "Sun"),
    ];
  }, [tr]);

  return (
    <div
      ref={blockRef}
      className={`block-card block-type-calendar ${
        selected ? "selected" : ""
      } ${isReadOnly ? "read-only" : ""} ${
        isImportDragActive ? "calendar-import-active" : ""
      } flex flex-col p-0! relative w-full h-full`}
      onDragEnter={handleCalendarDragEnter}
      onDragOver={handleCalendarDragOver}
      onDragLeave={handleCalendarDragLeave}
      onDrop={handleCalendarDrop}
      onClick={() => {
        if (openMenuKey) setOpenMenuKey(null);
      }}
    >
      <CustomNodeResizer
        nodeId={id}
        minWidth={400}
        minHeight={350}
        isVisible={!isReadOnly}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        keepAspectRatio={false}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />

      <div className="w-full h-full flex flex-col overflow-hidden rounded-[inherit] px-2">
        <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
          <div className="flex items-center gap-2">
            <CalendarIcon size={14} className="block-type-icon calendar" />
            <span className="text-sm uppercase tracking-wider opacity-50 font-bold">
              {dict.common.blockTypeCalendar || "Calendar"}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
            <BlockTitleInput
              value={title}
              onChange={handleTitleChange}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  (e.target as HTMLElement)?.blur?.();
                  focusProjectCanvas();
                }
              }}
              placeholder={dict.blocks.title || "..."}
              readOnly={isReadOnly}
            />
          </div>
        </div>

        <div className="block-content flex-1 flex flex-col min-h-0 p-4 pt-0">
          <div className="calendar-header flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevMonth}
                disabled={isReadOnly}
                className="calendar-nav-button flex items-center justify-center w-8 h-8 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label={tr("calendar.previousMonth", "Previous month")}
              >
                <ArrowLeft size={18} />
              </button>
              <h3 className="calendar-month-year text-lg font-bold">
                {currentMonthYear}
              </h3>
              <button
                onClick={handleNextMonth}
                disabled={isReadOnly}
                className="calendar-nav-button flex items-center justify-center w-8 h-8 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label={tr("calendar.nextMonth", "Next month")}
              >
                <ArrowRight size={18} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleToday}
                disabled={isReadOnly}
                className="calendar-today-button px-3 py-1 text-sm rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {tr("calendar.today", "Today")}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isReadOnly}
                className="calendar-import-button px-3 py-1 text-sm rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Upload size={14} className="mr-1" />
                {tr("calendar.import", "Import")}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ics,text/calendar"
                className="hidden"
                onChange={handleFileInputChange}
              />
            </div>
          </div>

          <div className="calendar-grid flex-1 overflow-hidden">
            <div className="calendar-day-names">
              {dayNames.map((dayName, index) => (
                <div
                  key={`day-name-${index}`}
                  className="calendar-day-name flex items-center justify-center text-xs uppercase tracking-wider opacity-50 font-bold p-2"
                >
                  {dayName}
                </div>
              ))}
            </div>

            <div className="calendar-weeks">
              {weeks.map((weekDays, weekIndex) => {
                const layout = weekLayouts[weekIndex];
                const hasBars =
                  layout.segments.length > 0 || layout.overflow > 0;
                return (
                  <div
                    key={`week-${weekIndex}`}
                    className={`calendar-week ${
                      hasBars ? "calendar-week-has-bars" : ""
                    }`}
                  >
                    <div className="calendar-week-bars">
                      {layout.segments.map((seg) => {
                        const bg = seg.event.color || DEFAULT_EVENT_COLORS[0];
                        const barClass = [
                          "calendar-event-bar",
                          seg.event.completed ? "is-completed" : "",
                          seg.clippedStart
                            ? "calendar-event-bar-clipped-start"
                            : "",
                          seg.clippedEnd
                            ? "calendar-event-bar-clipped-end"
                            : "",
                        ]
                          .filter((v) => v !== "")
                          .join(" ");
                        return (
                          <div
                            key={`${seg.event.id}-${weekIndex}`}
                            className={barClass}
                            style={
                              {
                                "--col-start": String(seg.startCol + 1),
                                "--col-end": String(seg.endCol + 2),
                                "--lane": String(seg.lane),
                                "--event-bg": bg,
                              } as CSSProperties
                            }
                            onMouseEnter={(e) =>
                              showHoverCard(
                                seg.event,
                                e.currentTarget as HTMLElement,
                              )
                            }
                            onMouseLeave={scheduleHideHoverCard}
                            onFocus={(e) =>
                              showHoverCard(
                                seg.event,
                                e.currentTarget as HTMLElement,
                              )
                            }
                            onBlur={scheduleHideHoverCard}
                            onClick={(e) => handleEventClick(seg.event, e)}
                            onContextMenu={(e) =>
                              handleEventContextMenu(seg.event, e)
                            }
                            role="button"
                            tabIndex={0}
                          >
                            <span className="calendar-event-bar-title">
                              {seg.event.title}
                            </span>
                          </div>
                        );
                      })}
                      {layout.overflow > 0 && (
                        <div
                          className="calendar-event-bar calendar-event-bar-more"
                          style={
                            {
                              "--col-start": "1",
                              "--col-end": "8",
                              "--lane": "3",
                            } as CSSProperties
                          }
                        >
                          <span className="calendar-event-bar-title">
                            +{layout.overflow}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="calendar-week-days">
                      {weekDays.map((day, dayIndex) => {
                        const isCurrentMonth =
                          day.getMonth() === currentDate.getMonth();
                        const isTodayDate = isToday(day);
                        const dayEvents = getEventsForDay(events, day).filter(
                          (event) => !isMultiDayEvent(event),
                        );

                        return (
                          <div
                            key={`day-${weekIndex}-${dayIndex}`}
                            className={`calendar-day flex flex-col gap-1 p-2 rounded cursor-pointer hover:bg-white/5 ${
                              !isCurrentMonth
                                ? "calendar-day-other-month opacity-30"
                                : ""
                            } ${isTodayDate ? "calendar-day-today" : ""}`}
                            onClick={() => !isReadOnly && handleDayClick(day)}
                          >
                            <div
                              className={`calendar-day-number text-sm font-semibold ${
                                isTodayDate ? "text-primary" : ""
                              }`}
                            >
                              {day.getDate()}
                            </div>
                            <div className="calendar-day-events flex flex-col gap-1 overflow-hidden">
                              {dayEvents.slice(0, 3).map((event) => (
                                <div
                                  key={event.id}
                                  className={`calendar-event px-2 py-1 rounded text-xs truncate cursor-pointer hover:opacity-80 ${
                                    event.completed ? "is-completed" : ""
                                  }`}
                                  style={
                                    {
                                      "--event-bg":
                                        event.color || DEFAULT_EVENT_COLORS[0],
                                    } as CSSProperties
                                  }
                                  onMouseEnter={(e) =>
                                    showHoverCard(
                                      event,
                                      e.currentTarget as HTMLElement,
                                    )
                                  }
                                  onMouseLeave={scheduleHideHoverCard}
                                  onFocus={(e) =>
                                    showHoverCard(
                                      event,
                                      e.currentTarget as HTMLElement,
                                    )
                                  }
                                  onBlur={scheduleHideHoverCard}
                                  onClick={(e) => handleEventClick(event, e)}
                                  onContextMenu={(e) =>
                                    handleEventContextMenu(event, e)
                                  }
                                >
                                  {event.title}
                                </div>
                              ))}
                              {dayEvents.length > 3 && (
                                <div className="calendar-event-more text-xs opacity-50">
                                  +{dayEvents.length - 3}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <BlockFooter
          updatedAt={data.updatedAt}
          authorName={data.authorName}
          isContentLocked={data.isContentLocked}
          isPositionLocked={data.isPositionLocked}
          dict={dict}
          lang={lang}
        />
      </div>

      <BlockReactions
        reactions={data.reactions}
        onReact={handleReact}
        onRemoveReaction={handleRemoveReaction}
        currentUserId={currentUser?.id}
        isReadOnly={isReadOnly}
        canReact={canReact}
      />

      <Handle
        id="left"
        type="source"
        position={Position.Left}
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-left z-50! ${
          isReadOnly ? "opacity-0! pointer-events-none!" : ""
        }`}
      >
        {!isLeftSourceConnected && <div className="handle-dot" />}
      </Handle>

      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-right z-50! ${
          isReadOnly ? "opacity-0! pointer-events-none!" : ""
        }`}
      >
        {!isRightSourceConnected && <div className="handle-dot" />}
      </Handle>

      <Handle
        id="top"
        type="source"
        position={Position.Top}
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-top z-50! ${
          isReadOnly ? "opacity-0! pointer-events-none!" : ""
        }`}
      >
        {!isTopSourceConnected && <div className="handle-dot" />}
      </Handle>

      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-bottom z-50! ${
          isReadOnly ? "opacity-0! pointer-events-none!" : ""
        }`}
      >
        {!isBottomSourceConnected && <div className="handle-dot" />}
      </Handle>

      {hoverCard && (
        <FloatingMenu
          className={`calendar-event-hovercard calendar-event-hovercard-${hoverCard.placement}`}
          style={
            {
              "--hover-x": `${hoverCard.x}px`,
              "--hover-y": `${hoverCard.y}px`,
              "--event-color": hoverCard.event.color || DEFAULT_EVENT_COLORS[0],
            } as CSSProperties
          }
        >
          <div className="calendar-event-hovercard-inner">
            <div className="calendar-event-hovercard-color" />
            <div className="calendar-event-hovercard-body">
              <div className="calendar-event-hovercard-head">
                <div className="calendar-event-hovercard-title">
                  {hoverCard.event.title}
                </div>
                {hoverCard.event.completed && (
                  <div className="calendar-event-hovercard-badge">
                    {tr("calendar.completed", "Completed")}
                  </div>
                )}
              </div>
              {hoverCard.event.description &&
                hoverCard.event.description !== "" && (
                  <div className="calendar-event-hovercard-desc">
                    {hoverCard.event.description}
                  </div>
                )}
              <div className="calendar-event-hovercard-meta">
                {formatEventMeta(hoverCard.event)}
              </div>
            </div>
          </div>
        </FloatingMenu>
      )}

      {isEventModalOpen && (
        <EventModal
          isOpen={isEventModalOpen}
          onClose={() => setIsEventModalOpen(false)}
          onAdd={handleAddEvent}
          onUpdate={handleUpdateEvent}
          onDelete={(eventId) => {
            handleDeleteEvent(eventId);
            setIsEventModalOpen(false);
            setEditingEvent(null);
            setSelectedDay(null);
          }}
          editingEvent={editingEvent}
          selectedDay={selectedDay}
          dict={dict}
          currentUser={currentUser}
          isReadOnly={isReadOnly}
        />
      )}

      {openMenuKey && (
        <FloatingMenu
          className="context-menu"
          style={{ top: menuPos.y, left: menuPos.x } as CSSProperties}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="context-menu-item"
            onClick={() => {
              const event = events.find((e) => e.id === openMenuKey);
              if (event) {
                setEditingEvent(event);
                setIsEventModalOpen(true);
                setOpenMenuKey(null);
              }
            }}
          >
            <span className="context-menu-icon">
              <Edit3 size={14} />
            </span>
            <span className="context-menu-label">
              {tr("calendar.editEvent", "Edit event")}
            </span>
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              const event = events.find((e) => e.id === openMenuKey);
              if (event) {
                handleDuplicateEvent(event);
                setOpenMenuKey(null);
              }
            }}
          >
            <span className="context-menu-icon">
              <Copy size={14} />
            </span>
            <span className="context-menu-label">
              {tr("calendar.duplicateEvent", "Duplicate event")}
            </span>
          </button>
          <button
            className="context-menu-item context-menu-danger"
            onClick={() => {
              if (openMenuKey) {
                handleDeleteEvent(openMenuKey);
              }
              setOpenMenuKey(null);
            }}
          >
            <span className="context-menu-icon">
              <Trash2 size={14} />
            </span>
            <span className="context-menu-label">
              {tr("calendar.deleteEvent", "Delete event")}
            </span>
          </button>
        </FloatingMenu>
      )}
    </div>
  );
});

export default CalendarBlock;
