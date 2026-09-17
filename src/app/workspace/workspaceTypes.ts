export type Destination = string;
export type Column = "To do" | "Doing" | "Done";
export type Page = "main" | "calendar" | "pomodoro" | "kanban" | "completed";
export type CalendarView = "week" | "month" | "year";
export type TaskMode = "one-time" | "recurring" | "deadline";
export type TaskStatus = "active" | "completed";
export type Recurrence = "daily" | "weekly" | "monthly" | "yearly";
export type RepeatLimit = "week" | "month" | "year" | "forever";
export type FolderGroup = "tasks" | "events" | "unassigned";

export type Task = {
  id: string;
  title: string;
  detail: string;
  tone: "warm" | "cool" | "neutral" | "focus" | "done";
  column: Column;
  destination: Destination;
  mode: TaskMode;
  status: TaskStatus;
  recurrence?: Recurrence;
  repeatLimit?: RepeatLimit;
  dueDate?: string;
  dueHour?: number;
  completedAt?: string;
  completedOccurrences: number;
};

export type CalendarEntry = {
  id: string;
  taskId: string;
  seriesId?: string;
  recurrence?: Recurrence | null;
  repeatUntil?: string;
  scheduledAt: string;
  status: "scheduled" | "completed" | "cleared";
};

export type FocusSession = {
  id: string;
  taskId: string;
  calendarEntryId?: string;
  completedAt: string;
  duration: number;
};

export type Folder = {
  id: string;
  name: string;
  color: string;
  group?: FolderGroup;
  hideFromUpNext?: boolean;
};

export type WorkspacePreferences = {
  showAllRecurringUpNext: boolean;
  themeMain?: string;
  themeText?: string;
};

export type WorkspaceSnapshot = {
  tasks: Task[];
  folders: Folder[];
  calendarEntries: CalendarEntry[];
  focusSessions: FocusSession[];
  preferences: WorkspacePreferences;
};

export type StoredPomodoro = {
  durationMinutes: number;
  remainingSeconds: number;
  endsAt: string | null;
  selectedTaskId: string | null;
};
