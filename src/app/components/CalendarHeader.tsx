import type { CalendarView } from "../workspace/workspaceTypes";

type CalendarHeaderProps = {
  calendarView: CalendarView;
  periodName: string;
  periodLabel: string;
  onToday: () => void;
  onShiftPeriod: (direction: -1 | 1) => void;
  onViewChange: (view: CalendarView) => void;
};

export function CalendarHeader({
  calendarView,
  periodName,
  periodLabel,
  onToday,
  onShiftPeriod,
  onViewChange,
}: CalendarHeaderProps) {
  return (
    <header className="calendar-page-header">
      <div>
        <h1 id="calendar-page-title">Calendar</h1>
      </div>
      <div className="calendar-page-actions">
        <button className="calendar-nav-today" type="button" onClick={onToday}>
          Today
        </button>
        <div className="calendar-nav" aria-label="Change calendar period">
          <button
            type="button"
            aria-label={`Previous ${periodName}`}
            onClick={() => onShiftPeriod(-1)}
          >
            ‹ <span className="calendar-nav-word">Prev</span>
          </button>
          <span aria-live="polite">{periodLabel}</span>
          <button
            type="button"
            aria-label={`Next ${periodName}`}
            onClick={() => onShiftPeriod(1)}
          >
            <span className="calendar-nav-word">Next</span> ›
          </button>
        </div>
        <div className="calendar-view-switch" role="tablist" aria-label="Calendar view">
          {(["week", "month", "year"] as CalendarView[]).map((view) => (
            <button
              type="button"
              role="tab"
              aria-selected={calendarView === view}
              key={view}
              onClick={() => onViewChange(view)}
            >
              {view[0].toUpperCase() + view.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
