import type {
  Column,
  FolderGroup,
  Recurrence,
  RepeatLimit,
  Task,
  TaskMode,
  TaskStatus,
} from "./workspaceTypes";

export const taskModes: TaskMode[] = ["one-time", "recurring", "deadline"];
export const taskStatuses: TaskStatus[] = ["active", "completed"];
export const recurrences: Recurrence[] = ["daily", "weekly", "monthly", "yearly"];
export const repeatLimits: RepeatLimit[] = ["week", "month", "year", "forever"];
export const folderGroups: FolderGroup[] = ["tasks", "events", "unassigned"];
export const columns: Column[] = ["To do", "Doing", "Done"];
export const tones: Task["tone"][] = ["warm", "cool", "neutral", "focus", "done"];
export const maxTaskTitleLength = 25;
export const maxTaskNoteLength = 80;
