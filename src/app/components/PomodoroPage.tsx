import type { Task } from "../workspace/workspaceTypes";

type PomodoroPageProps = {
  sessionCount: number;
  timerText: string;
  durationMinutes: number;
  isRunning: boolean;
  activeTasks: Task[];
  selectedTask: Task | undefined;
  selectedTaskSummary: string;
  calendarStatusText: string | undefined;
  onDurationChange: (minutes: number) => void;
  onToggleTimer: () => void;
  onReset: () => void;
  onSelectTask: (taskId: string | null) => void;
  onCompleteTask: (task: Task) => void;
};

/** Pomodoro page presentation with all timer state kept in the workspace coordinator. */
export function PomodoroPage({
  sessionCount,
  timerText,
  durationMinutes,
  isRunning,
  activeTasks,
  selectedTask,
  selectedTaskSummary,
  calendarStatusText,
  onDurationChange,
  onToggleTimer,
  onReset,
  onSelectTask,
  onCompleteTask,
}: PomodoroPageProps) {
  return (
    <section className="pomodoro-page" aria-labelledby="pomodoro-title">
      <header className="pomodoro-heading">
        <div>
          <p className="eyebrow">Focus with intent</p>
          <h1 id="pomodoro-title">Pomodoro</h1>
          <p>Each completed session is linked to the task you choose.</p>
        </div>
        <span>{sessionCount} sessions today</span>
      </header>
      <div className="pomodoro-layout">
        <section className="pomodoro-clock" aria-label="Focus timer">
          <p>Focus session</p>
          <strong>{timerText}</strong>
          <p>
            {selectedTask ? selectedTask.title : "Choose a task to link this session"}
          </p>
          <label className="pomodoro-duration-control">
            Focus length
            <input
              aria-label="Focus length in minutes"
              type="number"
              min="1"
              max="240"
              value={durationMinutes}
              disabled={isRunning}
              onChange={(event) => onDurationChange(Number(event.target.value))}
            />
            <span>min</span>
          </label>
          <div>
            <button className="primary-action" type="button" onClick={onToggleTimer}>
              {isRunning ? "Pause" : "Start focus"}
            </button>
            <button className="pomodoro-reset" type="button" onClick={onReset}>
              Reset
            </button>
          </div>
        </section>
        <aside className="pomodoro-task-panel">
          <p className="eyebrow">Linked task</p>
          <h2>What are you focusing on?</h2>
          <select
            aria-label="Focus task"
            value={selectedTask?.id ?? ""}
            onChange={(event) => onSelectTask(event.target.value || null)}
          >
            <option value="">No task</option>
            {activeTasks.map((task) => (
              <option value={task.id} key={task.id}>
                {task.title}
              </option>
            ))}
          </select>
          {selectedTask ? (
            <div className="pomodoro-task-summary">
              <h3>{selectedTask.title}</h3>
              <p>{selectedTaskSummary}</p>
              <p className="pomodoro-calendar-link">
                {calendarStatusText ?? "No active calendar block."}
              </p>
              <p className="pomodoro-kanban-note">
                Starting focus moves this task to Doing in Kanban.
              </p>
              <button
                className="task-complete-button"
                type="button"
                onClick={() => onCompleteTask(selectedTask)}
              >
                {selectedTask.mode === "recurring"
                  ? "Complete occurrence"
                  : "Complete task"}
              </button>
            </div>
          ) : (
            <p className="pomodoro-empty">
              Choose any active task. The timer can also run unlinked.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
