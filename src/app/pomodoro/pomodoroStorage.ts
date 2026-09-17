import type { StoredPomodoro } from "../workspace/workspaceTypes";

export const POMODORO_STORAGE_KEY = "lockin-board-pomodoro-v1";

export const defaultPomodoro: StoredPomodoro = {
  durationMinutes: 25,
  remainingSeconds: 25 * 60,
  endsAt: null,
  selectedTaskId: null,
};

export const loadPomodoro = (): StoredPomodoro => {
  try {
    const stored = JSON.parse(
      localStorage.getItem(POMODORO_STORAGE_KEY) ?? "null",
    ) as Partial<StoredPomodoro> | null;
    if (
      !stored ||
      !Number.isInteger(stored.durationMinutes) ||
      (stored.durationMinutes as number) < 1 ||
      (stored.durationMinutes as number) > 240 ||
      !Number.isFinite(stored.remainingSeconds) ||
      (stored.remainingSeconds as number) < 0
    )
      return defaultPomodoro;
    const endsAt =
      typeof stored.endsAt === "string" && !Number.isNaN(Date.parse(stored.endsAt))
        ? stored.endsAt
        : null;
    const remainingSeconds = endsAt
      ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000))
      : Math.floor(stored.remainingSeconds as number);
    return {
      durationMinutes: stored.durationMinutes as number,
      remainingSeconds,
      endsAt: remainingSeconds > 0 ? endsAt : null,
      selectedTaskId:
        typeof stored.selectedTaskId === "string" ? stored.selectedTaskId : null,
    };
  } catch {
    return defaultPomodoro;
  }
};
