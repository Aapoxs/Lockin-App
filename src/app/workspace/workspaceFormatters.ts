import type { Task } from "./workspaceTypes";

export const formatDueDate = (dateKey: string) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(`${dateKey}T12:00:00`),
  );

export const formatScheduledAt = (scheduledAt: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(scheduledAt));

export const formatRemaining = (seconds: number) =>
  `${String(Math.max(0, Math.floor(seconds / 60))).padStart(2, "0")}:${String(Math.max(0, seconds % 60)).padStart(2, "0")}`;

export const formatCalendarRemaining = (seconds: number) => {
  const minutes = Math.max(0, Math.ceil(seconds / 60));
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const remainingMinutes = minutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${remainingMinutes}m`;
  return minutes ? `${minutes}m` : "<1m";
};

export const taskModeLabel = (task: Task) =>
  task.mode === "recurring"
    ? `Repeats ${task.recurrence ?? "weekly"}`
    : task.mode === "deadline"
      ? "Deadline"
      : "One-time";
