import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";
import type { Folder, Task } from "../workspace/workspaceTypes";
import { FolderTaskPicker } from "./FolderTaskPicker";

const queueDragMimeType = "application/x-focusboard-pomodoro-queue";

type QueueDragPreview = {
  x: number;
  y: number;
  width: number;
  color: string;
  background: string;
  borderColor: string;
};

type PomodoroPageProps = {
  sessionCount: number;
  timerText: string;
  durationMinutes: number;
  isRunning: boolean;
  isBreakSession: boolean;
  breaksEnabled: boolean;
  breakMinutes: number;
  activeTasks: Task[];
  folders: Folder[];
  queuedTasks: Task[];
  isAutomaticQueueEnabled: boolean;
  selectedTask: Task | undefined;
  selectedTaskSummary: string;
  onDurationChange: (minutes: number) => void;
  onToggleTimer: () => void;
  onReset: () => void;
  onSelectTask: (taskId: string) => void;
  onClearLinkedTask: () => void;
  onBreaksEnabledChange: (enabled: boolean) => void;
  onBreakMinutesChange: (minutes: number) => void;
  onClearQueue: () => void;
  onToggleAutomaticQueue: () => void;
  onReorderQueueTask: (movingTaskId: string, targetTaskId: string) => void;
  onRemoveQueueTask: (taskId: string) => void;
  onCompleteTask: (task: Task) => void;
};

type PomodoroQueueTaskProps = {
  task: Task;
  onReorder: (movingTaskId: string, targetTaskId: string) => void;
  onRemove: (taskId: string) => void;
};

/** A small draggable queue item with desktop drag and mobile long-press support. */
function PomodoroQueueTask({ task, onReorder, onRemove }: PomodoroQueueTaskProps) {
  const taskRef = useRef<HTMLElement | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const touchPosition = useRef<{ x: number; y: number } | null>(null);
  const isTouchDragging = useRef(false);
  const autoScrollFrame = useRef<number | null>(null);
  const touchScrollLock = useRef<((event: globalThis.TouchEvent) => void) | null>(null);
  const [preview, setPreview] = useState<QueueDragPreview | null>(null);

  const clearLongPress = () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };
  const stopAutoScroll = () => {
    if (autoScrollFrame.current !== null)
      window.cancelAnimationFrame(autoScrollFrame.current);
    autoScrollFrame.current = null;
  };
  const unlockScroll = () => {
    if (touchScrollLock.current)
      document.removeEventListener("touchmove", touchScrollLock.current);
    touchScrollLock.current = null;
  };
  const scrollWhileDragging = () => {
    if (!isTouchDragging.current || !touchPosition.current) return;
    const edge = 88;
    const { y } = touchPosition.current;
    const distance =
      y < edge
        ? -Math.ceil(((edge - y) / edge) * 14)
        : y > window.innerHeight - edge
          ? Math.ceil(((y - (window.innerHeight - edge)) / edge) * 14)
          : 0;
    if (distance) window.scrollBy(0, distance);
    autoScrollFrame.current = window.requestAnimationFrame(scrollWhileDragging);
  };
  const finishTouchDrag = () => {
    isTouchDragging.current = false;
    touchPosition.current = null;
    stopAutoScroll();
    unlockScroll();
    setPreview(null);
  };
  const queueTaskFromDataTransfer = (event: DragEvent<HTMLElement>) =>
    event.dataTransfer.getData(queueDragMimeType);
  const hasQueueTaskInDataTransfer = (event: DragEvent<HTMLElement>) =>
    event.dataTransfer.types.includes(queueDragMimeType);
  const createPreview = (x: number, y: number): QueueDragPreview => {
    const element = taskRef.current;
    const bounds = element?.getBoundingClientRect();
    const style = element ? getComputedStyle(element) : null;
    return {
      x,
      y,
      width: bounds?.width ?? 180,
      color: style?.color ?? "#ffffff",
      background: style?.backgroundColor ?? "#18181b",
      borderColor: style?.borderColor ?? "#52525b",
    };
  };

  useEffect(
    () => () => {
      clearLongPress();
      stopAutoScroll();
      unlockScroll();
    },
    [],
  );

  const onTouchStart = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch || event.touches.length !== 1) return;
    touchStart.current = { x: touch.clientX, y: touch.clientY };
    longPressTimer.current = window.setTimeout(() => {
      isTouchDragging.current = true;
      touchPosition.current = { x: touch.clientX, y: touch.clientY };
      const lock = (moveEvent: globalThis.TouchEvent) => {
        if (isTouchDragging.current && moveEvent.cancelable) moveEvent.preventDefault();
      };
      touchScrollLock.current = lock;
      document.addEventListener("touchmove", lock, { passive: false });
      setPreview(createPreview(touch.clientX, touch.clientY));
      autoScrollFrame.current = window.requestAnimationFrame(scrollWhileDragging);
    }, 350);
  };
  const onTouchMove = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    if (isTouchDragging.current) {
      // The drag's non-passive document listener prevents scrolling.
      touchPosition.current = { x: touch.clientX, y: touch.clientY };
      setPreview((current) =>
        current ? { ...current, x: touch.clientX, y: touch.clientY } : current,
      );
      return;
    }
    if (
      touchStart.current &&
      Math.hypot(
        touch.clientX - touchStart.current.x,
        touch.clientY - touchStart.current.y,
      ) > 8
    )
      clearLongPress();
  };
  const onTouchEnd = (event: TouchEvent<HTMLElement>) => {
    clearLongPress();
    touchStart.current = null;
    if (!isTouchDragging.current) return;
    const touch = event.changedTouches[0];
    if (touch) {
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const queueTask = target?.closest<HTMLElement>("[data-pomodoro-queue-task-id]");
      if (queueTask?.dataset.pomodoroQueueTaskId)
        onReorder(task.id, queueTask.dataset.pomodoroQueueTaskId);
    }
    finishTouchDrag();
  };

  return (
    <>
      <article
        ref={taskRef}
        className={`pomodoro-queue-task${preview ? " pomodoro-queue-task-dragging" : ""}`}
        data-pomodoro-queue-task-id={task.id}
        draggable={!isTouchDragging.current}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={finishTouchDrag}
        onDragStart={(event) => {
          const transparentImage = document.createElement("canvas");
          transparentImage.width = 1;
          transparentImage.height = 1;
          event.dataTransfer.setDragImage(transparentImage, 0, 0);
          event.dataTransfer.setData(queueDragMimeType, task.id);
          event.dataTransfer.effectAllowed = "move";
          setPreview(createPreview(event.clientX, event.clientY));
        }}
        onDrag={(event) => {
          if (!event.clientX && !event.clientY) return;
          setPreview((current) =>
            current ? { ...current, x: event.clientX, y: event.clientY } : current,
          );
        }}
        onDragEnd={() => setPreview(null)}
        onDragOver={(event) => {
          if (hasQueueTaskInDataTransfer(event)) event.preventDefault();
        }}
        onDrop={(event) => {
          const movingTaskId = queueTaskFromDataTransfer(event);
          if (!movingTaskId) return;
          event.preventDefault();
          event.stopPropagation();
          onReorder(movingTaskId, task.id);
        }}
      >
        <div className="pomodoro-queue-task-content">
          <strong>{task.title}</strong>
          {task.detail !== "No note" && <span>{task.detail}</span>}
        </div>
        <button
          className="task-delete-button pomodoro-queue-remove-button"
          type="button"
          aria-label={`Remove ${task.title} from focus queue`}
          title="Remove from focus queue"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(task.id);
          }}
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
      </article>
      {preview &&
        createPortal(
          <div
            className="pomodoro-queue-drag-preview"
            aria-hidden="true"
            style={
              {
                "--queue-drag-x": `${preview.x}px`,
                "--queue-drag-y": `${preview.y}px`,
                width: `${preview.width}px`,
                color: preview.color,
                background: preview.background,
                borderColor: preview.borderColor,
              } as CSSProperties
            }
          >
            <strong>{task.title}</strong>
            {task.detail !== "No note" && <span>{task.detail}</span>}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Pomodoro page presentation with all timer state kept in the workspace coordinator. */
export function PomodoroPage({
  sessionCount,
  timerText,
  durationMinutes,
  isRunning,
  isBreakSession,
  breaksEnabled,
  breakMinutes,
  activeTasks,
  folders,
  queuedTasks,
  isAutomaticQueueEnabled,
  selectedTask,
  selectedTaskSummary,
  onDurationChange,
  onToggleTimer,
  onReset,
  onSelectTask,
  onClearLinkedTask,
  onBreaksEnabledChange,
  onBreakMinutesChange,
  onClearQueue,
  onToggleAutomaticQueue,
  onReorderQueueTask,
  onRemoveQueueTask,
  onCompleteTask,
}: PomodoroPageProps) {
  const [isFocusOptionsOpen, setIsFocusOptionsOpen] = useState(false);

  return (
    <section className="pomodoro-page" aria-labelledby="pomodoro-title">
      <header className="pomodoro-heading">
        <div>
          <h1 id="pomodoro-title">Pomodoro</h1>
          <p>Each completed session is linked to the task you choose.</p>
        </div>
      </header>
      <div className="pomodoro-layout">
        <section className="pomodoro-clock" aria-label="Focus timer">
          <span className="pomodoro-session-count">{sessionCount} sessions today</span>
          <p>{isBreakSession ? "Break session" : "Focus session"}</p>
          <strong>{timerText}</strong>
          {!isBreakSession && selectedTask && <p>Current task: {selectedTask.title}</p>}
          <div className="pomodoro-controls">
            <button className="primary-action" type="button" onClick={onToggleTimer}>
              {isRunning ? "Pause" : "Start focus"}
            </button>
            <button className="pomodoro-reset" type="button" onClick={onReset}>
              Reset
            </button>
            <div className="pomodoro-options">
              <button
                className="pomodoro-options-trigger"
                type="button"
                aria-label="Focus session options"
                aria-expanded={isFocusOptionsOpen}
                onClick={() => setIsFocusOptionsOpen((isOpen) => !isOpen)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
                  <path
                    d="M12 8.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M19.1 13.6a7.4 7.4 0 0 0 0-3.2l1.35-1.05-2.05-3.55-1.6.65a7.2 7.2 0 0 0-2.75-1.6L13.8 3h-4.1l-.25 1.83a7.2 7.2 0 0 0-2.75 1.6l-1.6-.65L3.05 9.33l1.35 1.05a7.4 7.4 0 0 0 0 3.2l-1.35 1.05 2.05 3.55 1.6-.65a7.2 7.2 0 0 0 2.75 1.6L9.7 21h4.1l.25-1.83a7.2 7.2 0 0 0 2.75-1.6l1.6.65 2.05-3.55-1.35-1.05Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {isFocusOptionsOpen && (
                <div
                  className="pomodoro-options-menu"
                  role="dialog"
                  aria-label="Focus options"
                >
                  <label className="pomodoro-option-length">
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
                  <label className="pomodoro-option-break-toggle">
                    <input
                      type="checkbox"
                      checked={breaksEnabled}
                      onChange={(event) => onBreaksEnabledChange(event.target.checked)}
                    />
                    Add a break after focus
                  </label>
                  <label className="pomodoro-option-length">
                    Break length
                    <input
                      aria-label="Break length in minutes"
                      type="number"
                      min="1"
                      max="60"
                      value={breakMinutes}
                      disabled={!breaksEnabled}
                      onChange={(event) =>
                        onBreakMinutesChange(Number(event.target.value))
                      }
                    />
                    <span>min</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        </section>
        <aside className="pomodoro-task-panel">
          <p className="eyebrow">Linked task</p>
          <div className="pomodoro-linked-heading">
            <h2>What are you focusing on?</h2>
            {selectedTask && (
              <button
                className="pomodoro-clear-linked-task"
                type="button"
                onClick={onClearLinkedTask}
              >
                Clear task
              </button>
            )}
          </div>
          <FolderTaskPicker
            activeTasks={activeTasks}
            folders={folders}
            label={selectedTask?.title ?? "No task"}
            selectedTaskId={selectedTask?.id}
            className="pomodoro-task-picker"
            onSelectTask={(taskId) => {
              if (taskId) onSelectTask(taskId);
            }}
          />
          {selectedTask ? (
            <div className="pomodoro-current-task">
              <h3>{selectedTask.title}</h3>
              <p>{selectedTaskSummary}</p>
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
          ) : null}
        </aside>
      </div>
      <section className="pomodoro-queue-section" aria-labelledby="pomodoro-queue-title">
        <header>
          <div>
            <p className="eyebrow">Up next</p>
            <h2 id="pomodoro-queue-title">Focus queue</h2>
          </div>
          <div className="pomodoro-queue-actions">
            <button
              className="pomodoro-queue-action"
              type="button"
              aria-pressed={isAutomaticQueueEnabled}
              onClick={onToggleAutomaticQueue}
            >
              Automatic queue: {isAutomaticQueueEnabled ? "On" : "Off"}
            </button>
            <button
              className="pomodoro-queue-action"
              type="button"
              onClick={onClearQueue}
              disabled={!queuedTasks.length}
            >
              Clear queue
            </button>
          </div>
        </header>
        {queuedTasks.length ? (
          <div className="pomodoro-queue-list">
            {queuedTasks.map((task) => (
              <PomodoroQueueTask
                key={task.id}
                task={task}
                onReorder={onReorderQueueTask}
                onRemove={onRemoveQueueTask}
              />
            ))}
          </div>
        ) : (
          <p className="pomodoro-queue-empty">
            Your queue is clear. Choose another task above to add it here.
          </p>
        )}
      </section>
    </section>
  );
}
