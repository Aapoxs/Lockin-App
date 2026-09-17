import {
  advanceRecurringDate,
  calendarEntryRecurrence,
  calendarSeriesKey,
  groupCalendarEntriesBySeries,
  isWithinRepeatLimit,
  normalizeScheduledAt,
  toDateKey,
} from "./calendarUtils";
import type { CalendarEntry, Task } from "../workspace/workspaceTypes";

export type ScheduledTask = {
  entry: CalendarEntry;
  task: Task;
};

const toScheduledAt = (date: Date) =>
  `${toDateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;

const storedEntryKeys = (entries: CalendarEntry[]) =>
  new Set(
    entries.map(
      (entry) => `${calendarSeriesKey(entry)}|${normalizeScheduledAt(entry.scheduledAt)}`,
    ),
  );

const entriesForTask = (entries: CalendarEntry[], taskId: string) => [
  ...groupCalendarEntriesBySeries(
    entries.filter((entry) => entry.taskId === taskId),
  ).entries(),
];

export const buildStoredScheduledTasks = (
  tasks: Task[],
  calendarEntries: CalendarEntry[],
): ScheduledTask[] =>
  calendarEntries
    .filter((entry) => entry.status !== "cleared")
    .flatMap((entry) => {
      const task = tasks.find((candidate) => candidate.id === entry.taskId);
      const normalizedEntry =
        entry.scheduledAt === normalizeScheduledAt(entry.scheduledAt)
          ? entry
          : { ...entry, scheduledAt: normalizeScheduledAt(entry.scheduledAt) };
      return task ? [{ entry: normalizedEntry, task }] : [];
    });

export const buildProjectedRecurringTasks = (
  tasks: Task[],
  calendarEntries: CalendarEntry[],
  projectionStart: Date,
): ScheduledTask[] => {
  const projectionEnd = new Date(projectionStart);
  projectionEnd.setFullYear(projectionEnd.getFullYear() + 2);
  const existingEntryKeys = storedEntryKeys(calendarEntries);

  return tasks
    .filter((task) => task.status === "active")
    .flatMap((task) =>
      entriesForTask(calendarEntries, task.id).flatMap(([seriesKey, seriesEntries]) => {
        const anchor = [...seriesEntries].sort((a, b) =>
          a.scheduledAt.localeCompare(b.scheduledAt),
        )[0];
        const recurrence = anchor ? calendarEntryRecurrence(anchor, task) : undefined;
        if (!anchor || !recurrence) return [];

        const projected: ScheduledTask[] = [];
        let occurrence = new Date(anchor.scheduledAt);
        let safety = 0;
        while (occurrence <= projectionEnd && safety < 5000) {
          const scheduledAt = toScheduledAt(occurrence);
          if (!isWithinRepeatLimit(scheduledAt, anchor.repeatUntil)) break;
          if (!existingEntryKeys.has(`${seriesKey}|${scheduledAt}`)) {
            projected.push({
              entry: {
                id: `recurring:${seriesKey}:${scheduledAt}`,
                taskId: task.id,
                seriesId: anchor.seriesId,
                recurrence,
                repeatUntil: anchor.repeatUntil,
                scheduledAt,
                status: "scheduled",
              },
              task,
            });
          }
          occurrence = advanceRecurringDate(occurrence, recurrence);
          safety += 1;
        }
        return projected;
      }),
    );
};

export const getRecurringTasksForSlot = (
  tasks: Task[],
  calendarEntries: CalendarEntry[],
  scheduledAt: string,
): ScheduledTask[] => {
  const slot = new Date(scheduledAt);
  const existingEntryKeys = storedEntryKeys(calendarEntries);

  return tasks
    .filter((task) => task.status === "active")
    .flatMap((task) =>
      entriesForTask(calendarEntries, task.id).flatMap(([seriesKey, seriesEntries]) => {
        if (existingEntryKeys.has(`${seriesKey}|${scheduledAt}`)) return [];
        const anchor = [...seriesEntries].sort((a, b) =>
          a.scheduledAt.localeCompare(b.scheduledAt),
        )[0];
        const recurrence = anchor ? calendarEntryRecurrence(anchor, task) : undefined;
        if (!anchor || !recurrence) return [];

        let occurrence = new Date(anchor.scheduledAt);
        let safety = 0;
        while (occurrence < slot && safety < 5000) {
          occurrence = advanceRecurringDate(occurrence, recurrence);
          safety += 1;
        }

        return occurrence.getTime() === slot.getTime() &&
          isWithinRepeatLimit(scheduledAt, anchor.repeatUntil)
          ? [
              {
                entry: {
                  id: `recurring:${seriesKey}:${scheduledAt}`,
                  taskId: task.id,
                  seriesId: anchor.seriesId,
                  recurrence,
                  repeatUntil: anchor.repeatUntil,
                  scheduledAt,
                  status: "scheduled",
                },
                task,
              },
            ]
          : [];
      }),
    );
};
