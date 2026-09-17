type UtilityBarProps = {
  timerText: string;
  isTimerRunning: boolean;
  onToggleNavigation: () => void;
  onToggleTimer: () => void;
};

export function UtilityBar({
  timerText,
  isTimerRunning,
  onToggleNavigation,
  onToggleTimer,
}: UtilityBarProps) {
  return (
    <header className="utility-bar">
      <button
        className="mobile-menu-button"
        type="button"
        aria-label="Toggle navigation"
        onClick={(event) => {
          event.stopPropagation();
          onToggleNavigation();
        }}
      >
        <span />
        <span />
        <span />
      </button>
      <div className="timer" aria-label="Pomodoro timer">
        <span className="timer-dot" aria-hidden="true" />
        <span>Focus</span>
        <strong>{timerText}</strong>
        <button
          type="button"
          aria-label={isTimerRunning ? "Pause timer" : "Start timer"}
          onClick={onToggleTimer}
        >
          {isTimerRunning ? "Ⅱ" : "▶"}
        </button>
      </div>
    </header>
  );
}
