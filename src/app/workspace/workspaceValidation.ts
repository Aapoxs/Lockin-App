import type {
  Column,
  FolderGroup,
  Recurrence,
  RepeatLimit,
  Task,
  TaskMode,
  TaskStatus,
  WorkspaceSnapshot,
} from "./workspaceTypes";
import {
  columns,
  folderGroups,
  maxTaskNoteLength,
  maxTaskTitleLength,
  recurrences,
  repeatLimits,
  taskModes,
  taskStatuses,
  tones,
} from "./workspaceConstants";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidDate = (value: unknown) =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

const isValidDateKey = (value: unknown) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T12:00:00`));

export const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

const isValidTask = (value: unknown): value is Task => {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.detail !== "string" ||
    typeof value.destination !== "string"
  )
    return false;
  if (value.title.length > maxTaskTitleLength || value.detail.length > maxTaskNoteLength)
    return false;
  if (
    !taskModes.includes(value.mode as TaskMode) ||
    !taskStatuses.includes(value.status as TaskStatus) ||
    !columns.includes(value.column as Column) ||
    !tones.includes(value.tone as Task["tone"])
  )
    return false;
  if (
    !Number.isInteger(value.completedOccurrences) ||
    (value.completedOccurrences as number) < 0
  )
    return false;
  if (value.mode === "recurring" && !recurrences.includes(value.recurrence as Recurrence))
    return false;
  if (
    value.recurrence !== undefined &&
    !recurrences.includes(value.recurrence as Recurrence)
  )
    return false;
  if (
    value.repeatLimit !== undefined &&
    !repeatLimits.includes(value.repeatLimit as RepeatLimit)
  )
    return false;
  if (value.dueDate !== undefined && !isValidDateKey(value.dueDate)) return false;
  if (
    value.dueHour !== undefined &&
    (!Number.isInteger(value.dueHour) ||
      (value.dueHour as number) < 0 ||
      (value.dueHour as number) > 23)
  )
    return false;
  return value.completedAt === undefined || isValidDate(value.completedAt);
};

export const isValidWorkspaceSnapshot = (value: unknown): value is WorkspaceSnapshot => {
  if (
    !isRecord(value) ||
    !Array.isArray(value.tasks) ||
    !Array.isArray(value.folders) ||
    !Array.isArray(value.calendarEntries) ||
    !Array.isArray(value.focusSessions)
  )
    return false;
  if (!value.tasks.every(isValidTask)) return false;
  if (
    !value.folders.every(
      (folder) =>
        isRecord(folder) &&
        typeof folder.id === "string" &&
        typeof folder.name === "string" &&
        typeof folder.color === "string" &&
        isHexColor(folder.color) &&
        (folder.group === undefined ||
          folderGroups.includes(folder.group as FolderGroup)) &&
        (folder.hideFromUpNext === undefined ||
          typeof folder.hideFromUpNext === "boolean"),
    )
  )
    return false;

  const taskIds = new Set(value.tasks.map((task) => task.id));
  if (
    !value.calendarEntries.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.id === "string" &&
        typeof entry.taskId === "string" &&
        taskIds.has(entry.taskId) &&
        (entry.seriesId === undefined || typeof entry.seriesId === "string") &&
        (entry.recurrence === undefined ||
          entry.recurrence === null ||
          recurrences.includes(entry.recurrence as Recurrence)) &&
        (entry.repeatUntil === undefined || isValidDateKey(entry.repeatUntil)) &&
        isValidDate(entry.scheduledAt) &&
        (entry.status === "scheduled" ||
          entry.status === "completed" ||
          entry.status === "cleared"),
    )
  )
    return false;
  if (
    !value.focusSessions.every(
      (session) =>
        isRecord(session) &&
        typeof session.id === "string" &&
        typeof session.taskId === "string" &&
        taskIds.has(session.taskId) &&
        isValidDate(session.completedAt) &&
        typeof session.duration === "number" &&
        Number.isFinite(session.duration) &&
        session.duration > 0 &&
        (session.calendarEntryId === undefined ||
          typeof session.calendarEntryId === "string"),
    )
  )
    return false;
  return (
    value.preferences === undefined ||
    (isRecord(value.preferences) &&
      typeof value.preferences.showAllRecurringUpNext === "boolean" &&
      (value.preferences.themeMain === undefined ||
        isHexColor(value.preferences.themeMain)) &&
      (value.preferences.themeText === undefined ||
        isHexColor(value.preferences.themeText)))
  );
};
