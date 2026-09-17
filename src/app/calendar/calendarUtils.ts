import type {
  CalendarEntry,
  Recurrence,
  RepeatLimit,
  Task,
} from "../workspace/workspaceTypes";

export const toDateKey = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

export const startOfWeek = (date: Date) => {
  const result = new Date(date);
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  result.setHours(0, 0, 0, 0);
  return result;
};

export const normalizeScheduledAt = (value: string) =>
  value.replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}):00$/, "$1");

export const calendarSeriesKey = (entry: CalendarEntry) =>
  entry.seriesId ?? `legacy:${entry.taskId}:${entry.scheduledAt.slice(11, 16)}`;

export const calendarEntryRecurrence = (entry: CalendarEntry, task: Task) =>
  entry.recurrence === undefined
    ? task.mode === "recurring"
      ? task.recurrence
      : undefined
    : (entry.recurrence ?? undefined);

export const groupCalendarEntriesBySeries = (entries: CalendarEntry[]) =>
  entries.reduce((groups, entry) => {
    const key = calendarSeriesKey(entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
    return groups;
  }, new Map<string, CalendarEntry[]>());

export const repeatLimitEnd = (scheduledAt: string, limit: RepeatLimit) => {
  if (limit === "forever") return undefined;
  const date = new Date(scheduledAt);
  if (limit === "week") {
    const end = startOfWeek(date);
    end.setDate(end.getDate() + 6);
    return toDateKey(end);
  }
  if (limit === "month")
    return toDateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  return `${date.getFullYear()}-12-31`;
};

export const isWithinRepeatLimit = (scheduledAt: string, repeatUntil?: string) =>
  !repeatUntil || toDateKey(new Date(scheduledAt)) <= repeatUntil;

export const advanceRecurringDate = (date: Date, recurrence: Recurrence) => {
  const next = new Date(date);
  if (recurrence === "daily") next.setDate(next.getDate() + 1);
  else if (recurrence === "weekly") next.setDate(next.getDate() + 7);
  else if (recurrence === "monthly") {
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
  } else {
    const month = next.getMonth();
    const day = next.getDate();
    next.setDate(1);
    next.setFullYear(next.getFullYear() + 1);
    next.setMonth(month);
    const lastDay = new Date(next.getFullYear(), month + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
  }
  return next;
};
