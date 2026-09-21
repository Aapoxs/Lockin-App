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
      <div className="timer" aria-label="Pomodoro timer">
        <span className="timer-dot" aria-hidden="true" />
        <strong>{timerText}</strong>
        <button
          type="button"
          aria-label={isTimerRunning ? "Pause timer" : "Start timer"}
          onClick={onToggleTimer}
        >
          {isTimerRunning ? "Ⅱ" : "▶"}
        </button>
      </div>
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
    </header>
  );
}
