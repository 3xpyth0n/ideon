export const DEFAULT_EVENT_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
  "#98D8C8",
  "#F7DC6F",
];

export type CalendarEvent = {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  allDay: boolean;
  color?: string;
  completed?: boolean;
  completedAt?: string;
  completedBy?: string;
};

export type ParsedCalendarMetadata = {
  events: CalendarEvent[];
};

const normalizeCalendarEvent = (raw: unknown): CalendarEvent | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  if (typeof value.id !== "string" || typeof value.title !== "string") {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    description:
      typeof value.description === "string" ? value.description : undefined,
    startDate:
      typeof value.startDate === "string"
        ? value.startDate
        : new Date().toISOString(),
    endDate: typeof value.endDate === "string" ? value.endDate : undefined,
    allDay: Boolean(value.allDay),
    color: typeof value.color === "string" ? value.color : undefined,
    completed:
      typeof value.completed === "boolean" ? value.completed : undefined,
    completedAt:
      typeof value.completedAt === "string" ? value.completedAt : undefined,
    completedBy:
      typeof value.completedBy === "string" ? value.completedBy : undefined,
  } satisfies CalendarEvent;
};

export const parseCalendarMetadata = (raw: unknown): ParsedCalendarMetadata => {
  try {
    const parsed = (
      typeof raw === "string" ? JSON.parse(raw || "{}") : raw
    ) as Record<string, unknown>;

    const eventsRaw = Array.isArray(parsed.events)
      ? (parsed.events as unknown[])
      : [];

    const events = eventsRaw
      .map((event) => normalizeCalendarEvent(event))
      .filter((event): event is CalendarEvent => event !== null);

    return { events } satisfies ParsedCalendarMetadata;
  } catch {
    return {
      events: [],
    };
  }
};

export const getDaysInMonth = (date: Date): Date[] => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const days: Date[] = [];

  let firstDayOfWeek = firstDay.getDay();
  firstDayOfWeek = (firstDayOfWeek + 6) % 7;
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }

  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }

  const totalDays = firstDayOfWeek + lastDay.getDate() > 35 ? 42 : 35;
  const remainingDays = totalDays - days.length;
  for (let i = 1; i <= remainingDays; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
};

export const isSameDay = (date1: Date, date2: Date): boolean => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

export const isToday = (date: Date): boolean => {
  return isSameDay(date, new Date());
};

export const getEventsForDay = (
  events: CalendarEvent[],
  day: Date,
): CalendarEvent[] => {
  return events.filter((event) => {
    const eventStart = new Date(event.startDate);
    const eventEnd = event.endDate ? new Date(event.endDate) : eventStart;

    const dayStart = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      0,
      0,
      0,
      0,
    );
    const dayEnd = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      23,
      59,
      59,
      999,
    );

    return eventStart <= dayEnd && eventEnd >= dayStart;
  });
};

const parseIcsDate = (value: string, isDateOnly: boolean): string => {
  if (isDateOnly) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    return new Date(year, month, day, 0, 0, 0, 0).toISOString();
  }

  // Support forms like 20230601T120000Z or 20230601T120000
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return new Date().toISOString();
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const hour = Number(m[4] ?? "0");
  const minute = Number(m[5] ?? "0");
  const second = Number(m[6] ?? "0");
  const isUTC = /Z$/.test(value);
  if (isUTC) {
    return new Date(
      Date.UTC(year, month, day, hour, minute, second),
    ).toISOString();
  }
  return new Date(year, month, day, hour, minute, second).toISOString();
};

const normalizeIcsLine = (line: string): string => line.trim();

export const parseIcsEvents = (raw: string): CalendarEvent[] => {
  const content = raw.replace(/\r?\n[ \t]/g, "");
  const lines = content.split(/\r?\n/).map(normalizeIcsLine);
  const events: CalendarEvent[] = [];
  let current: Partial<CalendarEvent> | null = null;
  let currentEndIsDateOnly = false;

  const flushEvent = () => {
    if (!current || !current.id || !current.title || !current.startDate) return;
    events.push({
      id: current.id,
      title: current.title,
      description: current.description,
      startDate: current.startDate,
      endDate: current.endDate,
      allDay: current.allDay ?? false,
      color: current.color,
      completed: current.completed,
      completedAt: current.completedAt,
      completedBy: current.completedBy,
    });
  };

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = { id: `e-${Math.random().toString(36).slice(2, 9)}` };
      currentEndIsDateOnly = false;
      continue;
    }

    if (line === "END:VEVENT") {
      if (current && current.startDate && !current.title) {
        current.title = "Untitled event";
      }
      if (
        current &&
        current.allDay &&
        current.endDate &&
        currentEndIsDateOnly
      ) {
        const end = new Date(current.endDate);
        end.setDate(end.getDate() - 1);
        end.setHours(23, 59, 59, 999);
        current.endDate = end.toISOString();
      }
      flushEvent();
      current = null;
      continue;
    }

    if (!current) continue;

    const [keyPart, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (!value) continue;

    const key = keyPart.toUpperCase();
    if (key.startsWith("UID")) {
      // Always generate a new ID to avoid duplicates when importing the same file twice
      // Do not override the random ID with the ICS UID
      continue;
    }
    if (key.startsWith("SUMMARY")) {
      current.title = value;
      continue;
    }
    if (key.startsWith("DESCRIPTION")) {
      current.description = value;
      continue;
    }
    if (key.startsWith("DTSTART")) {
      const isDateOnly = key.includes("VALUE=DATE") || /^[0-9]{8}$/.test(value);
      current.startDate = parseIcsDate(value, isDateOnly);
      current.allDay = isDateOnly;
      continue;
    }
    if (key.startsWith("DTEND")) {
      currentEndIsDateOnly =
        key.includes("VALUE=DATE") || /^[0-9]{8}$/.test(value);
      current.endDate = parseIcsDate(value, currentEndIsDateOnly);
      continue;
    }
    if (key.startsWith("STATUS")) {
      current.completed = value.toUpperCase() === "COMPLETED";
      continue;
    }
    if (key.startsWith("COLOR")) {
      current.color = value;
      continue;
    }
  }

  return events;
};
