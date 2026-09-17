import type { CSSProperties } from "react";
import type { ScheduledTask } from "../calendar/calendarProjection";

type CalendarDay = {
  key: string;
  day: number;
  inMonth: boolean;
};

type MainOverviewProps = {
  urgentTasks: ScheduledTask[];
  showAllRecurringUpNext: boolean;
  mainCalendarMonthLabel: string;
  mainMonthDays: CalendarDay[];
  activeScheduledTasks: ScheduledTask[];
  formatScheduledAt: (scheduledAt: string) => string;
  getTaskColor: (taskId: string) => string;
  onToggleRecurringFilter: () => void;
  onOpenCalendarEntry: (entry: ScheduledTask["entry"]) => void;
};

export function MainOverview({
  urgentTasks,
  showAllRecurringUpNext,
  mainCalendarMonthLabel,
  mainMonthDays,
  activeScheduledTasks,
  formatScheduledAt,
  getTaskColor,
  onToggleRecurringFilter,
  onOpenCalendarEntry,
}: MainOverviewProps) {
  return (
    <section className="main-overview" aria-label="Main overview">
      <section className="urgent-section" aria-labelledby="urgent-title">
        <header>
          <div>
            <p className="eyebrow">Up next</p>
            <h2 id="urgent-title">On your calendar</h2>
          </div>
          <div className="urgent-heading-actions">
            <button
              className="urgent-repeat-filter"
              type="button"
              aria-pressed={showAllRecurringUpNext}
              onClick={onToggleRecurringFilter}
            >
              {showAllRecurringUpNext ? "All repeats" : "Next repeat only"}
            </button>
            <span>{urgentTasks.length}</span>
          </div>
        </header>
        <div className="urgent-list">
          {urgentTasks.length ? (
            urgentTasks.map(({ entry, task }, index) => (
              <article className="urgent-task" key={entry.id}>
                <span
                  className={`task-accent task-accent-${task.tone}`}
                  aria-hidden="true"
                />
                <div>
                  <h3>{task.title}</h3>
                  <p>
                    {index === 0 ? "Next · " : ""}
                    {formatScheduledAt(entry.scheduledAt)}
                  </p>
                </div>
                <button
                  className="urgent-arrow"
                  type="button"
                  aria-label={`Open ${task.title} in calendar`}
                  onClick={() => onOpenCalendarEntry(entry)}
                >
                  →
                </button>
              </article>
            ))
          ) : (
            <p className="overview-empty">Schedule a task to see it here.</p>
          )}
        </div>
      </section>

      <section
        className="calendar-section main-month-section"
        id="calendar"
        aria-labelledby="calendar-title"
      >
        <header>
          <div>
            <p className="eyebrow">This month</p>
            <h2 id="calendar-title">{mainCalendarMonthLabel}</h2>
          </div>
        </header>
        <div
          className="main-month-calendar"
          aria-label={`Scheduled tasks for ${mainCalendarMonthLabel}`}
        >
          <div className="main-month-weekdays" aria-hidden="true">
            {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
              <span key={`${day}-${index}`}>{day}</span>
            ))}
          </div>
          {mainMonthDays.map((day) => (
            <div
              className={`main-month-day${day.inMonth ? "" : " main-month-day-muted"}`}
              key={day.key}
            >
              <span>{day.day}</span>
              <div className="main-month-dots">
                {activeScheduledTasks
                  .filter(({ entry }) => entry.scheduledAt.startsWith(day.key))
                  .map(({ entry, task }) => (
                    <span
                      className="main-calendar-dot"
                      style={
                        { "--task-folder-color": getTaskColor(task.id) } as CSSProperties
                      }
                      role="img"
                      aria-label={`Scheduled: ${task.title}`}
                      key={entry.id}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
