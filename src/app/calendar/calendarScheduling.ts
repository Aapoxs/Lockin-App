import {
  advanceRecurringDate,
  calendarEntryRecurrence,
  isWithinRepeatLimit,
  normalizeScheduledAt,
  repeatLimitEnd,
  toDateKey,
} from "./calendarUtils";
import type { CalendarEntry, Recurrence, Task } from "../workspace/workspaceTypes";

const recurrenceRank = (recurrence: Recurrence | undefined) =>
  recurrence === "daily"
    ? 1
    : recurrence === "weekly"
      ? 2
      : recurrence === "monthly"
        ? 3
        : recurrence === "yearly"
          ? 4
          : 0;

const formatScheduledAt = (date: Date) =>
  `${toDateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;

const recurrenceSeedCount = (recurrence: Recurrence) =>
  recurrence === "daily"
    ? 366
    : recurrence === "weekly"
      ? 53
      : recurrence === "monthly"
        ? 13
        : 2;

/** Returns whether a task may occupy a calendar slot without duplicating its series. */
export const canScheduleTaskAt = (
  task: Task | undefined,
  scheduledAt: string,
  entries: CalendarEntry[],
) => {
  if (!task) return false;
  const recurrence = task.mode === "recurring" ? task.recurrence : undefined;
  const hasExactConflict = entries.some((entry) => {
    if (
      entry.taskId !== task.id ||
      entry.status === "cleared" ||
      normalizeScheduledAt(entry.scheduledAt) !== normalizeScheduledAt(scheduledAt)
    )
      return false;
    const existingRecurrence = calendarEntryRecurrence(entry, task);
    return (
      !recurrence ||
      !existingRecurrence ||
      recurrenceRank(existingRecurrence) <= recurrenceRank(recurrence)
    );
  });
  if (hasExactConflict) return false;

  const time = scheduledAt.slice(11, 16);
  return !entries.some((entry) => {
    const existingRecurrence = calendarEntryRecurrence(entry, task);
    return (
      entry.taskId === task.id &&
      entry.status === "scheduled" &&
      Boolean(recurrence && existingRecurrence) &&
      recurrenceRank(existingRecurrence) <= recurrenceRank(recurrence) &&
      entry.scheduledAt.slice(11, 16) === time &&
      isWithinRepeatLimit(scheduledAt, entry.repeatUntil)
    );
  });
};

/** Builds the first stored occurrence plus the initial finite recurrence projection. */
export const createCalendarEntries = (
  task: Task,
  scheduledAt: string,
  createId: () => string,
): CalendarEntry[] => {
  const recurrence = task.mode === "recurring" ? task.recurrence : undefined;
  const seriesId = recurrence ? createId() : undefined;
  const repeatUntil = recurrence
    ? repeatLimitEnd(scheduledAt, task.repeatLimit ?? "forever")
    : undefined;
  const first: CalendarEntry = {
    id: createId(),
    taskId: task.id,
    seriesId,
    recurrence,
    repeatUntil,
    scheduledAt,
    status: "scheduled",
  };
  if (!recurrence) return [first];

  const entries = [first];
  let occurrence = new Date(scheduledAt);
  for (let index = 1; index < recurrenceSeedCount(recurrence); index += 1) {
    occurrence = advanceRecurringDate(occurrence, recurrence);
    const nextScheduledAt = formatScheduledAt(occurrence);
    if (!isWithinRepeatLimit(nextScheduledAt, repeatUntil)) break;
    entries.push({
      id: createId(),
      taskId: task.id,
      seriesId,
      recurrence,
      repeatUntil,
      scheduledAt: nextScheduledAt,
      status: "scheduled",
    });
  }
  return entries;
};
