import type {
  CalendarEntry,
  Column,
  FocusSession,
  Folder,
  FolderGroup,
  Recurrence,
  RepeatLimit,
  Task,
  TaskMode,
  TaskStatus,
  StoredPomodoro,
  WorkspacePreferences,
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
  if (value.isInKanban !== undefined && typeof value.isInKanban !== "boolean")
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

const isValidStoredPomodoro = (value: unknown): value is StoredPomodoro =>
  isRecord(value) &&
  Number.isInteger(value.durationMinutes) &&
  (value.durationMinutes as number) >= 1 &&
  (value.durationMinutes as number) <= 240 &&
  Number.isFinite(value.remainingSeconds) &&
  (value.remainingSeconds as number) >= 0 &&
  (value.endsAt === null || isValidDate(value.endsAt)) &&
  (value.selectedTaskId === null || typeof value.selectedTaskId === "string") &&
  Array.isArray(value.queueTaskIds) &&
  value.queueTaskIds.every((taskId) => typeof taskId === "string") &&
  typeof value.breaksEnabled === "boolean" &&
  Number.isInteger(value.breakMinutes) &&
  (value.breakMinutes as number) >= 1 &&
  (value.breakMinutes as number) <= 60 &&
  typeof value.isBreakSession === "boolean" &&
  typeof value.isAutomaticQueueEnabled === "boolean";

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
  if (value.pomodoro !== undefined && !isValidStoredPomodoro(value.pomodoro))
    return false;
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

/**
 * Converts exports from earlier Lockin Board releases to the current snapshot
 * shape. It deliberately preserves task order and only fills fields that old
 * exports did not record yet.
 */
export const migrateWorkspaceSnapshot = (value: unknown): WorkspaceSnapshot | null => {
  if (!isRecord(value) || !Array.isArray(value.tasks)) return null;

  const tasks = value.tasks
    .filter(isRecord)
    .map(
      (task): Task => ({
        id: typeof task.id === "string" ? task.id : crypto.randomUUID(),
        title: typeof task.title === "string" ? task.title : "Untitled task",
        detail: typeof task.detail === "string" ? task.detail : "No note",
        tone: tones.includes(task.tone as Task["tone"])
          ? (task.tone as Task["tone"])
          : "neutral",
        column: columns.includes(task.column as Column)
          ? (task.column as Column)
          : "To do",
        isInKanban: task.isInKanban === true,
        destination: typeof task.destination === "string" ? task.destination : "Main",
        mode: taskModes.includes(task.mode as TaskMode)
          ? (task.mode as TaskMode)
          : "one-time",
        status: taskStatuses.includes(task.status as TaskStatus)
          ? (task.status as TaskStatus)
          : "active",
        recurrence: recurrences.includes(task.recurrence as Recurrence)
          ? (task.recurrence as Recurrence)
          : undefined,
        repeatLimit: repeatLimits.includes(task.repeatLimit as RepeatLimit)
          ? (task.repeatLimit as RepeatLimit)
          : undefined,
        dueDate: isValidDateKey(task.dueDate) ? (task.dueDate as string) : undefined,
        dueHour:
          Number.isInteger(task.dueHour) &&
          (task.dueHour as number) >= 0 &&
          (task.dueHour as number) <= 23
            ? (task.dueHour as number)
            : undefined,
        completedAt: isValidDate(task.completedAt)
          ? (task.completedAt as string)
          : undefined,
        completedOccurrences:
          Number.isInteger(task.completedOccurrences) &&
          (task.completedOccurrences as number) >= 0
            ? (task.completedOccurrences as number)
            : 0,
      }),
    )
    .map((task) =>
      task.mode === "recurring" && !task.recurrence
        ? { ...task, recurrence: "weekly" as const }
        : task,
    );
  if (
    tasks.length !== value.tasks.length ||
    tasks.some(
      (task) =>
        task.title.length > maxTaskTitleLength || task.detail.length > maxTaskNoteLength,
    )
  )
    return null;

  const folders = (Array.isArray(value.folders) ? value.folders : [])
    .filter(isRecord)
    .map(
      (folder): Folder => ({
        id: typeof folder.id === "string" ? folder.id : crypto.randomUUID(),
        name: typeof folder.name === "string" ? folder.name : "Untitled folder",
        color: isHexColor(folder.color) ? folder.color : "#38bdf8",
        group: folderGroups.includes(folder.group as FolderGroup)
          ? (folder.group as FolderGroup)
          : undefined,
        hideFromUpNext:
          typeof folder.hideFromUpNext === "boolean" ? folder.hideFromUpNext : undefined,
      }),
    );
  const taskIds = new Set(tasks.map((task) => task.id));
  const calendarEntries = (
    Array.isArray(value.calendarEntries) ? value.calendarEntries : []
  )
    .filter(isRecord)
    .filter(
      (entry) =>
        typeof entry.id === "string" &&
        typeof entry.taskId === "string" &&
        taskIds.has(entry.taskId) &&
        isValidDate(entry.scheduledAt),
    )
    .map(
      (entry): CalendarEntry => ({
        id: entry.id as string,
        taskId: entry.taskId as string,
        seriesId: typeof entry.seriesId === "string" ? entry.seriesId : undefined,
        recurrence:
          entry.recurrence === null ||
          recurrences.includes(entry.recurrence as Recurrence)
            ? (entry.recurrence as Recurrence | null | undefined)
            : undefined,
        repeatUntil: isValidDateKey(entry.repeatUntil)
          ? (entry.repeatUntil as string)
          : undefined,
        scheduledAt: entry.scheduledAt as string,
        status:
          entry.status === "completed" || entry.status === "cleared"
            ? entry.status
            : "scheduled",
      }),
    );
  const focusSessions = (Array.isArray(value.focusSessions) ? value.focusSessions : [])
    .filter(isRecord)
    .filter(
      (session) =>
        typeof session.id === "string" &&
        typeof session.taskId === "string" &&
        taskIds.has(session.taskId) &&
        isValidDate(session.completedAt) &&
        typeof session.duration === "number" &&
        Number.isFinite(session.duration) &&
        session.duration > 0,
    )
    .map(
      (session): FocusSession => ({
        id: session.id as string,
        taskId: session.taskId as string,
        calendarEntryId:
          typeof session.calendarEntryId === "string"
            ? session.calendarEntryId
            : undefined,
        completedAt: session.completedAt as string,
        duration: session.duration as number,
      }),
    );
  const preferences: WorkspacePreferences = {
    showAllRecurringUpNext:
      isRecord(value.preferences) && value.preferences.showAllRecurringUpNext === true,
    themeMain:
      isRecord(value.preferences) && isHexColor(value.preferences.themeMain)
        ? value.preferences.themeMain
        : undefined,
    themeText:
      isRecord(value.preferences) && isHexColor(value.preferences.themeText)
        ? value.preferences.themeText
        : undefined,
  };
  const snapshot: WorkspaceSnapshot = {
    tasks,
    folders,
    calendarEntries,
    focusSessions,
    preferences,
    pomodoro: isValidStoredPomodoro(value.pomodoro) ? value.pomodoro : undefined,
  };
  return isValidWorkspaceSnapshot(snapshot) ? snapshot : null;
};
