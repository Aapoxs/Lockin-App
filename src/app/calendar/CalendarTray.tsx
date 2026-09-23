import type { CSSProperties, DragEvent } from "react";
import type {
  CalendarView,
  Destination,
  Folder,
  Recurrence,
  RepeatLimit,
  Task,
} from "../workspace/workspaceTypes";

type CalendarTrayProps = {
  calendarView: CalendarView;
  selectedFolder: Destination | null;
  folders: Folder[];
  mainTaskCount: number;
  activeTasks: Task[];
  tasks: Task[];
  onSelectFolder: (folder: Destination | null) => void;
  onClearCalendar: () => void;
  onDropToFolder: (event: DragEvent<HTMLElement>, destination: Destination) => void;
  onDragTaskStart: (event: DragEvent<HTMLElement>, taskId: string) => void;
  onDragTaskEnd: () => void;
  onSetRecurrence: (taskId: string, recurrence: Recurrence | "none") => void;
  onSetRepeatLimit: (taskId: string, limit: RepeatLimit) => void;
  getTaskColor: (task: Task) => string;
};

/** Folder picker and task source for calendar scheduling. */
export function CalendarTray({
  calendarView,
  selectedFolder,
  folders,
  mainTaskCount,
  activeTasks,
  tasks,
  onSelectFolder,
  onClearCalendar,
  onDropToFolder,
  onDragTaskStart,
  onDragTaskEnd,
  onSetRecurrence,
  onSetRepeatLimit,
  getTaskColor,
}: CalendarTrayProps) {
  if (selectedFolder === null) {
    return (
      <aside className="calendar-tray" aria-label="Tasks to schedule" key="folders">
        <div className="calendar-tray-folder-options folder-task-picker-options">
          <button
            className="folder-task-picker-option folder-task-picker-folder-option"
            type="button"
            onClick={() => onSelectFolder("Main")}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDropToFolder(event, "Main")}
          >
            <i className="calendar-tray-main-dot" />
            <span>Main</span>
            <b>{mainTaskCount}</b>
          </button>
          {folders.map((folder) => (
            <button
              className="folder-task-picker-option folder-task-picker-folder-option"
              type="button"
              key={folder.id}
              onClick={() => onSelectFolder(folder.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onDropToFolder(event, folder.id)}
            >
              <i style={{ background: folder.color }} />
              <span>{folder.name}</span>
              <b>{activeTasks.filter((task) => task.destination === folder.id).length}</b>
            </button>
          ))}
        </div>
        <button className="calendar-tray-clear" type="button" onClick={onClearCalendar}>
          Clear calendar
        </button>
      </aside>
    );
  }

  const folderName =
    selectedFolder === "Main"
      ? "Main"
      : folders.find((folder) => folder.id === selectedFolder)?.name;
  const folderTasks = tasks.filter((task) => task.destination === selectedFolder);

  return (
    <aside className="calendar-tray" aria-label="Tasks to schedule" key={selectedFolder}>
      <button
        className="calendar-tray-back"
        type="button"
        onClick={() => onSelectFolder(null)}
      >
        ← Back to folders
      </button>
      <h2>{folderName}</h2>
      <p>
        {calendarView === "week"
          ? "Drag a task into a time slot. Repeat applies to the new series."
          : calendarView === "month"
            ? "Drag a task onto a day to add it at 06:00."
            : "Switch to Week or Month to schedule a task."}
      </p>
      <div
        className="calendar-tray-task-options"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => onDropToFolder(event, selectedFolder)}
      >
        {folderTasks.map((task) => (
          <article
            className="calendar-task"
            key={task.id}
            data-calendar-touch-task-id={task.id}
            style={{ "--task-folder-color": getTaskColor(task) } as CSSProperties}
            draggable
            onDragStart={(event) => onDragTaskStart(event, task.id)}
            onDragEnd={onDragTaskEnd}
          >
            <strong>{task.title}</strong>
            {calendarView !== "year" && (
              <span className="calendar-touch-drag-handle" aria-hidden="true">
                ⠿
              </span>
            )}
            {task.detail && task.detail !== "No note" && (
              <span className="calendar-task-detail">{task.detail}</span>
            )}
            <label
              className="calendar-repeat-control"
              onClick={(event) => event.stopPropagation()}
            >
              Repeat
              <select
                aria-label={`Repeat ${task.title}`}
                value={task.mode === "recurring" ? (task.recurrence ?? "weekly") : "none"}
                onChange={(event) =>
                  onSetRecurrence(task.id, event.target.value as Recurrence | "none")
                }
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            {task.mode === "recurring" && (
              <label
                className="calendar-repeat-control"
                onClick={(event) => event.stopPropagation()}
              >
                New series ends
                <select
                  aria-label={`Repeat limit for new ${task.title} series`}
                  value={task.repeatLimit ?? "forever"}
                  onChange={(event) =>
                    onSetRepeatLimit(task.id, event.target.value as RepeatLimit)
                  }
                >
                  <option value="week">This week</option>
                  <option value="month">This month</option>
                  <option value="year">This year</option>
                  <option value="forever">No end</option>
                </select>
              </label>
            )}
          </article>
        ))}
      </div>
      <button className="calendar-tray-clear" type="button" onClick={onClearCalendar}>
        Clear calendar
      </button>
    </aside>
  );
}
