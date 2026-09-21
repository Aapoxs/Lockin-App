import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import {
  clearWorkspace,
  loadWorkspace,
  requestPersistentStorage,
  saveWorkspace,
  type StoredWorkspace,
} from "../lib/workspaceStorage";
import {
  advanceRecurringDate,
  calendarEntryRecurrence,
  calendarSeriesKey,
  groupCalendarEntriesBySeries,
  isWithinRepeatLimit,
  normalizeScheduledAt,
  startOfWeek,
  toDateKey,
} from "./calendar/calendarUtils";
import {
  canScheduleTaskAt as canScheduleTaskInEntries,
  createCalendarEntries,
} from "./calendar/calendarScheduling";
import {
  buildProjectedRecurringTasks,
  buildStoredScheduledTasks,
  getRecurringTasksForSlot,
} from "./calendar/calendarProjection";
import { CalendarEntryMenu } from "./calendar/CalendarEntryMenu";
import { CalendarScheduledEvent } from "./calendar/CalendarScheduledEvent";
import { CalendarTray } from "./calendar/CalendarTray";
import { FolderCard } from "./components/FolderCard";
import { FolderGroupPanel } from "./components/FolderGroupPanel";
import { CalendarHeader } from "./components/CalendarHeader";
import { MainOverview } from "./components/MainOverview";
import { KanbanPage } from "./components/KanbanPage";
import { PageIcon } from "./components/PageIcon";
import { PomodoroPage } from "./components/PomodoroPage";
import { SidebarFolderItem } from "./components/SidebarFolderItem";
import { loadPomodoro, POMODORO_STORAGE_KEY } from "./pomodoro/pomodoroStorage";
import { TaskCard } from "./components/TaskCard";
import { UtilityBar } from "./components/UtilityBar";
import {
  folderGroups,
  maxTaskNoteLength,
  maxTaskTitleLength,
} from "./workspace/workspaceConstants";
import {
  formatCalendarRemaining,
  formatDueDate,
  formatRemaining,
  formatScheduledAt,
  isDueDateWithinNextTwoMonths,
  taskModeLabel,
} from "./workspace/workspaceFormatters";
import { isHexColor, migrateWorkspaceSnapshot } from "./workspace/workspaceValidation";
import type {
  CalendarEntry,
  CalendarView,
  Column,
  Destination,
  Folder,
  FolderGroup,
  FocusSession,
  Page,
  Recurrence,
  RepeatLimit,
  StoredPomodoro,
  Task,
  TaskMode,
  WorkspaceSnapshot,
} from "./workspace/workspaceTypes";

const initialFolders: Folder[] = [];
const initialTasks: Task[] = [];
const themePresets = [
  { id: "midnight", label: "Midnight", main: "#09090b", text: "#ffffff" },
  { id: "paper", label: "Paper", main: "#ffffff", text: "#09090b" },
  { id: "ocean", label: "Ocean", main: "#0f172a", text: "#e0f2fe" },
  { id: "forest", label: "Forest", main: "#10251d", text: "#ecfdf5" },
  { id: "plum", label: "Plum", main: "#25152e", text: "#fae8ff" },
  { id: "aquamarine", label: "Aquamarine", main: "#7fffd4", text: "#062b25" },
] as const;

const isLightTheme = (color: string) => {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 > 160;
};

const normalizeTaskTitle = (value: string) =>
  value.replace(/\s*[\r\n]+\s*/g, " ").slice(0, maxTaskTitleLength);

const normalizeTaskNote = (value: string) =>
  value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .slice(0, 2)
    .join("\n")
    .slice(0, maxTaskNoteLength);

export function WorkspacePreview() {
  // Workspace and navigation state
  const [tasks, setTasks] = useState(initialTasks);
  const [calendarEntries, setCalendarEntries] = useState<CalendarEntry[]>([]);
  const [folders, setFolders] = useState(initialFolders);
  const [activePage, setActivePage] = useState<Page>("main");
  const [calendarView, setCalendarView] = useState<CalendarView>("week");
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [highlightedCalendarEntryId, setHighlightedCalendarEntryId] = useState<
    string | null
  >(null);
  const [isCalendarTrayOpen, setIsCalendarTrayOpen] = useState(false);
  const [calendarTrayFolder, setCalendarTrayFolder] = useState<Destination | null>(null);
  const [visibleWeekDayCount, setVisibleWeekDayCount] = useState(7);
  const [openFolderMenu, setOpenFolderMenu] = useState<string | null>(null);
  const [collapsedFolderGroups, setCollapsedFolderGroups] = useState<Set<FolderGroup>>(
    () => new Set(),
  );
  const [folderGroupButtonFlash, setFolderGroupButtonFlash] =
    useState<FolderGroup | null>(null);
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [folderCreationLocation, setFolderCreationLocation] = useState<
    "sidebar" | "main" | null
  >(null);
  const [folderName, setFolderName] = useState("");

  // Task composer and editor state
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
  const [editTaskDeadline, setEditTaskDeadline] = useState("");
  const [editTaskDeadlineHour, setEditTaskDeadlineHour] = useState(9);

  // Interaction and drag-and-drop state
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [openCalendarEntryMenuId, setOpenCalendarEntryMenuId] = useState<string | null>(
    null,
  );

  // Pomodoro, preferences, and persistence state
  const [now, setNow] = useState(() => new Date());
  const initialPomodoro = useRef(loadPomodoro()).current;
  const [pomodoroDurationMinutes, setPomodoroDurationMinutes] = useState(
    initialPomodoro.durationMinutes,
  );
  const [pomodoroSeconds, setPomodoroSeconds] = useState(
    initialPomodoro.remainingSeconds,
  );
  const [pomodoroEndsAt, setPomodoroEndsAt] = useState<string | null>(
    initialPomodoro.endsAt,
  );
  const [isPomodoroRunning, setIsPomodoroRunning] = useState(
    Boolean(initialPomodoro.endsAt),
  );
  const [selectedPomodoroTaskId, setSelectedPomodoroTaskId] = useState<string | null>(
    initialPomodoro.selectedTaskId,
  );
  const [pomodoroQueueTaskIds, setPomodoroQueueTaskIds] = useState(
    initialPomodoro.queueTaskIds,
  );
  const [arePomodoroBreaksEnabled, setArePomodoroBreaksEnabled] = useState(
    initialPomodoro.breaksEnabled,
  );
  const [pomodoroBreakMinutes, setPomodoroBreakMinutes] = useState(
    initialPomodoro.breakMinutes,
  );
  const [isPomodoroBreak, setIsPomodoroBreak] = useState(initialPomodoro.isBreakSession);
  const [isAutomaticPomodoroQueueEnabled, setIsAutomaticPomodoroQueueEnabled] = useState(
    initialPomodoro.isAutomaticQueueEnabled,
  );
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [showAllRecurringUpNext, setShowAllRecurringUpNext] = useState(false);
  const [themeMain, setThemeMain] = useState("#09090b");
  const [themeText, setThemeText] = useState("#ffffff");
  const [isWorkspaceReady, setIsWorkspaceReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState("Opening local workspace…");
  const backupInputRef = useRef<HTMLInputElement>(null);
  const weekCalendarRef = useRef<HTMLDivElement>(null);
  const draggedTaskIdRef = useRef<string | null>(null);
  const folderGroupButtonFlashTimer = useRef<number | null>(null);

  // Load and persist the local workspace
  useEffect(() => {
    let isActive = true;
    void Promise.all([loadWorkspace(), requestPersistentStorage()])
      .then(([workspace, persistent]) => {
        if (!isActive) return;
        const snapshot = workspace?.snapshot as Partial<WorkspaceSnapshot> | undefined;
        if (Array.isArray(snapshot?.tasks)) setTasks(snapshot.tasks);
        if (Array.isArray(snapshot?.folders)) setFolders(snapshot.folders);
        if (Array.isArray(snapshot?.calendarEntries))
          setCalendarEntries(
            snapshot.calendarEntries.map((entry) => ({
              ...entry,
              scheduledAt: normalizeScheduledAt(entry.scheduledAt),
            })),
          );
        if (Array.isArray(snapshot?.focusSessions))
          setFocusSessions(snapshot.focusSessions);
        if (snapshot?.pomodoro) {
          setPomodoroDurationMinutes(snapshot.pomodoro.durationMinutes);
          setPomodoroSeconds(snapshot.pomodoro.remainingSeconds);
          setPomodoroEndsAt(snapshot.pomodoro.endsAt);
          setSelectedPomodoroTaskId(snapshot.pomodoro.selectedTaskId);
          setPomodoroQueueTaskIds(snapshot.pomodoro.queueTaskIds);
          setArePomodoroBreaksEnabled(snapshot.pomodoro.breaksEnabled);
          setPomodoroBreakMinutes(snapshot.pomodoro.breakMinutes);
          setIsPomodoroBreak(snapshot.pomodoro.isBreakSession);
          setIsAutomaticPomodoroQueueEnabled(snapshot.pomodoro.isAutomaticQueueEnabled);
          setIsPomodoroRunning(Boolean(snapshot.pomodoro.endsAt));
        }
        const preferences = snapshot?.preferences;
        if (typeof preferences?.showAllRecurringUpNext === "boolean")
          setShowAllRecurringUpNext(preferences.showAllRecurringUpNext);
        const savedThemeMain = preferences?.themeMain;
        const savedThemeText = preferences?.themeText;
        if (isHexColor(savedThemeMain)) setThemeMain(savedThemeMain);
        if (isHexColor(savedThemeText)) setThemeText(savedThemeText);
        setStorageStatus(
          persistent === true
            ? "Saved locally · protected from automatic cleanup"
            : "Saved locally · export backups regularly",
        );
      })
      .catch(() => {
        if (isActive)
          setStorageStatus(
            "Local storage is unavailable — restore or browser settings may need attention",
          );
      })
      .finally(() => {
        if (isActive) setIsWorkspaceReady(true);
      });
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (folderGroupButtonFlashTimer.current !== null)
        window.clearTimeout(folderGroupButtonFlashTimer.current);
    },
    [],
  );

  // Keep the sidebar's visible/hidden state when the viewport crosses the drawer breakpoint.
  useEffect(() => {
    const mobileViewport = window.matchMedia("(max-width: 1100px)");
    let wasMobile = mobileViewport.matches;
    const preserveSidebarState = () => {
      const isMobile = mobileViewport.matches;
      if (isMobile === wasMobile) return;
      if (isMobile) setIsNavigationOpen(!isSidebarCollapsed);
      else setIsSidebarCollapsed(!isNavigationOpen);
      wasMobile = isMobile;
    };
    mobileViewport.addEventListener("change", preserveSidebarState);
    return () => mobileViewport.removeEventListener("change", preserveSidebarState);
  }, [isNavigationOpen, isSidebarCollapsed]);

  useEffect(() => {
    if (!isWorkspaceReady) return;
    const saveTimer = window.setTimeout(() => {
      const snapshot: WorkspaceSnapshot = {
        tasks,
        folders,
        calendarEntries,
        focusSessions,
        preferences: { showAllRecurringUpNext, themeMain, themeText },
        pomodoro: {
          durationMinutes: pomodoroDurationMinutes,
          remainingSeconds: pomodoroSeconds,
          endsAt: pomodoroEndsAt,
          selectedTaskId: selectedPomodoroTaskId,
          queueTaskIds: pomodoroQueueTaskIds,
          breaksEnabled: arePomodoroBreaksEnabled,
          breakMinutes: pomodoroBreakMinutes,
          isBreakSession: isPomodoroBreak,
          isAutomaticQueueEnabled: isAutomaticPomodoroQueueEnabled,
        },
      };
      void saveWorkspace(snapshot)
        .then(() =>
          setStorageStatus((status) =>
            status.startsWith("Local storage is unavailable") ? status : "Saved locally",
          ),
        )
        .catch(() =>
          setStorageStatus(
            "Local storage is unavailable — export a backup before closing",
          ),
        );
    }, 300);
    return () => window.clearTimeout(saveTimer);
  }, [
    calendarEntries,
    arePomodoroBreaksEnabled,
    focusSessions,
    folders,
    isWorkspaceReady,
    isAutomaticPomodoroQueueEnabled,
    isPomodoroBreak,
    pomodoroBreakMinutes,
    pomodoroDurationMinutes,
    pomodoroEndsAt,
    pomodoroQueueTaskIds,
    pomodoroSeconds,
    selectedPomodoroTaskId,
    showAllRecurringUpNext,
    tasks,
    themeMain,
    themeText,
  ]);

  // Keep recurring calendar series populated through the next year
  useEffect(() => {
    if (!isWorkspaceReady) return;
    const horizon = new Date(Math.max(Date.now(), calendarDate.getTime()));
    horizon.setFullYear(horizon.getFullYear() + 1);
    setCalendarEntries((current) => {
      const additions: CalendarEntry[] = [];
      tasks
        .filter((task) => task.status === "active")
        .forEach((task) => {
          const series = groupCalendarEntriesBySeries(
            current.filter((entry) => entry.taskId === task.id),
          );
          series.forEach((entries) => {
            const latest = [...entries]
              .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
              .at(-1);
            const recurrence = latest ? calendarEntryRecurrence(latest, task) : undefined;
            if (!latest || !recurrence) return;
            let occurrence = new Date(latest.scheduledAt);
            while (occurrence < horizon) {
              occurrence = advanceRecurringDate(occurrence, recurrence);
              const scheduledAt = `${toDateKey(occurrence)}T${String(occurrence.getHours()).padStart(2, "0")}:${String(occurrence.getMinutes()).padStart(2, "0")}`;
              if (!isWithinRepeatLimit(scheduledAt, latest.repeatUntil)) break;
              if (
                !current.some(
                  (entry) =>
                    calendarSeriesKey(entry) === calendarSeriesKey(latest) &&
                    normalizeScheduledAt(entry.scheduledAt) === scheduledAt,
                ) &&
                !additions.some(
                  (entry) =>
                    calendarSeriesKey(entry) === calendarSeriesKey(latest) &&
                    normalizeScheduledAt(entry.scheduledAt) === scheduledAt,
                )
              )
                additions.push({
                  id: crypto.randomUUID(),
                  taskId: task.id,
                  seriesId: latest.seriesId,
                  recurrence,
                  repeatUntil: latest.repeatUntil,
                  scheduledAt,
                  status: "scheduled",
                });
            }
          });
        });
      return additions.length ? [...current, ...additions] : current;
    });
  }, [calendarDate, calendarEntries, isWorkspaceReady, tasks]);

  // Live UI state and responsive calendar behavior
  useEffect(() => {
    if (activePage !== "calendar" && activePage !== "pomodoro") return;
    setNow(new Date());
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, [activePage]);

  useEffect(() => {
    if (activePage !== "calendar" || calendarView !== "week" || !weekCalendarRef.current)
      return;
    const calendar = weekCalendarRef.current;
    const updateVisibleDays = () => {
      const nextCount = Math.max(
        2,
        Math.min(7, Math.floor((calendar.clientWidth - 48) / 86)),
      );
      setVisibleWeekDayCount(nextCount);
      if (nextCount < 5) setIsCalendarTrayOpen(false);
    };
    updateVisibleDays();
    const observer = new ResizeObserver(updateVisibleDays);
    observer.observe(calendar);
    return () => observer.disconnect();
  }, [activePage, calendarView]);

  // Global interaction handlers
  useEffect(() => {
    const closeCalendarEntryMenu = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".calendar-event-settings")
      )
        return;
      setOpenCalendarEntryMenuId(null);
    };
    document.addEventListener("pointerdown", closeCalendarEntryMenu);
    return () => document.removeEventListener("pointerdown", closeCalendarEntryMenu);
  }, []);

  // Pomodoro clock lifecycle
  useEffect(() => {
    if (!isPomodoroRunning) return;
    const tick = () =>
      setPomodoroSeconds(
        Math.max(
          0,
          Math.ceil(
            ((pomodoroEndsAt ? new Date(pomodoroEndsAt).getTime() : Date.now()) -
              Date.now()) /
              1000,
          ),
        ),
      );
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [isPomodoroRunning, pomodoroEndsAt]);

  useEffect(() => {
    localStorage.setItem(
      POMODORO_STORAGE_KEY,
      JSON.stringify({
        durationMinutes: pomodoroDurationMinutes,
        remainingSeconds: pomodoroSeconds,
        endsAt: pomodoroEndsAt,
        selectedTaskId: selectedPomodoroTaskId,
        queueTaskIds: pomodoroQueueTaskIds,
        breaksEnabled: arePomodoroBreaksEnabled,
        breakMinutes: pomodoroBreakMinutes,
        isBreakSession: isPomodoroBreak,
        isAutomaticQueueEnabled: isAutomaticPomodoroQueueEnabled,
      } satisfies StoredPomodoro),
    );
  }, [
    arePomodoroBreaksEnabled,
    isPomodoroBreak,
    isAutomaticPomodoroQueueEnabled,
    pomodoroBreakMinutes,
    pomodoroDurationMinutes,
    pomodoroEndsAt,
    pomodoroQueueTaskIds,
    pomodoroSeconds,
    selectedPomodoroTaskId,
  ]);

  useEffect(() => {
    if (pomodoroSeconds !== 0 || !isPomodoroRunning) return;
    setIsPomodoroRunning(false);
    setPomodoroEndsAt(null);
    if (isPomodoroBreak) {
      setIsPomodoroBreak(false);
      setPomodoroSeconds(pomodoroDurationMinutes * 60);
      if (isAutomaticPomodoroQueueEnabled && pomodoroQueueTaskIds[0]) {
        setSelectedPomodoroTaskId(pomodoroQueueTaskIds[0]);
        setPomodoroQueueTaskIds((current) => current.slice(1));
      }
      return;
    }
    if (!selectedPomodoroTaskId) return;
    const completedAt = new Date();
    const activeEntry = calendarEntries.find(
      (entry) =>
        entry.taskId === selectedPomodoroTaskId &&
        entry.status === "scheduled" &&
        new Date(entry.scheduledAt) <= completedAt &&
        completedAt < new Date(new Date(entry.scheduledAt).getTime() + 60 * 60 * 1000),
    );
    setFocusSessions((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        taskId: selectedPomodoroTaskId,
        calendarEntryId: activeEntry?.id,
        completedAt: completedAt.toISOString(),
        duration: pomodoroDurationMinutes * 60,
      },
    ]);
    const remainingQueue = pomodoroQueueTaskIds.filter(
      (taskId) => taskId !== selectedPomodoroTaskId,
    );
    setPomodoroQueueTaskIds(remainingQueue);
    if (arePomodoroBreaksEnabled) {
      const breakSeconds = pomodoroBreakMinutes * 60;
      setPomodoroSeconds(breakSeconds);
      setPomodoroEndsAt(new Date(Date.now() + breakSeconds * 1000).toISOString());
      setIsPomodoroBreak(true);
      setIsPomodoroRunning(true);
    } else if (isAutomaticPomodoroQueueEnabled && remainingQueue[0]) {
      setSelectedPomodoroTaskId(remainingQueue[0]);
      setPomodoroQueueTaskIds(remainingQueue.slice(1));
    }
  }, [
    arePomodoroBreaksEnabled,
    pomodoroDurationMinutes,
    pomodoroBreakMinutes,
    pomodoroSeconds,
    isPomodoroRunning,
    isPomodoroBreak,
    isAutomaticPomodoroQueueEnabled,
    selectedPomodoroTaskId,
    calendarEntries,
    pomodoroQueueTaskIds,
  ]);

  // Calendar operations
  const moveTask = (taskId: string, destination: Destination) => {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, destination } : task)),
    );
  };
  const reorderTask = (movingTaskId: string, targetTaskId: string) => {
    if (!movingTaskId || movingTaskId === targetTaskId) return;
    setTasks((current) => {
      const movingTask = current.find((task) => task.id === movingTaskId);
      const targetTask = current.find((task) => task.id === targetTaskId);
      if (!movingTask || !targetTask) return current;
      const next = current.filter((task) => task.id !== movingTaskId);
      const targetIndex = next.findIndex((task) => task.id === targetTaskId);
      if (targetIndex < 0) return current;
      next.splice(targetIndex, 0, {
        ...movingTask,
        destination: targetTask.destination,
      });
      return next;
    });
  };

  const reorderFolders = (movingFolderId: string, targetFolderId: string) => {
    if (!movingFolderId || movingFolderId === targetFolderId) return;
    setFolders((current) => {
      const movingFolder = current.find((folder) => folder.id === movingFolderId);
      const next = current.filter((folder) => folder.id !== movingFolderId);
      const targetIndex = next.findIndex((folder) => folder.id === targetFolderId);
      if (!movingFolder || targetIndex < 0) return current;
      next.splice(targetIndex, 0, movingFolder);
      return next;
    });
  };

  const setCalendarTaskRecurrence = (taskId: string, recurrence: Recurrence | "none") => {
    const currentTask = tasks.find((task) => task.id === taskId);
    if (currentTask)
      setCalendarEntries((current) =>
        current.map((entry) =>
          entry.taskId === taskId && entry.recurrence === undefined
            ? {
                ...entry,
                recurrence:
                  currentTask.mode === "recurring" ? currentTask.recurrence : null,
              }
            : entry,
        ),
      );
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? recurrence === "none"
            ? {
                ...task,
                mode: "one-time",
                recurrence: undefined,
                repeatLimit: undefined,
                dueDate: undefined,
              }
            : {
                ...task,
                mode: "recurring",
                recurrence,
                repeatLimit: task.repeatLimit ?? "forever",
                dueDate: undefined,
              }
          : task,
      ),
    );
  };

  const setCalendarTaskRepeatLimit = (taskId: string, repeatLimit: RepeatLimit) => {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, repeatLimit } : task)),
    );
  };

  const canScheduleTaskAt = (
    taskId: string,
    scheduledAt: string,
    entries: CalendarEntry[],
  ) =>
    canScheduleTaskInEntries(
      tasks.find((candidate) => candidate.id === taskId),
      scheduledAt,
      entries,
    );

  const scheduleTask = (taskId: string, dateKey: string, hour: number) => {
    const scheduledAt = `${dateKey}T${String(hour).padStart(2, "0")}:00`;
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;
    setCalendarEntries((current) => {
      if (!canScheduleTaskAt(taskId, scheduledAt, current)) return current;
      return [...current, ...createCalendarEntries(task, scheduledAt, crypto.randomUUID)];
    });
  };

  const moveCalendarEntry = (entryId: string, dateKey: string, hour: number) => {
    const scheduledAt = `${dateKey}T${String(hour).padStart(2, "0")}:00`;
    setCalendarEntries((current) =>
      current.map((entry) => (entry.id === entryId ? { ...entry, scheduledAt } : entry)),
    );
  };

  const completeCalendarEntry = (entry: CalendarEntry) => {
    const storedEntry = calendarEntries.find((candidate) => candidate.id === entry.id);
    const task = tasks.find((candidate) => candidate.id === entry.taskId);
    if (!entry || !task || entry.status === "completed") return;
    if (calendarEntryRecurrence(entry, task)) {
      setCalendarEntries((current) =>
        storedEntry
          ? current.map((candidate) =>
              candidate.id === entry.id
                ? { ...candidate, status: "completed" as const }
                : candidate,
            )
          : [...current, { ...entry, id: crypto.randomUUID(), status: "completed" }],
      );
      setTasks((current) =>
        current.map((candidate) =>
          candidate.id === task.id
            ? {
                ...candidate,
                completedOccurrences: candidate.completedOccurrences + 1,
              }
            : candidate,
        ),
      );
      return;
    }
    setCalendarEntries((current) =>
      current.map((candidate) =>
        candidate.taskId === task.id ? { ...candidate, status: "completed" } : candidate,
      ),
    );
    setTasks((current) =>
      current.map((candidate) =>
        candidate.id === task.id
          ? {
              ...candidate,
              status: "completed",
              completedAt: new Date().toISOString(),
              column: "Done",
            }
          : candidate,
      ),
    );
  };

  const clearCalendarSlot = (entry: CalendarEntry, task: Task) => {
    if (
      !window.confirm(
        `Clear “${task.title}” from ${formatScheduledAt(entry.scheduledAt)}?`,
      )
    )
      return;
    const storedEntry = calendarEntries.find((candidate) => candidate.id === entry.id);
    setCalendarEntries((current) =>
      storedEntry
        ? current.map((candidate) =>
            candidate.id === entry.id
              ? { ...candidate, status: "cleared" as const }
              : candidate,
          )
        : [...current, { ...entry, id: crypto.randomUUID(), status: "cleared" }],
    );
    setOpenCalendarEntryMenuId(null);
  };

  const clearCalendarSeries = (entry: CalendarEntry, task: Task) => {
    if (!window.confirm(`Clear every repeat of “${task.title}”?`)) return;
    setCalendarEntries((current) =>
      current.filter(
        (candidate) => calendarSeriesKey(candidate) !== calendarSeriesKey(entry),
      ),
    );
    setOpenCalendarEntryMenuId(null);
  };

  const clearCalendar = () => {
    if (
      !window.confirm(
        "Clear every scheduled calendar entry and repeating series? Your tasks, folders, and focus history will remain.",
      )
    )
      return;
    setCalendarEntries([]);
    setOpenCalendarEntryMenuId(null);
  };

  // Task lifecycle and Pomodoro operations
  const completeTask = (task: Task) => {
    if (
      calendarEntries.some(
        (entry) => entry.taskId === task.id && calendarEntryRecurrence(entry, task),
      )
    ) {
      const nextOccurrence = calendarEntries
        .filter((entry) => entry.taskId === task.id && entry.status === "scheduled")
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
      if (nextOccurrence) completeCalendarEntry(nextOccurrence);
      else
        setTasks((current) =>
          current.map((candidate) =>
            candidate.id === task.id
              ? {
                  ...candidate,
                  completedOccurrences: candidate.completedOccurrences + 1,
                }
              : candidate,
          ),
        );
      return;
    }
    setCalendarEntries((current) =>
      current.map((entry) =>
        entry.taskId === task.id ? { ...entry, status: "completed" } : entry,
      ),
    );
    setTasks((current) =>
      current.map((candidate) =>
        candidate.id === task.id
          ? {
              ...candidate,
              status: "completed",
              completedAt: new Date().toISOString(),
              column: "Done",
            }
          : candidate,
      ),
    );
  };

  const restoreTask = (taskId: string) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: "active",
              completedAt: undefined,
              column: "To do",
            }
          : task,
      ),
    );
    setCalendarEntries((current) =>
      current.map((entry) =>
        entry.taskId === taskId ? { ...entry, status: "scheduled" } : entry,
      ),
    );
  };
  const reopenCalendarEntry = (entry: CalendarEntry, task: Task) => {
    if (task.status === "completed") {
      restoreTask(task.id);
      return;
    }
    setCalendarEntries((current) =>
      current.map((candidate) =>
        candidate.id === entry.id ? { ...candidate, status: "scheduled" } : candidate,
      ),
    );
  };
  const calendarEntryMenuProps = (entry: CalendarEntry, task: Task) => ({
    entry,
    task,
    isOpen: openCalendarEntryMenuId === entry.id,
    onToggle: () =>
      setOpenCalendarEntryMenuId((current) => (current === entry.id ? null : entry.id)),
    onComplete: () => {
      completeCalendarEntry(entry);
      setOpenCalendarEntryMenuId(null);
    },
    onReopen: () => {
      reopenCalendarEntry(entry, task);
      setOpenCalendarEntryMenuId(null);
    },
    onClearSlot: () => clearCalendarSlot(entry, task),
    onClearSeries: () => clearCalendarSeries(entry, task),
  });
  const moveTaskColumn = (taskId: string, column: Column) =>
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, column, isInKanban: true } : task,
      ),
    );

  const startPomodoro = () => {
    const seconds = pomodoroSeconds || pomodoroDurationMinutes * 60;
    setPomodoroSeconds(seconds);
    setPomodoroEndsAt(new Date(Date.now() + seconds * 1000).toISOString());
    setIsPomodoroRunning(true);
    if (selectedPomodoroTaskId && !isPomodoroBreak)
      moveTaskColumn(selectedPomodoroTaskId, "Doing");
  };
  const pausePomodoro = () => {
    setIsPomodoroRunning(false);
    setPomodoroEndsAt(null);
  };
  const resetPomodoro = () => {
    setIsPomodoroRunning(false);
    setPomodoroEndsAt(null);
    setPomodoroSeconds(pomodoroDurationMinutes * 60);
    setIsPomodoroBreak(false);
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
    window.setTimeout(
      () =>
        setHighlightedCalendarEntryId((current) =>
          current === entry.id ? null : current,
        ),
      3000,
    );
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

  const setCalendarSlotDragPreview = (event: DragEvent<HTMLElement>) => {
    const source = event.currentTarget;
    const folderTaskCard = document.querySelector<HTMLElement>(
      ".folder-task-list .task-card",
    );
    const previewSource = source.closest(".folder-task-list")
      ? source
      : (folderTaskCard ?? source);
    const sourceBounds = previewSource.getBoundingClientRect();
    const preview = document.createElement("div");
    preview.classList.add("calendar-slot-drag-preview", "task-drag-preview");
    preview.textContent =
      source.querySelector("h3, strong")?.textContent?.trim() ?? "Task";

    const width = Math.max(1, sourceBounds.width);
    const height = Math.max(1, sourceBounds.height);
    preview.style.width = `${width}px`;
    preview.style.height = `${height}px`;
    const sourceStyle = getComputedStyle(previewSource);
    const titleStyle = getComputedStyle(
      source.querySelector<HTMLElement>("h3, strong") ?? source,
    );
    preview.style.opacity = "1";
    preview.style.setProperty("--drag-preview-text", titleStyle.color);
    preview.style.setProperty("--drag-preview-background", sourceStyle.backgroundColor);
    preview.style.setProperty("--drag-preview-border", sourceStyle.borderColor);
    document.body.append(preview);
    event.dataTransfer.setDragImage(preview, width / 2, height / 2);
    window.requestAnimationFrame(() => preview.remove());
  };

  const dragTaskStart = (event: DragEvent<HTMLElement>, taskId: string) => {
    draggedTaskIdRef.current = taskId;
    setDraggedTaskId(taskId);
    event.dataTransfer.setData("application/x-focusboard-task", taskId);
    event.dataTransfer.setData("text/plain", `task:${taskId}`);
    event.dataTransfer.effectAllowed = "copyMove";
    if (!event.currentTarget.classList.contains("task-card"))
      setCalendarSlotDragPreview(event);
  };

  const clearDraggedTask = () => {
    draggedTaskIdRef.current = null;
    setDraggedTaskId(null);
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
    const internalId = event.dataTransfer.getData(
      "application/x-focusboard-calendar-entry",
    );
    const plainText = event.dataTransfer.getData("text/plain");
    return internalId || (plainText.startsWith("calendar:") ? plainText.slice(9) : "");
  };

  // Folder operations
  const addFolder = () => {
    const name = folderName.trim();
    if (
      !name ||
      name.toLocaleLowerCase() === "main" ||
      folders.some(
        (folder) =>
          folder.name.localeCompare(name, undefined, {
            sensitivity: "accent",
          }) === 0,
      )
    )
      return;
    setFolders((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name,
        color: "#38bdf8",
        group: "unassigned",
        hideFromUpNext: false,
      },
    ]);
    setFolderName("");
    setFolderCreationLocation(null);
  };

  const renameFolder = (folderId: string) => {
    const name = renameValue.trim();
    if (
      !name ||
      name.toLocaleLowerCase() === "main" ||
      folders.some(
        (folder) =>
          folder.id !== folderId &&
          folder.name.localeCompare(name, undefined, {
            sensitivity: "accent",
          }) === 0,
      )
    )
      return;
    setFolders((current) =>
      current.map((folder) => (folder.id === folderId ? { ...folder, name } : folder)),
    );
    setIsRenamingFolder(false);
    setOpenFolderMenu(null);
  };

  const updateFolderColor = (folderId: string, color: string) =>
    setFolders((current) =>
      current.map((folder) => (folder.id === folderId ? { ...folder, color } : folder)),
    );
  const updateFolderGroup = (folderId: string, group: FolderGroup) =>
    setFolders((current) =>
      current.map((folder) => (folder.id === folderId ? { ...folder, group } : folder)),
    );
  const setFolderUpNextVisibility = (folderId: string, hideFromUpNext: boolean) =>
    setFolders((current) =>
      current.map((folder) =>
        folder.id === folderId ? { ...folder, hideFromUpNext } : folder,
      ),
    );
  const toggleFolderGroupCollapsed = (group: FolderGroup) => {
    setCollapsedFolderGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    if (folderGroupButtonFlashTimer.current !== null)
      window.clearTimeout(folderGroupButtonFlashTimer.current);
    setFolderGroupButtonFlash(group);
    folderGroupButtonFlashTimer.current = window.setTimeout(
      () => setFolderGroupButtonFlash(null),
      1000,
    );
  };

  const removeFolder = (folder: Folder) => {
    if (!window.confirm(`Remove ${folder.name}? Tasks in it will return to Main.`))
      return;
    setTasks((current) =>
      current.map((task) =>
        task.destination === folder.id ? { ...task, destination: "Main" } : task,
      ),
    );
    setFolders((current) => current.filter((entry) => entry.id !== folder.id));
    setOpenFolderMenu(null);
  };

  // Task authoring and drag-and-drop
  const addTask = () => {
    const title = normalizeTaskTitle(taskTitle).trim();
    const detail = normalizeTaskNote(taskNote).trim();
    if (!title) return;
    const id = crypto.randomUUID();
    setTasks((current) => [
      ...current,
      {
        id,
        title,
        detail,
        tone: "neutral",
        column: "To do",
        isInKanban: false,
        destination: "Main",
        mode: taskMode,
        status: "active",
        recurrence: taskMode === "recurring" ? taskRecurrence : undefined,
        dueDate: taskMode === "deadline" ? taskDeadline : undefined,
        dueHour: taskMode === "deadline" ? taskDeadlineHour : undefined,
        completedOccurrences: 0,
      },
    ]);
    if (taskMode === "deadline" && taskDeadline)
      setCalendarEntries((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          taskId: id,
          scheduledAt: `${taskDeadline}T${String(taskDeadlineHour).padStart(2, "0")}:00`,
          status: "scheduled",
        },
      ]);
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
    setEditTaskNote(task.detail === "No note" ? "" : task.detail);
    setEditTaskMode(task.mode);
    setEditTaskDeadline(task.dueDate ?? "");
    setEditTaskDeadlineHour(task.dueHour ?? 9);
  };

  const saveTask = () => {
    const title = normalizeTaskTitle(editTaskTitle).trim();
    const detail = normalizeTaskNote(editTaskNote).trim();
    if (!editingTaskId || !title) return;
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== editingTaskId) return task;
        if (task.mode === "recurring") return { ...task, title, detail };
        return {
          ...task,
          title,
          detail,
          mode: editTaskMode,
          recurrence: undefined,
          dueDate: editTaskMode === "deadline" ? editTaskDeadline : undefined,
          dueHour: editTaskMode === "deadline" ? editTaskDeadlineHour : undefined,
        };
      }),
    );
    if (editTaskMode === "deadline" && editTaskDeadline) {
      const scheduledAt = `${editTaskDeadline}T${String(editTaskDeadlineHour).padStart(2, "0")}:00`;
      const existingEntry = calendarEntries.find(
        (entry) => entry.taskId === editingTaskId && entry.status === "scheduled",
      );
      if (existingEntry)
        setCalendarEntries((current) =>
          current.map((entry) =>
            entry.id === existingEntry.id ? { ...entry, scheduledAt } : entry,
          ),
        );
      else scheduleTask(editingTaskId, editTaskDeadline, editTaskDeadlineHour);
    }
    setEditingTaskId(null);
  };

  const deleteTask = (task: Task) => {
    setTasks((current) => current.filter((candidate) => candidate.id !== task.id));
    setCalendarEntries((current) => current.filter((entry) => entry.taskId !== task.id));
    if (editingTaskId === task.id) setEditingTaskId(null);
  };

  const dropOn = (event: DragEvent<HTMLElement>, destination: Destination) => {
    event.preventDefault();
    const taskId =
      getDraggedTaskId(event) || draggedTaskIdRef.current || draggedTaskId || "";
    if (taskId) {
      moveTask(taskId, destination);
      return;
    }
    const calendarEntryId = getDraggedCalendarEntryId(event);
    const calendarEntry = calendarEntries.find((entry) => entry.id === calendarEntryId);
    if (calendarEntry) {
      moveTask(calendarEntry.taskId, destination);
      const task = tasks.find((candidate) => candidate.id === calendarEntry.taskId);
      setCalendarEntries((current) =>
        current.filter((entry) =>
          task && calendarEntryRecurrence(calendarEntry, task)
            ? calendarSeriesKey(entry) !== calendarSeriesKey(calendarEntry)
            : entry.id !== calendarEntry.id,
        ),
      );
    }
  };

  const isOverdue = (task: Task) =>
    task.status === "active" &&
    task.mode === "deadline" &&
    Boolean(task.dueDate && new Date(`${task.dueDate}T23:59:59`) < now);
  const taskCard = (task: Task) => (
    <TaskCard
      key={task.id}
      task={task}
      summary={task.detail === "No note" ? "" : task.detail}
      dueText={
        task.dueDate && isDueDateWithinNextTwoMonths(task.dueDate, now)
          ? formatDueDate(task.dueDate)
          : ""
      }
      modeText={taskModeLabel(task)}
      isOverdue={isOverdue(task)}
      onDragStart={(event) => dragTaskStart(event, task.id)}
      onDragEnd={clearDraggedTask}
      onOpen={() => openTaskEditor(task)}
      onTouchMove={(targetFolderId, targetTaskId) => {
        const targetTask = tasks.find((candidate) => candidate.id === targetTaskId);
        if (targetTask) {
          reorderTask(task.id, targetTask.id);
          return;
        }
        moveTask(task.id, targetFolderId);
      }}
      onDropOnTask={(event, targetTaskId) => {
        event.preventDefault();
        const movingTaskId =
          getDraggedTaskId(event) || draggedTaskIdRef.current || draggedTaskId || "";
        if (movingTaskId) reorderTask(movingTaskId, targetTaskId);
      }}
      onComplete={() => completeTask(task)}
      onDelete={() => deleteTask(task)}
    />
  );
  const dropOnFolder = (event: DragEvent<HTMLElement>, targetFolderId: string) => {
    const movingTaskId =
      getDraggedTaskId(event) || draggedTaskIdRef.current || draggedTaskId || "";
    if (movingTaskId) {
      dropOn(event, targetFolderId);
      return;
    }

    const movingFolderId = event.dataTransfer.getData("application/x-lockin-folder");
    if (!movingFolderId) return;

    event.preventDefault();
    event.stopPropagation();
    const movingFolder = folders.find((folder) => folder.id === movingFolderId);
    const targetFolder = folders.find((folder) => folder.id === targetFolderId);
    if (!movingFolder || !targetFolder) return;

    const targetGroup = targetFolder.group ?? "unassigned";
    if ((movingFolder.group ?? "unassigned") !== targetGroup) {
      updateFolderGroup(movingFolderId, targetGroup);
    }
    reorderFolders(movingFolderId, targetFolderId);
  };
  const moveSidebarFolder = (
    movingFolderId: string,
    targetFolderId?: string,
    targetGroup?: string,
  ) => {
    const movingFolder = folders.find((folder) => folder.id === movingFolderId);
    const targetFolder = targetFolderId
      ? folders.find((folder) => folder.id === targetFolderId)
      : undefined;
    const destinationGroup = targetFolder
      ? (targetFolder.group ?? "unassigned")
      : targetGroup;
    if (
      !movingFolder ||
      !destinationGroup ||
      !folderGroups.includes(destinationGroup as FolderGroup)
    )
      return;
    if ((movingFolder.group ?? "unassigned") !== destinationGroup)
      updateFolderGroup(movingFolderId, destinationGroup as FolderGroup);
    if (targetFolder) reorderFolders(movingFolderId, targetFolder.id);
  };
  const dropOnSidebarFolder = (event: DragEvent<HTMLElement>, targetFolderId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const movingFolderId = event.dataTransfer.getData("application/x-lockin-folder");
    if (movingFolderId) moveSidebarFolder(movingFolderId, targetFolderId);
  };
  const dropOnSidebarGroup = (event: DragEvent<HTMLElement>, group: FolderGroup) => {
    event.preventDefault();
    const movingFolderId = event.dataTransfer.getData("application/x-lockin-folder");
    if (movingFolderId) moveSidebarFolder(movingFolderId, undefined, group);
  };
  const folderCard = (folder: Folder) => (
    <FolderCard
      key={folder.id}
      folder={folder}
      tasks={tasks.filter(
        (task) => task.status === "active" && task.destination === folder.id,
      )}
      isMenuOpen={openFolderMenu === folder.id}
      isRenaming={isRenamingFolder}
      renameValue={renameValue}
      renderTask={taskCard}
      onDragStart={(event, folderId) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-lockin-folder", folderId);
      }}
      onDrop={dropOnFolder}
      onOpenMenu={(selectedFolder) => {
        setOpenFolderMenu(
          openFolderMenu === selectedFolder.id ? null : selectedFolder.id,
        );
        setIsRenamingFolder(false);
        setRenameValue(selectedFolder.name);
      }}
      onToggleRename={() => setIsRenamingFolder(!isRenamingFolder)}
      onRenameValueChange={setRenameValue}
      onRenameSubmit={renameFolder}
      onColorChange={updateFolderColor}
      onUpNextVisibilityChange={setFolderUpNextVisibility}
      onRemove={removeFolder}
    />
  );
  // Derived view data
  const activeTasks = tasks.filter((task) => task.status === "active");
  const completedTasks = tasks.filter((task) => task.status === "completed");
  const mainTasks = activeTasks.filter((task) => task.destination === "Main");
  const nonEventTasks = activeTasks.filter(
    (task) =>
      (folders.find((folder) => folder.id === task.destination)?.group ??
        "unassigned") !== "events",
  );
  const pomodoroTasks = nonEventTasks;
  // The board is opt-in: tasks remain in their folders until added or focused.
  const kanbanTasks = nonEventTasks.filter((task) => task.isInKanban === true);
  const weekStart = startOfWeek(calendarDate);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return {
      key: toDateKey(date),
      label: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date),
      day: date.getDate(),
    };
  });
  const visibleWeekDays = weekDays.slice(0, visibleWeekDayCount);
  const scheduleHours = Array.from({ length: 24 }, (_, index) => index);
  const calendarHours = [...scheduleHours.slice(6), ...scheduleHours.slice(0, 6)];
  const calendarTrayTasks = calendarTrayFolder
    ? activeTasks.filter((task) => task.destination === calendarTrayFolder)
    : [];
  const storedScheduledTasks = buildStoredScheduledTasks(tasks, calendarEntries);
  const projectedRecurringTasks = buildProjectedRecurringTasks(
    tasks,
    calendarEntries,
    new Date(Math.max(Date.now(), calendarDate.getTime())),
  );
  const scheduledTasks = [...storedScheduledTasks, ...projectedRecurringTasks];
  const recurringTasksForSlot = (scheduledAt: string) =>
    getRecurringTasksForSlot(tasks, calendarEntries, scheduledAt);
  const activeScheduledTasks = scheduledTasks.filter(
    ({ entry, task }) => entry.status === "scheduled" && task.status === "active",
  );
  const sortedScheduledTasks = [...activeScheduledTasks].sort((a, b) =>
    a.entry.scheduledAt.localeCompare(b.entry.scheduledAt),
  );
  const todayKey = toDateKey(new Date());
  const todayCalendarTasks = scheduledTasks
    .filter(({ entry }) => toDateKey(new Date(entry.scheduledAt)) === todayKey)
    .sort((a, b) => a.entry.scheduledAt.localeCompare(b.entry.scheduledAt));
  const completedRecurringOccurrences = storedScheduledTasks
    .filter(
      ({ entry, task }) =>
        entry.status === "completed" && Boolean(calendarEntryRecurrence(entry, task)),
    )
    .sort((a, b) => b.entry.scheduledAt.localeCompare(a.entry.scheduledAt));
  const futureScheduledTasks = sortedScheduledTasks.filter(
    ({ entry }) => new Date(entry.scheduledAt) >= new Date(),
  );
  const upNextCandidates = (
    futureScheduledTasks.length ? futureScheduledTasks : sortedScheduledTasks
  ).filter(
    ({ task }) =>
      !folders.find((folder) => folder.id === task.destination)?.hideFromUpNext,
  );
  const seenRecurringTaskIds = new Set<string>();
  const upNextVisibleTasks = showAllRecurringUpNext
    ? upNextCandidates
    : upNextCandidates.filter(({ task }) => {
        if (task.mode !== "recurring") return true;
        if (seenRecurringTaskIds.has(task.id)) return false;
        seenRecurringTaskIds.add(task.id);
        return true;
      });
  const urgentTasks = upNextVisibleTasks.slice(0, 5);
  const calendarTaskColor = (task: Task) =>
    folders.find((folder) => folder.id === task.destination)?.color ?? "#a1a1aa";
  const mainCurrentDate = new Date();
  const mainMonthStart = new Date(
    mainCurrentDate.getFullYear(),
    mainCurrentDate.getMonth(),
    1,
  );
  const mainCalendarMonthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(mainMonthStart);
  const mainMonthGridStart = startOfWeek(mainMonthStart);
  const mainMonthDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(mainMonthGridStart);
    date.setDate(mainMonthGridStart.getDate() + index);
    return {
      key: toDateKey(date),
      day: date.getDate(),
      inMonth: date.getMonth() === mainCurrentDate.getMonth(),
    };
  });
  const currentDate = calendarDate;
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthGridStart = startOfWeek(monthStart);
  const monthDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(monthGridStart);
    date.setDate(monthGridStart.getDate() + index);
    return {
      key: toDateKey(date),
      day: date.getDate(),
      inMonth: date.getMonth() === currentDate.getMonth(),
    };
  });
  const yearMonths = Array.from(
    { length: 12 },
    (_, index) => new Date(currentDate.getFullYear(), currentDate.getMonth() + index, 1),
  );
  const calendarPeriodLabel =
    calendarView === "week"
      ? `${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(weekStart)} – ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6))}`
      : calendarView === "month"
        ? new Intl.DateTimeFormat(undefined, {
            month: "long",
            year: "numeric",
          }).format(monthStart)
        : `${new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(yearMonths[0])} – ${new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(yearMonths[11])}`;
  const calendarPeriodName =
    calendarView === "week" ? "week" : calendarView === "month" ? "month" : "year";
  const selectedPomodoroTask = pomodoroTasks.find(
    (task) => task.id === selectedPomodoroTaskId,
  );
  useEffect(() => {
    if (
      selectedPomodoroTaskId &&
      !pomodoroTasks.some((task) => task.id === selectedPomodoroTaskId)
    )
      setSelectedPomodoroTaskId(null);
  }, [pomodoroTasks, selectedPomodoroTaskId]);
  const queuedPomodoroTasks = pomodoroQueueTaskIds
    .map((taskId) => pomodoroTasks.find((task) => task.id === taskId))
    .filter((task): task is Task => Boolean(task));
  const firstQueuedPomodoroTask = queuedPomodoroTasks[0];
  useEffect(() => {
    if (
      !isPomodoroRunning ||
      isPomodoroBreak ||
      !isAutomaticPomodoroQueueEnabled ||
      selectedPomodoroTaskId ||
      !firstQueuedPomodoroTask
    )
      return;
    setSelectedPomodoroTaskId(firstQueuedPomodoroTask.id);
    setPomodoroQueueTaskIds((current) =>
      current.filter((taskId) => taskId !== firstQueuedPomodoroTask.id),
    );
  }, [
    firstQueuedPomodoroTask,
    isAutomaticPomodoroQueueEnabled,
    isPomodoroBreak,
    isPomodoroRunning,
    selectedPomodoroTaskId,
  ]);
  const clearPomodoroQueue = () => setPomodoroQueueTaskIds([]);
  const removePomodoroQueueTask = (taskId: string) =>
    setPomodoroQueueTaskIds((current) =>
      current.filter((queuedTaskId) => queuedTaskId !== taskId),
    );
  const reorderPomodoroQueueTask = (movingTaskId: string, targetTaskId: string) => {
    if (!movingTaskId || movingTaskId === targetTaskId) return;
    setPomodoroQueueTaskIds((current) => {
      const movingIndex = current.indexOf(movingTaskId);
      const targetIndex = current.indexOf(targetTaskId);
      if (movingIndex < 0 || targetIndex < 0) return current;
      const next = current.filter((taskId) => taskId !== movingTaskId);
      next.splice(next.indexOf(targetTaskId) + 1, 0, movingTaskId);
      return next;
    });
  };
  const toggleAutomaticPomodoroQueue = () =>
    setIsAutomaticPomodoroQueueEnabled((isEnabled) => !isEnabled);
  const addPomodoroTask = (taskId: string) => {
    if (!selectedPomodoroTaskId) {
      setSelectedPomodoroTaskId(taskId);
      setPomodoroQueueTaskIds((current) =>
        current.filter((queuedTaskId) => queuedTaskId !== taskId),
      );
      return;
    }
    if (selectedPomodoroTaskId === taskId) return;
    setPomodoroQueueTaskIds((current) =>
      current.includes(taskId) ? current : [...current, taskId],
    );
  };
  const setPomodoroBreakLength = (minutes: number) =>
    setPomodoroBreakMinutes(Math.max(1, Math.min(60, Math.round(minutes) || 5)));
  const calendarEntryCountdown = (entry: CalendarEntry) => {
    if (entry.status === "completed") return "Completed";
    const start = new Date(entry.scheduledAt);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    if (now < start)
      return `Starts in ${formatCalendarRemaining((start.getTime() - now.getTime()) / 1000)}`;
    if (now < end)
      return `${formatCalendarRemaining((end.getTime() - now.getTime()) / 1000)} left`;
    return "Ended";
  };

  // Backup and workspace controls
  const exportBackup = () => {
    const backup: StoredWorkspace = {
      version: 1,
      savedAt: new Date().toISOString(),
      snapshot: {
        tasks,
        folders,
        calendarEntries,
        focusSessions,
        preferences: { showAllRecurringUpNext, themeMain, themeText },
        pomodoro: {
          durationMinutes: pomodoroDurationMinutes,
          remainingSeconds: pomodoroSeconds,
          endsAt: pomodoroEndsAt,
          selectedTaskId: selectedPomodoroTaskId,
          queueTaskIds: pomodoroQueueTaskIds,
          breaksEnabled: arePomodoroBreaksEnabled,
          breakMinutes: pomodoroBreakMinutes,
          isBreakSession: isPomodoroBreak,
          isAutomaticQueueEnabled: isAutomaticPomodoroQueueEnabled,
        },
      } satisfies WorkspaceSnapshot,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `lockin-board-backup-${backup.savedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStorageStatus(
      `Backup exported · ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date())}`,
    );
  };

  const restoreBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Backup file is too large.");
      const backup = JSON.parse(await file.text()) as unknown;
      const wrappedBackup =
        typeof backup === "object" && backup !== null && "snapshot" in backup
          ? (backup as Partial<StoredWorkspace>)
          : undefined;
      const snapshot = migrateWorkspaceSnapshot(
        wrappedBackup?.version === 1 ? wrappedBackup.snapshot : backup,
      );
      if (!snapshot) {
        throw new Error("This is not a Lockin Board backup.");
      }
      if (
        !window.confirm(
          "Restore this backup? It will replace the workspace currently stored in this browser.",
        )
      )
        return;
      setTasks(snapshot.tasks);
      setFolders(snapshot.folders);
      setCalendarEntries(snapshot.calendarEntries);
      setFocusSessions(snapshot.focusSessions);
      setShowAllRecurringUpNext(snapshot.preferences.showAllRecurringUpNext);
      if (isHexColor(snapshot.preferences.themeMain))
        setThemeMain(snapshot.preferences.themeMain);
      if (isHexColor(snapshot.preferences.themeText))
        setThemeText(snapshot.preferences.themeText);
      if (snapshot.pomodoro) {
        setPomodoroDurationMinutes(snapshot.pomodoro.durationMinutes);
        setPomodoroSeconds(snapshot.pomodoro.remainingSeconds);
        setPomodoroEndsAt(snapshot.pomodoro.endsAt);
        setSelectedPomodoroTaskId(snapshot.pomodoro.selectedTaskId);
        setPomodoroQueueTaskIds(snapshot.pomodoro.queueTaskIds);
        setArePomodoroBreaksEnabled(snapshot.pomodoro.breaksEnabled);
        setPomodoroBreakMinutes(snapshot.pomodoro.breakMinutes);
        setIsPomodoroBreak(snapshot.pomodoro.isBreakSession);
        setIsAutomaticPomodoroQueueEnabled(snapshot.pomodoro.isAutomaticQueueEnabled);
        setIsPomodoroRunning(Boolean(snapshot.pomodoro.endsAt));
      }
      setStorageStatus("Backup restored · saving locally");
    } catch {
      setStorageStatus("Could not restore that backup file");
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  };

  const clearCurrentWorkspace = async () => {
    if (
      !window.confirm(
        "Clear this Lockin Board workspace? All tasks, folders, calendar entries, and focus history stored in this browser will be removed. Export a backup first if you may want them later.",
      )
    )
      return;
    try {
      await clearWorkspace();
      setTasks([]);
      setFolders([]);
      setCalendarEntries([]);
      setFocusSessions([]);
      setShowAllRecurringUpNext(false);
      setSelectedPomodoroTaskId(null);
      setPomodoroQueueTaskIds([]);
      setIsPomodoroBreak(false);
      setIsAutomaticPomodoroQueueEnabled(false);
      setStorageStatus("Workspace cleared · ready for a fresh start");
    } catch {
      setStorageStatus("Could not clear the local workspace");
    }
  };
  const toggleCalendarTray = () => {
    setIsCalendarTrayOpen((current) => !current);
    setCalendarTrayFolder(null);
  };

  if (!isWorkspaceReady) {
    return <main className="startup-screen">Opening your local workspace…</main>;
  }

  // Page layout
  return (
    <div
      className={`focusboard-shell custom-theme${isLightTheme(themeMain) ? " light-theme" : ""}${isSidebarCollapsed ? " sidebar-collapsed" : ""}`}
      style={
        {
          "--theme-main": themeMain,
          "--theme-text": themeText,
        } as CSSProperties
      }
      onClick={() => setOpenFolderMenu(null)}
    >
      {isNavigationOpen && (
        <button
          className="mobile-nav-scrim"
          type="button"
          aria-label="Close navigation"
          onPointerDown={(event) => event.stopPropagation()}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "none";
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            setIsNavigationOpen(false);
          }}
        />
      )}
      <aside
        className={`sidebar${isNavigationOpen ? " sidebar-open" : ""}`}
        aria-label="Workspace navigation"
      >
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          Lockin Board
        </div>
        <nav className="navigation">
          <p className="nav-label">Pages</p>
          {(["main", "calendar", "pomodoro", "kanban"] as Page[]).map((page) => (
            <a
              className={`nav-item${activePage === page ? " nav-item-selected" : ""}`}
              href={page === "main" ? window.location.pathname : `#${page}`}
              key={page}
              onClick={(event) => {
                if (page === "main") {
                  event.preventDefault();
                  window.history.pushState(null, "", window.location.pathname);
                }
                setActivePage(page);
                setIsNavigationOpen(false);
              }}
            >
              <PageIcon page={page} />
              {page[0].toUpperCase() + page.slice(1)}
              {page === "main" && <b>{mainTasks.length}</b>}
            </a>
          ))}
          <a
            className={`nav-item${activePage === "completed" ? " nav-item-selected" : ""}`}
            href="#completed"
            onClick={() => {
              setActivePage("completed");
              setIsNavigationOpen(false);
            }}
          >
            <PageIcon page="completed" />
            Completed<b>{completedTasks.length || ""}</b>
          </a>
          <p className="nav-label folders-label">
            Folders{" "}
            <button
              type="button"
              aria-label="Add folder"
              onClick={() => setFolderCreationLocation("sidebar")}
            >
              +
            </button>
          </p>
          <section className="sidebar-folder-groups" aria-label="Folder sections">
            {folderGroups.map((group) => {
              const groupFolders = folders.filter(
                (folder) => (folder.group ?? "unassigned") === group,
              );
              if (group === "unassigned" && groupFolders.length === 0) return null;
              return (
                <div
                  key={group}
                  data-sidebar-folder-group={group}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => dropOnSidebarGroup(event, group)}
                >
                  <p className="nav-label">{group[0].toUpperCase() + group.slice(1)}</p>
                  {groupFolders.length ? (
                    groupFolders.map((folder) => (
                      <SidebarFolderItem
                        key={folder.id}
                        folder={folder}
                        taskCount={
                          activeTasks.filter((task) => task.destination === folder.id)
                            .length
                        }
                        onDragStart={(event, folderId) => {
                          event.stopPropagation();
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(
                            "application/x-lockin-folder",
                            folderId,
                          );
                          event.dataTransfer.setData("text/plain", `folder:${folderId}`);
                        }}
                        onDrop={(event) => dropOnSidebarFolder(event, folder.id)}
                        onTouchReorder={moveSidebarFolder}
                      />
                    ))
                  ) : (
                    <div className="sidebar-empty-folder-target">Empty</div>
                  )}
                </div>
              );
            })}
          </section>
          <section className="data-panel" aria-label="Data and backups">
            <p className="nav-label">Data</p>
            <p className="storage-status" aria-live="polite">
              {storageStatus}
            </p>
            <div>
              <button type="button" onClick={exportBackup}>
                Export backup
              </button>
              <button type="button" onClick={() => backupInputRef.current?.click()}>
                Restore backup
              </button>
              <button
                className="clear-workspace-button"
                type="button"
                onClick={() => {
                  void clearCurrentWorkspace();
                }}
              >
                Clear workspace
              </button>
            </div>
            <input
              ref={backupInputRef}
              className="backup-input"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                void restoreBackup(event.target.files?.[0]);
              }}
            />
          </section>
        </nav>
        <section className="theme-controls" aria-label="Theme">
          <p className="nav-label">Theme</p>
          <div className="theme-preset-list" role="group" aria-label="Theme presets">
            {themePresets.map((preset) => {
              const isSelected = themeMain === preset.main && themeText === preset.text;
              return (
                <button
                  className="theme-preset-button"
                  type="button"
                  key={preset.id}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setThemeMain(preset.main);
                    setThemeText(preset.text);
                  }}
                >
                  <i
                    style={{ background: preset.main, borderColor: preset.text }}
                    aria-hidden="true"
                  />
                  {preset.label}
                </button>
              );
            })}
          </div>
        </section>
      </aside>

      <main className="workspace" id="main">
        <UtilityBar
          timerText={formatRemaining(pomodoroSeconds)}
          isTimerRunning={isPomodoroRunning}
          onToggleNavigation={() => {
            if (window.matchMedia("(min-width: 1101px)").matches) {
              setIsSidebarCollapsed((current) => !current);
              return;
            }
            setIsNavigationOpen((current) => !current);
          }}
          onToggleTimer={isPomodoroRunning ? pausePomodoro : startPomodoro}
        />
        {activePage === "main" ? (
          <>
            <section className="board-heading" aria-labelledby="board-title">
              <div>
                <h1 id="board-title">Main</h1>
              </div>
            </section>
            <MainOverview
              urgentTasks={urgentTasks}
              showAllRecurringUpNext={showAllRecurringUpNext}
              mainCalendarMonthLabel={mainCalendarMonthLabel}
              mainMonthDays={mainMonthDays}
              activeScheduledTasks={activeScheduledTasks}
              formatScheduledAt={formatScheduledAt}
              getTaskColor={(taskId) => {
                const task = tasks.find((candidate) => candidate.id === taskId);
                return task ? calendarTaskColor(task) : "#a1a1aa";
              }}
              onToggleRecurringFilter={() =>
                setShowAllRecurringUpNext((current) => !current)
              }
              onOpenCalendarEntry={openCalendarEntry}
            />
          </>
        ) : null}
        {activePage === "main" && (
          <section
            className="folder-section folder-section-categorized"
            aria-labelledby="folder-groups-title"
          >
            <div className="folder-section-heading">
              <h2 id="folder-groups-title">Folders</h2>
              <div className="folder-section-actions">
                <button
                  className={`folder-group-visibility-button${
                    folderGroupButtonFlash === "tasks"
                      ? " folder-group-visibility-flash"
                      : ""
                  }`}
                  type="button"
                  onClick={(event) => {
                    if (window.matchMedia("(max-width: 760px)").matches)
                      event.currentTarget.blur();
                    toggleFolderGroupCollapsed("tasks");
                  }}
                >
                  {collapsedFolderGroups.has("tasks") ? "Show Tasks" : "Hide Tasks"}
                </button>
                <button
                  className={`folder-group-visibility-button${
                    folderGroupButtonFlash === "events"
                      ? " folder-group-visibility-flash"
                      : ""
                  }`}
                  type="button"
                  onClick={(event) => {
                    if (window.matchMedia("(max-width: 760px)").matches)
                      event.currentTarget.blur();
                    toggleFolderGroupCollapsed("events");
                  }}
                >
                  {collapsedFolderGroups.has("events") ? "Show Events" : "Hide Events"}
                </button>
                <button
                  className="folder-add-button"
                  type="button"
                  onClick={() => setIsTaskComposerOpen(true)}
                >
                  <svg
                    className="action-plus-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Task
                </button>
                <button
                  className="folder-add-button"
                  type="button"
                  onClick={() => setFolderCreationLocation("main")}
                >
                  <svg
                    className="action-plus-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Folder
                </button>
              </div>
            </div>
            {mainTasks.length > 0 && (
              <section
                className="folder-dropzone unassigned-task-folder"
                data-folder-id="Main"
                style={{ "--folder-color": "#a78bfa" } as CSSProperties}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => dropOn(event, "Main")}
                aria-label="Unassigned tasks"
              >
                <header>
                  <h3>Unassigned tasks</h3>
                  <span>{mainTasks.length}</span>
                </header>
                <div className="folder-task-list">{mainTasks.map(taskCard)}</div>
              </section>
            )}
            {folders.some(
              (folder) => (folder.group ?? "unassigned") === "unassigned",
            ) && (
              <FolderGroupPanel
                group="unassigned"
                label="Unassigned"
                folders={folders.filter(
                  (folder) => (folder.group ?? "unassigned") === "unassigned",
                )}
                onMoveFolder={updateFolderGroup}
                renderFolder={folderCard}
              />
            )}
            <div
              className={`folder-groups${
                collapsedFolderGroups.has("tasks") || collapsedFolderGroups.has("events")
                  ? " folder-groups-single"
                  : ""
              }`}
            >
              {!collapsedFolderGroups.has("tasks") && (
                <FolderGroupPanel
                  group="tasks"
                  label="Tasks"
                  folders={folders.filter(
                    (folder) => (folder.group ?? "unassigned") === "tasks",
                  )}
                  onMoveFolder={updateFolderGroup}
                  renderFolder={folderCard}
                />
              )}
              {!collapsedFolderGroups.has("events") && (
                <FolderGroupPanel
                  group="events"
                  label="Events"
                  folders={folders.filter(
                    (folder) => (folder.group ?? "unassigned") === "events",
                  )}
                  onMoveFolder={updateFolderGroup}
                  renderFolder={folderCard}
                />
              )}
            </div>
          </section>
        )}
        {activePage === "calendar" && (
          <section className="calendar-page" aria-labelledby="calendar-page-title">
            <CalendarHeader
              calendarView={calendarView}
              periodName={calendarPeriodName}
              periodLabel={calendarPeriodLabel}
              onClear={clearCalendar}
              onToday={() => setCalendarDate(new Date())}
              onShiftPeriod={shiftCalendarDate}
              onViewChange={(view) => {
                setCalendarView(view);
                if (view === "year") setIsCalendarTrayOpen(false);
              }}
            />
            <div
              className={`calendar-workspace${isCalendarTrayOpen ? " calendar-workspace-tray-open" : ""}`}
            >
              {isCalendarTrayOpen && calendarView !== "year" && (
                <CalendarTray
                  calendarView={calendarView}
                  selectedFolder={calendarTrayFolder}
                  folders={folders}
                  mainTaskCount={mainTasks.length}
                  activeTasks={activeTasks}
                  tasks={calendarTrayTasks}
                  onSelectFolder={setCalendarTrayFolder}
                  onDropToFolder={dropOn}
                  onDragTaskStart={dragTaskStart}
                  onDragTaskEnd={clearDraggedTask}
                  onSetRecurrence={setCalendarTaskRecurrence}
                  onSetRepeatLimit={setCalendarTaskRepeatLimit}
                  getTaskColor={calendarTaskColor}
                />
              )}
              <section className="calendar-canvas">
                {calendarView === "month" && (
                  <button
                    className="calendar-task-toggle calendar-canvas-task-toggle"
                    type="button"
                    aria-label="Open task folders"
                    title="Tasks to schedule"
                    aria-expanded={isCalendarTrayOpen}
                    onClick={toggleCalendarTray}
                  >
                    <span />
                    <span />
                    <span />
                  </button>
                )}
                {calendarView === "week" && (
                  <div
                    className="week-calendar"
                    ref={weekCalendarRef}
                    style={
                      {
                        "--visible-days": visibleWeekDays.length,
                      } as CSSProperties
                    }
                  >
                    <div className="week-corner">
                      <button
                        className="calendar-task-toggle"
                        type="button"
                        aria-label="Open task folders"
                        title="Tasks to schedule"
                        aria-expanded={isCalendarTrayOpen}
                        onClick={toggleCalendarTray}
                      >
                        <span />
                        <span />
                        <span />
                      </button>
                    </div>
                    {visibleWeekDays.map((day) => (
                      <div className="week-day-label" key={day.key}>
                        {day.label}
                        <b>{day.day}</b>
                      </div>
                    ))}
                    {calendarHours.map((hour) => (
                      <Fragment key={hour}>
                        <div className="hour-label">
                          {String(hour).padStart(2, "0")}:00
                        </div>
                        {visibleWeekDays.map((day) => {
                          const scheduledAt = `${day.key}T${String(hour).padStart(2, "0")}:00`;
                          return (
                            <div
                              className="hour-slot"
                              key={scheduledAt}
                              onDragOver={(event) => {
                                const taskId =
                                  draggedTaskIdRef.current ??
                                  draggedTaskId ??
                                  getDraggedTaskId(event);
                                if (
                                  taskId &&
                                  !canScheduleTaskAt(taskId, scheduledAt, calendarEntries)
                                ) {
                                  event.dataTransfer.dropEffect = "none";
                                  return;
                                }
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "copy";
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                const taskId =
                                  getDraggedTaskId(event) ||
                                  draggedTaskIdRef.current ||
                                  draggedTaskId ||
                                  "";
                                const entryId = getDraggedCalendarEntryId(event);
                                if (
                                  taskId &&
                                  canScheduleTaskAt(taskId, scheduledAt, calendarEntries)
                                )
                                  scheduleTask(taskId, day.key, hour);
                                if (entryId) moveCalendarEntry(entryId, day.key, hour);
                              }}
                            >
                              {[
                                ...scheduledTasks.filter(
                                  ({ entry }) => entry.scheduledAt === scheduledAt,
                                ),
                                ...recurringTasksForSlot(scheduledAt),
                              ]
                                .filter(
                                  ({ entry }, index, entries) =>
                                    entries.findIndex(
                                      (candidate) =>
                                        calendarSeriesKey(candidate.entry) ===
                                          calendarSeriesKey(entry) &&
                                        candidate.entry.scheduledAt === entry.scheduledAt,
                                    ) === index,
                                )
                                .map(({ entry, task }) => (
                                  <CalendarScheduledEvent
                                    key={entry.id}
                                    entry={entry}
                                    task={task}
                                    color={calendarTaskColor(task)}
                                    countdown={calendarEntryCountdown(entry)}
                                    isHighlighted={
                                      highlightedCalendarEntryId === entry.id
                                    }
                                    menu={
                                      <CalendarEntryMenu
                                        {...calendarEntryMenuProps(entry, task)}
                                      />
                                    }
                                    onDragStart={(event) =>
                                      dragCalendarEntryStart(event, entry.id)
                                    }
                                    onReopen={() => reopenCalendarEntry(entry, task)}
                                  />
                                ))}
                            </div>
                          );
                        })}
                      </Fragment>
                    ))}
                  </div>
                )}
                {calendarView === "month" && (
                  <div className="month-calendar">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                      <b key={day}>{day}</b>
                    ))}
                    {monthDays.map((day) => (
                      <div
                        className={`month-day${day.inMonth ? "" : " month-day-muted"}`}
                        key={day.key}
                        onDragOver={(event) => {
                          const taskId =
                            draggedTaskIdRef.current ??
                            draggedTaskId ??
                            getDraggedTaskId(event);
                          const scheduledAt = `${day.key}T06:00`;
                          if (
                            taskId &&
                            !canScheduleTaskAt(taskId, scheduledAt, calendarEntries)
                          ) {
                            event.dataTransfer.dropEffect = "none";
                            return;
                          }
                          event.preventDefault();
                          event.dataTransfer.dropEffect = taskId ? "copy" : "move";
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const taskId =
                            getDraggedTaskId(event) ||
                            draggedTaskIdRef.current ||
                            draggedTaskId ||
                            "";
                          const entryId = getDraggedCalendarEntryId(event);
                          if (
                            taskId &&
                            canScheduleTaskAt(taskId, `${day.key}T06:00`, calendarEntries)
                          )
                            scheduleTask(taskId, day.key, 6);
                          if (entryId) moveCalendarEntry(entryId, day.key, 9);
                        }}
                      >
                        <span>{day.day}</span>
                        {scheduledTasks
                          .filter(({ entry }) => entry.scheduledAt.startsWith(day.key))
                          .map(({ entry, task }) => (
                            <CalendarScheduledEvent
                              key={entry.id}
                              entry={entry}
                              task={task}
                              color={calendarTaskColor(task)}
                              countdown={calendarEntryCountdown(entry)}
                              menu={
                                <CalendarEntryMenu
                                  {...calendarEntryMenuProps(entry, task)}
                                />
                              }
                              onDragStart={(event) =>
                                dragCalendarEntryStart(event, entry.id)
                              }
                              onReopen={() => reopenCalendarEntry(entry, task)}
                            />
                          ))}
                      </div>
                    ))}
                  </div>
                )}
                {calendarView === "year" && (
                  <div className="year-calendar">
                    {yearMonths.map((month) => {
                      const name = new Intl.DateTimeFormat(undefined, {
                        month: "long",
                        year: "numeric",
                      }).format(month);
                      const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
                      const count = scheduledTasks.filter(({ entry }) =>
                        entry.scheduledAt.startsWith(prefix),
                      ).length;
                      return (
                        <div key={name}>
                          <h2>{name}</h2>
                          <p>
                            {count} {count === 1 ? "task" : "tasks"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </section>
        )}
        {activePage === "pomodoro" && (
          <PomodoroPage
            sessionCount={focusSessions.length}
            timerText={formatRemaining(pomodoroSeconds)}
            durationMinutes={pomodoroDurationMinutes}
            isRunning={isPomodoroRunning}
            isBreakSession={isPomodoroBreak}
            breaksEnabled={arePomodoroBreaksEnabled}
            breakMinutes={pomodoroBreakMinutes}
            activeTasks={pomodoroTasks}
            folders={folders}
            queuedTasks={queuedPomodoroTasks}
            isAutomaticQueueEnabled={isAutomaticPomodoroQueueEnabled}
            selectedTask={selectedPomodoroTask}
            selectedTaskSummary={
              selectedPomodoroTask
                ? `${taskModeLabel(selectedPomodoroTask)}${
                    selectedPomodoroTask.dueDate
                      ? ` · Due ${formatDueDate(selectedPomodoroTask.dueDate)}`
                      : ""
                  }`
                : ""
            }
            onDurationChange={setPomodoroDuration}
            onToggleTimer={isPomodoroRunning ? pausePomodoro : startPomodoro}
            onReset={resetPomodoro}
            onSelectTask={addPomodoroTask}
            onClearLinkedTask={() => setSelectedPomodoroTaskId(null)}
            onBreaksEnabledChange={setArePomodoroBreaksEnabled}
            onBreakMinutesChange={setPomodoroBreakLength}
            onClearQueue={clearPomodoroQueue}
            onToggleAutomaticQueue={toggleAutomaticPomodoroQueue}
            onReorderQueueTask={reorderPomodoroQueueTask}
            onRemoveQueueTask={removePomodoroQueueTask}
            onCompleteTask={completeTask}
          />
        )}
        {activePage === "kanban" && (
          <KanbanPage
            tasks={kanbanTasks}
            availableTasks={pomodoroTasks}
            folders={folders}
            renderTask={taskCard}
            onAddTaskToKanban={(taskId) => moveTaskColumn(taskId, "To do")}
            onDropTask={(event, column) => {
              event.preventDefault();
              const taskId = getDraggedTaskId(event);
              if (taskId) moveTaskColumn(taskId, column);
            }}
          />
        )}
        {activePage === "completed" && (
          <section className="completed-page" aria-labelledby="completed-title">
            <header>
              <div>
                <h1 id="completed-title">Completed</h1>
                <p>
                  See today’s scheduled work separately from tasks that are permanently
                  complete.
                </p>
              </div>
              <span>{completedTasks.length}</span>
            </header>
            <section
              className="today-completed-section"
              aria-labelledby="today-schedule-title"
            >
              <header>
                <div>
                  <p className="eyebrow">Today</p>
                  <h2 id="today-schedule-title">Today’s schedule</h2>
                </div>
                <span>{todayCalendarTasks.length}</span>
              </header>
              {todayCalendarTasks.length ? (
                <div className="today-completed-list">
                  {todayCalendarTasks.map(({ entry, task }) => {
                    const isComplete =
                      entry.status === "completed" || task.status === "completed";
                    const folder = folders.find(
                      (candidate) => candidate.id === task.destination,
                    );
                    return (
                      <article
                        className={`today-completed-task${isComplete ? " today-completed-task-done" : ""}`}
                        style={
                          {
                            "--task-folder-color": folder?.color ?? "#a1a1aa",
                          } as CSSProperties
                        }
                        key={entry.id}
                      >
                        <time dateTime={entry.scheduledAt}>
                          {new Intl.DateTimeFormat(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          }).format(new Date(entry.scheduledAt))}
                        </time>
                        <div>
                          <h3>{task.title}</h3>
                          <p>
                            {task.destination === "Main"
                              ? "Main"
                              : (folder?.name ?? "Removed folder")}{" "}
                            · {taskModeLabel(task)}
                          </p>
                        </div>
                        <strong>{isComplete ? "Completed" : "Scheduled"}</strong>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="completed-empty">
                  Nothing is scheduled in the calendar for today.
                </p>
              )}
            </section>
            <section
              className="permanent-completed-section"
              aria-labelledby="completed-occurrences-title"
            >
              <header>
                <div>
                  <p className="eyebrow">Calendar history</p>
                  <h2 id="completed-occurrences-title">
                    Completed repeating occurrences
                  </h2>
                </div>
                <span>{completedRecurringOccurrences.length}</span>
              </header>
              {completedRecurringOccurrences.length ? (
                <div className="completed-list">
                  {completedRecurringOccurrences.map(({ entry, task }) => (
                    <article className="completed-task" key={entry.id}>
                      <div>
                        <h3>{task.title}</h3>
                        <p>
                          {taskModeLabel(task)} · Completed{" "}
                          {formatScheduledAt(entry.scheduledAt)}
                        </p>
                      </div>
                      <div>
                        <button
                          className="task-edit-button"
                          type="button"
                          onClick={() => reopenCalendarEntry(entry, task)}
                        >
                          Reopen
                        </button>
                        <button
                          className="task-delete-button"
                          type="button"
                          aria-label={`Clear ${task.title} from the calendar`}
                          title="Clear calendar block"
                          onClick={() => clearCalendarSlot(entry, task)}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M4 7h16" />
                            <path d="M9 7V4h6v3" />
                            <path d="m6 7 1 13h10l1-13" />
                            <path d="M10 11v5" />
                            <path d="M14 11v5" />
                          </svg>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="completed-empty">
                  Completed repeating occurrences will appear here.
                </p>
              )}
            </section>
            <section
              className="permanent-completed-section"
              aria-labelledby="permanent-completed-title"
            >
              <header>
                <div>
                  <p className="eyebrow">Archive</p>
                  <h2 id="permanent-completed-title">Permanently completed</h2>
                </div>
                <span>{completedTasks.length}</span>
              </header>
              {completedTasks.length ? (
                <div className="completed-list">
                  {completedTasks.map((task) => (
                    <article className="completed-task" key={task.id}>
                      <div>
                        <h3>{task.title}</h3>
                        <p>
                          {taskModeLabel(task)} ·{" "}
                          {task.destination === "Main"
                            ? "Main"
                            : (folders.find((folder) => folder.id === task.destination)
                                ?.name ?? "Removed folder")}
                          {task.completedAt
                            ? ` · Completed ${formatScheduledAt(task.completedAt)}`
                            : ""}
                        </p>
                      </div>
                      <div>
                        <button
                          className="task-edit-button"
                          type="button"
                          onClick={() => restoreTask(task.id)}
                        >
                          Restore
                        </button>
                        <button
                          className="task-delete-button"
                          type="button"
                          aria-label={`Delete ${task.title}`}
                          title="Delete task"
                          onClick={() => deleteTask(task)}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M4 7h16" />
                            <path d="M9 7V4h6v3" />
                            <path d="m6 7 1 13h10l1-13" />
                            <path d="M10 11v5" />
                            <path d="M14 11v5" />
                          </svg>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="completed-empty">
                  One-time and deadline tasks you complete will stay here until you
                  restore or delete them.
                </p>
              )}
            </section>
          </section>
        )}
      </main>
      {isTaskComposerOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setIsTaskComposerOpen(false)}
        >
          <form
            className="task-composer"
            aria-label="Create task"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              addTask();
            }}
          >
            <h2>New Task</h2>
            <label htmlFor="task-title">
              Task title (up to {maxTaskTitleLength} characters)
            </label>
            <textarea
              id="task-title"
              rows={2}
              autoFocus
              required
              maxLength={maxTaskTitleLength}
              value={taskTitle}
              onChange={(event) => setTaskTitle(normalizeTaskTitle(event.target.value))}
              onKeyDown={(event) => {
                if (event.key === "Escape") setIsTaskComposerOpen(false);
              }}
              placeholder="What needs doing?"
            />
            <label htmlFor="task-note">Note (up to {maxTaskNoteLength} characters)</label>
            <textarea
              id="task-note"
              className="task-note-input"
              rows={2}
              maxLength={maxTaskNoteLength}
              value={taskNote}
              onChange={(event) => setTaskNote(normalizeTaskNote(event.target.value))}
              placeholder="Optional note"
            />
            <label htmlFor="task-mode">Task type</label>
            <select
              id="task-mode"
              value={taskMode}
              onChange={(event) => setTaskMode(event.target.value as TaskMode)}
            >
              <option value="one-time">One-time</option>
              <option value="deadline">Deadline</option>
            </select>
            {taskMode === "deadline" && (
              <>
                <label htmlFor="task-deadline">Deadline date</label>
                <input
                  id="task-deadline"
                  type="date"
                  required
                  value={taskDeadline}
                  onChange={(event) => setTaskDeadline(event.target.value)}
                />
                <label htmlFor="task-deadline-hour">Deadline hour</label>
                <select
                  id="task-deadline-hour"
                  value={taskDeadlineHour}
                  onChange={(event) => setTaskDeadlineHour(Number(event.target.value))}
                >
                  {scheduleHours.map((hour) => (
                    <option value={hour} key={hour}>
                      {String(hour).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </>
            )}
            <div>
              <button
                className="cancel-button"
                type="button"
                onClick={() => setIsTaskComposerOpen(false)}
              >
                Cancel
              </button>
              <button className="primary-action" type="submit">
                Create task
              </button>
            </div>
          </form>
        </div>
      )}
      {folderCreationLocation && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setFolderCreationLocation(null)}
        >
          <form
            className="task-composer folder-composer"
            aria-label="Create folder"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              addFolder();
            }}
          >
            <h2>New Folder</h2>
            <input
              id="folder-name"
              aria-label="Folder name"
              autoFocus
              required
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setFolderCreationLocation(null);
              }}
              placeholder="Name your folder"
            />
            <div>
              <button
                className="cancel-button"
                type="button"
                onClick={() => setFolderCreationLocation(null)}
              >
                Cancel
              </button>
              <button className="primary-action" type="submit">
                Create folder
              </button>
            </div>
          </form>
        </div>
      )}
      {editingTaskId && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setEditingTaskId(null)}
        >
          <form
            className="task-composer"
            aria-label="Edit task"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              saveTask();
            }}
          >
            <p className="eyebrow">Task details</p>
            <h2>Edit task</h2>
            <label htmlFor="edit-task-title">
              Task title (up to {maxTaskTitleLength} characters)
            </label>
            <textarea
              id="edit-task-title"
              rows={2}
              autoFocus
              required
              maxLength={maxTaskTitleLength}
              value={editTaskTitle}
              onChange={(event) =>
                setEditTaskTitle(normalizeTaskTitle(event.target.value))
              }
              onKeyDown={(event) => {
                if (event.key === "Escape") setEditingTaskId(null);
              }}
            />
            <label htmlFor="edit-task-note">
              Note (up to {maxTaskNoteLength} characters)
            </label>
            <textarea
              id="edit-task-note"
              className="task-note-input"
              rows={2}
              maxLength={maxTaskNoteLength}
              value={editTaskNote}
              onChange={(event) => setEditTaskNote(normalizeTaskNote(event.target.value))}
              placeholder="Optional note"
            />
            {tasks.find((task) => task.id === editingTaskId)?.mode === "recurring" ? (
              <p className="task-repeat-note">Repeat timing is managed in Calendar.</p>
            ) : (
              <>
                <label htmlFor="edit-task-mode">Task type</label>
                <select
                  id="edit-task-mode"
                  value={editTaskMode}
                  onChange={(event) => setEditTaskMode(event.target.value as TaskMode)}
                >
                  <option value="one-time">One-time</option>
                  <option value="deadline">Deadline</option>
                </select>
                {editTaskMode === "deadline" && (
                  <>
                    <label htmlFor="edit-task-deadline">Deadline date</label>
                    <input
                      id="edit-task-deadline"
                      type="date"
                      required
                      value={editTaskDeadline}
                      onChange={(event) => setEditTaskDeadline(event.target.value)}
                    />
                    <label htmlFor="edit-task-deadline-hour">Deadline hour</label>
                    <select
                      id="edit-task-deadline-hour"
                      value={editTaskDeadlineHour}
                      onChange={(event) =>
                        setEditTaskDeadlineHour(Number(event.target.value))
                      }
                    >
                      {scheduleHours.map((hour) => (
                        <option value={hour} key={hour}>
                          {String(hour).padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </>
            )}
            <div>
              <button
                className="cancel-button"
                type="button"
                onClick={() => setEditingTaskId(null)}
              >
                Cancel
              </button>
              <button className="primary-action" type="submit">
                Save task
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
