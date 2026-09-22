import type { CSSProperties, DragEvent, ReactNode } from "react";
import { calendarEntryRecurrence } from "./calendarUtils";
import type { CalendarEntry, Task } from "../workspace/workspaceTypes";

type CalendarScheduledEventProps = {
  entry: CalendarEntry;
  task: Task;
  color: string;
  countdown: string;
  isHighlighted?: boolean;
  menu: ReactNode;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onReopen: () => void;
};

/** Shared calendar event card used by the week and month views. */
export function CalendarScheduledEvent({
  entry,
  task,
  color,
  countdown,
  isHighlighted = false,
  menu,
  onDragStart,
  onReopen,
}: CalendarScheduledEventProps) {
  const isComplete = entry.status === "completed" || task.status === "completed";

  return (
    <article
      className={`scheduled-event${isHighlighted ? " scheduled-event-highlighted" : ""}${isComplete ? " scheduled-event-completed" : ""}`}
      data-calendar-touch-entry-id={entry.id}
      style={{ "--task-folder-color": color } as CSSProperties}
      draggable={!entry.id.startsWith("recurring:")}
      onDragStart={onDragStart}
    >
      <strong>{task.title}</strong>
      {menu}
      <footer>
        <span>{countdown}</span>
        {isComplete && !calendarEntryRecurrence(entry, task) && (
          <button
            type="button"
            aria-label={`Reopen ${task.title}`}
            title="Reopen calendar block"
            onClick={(event) => {
              event.stopPropagation();
              onReopen();
            }}
          >
            ↺
          </button>
        )}
      </footer>
    </article>
  );
}
