import { describe, expect, it } from "vitest";
import { canScheduleTaskAt, createCalendarEntries } from "./calendarScheduling";
import type { Task } from "../workspace/workspaceTypes";

const recurringTask: Task = {
  id: "task-1",
  title: "Daily standup",
  detail: "",
  tone: "focus",
  column: "To do",
  destination: "Main",
  mode: "recurring",
  status: "active",
  recurrence: "daily",
  repeatLimit: "week",
  completedOccurrences: 0,
};

describe("calendar scheduling", () => {
  it("seeds a repeat series only through its configured end limit", () => {
    let id = 0;
    const entries = createCalendarEntries(
      recurringTask,
      "2026-09-16T14:00",
      () => `entry-${++id}`,
    );

    expect(entries.map((entry) => entry.scheduledAt)).toEqual([
      "2026-09-16T14:00",
      "2026-09-17T14:00",
      "2026-09-18T14:00",
      "2026-09-19T14:00",
      "2026-09-20T14:00",
    ]);
    expect(entries.every((entry) => entry.seriesId === "entry-1")).toBe(true);
  });

  it("blocks an identical recurrence at a time already occupied by the same task", () => {
    const entries = createCalendarEntries(recurringTask, "2026-09-16T14:00", () => "id");

    expect(canScheduleTaskAt(recurringTask, "2026-09-17T14:00", entries)).toBe(false);
    expect(canScheduleTaskAt(recurringTask, "2026-09-17T15:00", entries)).toBe(true);
  });
});
