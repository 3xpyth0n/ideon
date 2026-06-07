"use client";
import React, { useEffect, useRef, useState } from "react";
import { Modal } from "@components/ui/Modal";
import { Check } from "lucide-react";
import { type CalendarEvent, DEFAULT_EVENT_COLORS } from "./calendarModel";

type CurrentUser = {
  id: string;
  username?: string | null;
  displayName?: string | null;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (event: Omit<CalendarEvent, "id">) => void;
  onUpdate: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
  editingEvent: CalendarEvent | null;
  selectedDay: Date | null;
  dict: Record<string, unknown>;
  currentUser?: CurrentUser | null;
  isReadOnly?: boolean;
}

const getLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getLocalDateTimeString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const parseLocalDateTime = (dateTimeStr: string, isAllDay: boolean): Date => {
  if (isAllDay) {
    const [year, month, day] = dateTimeStr.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }
  return new Date(dateTimeStr);
};

export default function EventModal({
  isOpen,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
  editingEvent,
  selectedDay,
  dict,
  currentUser,
  isReadOnly = false,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [color, setColor] = useState(DEFAULT_EVENT_COLORS[0]);
  const [completed, setCompleted] = useState(false);
  const [completedBy, setCompletedBy] = useState<string | undefined>(undefined);
  const [completedAt, setCompletedAt] = useState<string | undefined>(undefined);
  const initializedRef = useRef(false);

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

  const handleToggleAllDay = (checked: boolean) => {
    if (isReadOnly) return;
    const newAllDay = checked;
    setAllDay(newAllDay);

    if (newAllDay) {
      if (startDate) {
        const dateStr = startDate.split("T")[0];
        setStartDate(dateStr);
        setEndDate(endDate ? endDate.split("T")[0] || dateStr : dateStr);
      }
    } else {
      if (startDate) {
        const dateStr = startDate.split("T")[0];
        setStartDate(`${dateStr}T09:00`);
        setEndDate(
          endDate
            ? `${endDate.split("T")[0] || dateStr}T10:00`
            : `${dateStr}T10:00`,
        );
      }
    }
  };

  useEffect(() => {
    if (!isOpen) {
      initializedRef.current = false;
      return;
    }

    if (initializedRef.current) return;
    initializedRef.current = true;

    if (editingEvent) {
      setTitle(editingEvent.title);
      setDescription(editingEvent.description || "");
      setAllDay(editingEvent.allDay);
      setColor(editingEvent.color || DEFAULT_EVENT_COLORS[0]);
      setCompleted(Boolean(editingEvent.completed));
      setCompletedBy(editingEvent.completedBy);
      setCompletedAt(editingEvent.completedAt);

      const start = new Date(editingEvent.startDate);
      if (editingEvent.allDay) {
        setStartDate(getLocalDateString(start));
      } else {
        setStartDate(getLocalDateTimeString(start));
      }

      if (editingEvent.endDate) {
        const end = new Date(editingEvent.endDate);
        if (editingEvent.allDay) {
          setEndDate(getLocalDateString(end));
        } else {
          setEndDate(getLocalDateTimeString(end));
        }
      } else {
        if (editingEvent.allDay) {
          setEndDate(getLocalDateString(start));
        } else {
          setEndDate(getLocalDateTimeString(start));
        }
      }
    } else if (selectedDay) {
      const dateStr = getLocalDateString(selectedDay);
      setStartDate(dateStr);
      setEndDate(dateStr);
      setAllDay(true);
      setTitle("");
      setDescription("");
      setColor(DEFAULT_EVENT_COLORS[0]);
      setCompleted(false);
      setCompletedBy(undefined);
      setCompletedAt(undefined);
    } else {
      const today = new Date();
      const dateStr = getLocalDateString(today);
      setStartDate(dateStr);
      setEndDate(dateStr);
      setAllDay(true);
      setTitle("");
      setDescription("");
      setColor(DEFAULT_EVENT_COLORS[0]);
      setCompleted(false);
      setCompletedBy(undefined);
      setCompletedAt(undefined);
    }
  }, [isOpen, editingEvent, selectedDay]);

  const completedLabel = tr("calendar.completed", "");
  const completedByTemplate = tr("calendar.completedBy", "");
  const formatCompletedBy = (user: string): string => {
    return completedByTemplate.replace("{user}", user);
  };

  const handleToggleCompleted = () => {
    if (isReadOnly) return;
    setCompleted((prev) => {
      const next = !prev;
      if (next) {
        const handle = currentUser?.displayName
          ? `@${currentUser.displayName}`
          : currentUser?.username
            ? `@${currentUser.username}`
            : undefined;
        setCompletedBy(handle);
        setCompletedAt(new Date().toISOString());
      } else {
        setCompletedBy(undefined);
        setCompletedAt(undefined);
      }
      return next;
    });
  };

  const handleSave = () => {
    if (isReadOnly) return;
    if (!title.trim()) return;

    const finalStart = parseLocalDateTime(startDate, allDay);
    const finalStartStr = finalStart.toISOString();
    let finalEndStr: string | undefined = undefined;
    if (endDate) {
      const finalEnd = parseLocalDateTime(endDate, allDay);
      finalEndStr = finalEnd.toISOString();
    }

    if (editingEvent) {
      onUpdate({
        ...editingEvent,
        title: title.trim(),
        description: description.trim() || undefined,
        startDate: finalStartStr,
        endDate: finalEndStr,
        allDay,
        color,
        completed,
        completedBy,
        completedAt,
      });
    } else {
      onAdd({
        title: title.trim(),
        description: description.trim() || undefined,
        startDate: finalStartStr,
        endDate: finalEndStr,
        allDay,
        color,
        completed,
        completedBy,
        completedAt,
      });
    }
    onClose();
  };

  const isEditing = !!editingEvent;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isEditing
          ? tr("calendar.editEvent", "Edit event")
          : tr("calendar.addEvent", "Add event")
      }
      showCloseButton={false}
    >
      <div className="event-modal-content flex flex-col gap-4">
        {isEditing && (
          <div className="event-modal-top-right">
            <div
              className={`event-modal-top-right-meta ${
                completed ? "is-completed" : "is-prompt"
              }`}
            >
              {completed
                ? completedBy && completedBy !== ""
                  ? formatCompletedBy(completedBy)
                  : completedLabel
                : tr("calendar.completedQuestion", "Completed?")}
            </div>
            <button
              type="button"
              className={`zen-switch-small ${completed ? "active" : ""}`}
              onClick={handleToggleCompleted}
              aria-label={completedLabel}
              role="switch"
              aria-checked={completed}
              disabled={isReadOnly}
            >
              <div className="switch-thumb" />
            </button>
          </div>
        )}
        <div className="event-modal-field">
          <label className="event-modal-label">
            {tr("calendar.eventTitle", "Title")}
          </label>
          <input
            value={title}
            onChange={(e) => !isReadOnly && setTitle(e.target.value)}
            className="event-modal-input"
            placeholder={tr("calendar.eventTitlePlaceholder", "Event title")}
            autoFocus
            disabled={isReadOnly}
          />
        </div>

        <div className="event-modal-field">
          <label className="event-modal-label">
            {tr("calendar.eventDescription", "Description")}
          </label>
          <textarea
            value={description}
            onChange={(e) => !isReadOnly && setDescription(e.target.value)}
            className="event-modal-textarea"
            placeholder={tr(
              "calendar.eventDescriptionPlaceholder",
              "Event description",
            )}
            rows={3}
            disabled={isReadOnly}
          />
        </div>

        <div className="event-modal-field">
          <label className="event-modal-label">
            {tr("calendar.eventColor", "Color")}
          </label>
          <div className="event-modal-color-picker flex gap-2">
            {DEFAULT_EVENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => !isReadOnly && setColor(c)}
                className={`event-modal-color-option w-8 h-8 rounded-full border-2 ${
                  color === c ? "border-white" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
                disabled={isReadOnly}
              >
                {color === c && <Check size={14} className="mx-auto" />}
              </button>
            ))}
          </div>
        </div>

        <div className="event-modal-field">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => handleToggleAllDay(e.target.checked)}
              className="event-modal-checkbox"
              disabled={isReadOnly}
            />
            <span className="event-modal-label">
              {tr("calendar.allDay", "All day")}
            </span>
          </label>
        </div>

        <div className="event-modal-field">
          <label className="event-modal-label">
            {tr("calendar.startDate", "Start date")}
          </label>
          <input
            type={allDay ? "date" : "datetime-local"}
            value={startDate}
            onChange={(e) => !isReadOnly && setStartDate(e.target.value)}
            className="event-modal-input"
            disabled={isReadOnly}
          />
        </div>

        <div className="event-modal-field">
          <label className="event-modal-label">
            {tr("calendar.endDate", "End date")}
          </label>
          <input
            type={allDay ? "date" : "datetime-local"}
            value={endDate}
            onChange={(e) => !isReadOnly && setEndDate(e.target.value)}
            className="event-modal-input"
            disabled={isReadOnly}
          />
        </div>

        <div className="event-modal-actions flex justify-end gap-2 mt-4">
          {isEditing && !isReadOnly && (
            <button
              type="button"
              onClick={() => {
                if (!editingEvent) return;
                onDelete(editingEvent.id);
                onClose();
              }}
              className="event-modal-button event-modal-button-danger"
            >
              {tr("common.delete", "Delete")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="event-modal-button event-modal-button-secondary"
          >
            {tr("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!title.trim() || isReadOnly}
            className="event-modal-button event-modal-button-primary"
          >
            {isEditing ? tr("common.save", "Save") : tr("common.add", "Add")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
