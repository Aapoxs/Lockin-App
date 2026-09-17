import { calendarEntryRecurrence } from "./calendarUtils";
import type { CalendarEntry, Task } from "../workspace/workspaceTypes";

type CalendarEntryMenuProps = {
  entry: CalendarEntry;
  task: Task;
  isOpen: boolean;
  onToggle: () => void;
  onComplete: () => void;
  onReopen: () => void;
  onClearSlot: () => void;
  onClearSeries: () => void;
};

/** The per-occurrence actions shared by week and month calendar events. */
export function CalendarEntryMenu({
  entry,
  task,
  isOpen,
  onToggle,
  onComplete,
  onReopen,
  onClearSlot,
  onClearSeries,
}: CalendarEntryMenuProps) {
  const isComplete = entry.status === "completed" || task.status === "completed";
  const repeats = Boolean(calendarEntryRecurrence(entry, task));

  return (
    <div className="calendar-event-settings">
      <button
        className="calendar-event-settings-trigger"
        type="button"
        aria-label={`Settings for ${task.title}`}
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        •••
      </button>
      {isOpen && (
        <div className="calendar-event-settings-menu" role="menu">
          {isComplete ? (
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                onReopen();
              }}
            >
              Reopen {repeats ? "occurrence" : "task"}
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                onComplete();
              }}
            >
              Complete task
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              onClearSlot();
            }}
          >
            Clear this time slot
          </button>
          {repeats && (
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                onClearSeries();
              }}
            >
              Clear repeating series
            </button>
          )}
        </div>
      )}
    </div>
  );
}
