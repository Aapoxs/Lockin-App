import { Fragment, useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { clearWorkspace, loadWorkspace, requestPersistentStorage, saveWorkspace, type StoredWorkspace } from "../lib/workspaceStorage";

type Destination = string;
type Column = "To do" | "Doing" | "Done";
type Page = "main" | "calendar" | "pomodoro" | "kanban" | "completed";
type CalendarView = "week" | "month" | "year";
type TaskMode = "one-time" | "recurring" | "deadline";
type TaskStatus = "active" | "completed";
type Recurrence = "daily" | "weekly" | "monthly";

type Task = {
  id: string;
  title: string;
  detail: string;
  tone: "warm" | "cool" | "neutral" | "focus" | "done";
  column: Column;
  destination: Destination;
  mode: TaskMode;
  status: TaskStatus;
  recurrence?: Recurrence;
  dueDate?: string;
  dueHour?: number;
  completedAt?: string;
  completedOccurrences: number;
};

type CalendarEntry = {
  id: string;
  taskId: string;
  scheduledAt: string;
  status: "scheduled" | "completed";
};

type FocusSession = { id: string; taskId: string; calendarEntryId?: string; completedAt: string; duration: number };
type WorkspacePreferences = { showAllRecurringUpNext: boolean };
type WorkspaceSnapshot = { tasks: Task[]; folders: Folder[]; calendarEntries: CalendarEntry[]; focusSessions: FocusSession[]; preferences: WorkspacePreferences };
type StoredPomodoro = { durationMinutes: number; remainingSeconds: number; endsAt: string | null; selectedTaskId: string | null };

type Folder = { id: string; name: string; color: string };

const initialFolders: Folder[] = [];
const initialTasks: Task[] = [];
const POMODORO_STORAGE_KEY = "lockin-board-pomodoro-v1";
const defaultPomodoro: StoredPomodoro = { durationMinutes: 25, remainingSeconds: 25 * 60, endsAt: null, selectedTaskId: null };
const loadPomodoro = (): StoredPomodoro => {
  try {
    const stored = JSON.parse(localStorage.getItem(POMODORO_STORAGE_KEY) ?? "null") as Partial<StoredPomodoro> | null;
    if (!stored || !Number.isInteger(stored.durationMinutes) || (stored.durationMinutes as number) < 1 || (stored.durationMinutes as number) > 240 || !Number.isFinite(stored.remainingSeconds) || (stored.remainingSeconds as number) < 0) return defaultPomodoro;
    const endsAt = typeof stored.endsAt === "string" && !Number.isNaN(Date.parse(stored.endsAt)) ? stored.endsAt : null;
    const remainingSeconds = endsAt ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000)) : Math.floor(stored.remainingSeconds as number);
    return { durationMinutes: stored.durationMinutes as number, remainingSeconds, endsAt: remainingSeconds > 0 ? endsAt : null, selectedTaskId: typeof stored.selectedTaskId === "string" ? stored.selectedTaskId : null };
  } catch {
    return defaultPomodoro;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isValidDate = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value));
const isValidDateKey = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`));
const taskModes: TaskMode[] = ["one-time", "recurring", "deadline"];
const taskStatuses: TaskStatus[] = ["active", "completed"];
const recurrences: Recurrence[] = ["daily", "weekly", "monthly"];
const columns: Column[] = ["To do", "Doing", "Done"];
const tones: Task["tone"][] = ["warm", "cool", "neutral", "focus", "done"];

const isValidTask = (value: unknown): value is Task => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string" || typeof value.detail !== "string" || typeof value.destination !== "string") return false;
  if (!taskModes.includes(value.mode as TaskMode) || !taskStatuses.includes(value.status as TaskStatus) || !columns.includes(value.column as Column) || !tones.includes(value.tone as Task["tone"])) return false;
  if (!Number.isInteger(value.completedOccurrences) || (value.completedOccurrences as number) < 0) return false;
  if (value.mode === "recurring" && !recurrences.includes(value.recurrence as Recurrence)) return false;
  if (value.recurrence !== undefined && !recurrences.includes(value.recurrence as Recurrence)) return false;
  if (value.dueDate !== undefined && !isValidDateKey(value.dueDate)) return false;
  if (value.dueHour !== undefined && (!Number.isInteger(value.dueHour) || (value.dueHour as number) < 0 || (value.dueHour as number) > 23)) return false;
  return value.completedAt === undefined || isValidDate(value.completedAt);
};

const isValidWorkspaceSnapshot = (value: unknown): value is WorkspaceSnapshot => {
  if (!isRecord(value) || !Array.isArray(value.tasks) || !Array.isArray(value.folders) || !Array.isArray(value.calendarEntries) || !Array.isArray(value.focusSessions)) return false;
  if (!value.tasks.every(isValidTask)) return false;
  if (!value.folders.every((folder) => isRecord(folder) && typeof folder.id === "string" && typeof folder.name === "string" && typeof folder.color === "string" && /^#[0-9a-f]{6}$/i.test(folder.color))) return false;
  const taskIds = new Set(value.tasks.map((task) => task.id));
  if (!value.calendarEntries.every((entry) => isRecord(entry) && typeof entry.id === "string" && typeof entry.taskId === "string" && taskIds.has(entry.taskId) && isValidDate(entry.scheduledAt) && (entry.status === "scheduled" || entry.status === "completed"))) return false;
  if (!value.focusSessions.every((session) => isRecord(session) && typeof session.id === "string" && typeof session.taskId === "string" && taskIds.has(session.taskId) && isValidDate(session.completedAt) && typeof session.duration === "number" && Number.isFinite(session.duration) && session.duration > 0 && (session.calendarEntryId === undefined || typeof session.calendarEntryId === "string"))) return false;
  return value.preferences === undefined || (isRecord(value.preferences) && typeof value.preferences.showAllRecurringUpNext === "boolean");
};

const toDateKey = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
const startOfWeek = (date: Date) => {
  const result = new Date(date);
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  result.setHours(0, 0, 0, 0);
  return result;
};
const formatDueDate = (dateKey: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${dateKey}T12:00:00`));
const formatScheduledAt = (scheduledAt: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(scheduledAt));
const modeLabel = (task: Task) => task.mode === "recurring" ? `Repeats ${task.recurrence ?? "weekly"}` : task.mode === "deadline" ? "Deadline" : "One-time";
const formatRemaining = (seconds: number) => `${String(Math.max(0, Math.floor(seconds / 60))).padStart(2, "0")}:${String(Math.max(0, seconds % 60)).padStart(2, "0")}`;
const formatCalendarRemaining = (seconds: number) => {
  const minutes = Math.max(0, Math.ceil(seconds / 60));
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const remainingMinutes = minutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${remainingMinutes}m`;
  return minutes ? `${minutes}m` : "<1m";
};
const advanceRecurringDate = (date: Date, recurrence: Recurrence) => {
  const next = new Date(date);
  if (recurrence === "daily") next.setDate(next.getDate() + 1);
  else if (recurrence === "weekly") next.setDate(next.getDate() + 7);
  else {
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
  }
  return next;
};

export function WorkspacePreview() {
  const [tasks, setTasks] = useState(initialTasks);
  const [calendarEntries, setCalendarEntries] = useState<CalendarEntry[]>([]);
  const [folders, setFolders] = useState(initialFolders);
  const [activePage, setActivePage] = useState<Page>("main");
  const [calendarView, setCalendarView] = useState<CalendarView>("week");
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [highlightedCalendarEntryId, setHighlightedCalendarEntryId] = useState<string | null>(null);
  const [isCalendarTrayOpen, setIsCalendarTrayOpen] = useState(false);
  const [calendarTrayFolder, setCalendarTrayFolder] = useState<Destination | null>(null);
  const [visibleWeekDayCount, setVisibleWeekDayCount] = useState(7);
  const [openFolderMenu, setOpenFolderMenu] = useState<string | null>(null);
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [isTaskComposerOpen, setIsTaskComposerOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskNote, setTaskNote] = useState("");
  const [taskMode, setTaskMode] = useState<TaskMode>("one-time");
  const [taskRecurrence, setTaskRecurrence] = useState<Recurrence>("weekly");
  const [taskDeadline, setTaskDeadline] = useState("");
  const [taskDeadlineHour, setTaskDeadlineHour] = useState(9);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [editTaskNote, setEditTaskNote] = useState("");
  const [editTaskMode, setEditTaskMode] = useState<TaskMode>("one-time");
  const [editTaskRecurrence, setEditTaskRecurrence] = useState<Recurrence>("weekly");
  const [editTaskDeadline, setEditTaskDeadline] = useState("");
  const [editTaskDeadlineHour, setEditTaskDeadlineHour] = useState(9);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const initialPomodoro = useRef(loadPomodoro()).current;
  const [pomodoroDurationMinutes, setPomodoroDurationMinutes] = useState(initialPomodoro.durationMinutes);
  const [pomodoroSeconds, setPomodoroSeconds] = useState(initialPomodoro.remainingSeconds);
  const [pomodoroEndsAt, setPomodoroEndsAt] = useState<string | null>(initialPomodoro.endsAt);
  const [isPomodoroRunning, setIsPomodoroRunning] = useState(Boolean(initialPomodoro.endsAt));
  const [selectedPomodoroTaskId, setSelectedPomodoroTaskId] = useState<string | null>(initialPomodoro.selectedTaskId);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [showAllRecurringUpNext, setShowAllRecurringUpNext] = useState(false);
  const [isWorkspaceReady, setIsWorkspaceReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState("Opening local workspace…");
  const backupInputRef = useRef<HTMLInputElement>(null);
  const weekCalendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isActive = true;
    void Promise.all([loadWorkspace(), requestPersistentStorage()]).then(([workspace, persistent]) => {
      if (!isActive) return;
      const snapshot = workspace?.snapshot as Partial<WorkspaceSnapshot> | undefined;
      if (Array.isArray(snapshot?.tasks)) setTasks(snapshot.tasks);
      if (Array.isArray(snapshot?.folders)) setFolders(snapshot.folders);
      if (Array.isArray(snapshot?.calendarEntries)) setCalendarEntries(snapshot.calendarEntries);
      if (Array.isArray(snapshot?.focusSessions)) setFocusSessions(snapshot.focusSessions);
      if (typeof snapshot?.preferences?.showAllRecurringUpNext === "boolean") setShowAllRecurringUpNext(snapshot.preferences.showAllRecurringUpNext);
      setStorageStatus(persistent === true ? "Saved locally · protected from automatic cleanup" : "Saved locally · export backups regularly");
    }).catch(() => {
      if (isActive) setStorageStatus("Local storage is unavailable — restore or browser settings may need attention");
    }).finally(() => { if (isActive) setIsWorkspaceReady(true); });
    return () => { isActive = false; };
  }, []);

  useEffect(() => {
    if (!isWorkspaceReady) return;
    const saveTimer = window.setTimeout(() => {
      const snapshot: WorkspaceSnapshot = { tasks, folders, calendarEntries, focusSessions, preferences: { showAllRecurringUpNext } };
      void saveWorkspace(snapshot).then(() => setStorageStatus((status) => status.startsWith("Local storage is unavailable") ? status : "Saved locally")).catch(() => setStorageStatus("Local storage is unavailable — export a backup before closing"));
    }, 300);
    return () => window.clearTimeout(saveTimer);
  }, [calendarEntries, focusSessions, folders, isWorkspaceReady, showAllRecurringUpNext, tasks]);

  useEffect(() => {
    if (!isWorkspaceReady) return;
    const horizon = new Date(Math.max(Date.now(), calendarDate.getTime()));
    horizon.setFullYear(horizon.getFullYear() + 1);
    setCalendarEntries((current) => {
      const additions: CalendarEntry[] = [];
      tasks.filter((task) => task.status === "active" && task.mode === "recurring").forEach((task) => {
        const entries = current.filter((entry) => entry.taskId === task.id).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
        const latest = entries.at(-1);
        if (!latest) return;
        let occurrence = new Date(latest.scheduledAt);
        while (occurrence < horizon) {
          occurrence = advanceRecurringDate(occurrence, task.recurrence ?? "weekly");
          const scheduledAt = `${toDateKey(occurrence)}T${String(occurrence.getHours()).padStart(2, "0")}:${String(occurrence.getMinutes()).padStart(2, "0")}:00`;
          if (!current.some((entry) => entry.taskId === task.id && entry.scheduledAt === scheduledAt) && !additions.some((entry) => entry.taskId === task.id && entry.scheduledAt === scheduledAt)) additions.push({ id: crypto.randomUUID(), taskId: task.id, scheduledAt, status: "scheduled" });
        }
      });
      return additions.length ? [...current, ...additions] : current;
    });
  }, [calendarDate, calendarEntries, isWorkspaceReady, tasks]);

  useEffect(() => {
    if (activePage !== "calendar" && activePage !== "pomodoro") return;
    setNow(new Date());
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, [activePage]);

  useEffect(() => {
    if (activePage !== "calendar" || calendarView !== "week" || !weekCalendarRef.current) return;
    const calendar = weekCalendarRef.current;
    const updateVisibleDays = () => {
      const nextCount = Math.max(2, Math.min(7, Math.floor((calendar.clientWidth - 48) / 86)));
      setVisibleWeekDayCount(nextCount);
      if (nextCount < 5) setIsCalendarTrayOpen(false);
    };
    updateVisibleDays();
    const observer = new ResizeObserver(updateVisibleDays);
    observer.observe(calendar);
    return () => observer.disconnect();
  }, [activePage, calendarView]);

  useEffect(() => {
    if (!isPomodoroRunning) return;
    const tick = () => setPomodoroSeconds(Math.max(0, Math.ceil(((pomodoroEndsAt ? new Date(pomodoroEndsAt).getTime() : Date.now()) - Date.now()) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [isPomodoroRunning, pomodoroEndsAt]);

  useEffect(() => {
    localStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify({ durationMinutes: pomodoroDurationMinutes, remainingSeconds: pomodoroSeconds, endsAt: pomodoroEndsAt, selectedTaskId: selectedPomodoroTaskId } satisfies StoredPomodoro));
  }, [pomodoroDurationMinutes, pomodoroEndsAt, pomodoroSeconds, selectedPomodoroTaskId]);

  useEffect(() => {
    if (pomodoroSeconds !== 0 || !isPomodoroRunning) return;
    setIsPomodoroRunning(false);
    setPomodoroEndsAt(null);
    if (!selectedPomodoroTaskId) return;
    const completedAt = new Date();
    const activeEntry = calendarEntries.find((entry) => entry.taskId === selectedPomodoroTaskId && entry.status === "scheduled" && new Date(entry.scheduledAt) <= completedAt && completedAt < new Date(new Date(entry.scheduledAt).getTime() + 60 * 60 * 1000));
    setFocusSessions((current) => [...current, { id: crypto.randomUUID(), taskId: selectedPomodoroTaskId, calendarEntryId: activeEntry?.id, completedAt: completedAt.toISOString(), duration: pomodoroDurationMinutes * 60 }]);
  }, [pomodoroDurationMinutes, pomodoroSeconds, isPomodoroRunning, selectedPomodoroTaskId, calendarEntries]);

  const moveTask = (taskId: string, destination: Destination) => {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, destination } : task));
  };

  const reorderFolders = (movingFolderId: string, targetFolderId: string) => {
    if (!movingFolderId || movingFolderId === targetFolderId) return;
    setFolders((current) => {
      const movingIndex = current.findIndex((folder) => folder.id === movingFolderId);
      const targetIndex = current.findIndex((folder) => folder.id === targetFolderId);
      if (movingIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [movingFolder] = next.splice(movingIndex, 1);
      next.splice(targetIndex, 0, movingFolder);
      return next;
    });
  };

  const setCalendarTaskRecurrence = (taskId: string, recurrence: Recurrence | "none") => {
    setTasks((current) => current.map((task) => task.id === taskId ? recurrence === "none" ? { ...task, mode: "one-time", recurrence: undefined, dueDate: undefined } : { ...task, mode: "recurring", recurrence, dueDate: undefined } : task));
    setCalendarEntries((current) => {
      const matching = current.filter((entry) => entry.taskId === taskId).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
      const completed = matching.filter((entry) => entry.status === "completed");
      const firstScheduled = matching.find((entry) => entry.status === "scheduled");
      if (!firstScheduled) return current;
      const unrelated = current.filter((entry) => entry.taskId !== taskId);
      if (recurrence === "none") return [...unrelated, ...completed, firstScheduled];
      const horizon = new Date();
      horizon.setFullYear(horizon.getFullYear() + 1);
      const recurringEntries = [...completed, firstScheduled];
      let occurrence = new Date(firstScheduled.scheduledAt);
      while (occurrence < horizon) {
        occurrence = advanceRecurringDate(occurrence, recurrence);
        recurringEntries.push({ id: crypto.randomUUID(), taskId, scheduledAt: `${toDateKey(occurrence)}T${String(occurrence.getHours()).padStart(2, "0")}:${String(occurrence.getMinutes()).padStart(2, "0")}:00`, status: "scheduled" });
      }
      return [...unrelated, ...recurringEntries];
    });
  };

  const scheduleTask = (taskId: string, dateKey: string, hour: number) => {
    const scheduledAt = `${dateKey}T${String(hour).padStart(2, "0")}:00`;
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;
    setCalendarEntries((current) => {
      if (current.some((entry) => entry.taskId === taskId && entry.scheduledAt === scheduledAt)) return current;
      const first: CalendarEntry = { id: crypto.randomUUID(), taskId, scheduledAt, status: "scheduled" };
      if (task.mode !== "recurring") return [...current, first];
      const count = task.recurrence === "daily" ? 366 : task.recurrence === "weekly" ? 53 : 13;
      const entries = [first];
      let occurrence = new Date(scheduledAt);
      for (let index = 1; index < count; index += 1) {
        occurrence = advanceRecurringDate(occurrence, task.recurrence ?? "weekly");
        entries.push({ id: crypto.randomUUID(), taskId, scheduledAt: `${toDateKey(occurrence)}T${String(occurrence.getHours()).padStart(2, "0")}:${String(occurrence.getMinutes()).padStart(2, "0")}:00`, status: "scheduled" });
      }
      return [...current, ...entries];
    });
  };

  const moveCalendarEntry = (entryId: string, dateKey: string, hour: number) => {
    const scheduledAt = `${dateKey}T${String(hour).padStart(2, "0")}:00`;
    setCalendarEntries((current) => current.map((entry) => entry.id === entryId ? { ...entry, scheduledAt } : entry));
  };

  const completeCalendarEntry = (entry: CalendarEntry) => {
    const storedEntry = calendarEntries.find((candidate) => candidate.id === entry.id);
    const task = tasks.find((candidate) => candidate.id === entry.taskId);
    if (!entry || !task || entry.status === "completed") return;
    if (task.mode === "recurring") {
      setCalendarEntries((current) => storedEntry ? current.map((candidate) => candidate.id === entry.id ? { ...candidate, status: "completed" as const } : candidate) : [...current, { ...entry, id: crypto.randomUUID(), status: "completed" }]);
      setTasks((current) => current.map((candidate) => candidate.id === task.id ? { ...candidate, completedOccurrences: candidate.completedOccurrences + 1 } : candidate));
      return;
    }
    setCalendarEntries((current) => current.map((candidate) => candidate.taskId === task.id ? { ...candidate, status: "completed" } : candidate));
    setTasks((current) => current.map((candidate) => candidate.id === task.id ? { ...candidate, status: "completed", completedAt: new Date().toISOString(), column: "Done" } : candidate));
  };

  const completeTask = (task: Task) => {
    if (task.mode === "recurring") {
      const nextOccurrence = calendarEntries.filter((entry) => entry.taskId === task.id && entry.status === "scheduled").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
      if (nextOccurrence) completeCalendarEntry(nextOccurrence);
      else setTasks((current) => current.map((candidate) => candidate.id === task.id ? { ...candidate, completedOccurrences: candidate.completedOccurrences + 1 } : candidate));
      return;
    }
    setCalendarEntries((current) => current.map((entry) => entry.taskId === task.id ? { ...entry, status: "completed" } : entry));
    setTasks((current) => current.map((candidate) => candidate.id === task.id ? { ...candidate, status: "completed", completedAt: new Date().toISOString(), column: "Done" } : candidate));
  };

  const restoreTask = (taskId: string) => {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status: "active", completedAt: undefined, column: "To do" } : task));
    setCalendarEntries((current) => current.map((entry) => entry.taskId === taskId ? { ...entry, status: "scheduled" } : entry));
  };
  const reopenCalendarEntry = (entry: CalendarEntry, task: Task) => {
    if (task.status === "completed") {
      restoreTask(task.id);
      return;
    }
    setCalendarEntries((current) => current.map((candidate) => candidate.id === entry.id ? { ...candidate, status: "scheduled" } : candidate));
  };
  const moveTaskColumn = (taskId: string, column: Column) => setTasks((current) => current.map((task) => task.id === taskId ? { ...task, column } : task));

  const startPomodoro = () => {
    const seconds = pomodoroSeconds || pomodoroDurationMinutes * 60;
    setPomodoroSeconds(seconds);
    setPomodoroEndsAt(new Date(Date.now() + seconds * 1000).toISOString());
    setIsPomodoroRunning(true);
    if (selectedPomodoroTaskId) moveTaskColumn(selectedPomodoroTaskId, "Doing");
  };
  const pausePomodoro = () => {
    setIsPomodoroRunning(false);
    setPomodoroEndsAt(null);
  };
  const resetPomodoro = () => {
    setIsPomodoroRunning(false);
    setPomodoroEndsAt(null);
    setPomodoroSeconds(pomodoroDurationMinutes * 60);
  };
  const setPomodoroDuration = (minutes: number) => {
    const duration = Math.max(1, Math.min(240, Math.round(minutes) || 25));
    setPomodoroDurationMinutes(duration);
    if (!isPomodoroRunning) setPomodoroSeconds(duration * 60);
  };

  const openCalendarEntry = (entry: CalendarEntry) => {
    setCalendarDate(new Date(entry.scheduledAt));
    setCalendarView("week");
    setActivePage("calendar");
    setHighlightedCalendarEntryId(entry.id);
    window.setTimeout(() => setHighlightedCalendarEntryId((current) => current === entry.id ? null : current), 3000);
  };

  const shiftCalendarDate = (direction: -1 | 1) => {
    setCalendarDate((current) => {
      const next = new Date(current);
      if (calendarView === "week") next.setDate(next.getDate() + direction * 7);
      else if (calendarView === "month") next.setMonth(next.getMonth() + direction);
      else next.setFullYear(next.getFullYear() + direction);
      return next;
    });
  };

  const dragTaskStart = (event: DragEvent<HTMLElement>, taskId: string) => {
    event.dataTransfer.setData("application/x-focusboard-task", taskId);
    event.dataTransfer.setData("text/plain", `task:${taskId}`);
    event.dataTransfer.effectAllowed = "copyMove";
  };

  const dragCalendarEntryStart = (event: DragEvent<HTMLElement>, entryId: string) => {
    event.dataTransfer.setData("application/x-focusboard-calendar-entry", entryId);
    event.dataTransfer.setData("text/plain", `calendar:${entryId}`);
    event.dataTransfer.effectAllowed = "copyMove";
  };

  const getDraggedTaskId = (event: DragEvent<HTMLElement>) => {
    const internalId = event.dataTransfer.getData("application/x-focusboard-task");
    const plainText = event.dataTransfer.getData("text/plain");
    return internalId || (plainText.startsWith("task:") ? plainText.slice(5) : "");
  };

  const getDraggedCalendarEntryId = (event: DragEvent<HTMLElement>) => {
    const internalId = event.dataTransfer.getData("application/x-focusboard-calendar-entry");
    const plainText = event.dataTransfer.getData("text/plain");
    return internalId || (plainText.startsWith("calendar:") ? plainText.slice(9) : "");
  };

  const addFolder = () => {
    const name = folderName.trim();
    if (!name || name.toLocaleLowerCase() === "main" || folders.some((folder) => folder.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0)) return;
    setFolders((current) => [...current, { id: crypto.randomUUID(), name, color: "#38bdf8" }]);
    setFolderName("");
    setIsCreatingFolder(false);
  };

  const renameFolder = (folderId: string) => {
    const name = renameValue.trim();
    if (!name || name.toLocaleLowerCase() === "main" || folders.some((folder) => folder.id !== folderId && folder.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0)) return;
    setFolders((current) => current.map((folder) => folder.id === folderId ? { ...folder, name } : folder));
    setIsRenamingFolder(false);
    setOpenFolderMenu(null);
  };

  const updateFolderColor = (folderId: string, color: string) => setFolders((current) => current.map((folder) => folder.id === folderId ? { ...folder, color } : folder));

  const removeFolder = (folder: Folder) => {
    if (!window.confirm(`Remove ${folder.name}? Tasks in it will return to Main.`)) return;
    setTasks((current) => current.map((task) => task.destination === folder.id ? { ...task, destination: "Main" } : task));
    setFolders((current) => current.filter((entry) => entry.id !== folder.id));
    setOpenFolderMenu(null);
  };

  const addTask = () => {
    const title = taskTitle.trim();
    if (!title) return;
    const id = crypto.randomUUID();
    setTasks((current) => [...current, { id, title, detail: taskNote.trim() || "No note", tone: "neutral", column: "To do", destination: "Main", mode: taskMode, status: "active", recurrence: taskMode === "recurring" ? taskRecurrence : undefined, dueDate: taskMode === "deadline" ? taskDeadline : undefined, dueHour: taskMode === "deadline" ? taskDeadlineHour : undefined, completedOccurrences: 0 }]);
    if (taskMode === "deadline" && taskDeadline) setCalendarEntries((current) => [...current, { id: crypto.randomUUID(), taskId: id, scheduledAt: `${taskDeadline}T${String(taskDeadlineHour).padStart(2, "0")}:00`, status: "scheduled" }]);
    setTaskTitle("");
    setTaskNote("");
    setTaskMode("one-time");
    setTaskRecurrence("weekly");
    setTaskDeadline("");
    setTaskDeadlineHour(9);
    setIsTaskComposerOpen(false);
  };

  const openTaskEditor = (task: Task) => {
    setEditingTaskId(task.id);
    setEditTaskTitle(task.title);
    setEditTaskNote(task.detail);
    setEditTaskMode(task.mode);
    setEditTaskRecurrence(task.recurrence ?? "weekly");
    setEditTaskDeadline(task.dueDate ?? "");
    setEditTaskDeadlineHour(task.dueHour ?? 9);
  };

  const saveTask = () => {
    const title = editTaskTitle.trim();
    if (!editingTaskId || !title) return;
    setTasks((current) => current.map((task) => {
      if (task.id !== editingTaskId) return task;
      if (task.mode === "recurring") return { ...task, title, detail: editTaskNote.trim() || "No note" };
      return { ...task, title, detail: editTaskNote.trim() || "No note", mode: editTaskMode, recurrence: undefined, dueDate: editTaskMode === "deadline" ? editTaskDeadline : undefined, dueHour: editTaskMode === "deadline" ? editTaskDeadlineHour : undefined };
    }));
    if (editTaskMode === "deadline" && editTaskDeadline) {
      const scheduledAt = `${editTaskDeadline}T${String(editTaskDeadlineHour).padStart(2, "0")}:00`;
      const existingEntry = calendarEntries.find((entry) => entry.taskId === editingTaskId && entry.status === "scheduled");
      if (existingEntry) setCalendarEntries((current) => current.map((entry) => entry.id === existingEntry.id ? { ...entry, scheduledAt } : entry));
      else scheduleTask(editingTaskId, editTaskDeadline, editTaskDeadlineHour);
    }
    setEditingTaskId(null);
  };

  const deleteTask = (task: Task) => {
    if (!window.confirm(`Delete “${task.title}”?`)) return;
    setTasks((current) => current.filter((candidate) => candidate.id !== task.id));
    setCalendarEntries((current) => current.filter((entry) => entry.taskId !== task.id));
    if (editingTaskId === task.id) setEditingTaskId(null);
  };

  const dropOn = (event: DragEvent<HTMLElement>, destination: Destination) => {
    event.preventDefault();
    const taskId = getDraggedTaskId(event);
    if (taskId) {
      moveTask(taskId, destination);
      return;
    }
    const calendarEntryId = getDraggedCalendarEntryId(event);
    const calendarEntry = calendarEntries.find((entry) => entry.id === calendarEntryId);
    if (calendarEntry) {
      moveTask(calendarEntry.taskId, destination);
      const task = tasks.find((candidate) => candidate.id === calendarEntry.taskId);
      setCalendarEntries((current) => current.filter((entry) => task?.mode === "recurring" ? entry.taskId !== calendarEntry.taskId : entry.id !== calendarEntry.id));
    }
  };

  const isOverdue = (task: Task) => task.status === "active" && task.mode === "deadline" && Boolean(task.dueDate && new Date(`${task.dueDate}T23:59:59`) < now);
  const taskCard = (task: Task) => (
    <article className={`task-card${isOverdue(task) ? " task-card-overdue" : ""}`} key={task.id} draggable onClick={(event) => event.stopPropagation()} onDragStart={(event) => dragTaskStart(event, task.id)}>
      <h3>{task.title}</h3><p>{task.dueDate ? `Due ${formatDueDate(task.dueDate)}` : task.detail}</p><div className="task-meta"><span>{modeLabel(task)}</span>{isOverdue(task) && <span>Overdue</span>}</div>
      <div className="task-footer"><button className="task-complete-button" type="button" aria-label={`Complete ${task.title}`} title={task.mode === "recurring" ? "Complete occurrence" : "Complete task"} onClick={(event) => { event.stopPropagation(); completeTask(task); }}>✓</button><button className="task-edit-button" type="button" onClick={(event) => { event.stopPropagation(); openTaskEditor(task); }}>Edit</button><button className="task-delete-button" type="button" aria-label={`Delete ${task.title}`} title="Delete task" onClick={(event) => { event.stopPropagation(); deleteTask(task); }}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="m6 7 1 13h10l1-13" /><path d="M10 11v5" /><path d="M14 11v5" /></svg></button></div>
    </article>
  );

  const activeTasks = tasks.filter((task) => task.status === "active");
  const completedTasks = tasks.filter((task) => task.status === "completed");
  const mainTasks = activeTasks.filter((task) => task.destination === "Main");
  const weekStart = startOfWeek(calendarDate);
  const weekDays = Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setDate(weekStart.getDate() + index); return { key: toDateKey(date), label: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date), day: date.getDate() }; });
  const visibleWeekDays = weekDays.slice(0, visibleWeekDayCount);
  const scheduleHours = Array.from({ length: 24 }, (_, index) => index);
  const calendarHours = [...scheduleHours.slice(6), ...scheduleHours.slice(0, 6)];
  const calendarTrayTasks = calendarTrayFolder ? activeTasks.filter((task) => task.destination === calendarTrayFolder) : [];
  const storedScheduledTasks = calendarEntries.flatMap((entry) => {
    const task = tasks.find((candidate) => candidate.id === entry.taskId);
    return task ? [{ entry, task }] : [];
  });
  const storedEntryKeys = new Set(calendarEntries.map((entry) => `${entry.taskId}|${entry.scheduledAt}`));
  const recurrenceProjectionEnd = new Date(Math.max(Date.now(), calendarDate.getTime()));
  recurrenceProjectionEnd.setFullYear(recurrenceProjectionEnd.getFullYear() + 2);
  const projectedRecurringTasks = tasks.filter((task) => task.status === "active" && task.mode === "recurring").flatMap((task) => {
    const anchor = calendarEntries.filter((entry) => entry.taskId === task.id).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
    if (!anchor) return [];
    const projected: { entry: CalendarEntry; task: Task }[] = [];
    let occurrence = new Date(anchor.scheduledAt);
    let safety = 0;
    while (occurrence <= recurrenceProjectionEnd && safety < 5000) {
      const scheduledAt = `${toDateKey(occurrence)}T${String(occurrence.getHours()).padStart(2, "0")}:${String(occurrence.getMinutes()).padStart(2, "0")}:00`;
      if (!storedEntryKeys.has(`${task.id}|${scheduledAt}`)) projected.push({ entry: { id: `recurring:${task.id}:${scheduledAt}`, taskId: task.id, scheduledAt, status: "scheduled" }, task });
      occurrence = advanceRecurringDate(occurrence, task.recurrence ?? "weekly");
      safety += 1;
    }
    return projected;
  });
  const scheduledTasks = [...storedScheduledTasks, ...projectedRecurringTasks];
  const recurringTasksForSlot = (scheduledAt: string) => {
    const slot = new Date(scheduledAt);
    return tasks.filter((task) => task.status === "active" && task.mode === "recurring").flatMap((task) => {
      if (storedEntryKeys.has(`${task.id}|${scheduledAt}`)) return [];
      const anchor = calendarEntries.filter((entry) => entry.taskId === task.id).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
      if (!anchor) return [];
      let occurrence = new Date(anchor.scheduledAt);
      let safety = 0;
      while (occurrence < slot && safety < 5000) {
        occurrence = advanceRecurringDate(occurrence, task.recurrence ?? "weekly");
        safety += 1;
      }
      return occurrence.getTime() === slot.getTime() ? [{ entry: { id: `recurring:${task.id}:${scheduledAt}`, taskId: task.id, scheduledAt, status: "scheduled" as const }, task }] : [];
    });
  };
  const activeScheduledTasks = scheduledTasks.filter(({ entry, task }) => entry.status === "scheduled" && task.status === "active");
  const sortedScheduledTasks = [...activeScheduledTasks].sort((a, b) => a.entry.scheduledAt.localeCompare(b.entry.scheduledAt));
  const todayKey = toDateKey(new Date());
  const todayCalendarTasks = scheduledTasks.filter(({ entry }) => toDateKey(new Date(entry.scheduledAt)) === todayKey).sort((a, b) => a.entry.scheduledAt.localeCompare(b.entry.scheduledAt));
  const futureScheduledTasks = sortedScheduledTasks.filter(({ entry }) => new Date(entry.scheduledAt) >= new Date());
  const upNextCandidates = futureScheduledTasks.length ? futureScheduledTasks : sortedScheduledTasks;
  const seenRecurringTaskIds = new Set<string>();
  const upNextVisibleTasks = showAllRecurringUpNext ? upNextCandidates : upNextCandidates.filter(({ task }) => {
    if (task.mode !== "recurring") return true;
    if (seenRecurringTaskIds.has(task.id)) return false;
    seenRecurringTaskIds.add(task.id);
    return true;
  });
  const urgentTasks = upNextVisibleTasks.slice(0, 5);
  const calendarTaskColor = (task: Task) => folders.find((folder) => folder.id === task.destination)?.color ?? "#a1a1aa";
  const mainCurrentDate = new Date();
  const mainMonthStart = new Date(mainCurrentDate.getFullYear(), mainCurrentDate.getMonth(), 1);
  const mainCalendarMonthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(mainMonthStart);
  const mainMonthGridStart = startOfWeek(mainMonthStart);
  const mainMonthDays = Array.from({ length: 42 }, (_, index) => { const date = new Date(mainMonthGridStart); date.setDate(mainMonthGridStart.getDate() + index); return { key: toDateKey(date), day: date.getDate(), inMonth: date.getMonth() === mainCurrentDate.getMonth() }; });
  const currentDate = calendarDate;
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthGridStart = startOfWeek(monthStart);
  const monthDays = Array.from({ length: 42 }, (_, index) => { const date = new Date(monthGridStart); date.setDate(monthGridStart.getDate() + index); return { key: toDateKey(date), day: date.getDate(), inMonth: date.getMonth() === currentDate.getMonth() }; });
  const yearMonths = Array.from({ length: 12 }, (_, index) => new Date(currentDate.getFullYear(), currentDate.getMonth() + index, 1));
  const calendarPeriodLabel = calendarView === "week" ? `${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(weekStart)} – ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6))}` : calendarView === "month" ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(monthStart) : `${new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(yearMonths[0])} – ${new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(yearMonths[11])}`;
  const calendarPeriodName = calendarView === "week" ? "week" : calendarView === "month" ? "month" : "year";
  const selectedPomodoroTask = activeTasks.find((task) => task.id === selectedPomodoroTaskId);
  const activePomodoroEntry = selectedPomodoroTask ? activeScheduledTasks.find(({ entry, task }) => task.id === selectedPomodoroTask.id && new Date(entry.scheduledAt) <= now && now < new Date(new Date(entry.scheduledAt).getTime() + 60 * 60 * 1000)) : undefined;
  const calendarEntryCountdown = (entry: CalendarEntry) => {
    if (entry.status === "completed") return "Completed";
    const start = new Date(entry.scheduledAt);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    if (now < start) return `Starts in ${formatCalendarRemaining((start.getTime() - now.getTime()) / 1000)}`;
    if (now < end) return `${formatCalendarRemaining((end.getTime() - now.getTime()) / 1000)} left`;
    return "Ended";
  };

  const exportBackup = () => {
    const backup: StoredWorkspace = {
      version: 1,
      savedAt: new Date().toISOString(),
      snapshot: { tasks, folders, calendarEntries, focusSessions, preferences: { showAllRecurringUpNext } } satisfies WorkspaceSnapshot,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `lockin-board-backup-${backup.savedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStorageStatus(`Backup exported · ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date())}`);
  };

  const restoreBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Backup file is too large.");
      const backup = JSON.parse(await file.text()) as Partial<StoredWorkspace>;
      const snapshot = backup.version === 1 ? backup.snapshot as Partial<WorkspaceSnapshot> : undefined;
      if (!isValidWorkspaceSnapshot(snapshot)) {
        throw new Error("This is not a Lockin Board backup.");
      }
      if (!window.confirm("Restore this backup? It will replace the workspace currently stored in this browser.")) return;
      setTasks(snapshot.tasks);
      setFolders(snapshot.folders);
      setCalendarEntries(snapshot.calendarEntries);
      setFocusSessions(snapshot.focusSessions);
      setStorageStatus("Backup restored · saving locally");
    } catch {
      setStorageStatus("Could not restore that backup file");
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  };

  const clearCurrentWorkspace = async () => {
    if (!window.confirm("Clear this Lockin Board workspace? All tasks, folders, calendar entries, and focus history stored in this browser will be removed. Export a backup first if you may want them later.")) return;
    try {
      await clearWorkspace();
      setTasks([]);
      setFolders([]);
      setCalendarEntries([]);
      setFocusSessions([]);
      setShowAllRecurringUpNext(false);
      setSelectedPomodoroTaskId(null);
      setStorageStatus("Workspace cleared · ready for a fresh start");
    } catch {
      setStorageStatus("Could not clear the local workspace");
    }
  };
  const toggleCalendarTray = () => { setIsCalendarTrayOpen((current) => !current); setCalendarTrayFolder(null); };

  if (!isWorkspaceReady) {
    return <main className="startup-screen">Opening your local workspace…</main>;
  }

  return (
    <div className="focusboard-shell" onClick={() => setOpenFolderMenu(null)}>
      {isNavigationOpen && <button className="mobile-nav-scrim" type="button" aria-label="Close navigation" onClick={() => setIsNavigationOpen(false)} />}
      <aside className={`sidebar${isNavigationOpen ? " sidebar-open" : ""}`} aria-label="Workspace navigation">
        <div className="brand"><span className="brand-mark" aria-hidden="true">L</span>Lockin Board</div>
        <nav className="navigation"><p className="nav-label">Pages</p>{(["main", "calendar", "pomodoro", "kanban"] as Page[]).map((page) => <a className={`nav-item${activePage === page ? " nav-item-selected" : ""}`} href={page === "main" ? window.location.pathname : `#${page}`} key={page} onClick={(event) => { if (page === "main") { event.preventDefault(); window.history.pushState(null, "", window.location.pathname); } setActivePage(page); setIsNavigationOpen(false); }}><span aria-hidden="true">{page === "main" ? "⌂" : page === "calendar" ? "□" : page === "pomodoro" ? "◷" : "▤"}</span>{page[0].toUpperCase() + page.slice(1)}{page === "main" && <b>{mainTasks.length}</b>}</a>)}<a className={`nav-item${activePage === "completed" ? " nav-item-selected" : ""}`} href="#completed" onClick={() => { setActivePage("completed"); setIsNavigationOpen(false); }}><span aria-hidden="true">✓</span>Completed<b>{completedTasks.length || ""}</b></a><p className="nav-label folders-label">Folders <button type="button" aria-label="Add folder" onClick={() => setIsCreatingFolder(true)}>+</button></p>{isCreatingFolder && <form className="folder-creator" onSubmit={(event) => { event.preventDefault(); addFolder(); }}><input aria-label="Folder name" autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setIsCreatingFolder(false); }} placeholder="Folder name" /><button type="submit">Add</button></form>}{folders.map((folder) => <a className="nav-item nav-folder-item" href={`#folder-${folder.id}`} key={folder.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-lockin-folder", folder.id); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); reorderFolders(event.dataTransfer.getData("application/x-lockin-folder"), folder.id); }}><span className="folder-nav-dot" style={{ background: folder.color }} aria-hidden="true" />{folder.name}<b>{activeTasks.filter((task) => task.destination === folder.id).length || ""}</b><em aria-hidden="true">⠿</em></a>)}<section className="data-panel" aria-label="Data and backups"><p className="nav-label">Data</p><p className="storage-status" aria-live="polite">{storageStatus}</p><div><button type="button" onClick={exportBackup}>Export backup</button><button type="button" onClick={() => backupInputRef.current?.click()}>Restore backup</button><button className="clear-workspace-button" type="button" onClick={() => { void clearCurrentWorkspace(); }}>Clear workspace</button></div><input ref={backupInputRef} className="backup-input" type="file" accept="application/json,.json" onChange={(event) => { void restoreBackup(event.target.files?.[0]); }} /></section></nav>
      </aside>

      <main className="workspace" id="main"><header className="utility-bar"><button className="mobile-menu-button" type="button" aria-label="Open navigation" aria-expanded={isNavigationOpen} onClick={(event) => { event.stopPropagation(); setIsNavigationOpen(!isNavigationOpen); }}><span /><span /><span /></button><div className="timer" aria-label="Pomodoro timer"><span className="timer-dot" aria-hidden="true" /><span>Focus</span><strong>{formatRemaining(pomodoroSeconds)}</strong><button type="button" aria-label={isPomodoroRunning ? "Pause timer" : "Start timer"} onClick={isPomodoroRunning ? pausePomodoro : startPomodoro}>{isPomodoroRunning ? "Ⅱ" : "▶"}</button></div></header>
        {activePage === "main" ? <><section className="board-heading" aria-labelledby="board-title"><div><p className="eyebrow">Your board</p><h1 id="board-title">Main</h1><p className="board-description">All unassigned tasks live here until you move them into a folder.</p></div><button className="primary-action" type="button" onClick={() => setIsTaskComposerOpen(true)}>+ New task <kbd>N</kbd></button></section>
        <section className="main-overview" aria-label="Main overview"><section className="urgent-section" aria-labelledby="urgent-title"><header><div><p className="eyebrow">Up next</p><h2 id="urgent-title">On your calendar</h2></div><div className="urgent-heading-actions"><button className="urgent-repeat-filter" type="button" aria-pressed={showAllRecurringUpNext} onClick={() => setShowAllRecurringUpNext((current) => !current)}>{showAllRecurringUpNext ? "All repeats" : "Next repeat only"}</button><span>{urgentTasks.length}</span></div></header><div className="urgent-list">{urgentTasks.length ? urgentTasks.map(({ entry, task }, index) => <article className="urgent-task" key={entry.id}><span className={`task-accent task-accent-${task.tone}`} aria-hidden="true" /><div><h3>{task.title}</h3><p>{index === 0 ? "Next · " : ""}{formatScheduledAt(entry.scheduledAt)}</p></div><button className="urgent-arrow" type="button" aria-label={`Open ${task.title} in calendar`} onClick={() => openCalendarEntry(entry)}>→</button></article>) : <p className="overview-empty">Schedule a task in Week view to see it here.</p>}</div></section><section className="calendar-section main-month-section" id="calendar" aria-labelledby="calendar-title"><header><div><p className="eyebrow">This month</p><h2 id="calendar-title">{mainCalendarMonthLabel}</h2></div></header><div className="main-month-calendar" aria-label={`Scheduled tasks for ${mainCalendarMonthLabel}`}><div className="main-month-weekdays" aria-hidden="true">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>{mainMonthDays.map((day) => <div className={`main-month-day${day.inMonth ? "" : " main-month-day-muted"}`} key={day.key}><span>{day.day}</span><div className="main-month-dots">{activeScheduledTasks.filter(({ entry }) => entry.scheduledAt.startsWith(day.key)).map(({ entry, task }) => <span className="main-calendar-dot" style={{ "--task-folder-color": calendarTaskColor(task) } as CSSProperties} role="img" aria-label={`Scheduled: ${task.title}`} key={entry.id} />)}</div></div>)}</div></section></section>
        <section className="folder-section" aria-labelledby="folders-title"><div><p className="eyebrow">Folders</p><h2 id="folders-title">Put tasks where they belong</h2><p>Drag a task into a folder to organise it.</p></div><div className="folder-grid">{folders.map((folder) => { const folderTasks = activeTasks.filter((task) => task.destination === folder.id); return <section className="folder-dropzone" id={`folder-${folder.id}`} key={folder.id} style={{ "--folder-color": folder.color } as CSSProperties} onClick={(event) => event.stopPropagation()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOn(event, folder.id)} aria-label={`Move task into ${folder.name}`}><header><h3>{folder.name}</h3><span>{folderTasks.length}</span><button className="folder-menu-button" type="button" aria-label={`Actions for ${folder.name}`} aria-expanded={openFolderMenu === folder.id} onClick={() => { setOpenFolderMenu(openFolderMenu === folder.id ? null : folder.id); setIsRenamingFolder(false); setRenameValue(folder.name); }}>•••</button></header>{openFolderMenu === folder.id && <div className="folder-menu" role="menu"><button type="button" onClick={() => setIsRenamingFolder(!isRenamingFolder)}>Rename</button>{isRenamingFolder && <form onSubmit={(event) => { event.preventDefault(); renameFolder(folder.id); }}><input aria-label="Folder name" autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} /><button type="submit">Save</button></form>}<label className="folder-color-control">Color <input type="color" value={folder.color} onChange={(event) => updateFolderColor(folder.id, event.target.value)} /></label><button className="folder-remove-button" type="button" onClick={() => removeFolder(folder)}>Remove folder</button></div>}{folderTasks.length > 0 ? <div className="folder-task-list">{folderTasks.map(taskCard)}</div> : <p>Drop a task here</p>}</section>; })}</div></section>
        <section className="main-task-section" aria-labelledby="tasks-title" onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOn(event, "Main")}><div className="main-task-header"><div><p className="eyebrow">Unassigned tasks</p><h2 id="tasks-title">Everything waiting in Main</h2></div><button className="add-task" type="button" onClick={() => setIsTaskComposerOpen(true)}>+ Add task</button></div><div className="main-task-list">{mainTasks.map(taskCard)}</div></section></> : null}
        {activePage === "calendar" && (
          <section className="calendar-page" aria-labelledby="calendar-page-title">
            <header className="calendar-page-header">
              <div><p className="eyebrow">Plan your time</p><h1 id="calendar-page-title">Calendar</h1></div>
              <div className="calendar-page-actions"><div className="calendar-nav" aria-label="Change calendar period"><button type="button" aria-label={`Previous ${calendarPeriodName}`} onClick={() => shiftCalendarDate(-1)}>‹ Prev</button><button className="calendar-nav-today" type="button" onClick={() => setCalendarDate(new Date())}>Today</button><span aria-live="polite">{calendarPeriodLabel}</span><button type="button" aria-label={`Next ${calendarPeriodName}`} onClick={() => shiftCalendarDate(1)}>Next ›</button></div>
                <div className="calendar-view-switch" role="tablist" aria-label="Calendar view">{(["week", "month", "year"] as CalendarView[]).map((view) => <button type="button" role="tab" aria-selected={calendarView === view} key={view} onClick={() => setCalendarView(view)}>{view[0].toUpperCase() + view.slice(1)}</button>)}</div>
              </div>
            </header>
            <div className={`calendar-workspace${isCalendarTrayOpen ? " calendar-workspace-tray-open" : ""}`}>
              {isCalendarTrayOpen && <aside className="calendar-tray" aria-label="Tasks to schedule">
                {calendarTrayFolder === null ? <>
                  <h2>Task folders</h2><p>Choose a folder to schedule tasks, or drop a scheduled task here to return it.</p>
                  <button type="button" onClick={() => setCalendarTrayFolder("Main")} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOn(event, "Main")}>Main <span>{mainTasks.length}</span></button>
                  {folders.map((folder) => <button type="button" key={folder.id} onClick={() => setCalendarTrayFolder(folder.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOn(event, folder.id)}><i style={{ background: folder.color }} />{folder.name} <span>{activeTasks.filter((task) => task.destination === folder.id).length}</span></button>)}
                </> : <>
                  <button className="calendar-tray-back" type="button" onClick={() => setCalendarTrayFolder(null)}>← Back to folders</button>
                  <h2>{calendarTrayFolder === "Main" ? "Main" : folders.find((folder) => folder.id === calendarTrayFolder)?.name}</h2>
                  <p>{calendarView === "week" ? "Drag a task into a slot. Set a repeat here before scheduling to create its upcoming calendar series." : "Switch to Week view to add a task to the calendar."}</p>
                  <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOn(event, calendarTrayFolder)}>{calendarTrayTasks.map((task) => <article className={`calendar-task${calendarView === "week" ? "" : " calendar-task-disabled"}`} key={task.id} style={{ "--task-folder-color": calendarTaskColor(task) } as CSSProperties} draggable={calendarView === "week"} aria-disabled={calendarView !== "week"} onDragStart={(event) => dragTaskStart(event, task.id)}><strong>{task.title}</strong><span>{task.detail}</span><label className="calendar-repeat-control" onClick={(event) => event.stopPropagation()}>Repeat<select aria-label={`Repeat ${task.title}`} value={task.mode === "recurring" ? task.recurrence ?? "weekly" : "none"} onChange={(event) => setCalendarTaskRecurrence(task.id, event.target.value as Recurrence | "none")}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label></article>)}</div>
                </>}
              </aside>}
              <section className="calendar-canvas">{calendarView !== "week" && <button className="calendar-task-toggle calendar-canvas-task-toggle" type="button" aria-label="Open task folders" title="Tasks to schedule" aria-expanded={isCalendarTrayOpen} onClick={toggleCalendarTray}><span /><span /><span /></button>}
                {calendarView === "week" && <div className="week-calendar" ref={weekCalendarRef} style={{ "--visible-days": visibleWeekDays.length } as CSSProperties}>
                  <div className="week-corner"><button className="calendar-task-toggle" type="button" aria-label="Open task folders" title="Tasks to schedule" aria-expanded={isCalendarTrayOpen} onClick={toggleCalendarTray}><span /><span /><span /></button></div>
                  {visibleWeekDays.map((day) => <div className="week-day-label" key={day.key}>{day.label}<b>{day.day}</b></div>)}
                  {calendarHours.map((hour) => <Fragment key={hour}>
                    <div className="hour-label">{String(hour).padStart(2, "0")}:00</div>
                    {visibleWeekDays.map((day) => {
                      const scheduledAt = `${day.key}T${String(hour).padStart(2, "0")}:00`;
                      return <div className="hour-slot" key={scheduledAt} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDrop={(event) => { event.preventDefault(); const taskId = getDraggedTaskId(event); const entryId = getDraggedCalendarEntryId(event); if (taskId) scheduleTask(taskId, day.key, hour); if (entryId) moveCalendarEntry(entryId, day.key, hour); }}>
                        {[...scheduledTasks.filter(({ entry }) => entry.scheduledAt === scheduledAt), ...recurringTasksForSlot(scheduledAt)].filter(({ entry }, index, entries) => entries.findIndex((candidate) => candidate.entry.taskId === entry.taskId && candidate.entry.scheduledAt === entry.scheduledAt) === index).map(({ entry, task }) => <article className={`scheduled-event${highlightedCalendarEntryId === entry.id ? " scheduled-event-highlighted" : ""}${entry.status === "completed" || task.status === "completed" ? " scheduled-event-completed" : ""}`} style={{ "--task-folder-color": calendarTaskColor(task) } as CSSProperties} draggable={entry.status === "scheduled" && task.status === "active" && !entry.id.startsWith("recurring:")} onDragStart={(event) => dragCalendarEntryStart(event, entry.id)} key={entry.id}><strong>{task.title}</strong><footer><span>{calendarEntryCountdown(entry)}</span>{entry.status === "scheduled" && task.status === "active" ? <button type="button" aria-label={`Complete ${task.title}`} onClick={(event) => { event.stopPropagation(); completeCalendarEntry(entry); }}>✓</button> : task.mode !== "recurring" && <button type="button" aria-label={`Reopen ${task.title}`} title="Reopen calendar block" onClick={(event) => { event.stopPropagation(); reopenCalendarEntry(entry, task); }}>↺</button>}</footer></article>)}
                      </div>;
                    })}
                  </Fragment>)}
                </div>}
                {calendarView === "month" && <div className="month-calendar">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <b key={day}>{day}</b>)}
                  {monthDays.map((day) => <div className={`month-day${day.inMonth ? "" : " month-day-muted"}`} key={day.key} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); const entryId = getDraggedCalendarEntryId(event); if (entryId) moveCalendarEntry(entryId, day.key, 9); }}>
                    <span>{day.day}</span>
                    {scheduledTasks.filter(({ entry }) => entry.scheduledAt.startsWith(day.key)).map(({ entry, task }) => <article className={`scheduled-event${entry.status === "completed" || task.status === "completed" ? " scheduled-event-completed" : ""}`} style={{ "--task-folder-color": calendarTaskColor(task) } as CSSProperties} draggable={entry.status === "scheduled" && task.status === "active" && !entry.id.startsWith("recurring:")} onDragStart={(event) => dragCalendarEntryStart(event, entry.id)} key={entry.id}><strong>{task.title}</strong><footer><span>{calendarEntryCountdown(entry)}</span>{entry.status === "scheduled" && task.status === "active" ? <button type="button" aria-label={`Complete ${task.title}`} onClick={(event) => { event.stopPropagation(); completeCalendarEntry(entry); }}>✓</button> : task.mode !== "recurring" && <button type="button" aria-label={`Reopen ${task.title}`} title="Reopen calendar block" onClick={(event) => { event.stopPropagation(); reopenCalendarEntry(entry, task); }}>↺</button>}</footer></article>)}
                  </div>)}
                </div>}
                {calendarView === "year" && <div className="year-calendar">{yearMonths.map((month) => {
                  const name = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(month);
                  const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
                  const count = scheduledTasks.filter(({ entry }) => entry.scheduledAt.startsWith(prefix)).length;
                  return <div key={name}><h2>{name}</h2><p>{count} {count === 1 ? "task" : "tasks"}</p></div>;
                })}</div>}
              </section>
            </div>
          </section>
        )}
        {activePage === "pomodoro" && <section className="pomodoro-page" aria-labelledby="pomodoro-title"><header className="pomodoro-heading"><div><p className="eyebrow">Focus with intent</p><h1 id="pomodoro-title">Pomodoro</h1><p>Each completed session is linked to the task you choose.</p></div><span>{focusSessions.length} sessions today</span></header><div className="pomodoro-layout"><section className="pomodoro-clock" aria-label="Focus timer"><p>Focus session</p><strong>{formatRemaining(pomodoroSeconds)}</strong><p>{selectedPomodoroTask ? selectedPomodoroTask.title : "Choose a task to link this session"}</p><label className="pomodoro-duration-control">Focus length <input aria-label="Focus length in minutes" type="number" min="1" max="240" value={pomodoroDurationMinutes} disabled={isPomodoroRunning} onChange={(event) => setPomodoroDuration(Number(event.target.value))} /><span>min</span></label><div><button className="primary-action" type="button" onClick={isPomodoroRunning ? pausePomodoro : startPomodoro}>{isPomodoroRunning ? "Pause" : "Start focus"}</button><button className="pomodoro-reset" type="button" onClick={resetPomodoro}>Reset</button></div></section><aside className="pomodoro-task-panel"><p className="eyebrow">Linked task</p><h2>What are you focusing on?</h2><select aria-label="Focus task" value={selectedPomodoroTask?.id ?? ""} onChange={(event) => setSelectedPomodoroTaskId(event.target.value || null)}><option value="">No task</option>{activeTasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select>{selectedPomodoroTask ? <div className="pomodoro-task-summary"><h3>{selectedPomodoroTask.title}</h3><p>{modeLabel(selectedPomodoroTask)}{selectedPomodoroTask.dueDate ? ` · Due ${formatDueDate(selectedPomodoroTask.dueDate)}` : ""}</p>{activePomodoroEntry ? <p className="pomodoro-calendar-link">Calendar now · {calendarEntryCountdown(activePomodoroEntry.entry)}</p> : <p>No active calendar block.</p>}<p className="pomodoro-kanban-note">Starting focus moves this task to Doing in Kanban.</p><button className="task-complete-button" type="button" onClick={() => completeTask(selectedPomodoroTask)}>{selectedPomodoroTask.mode === "recurring" ? "Complete occurrence" : "Complete task"}</button></div> : <p className="pomodoro-empty">Choose any active task. The timer can also run unlinked.</p>}</aside></div></section>}
        {activePage === "kanban" && <section className="kanban-page" aria-labelledby="kanban-title"><header className="kanban-heading"><div><p className="eyebrow">Task flow</p><h1 id="kanban-title">Kanban</h1><p>Move active tasks between stages; completed tasks are archived separately.</p></div></header><div className="kanban-board">{(["To do", "Doing", "Done"] as Column[]).map((column) => <section className="kanban-column" key={column} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const taskId = getDraggedTaskId(event); if (taskId) moveTaskColumn(taskId, column); }}><header><h2>{column}</h2><span>{activeTasks.filter((task) => task.column === column).length}</span></header><div>{activeTasks.filter((task) => task.column === column).map(taskCard)}</div></section>)}</div></section>}
        {activePage === "completed" && <section className="completed-page" aria-labelledby="completed-title"><header><div><p className="eyebrow">Daily progress & archive</p><h1 id="completed-title">Completed</h1><p>See today’s scheduled work separately from tasks that are permanently complete.</p></div><span>{completedTasks.length}</span></header><section className="today-completed-section" aria-labelledby="today-schedule-title"><header><div><p className="eyebrow">Today</p><h2 id="today-schedule-title">Today’s schedule</h2></div><span>{todayCalendarTasks.length}</span></header>{todayCalendarTasks.length ? <div className="today-completed-list">{todayCalendarTasks.map(({ entry, task }) => { const isComplete = entry.status === "completed" || task.status === "completed"; const folder = folders.find((candidate) => candidate.id === task.destination); return <article className={`today-completed-task${isComplete ? " today-completed-task-done" : ""}`} style={{ "--task-folder-color": folder?.color ?? "#a1a1aa" } as CSSProperties} key={entry.id}><time dateTime={entry.scheduledAt}>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(entry.scheduledAt))}</time><div><h3>{task.title}</h3><p>{task.destination === "Main" ? "Main" : folder?.name ?? "Removed folder"} · {modeLabel(task)}</p></div><strong>{isComplete ? "Completed" : "Scheduled"}</strong></article>; })}</div> : <p className="completed-empty">Nothing is scheduled in the calendar for today.</p>}</section><section className="permanent-completed-section" aria-labelledby="permanent-completed-title"><header><div><p className="eyebrow">Archive</p><h2 id="permanent-completed-title">Permanently completed</h2></div><span>{completedTasks.length}</span></header>{completedTasks.length ? <div className="completed-list">{completedTasks.map((task) => <article className="completed-task" key={task.id}><div><h3>{task.title}</h3><p>{modeLabel(task)} · {task.destination === "Main" ? "Main" : folders.find((folder) => folder.id === task.destination)?.name ?? "Removed folder"}{task.completedAt ? ` · Completed ${formatScheduledAt(task.completedAt)}` : ""}</p></div><div><button className="task-edit-button" type="button" onClick={() => restoreTask(task.id)}>Restore</button><button className="task-delete-button" type="button" aria-label={`Delete ${task.title}`} title="Delete task" onClick={() => deleteTask(task)}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="m6 7 1 13h10l1-13" /><path d="M10 11v5" /><path d="M14 11v5" /></svg></button></div></article>)}</div> : <p className="completed-empty">One-time and deadline tasks you complete will stay here until you restore or delete them.</p>}</section></section>}
      </main>
      {isTaskComposerOpen && <div className="dialog-backdrop" role="presentation" onClick={() => setIsTaskComposerOpen(false)}><form className="task-composer" aria-label="Create task" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); addTask(); }}><p className="eyebrow">New task</p><h2>Add to Main</h2><label htmlFor="task-title">Task title</label><textarea id="task-title" rows={2} autoFocus required value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setIsTaskComposerOpen(false); }} placeholder="What needs doing?" /><label htmlFor="task-note">Note</label><textarea id="task-note" rows={2} value={taskNote} onChange={(event) => setTaskNote(event.target.value)} placeholder="Optional note" /><label htmlFor="task-mode">Task type</label><select id="task-mode" value={taskMode} onChange={(event) => setTaskMode(event.target.value as TaskMode)}><option value="one-time">One-time</option><option value="deadline">Deadline</option></select>{taskMode === "deadline" && <><label htmlFor="task-deadline">Deadline date</label><input id="task-deadline" type="date" required value={taskDeadline} onChange={(event) => setTaskDeadline(event.target.value)} /><label htmlFor="task-deadline-hour">Deadline hour</label><select id="task-deadline-hour" value={taskDeadlineHour} onChange={(event) => setTaskDeadlineHour(Number(event.target.value))}>{scheduleHours.map((hour) => <option value={hour} key={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></>}<div><button className="cancel-button" type="button" onClick={() => setIsTaskComposerOpen(false)}>Cancel</button><button className="primary-action" type="submit">Create task</button></div></form></div>}
      {editingTaskId && <div className="dialog-backdrop" role="presentation" onClick={() => setEditingTaskId(null)}><form className="task-composer" aria-label="Edit task" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); saveTask(); }}><p className="eyebrow">Task details</p><h2>Edit task</h2><label htmlFor="edit-task-title">Task title</label><textarea id="edit-task-title" rows={2} autoFocus required value={editTaskTitle} onChange={(event) => setEditTaskTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setEditingTaskId(null); }} /><label htmlFor="edit-task-note">Note</label><textarea id="edit-task-note" rows={2} value={editTaskNote} onChange={(event) => setEditTaskNote(event.target.value)} placeholder="Optional note" />{tasks.find((task) => task.id === editingTaskId)?.mode === "recurring" ? <p className="task-repeat-note">Repeat timing is managed in Calendar.</p> : <><label htmlFor="edit-task-mode">Task type</label><select id="edit-task-mode" value={editTaskMode} onChange={(event) => setEditTaskMode(event.target.value as TaskMode)}><option value="one-time">One-time</option><option value="deadline">Deadline</option></select>{editTaskMode === "deadline" && <><label htmlFor="edit-task-deadline">Deadline date</label><input id="edit-task-deadline" type="date" required value={editTaskDeadline} onChange={(event) => setEditTaskDeadline(event.target.value)} /><label htmlFor="edit-task-deadline-hour">Deadline hour</label><select id="edit-task-deadline-hour" value={editTaskDeadlineHour} onChange={(event) => setEditTaskDeadlineHour(Number(event.target.value))}>{scheduleHours.map((hour) => <option value={hour} key={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></>}</>}<div><button className="cancel-button" type="button" onClick={() => setEditingTaskId(null)}>Cancel</button><button className="primary-action" type="submit">Save task</button></div></form></div>}
    </div>
  );
}
