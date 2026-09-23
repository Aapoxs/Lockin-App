import { describe, expect, it } from "vitest";
import {
  advanceRecurringDate,
  calendarEntryRecurrence,
  calendarSeriesKey,
  isWithinRepeatLimit,
  repeatLimitEnd,
  startOfThreeDayWindow,
  startOfWeek,
  toDateKey,
} from "./calendarUtils";
import type { CalendarEntry, Task } from "../workspace/workspaceTypes";

const recurringTask: Task = {
  id: "task-1",
  title: "Test task",
  detail: "",
  tone: "neutral",
  column: "To do",
  destination: "Main",
  mode: "recurring",
  status: "active",
  recurrence: "weekly",
  completedOccurrences: 0,
};

const scheduledEntry: CalendarEntry = {
  id: "entry-1",
  taskId: recurringTask.id,
  scheduledAt: "2026-01-14T14:00",
  status: "scheduled",
};

describe("calendar utilities", () => {
  it("starts weeks on Monday", () => {
    expect(toDateKey(startOfWeek(new Date("2026-01-18T12:00:00")))).toBe("2026-01-12");
  });

  it("places a date in its three-day mobile calendar window", () => {
    expect(toDateKey(startOfThreeDayWindow(new Date("2026-09-23T12:00:00")))).toBe(
      "2026-09-21",
    );
    expect(toDateKey(startOfThreeDayWindow(new Date("2026-09-25T12:00:00")))).toBe(
      "2026-09-24",
    );
    expect(toDateKey(startOfThreeDayWindow(new Date("2026-09-27T12:00:00")))).toBe(
      "2026-09-27",
    );
  });

  it("keeps a monthly series on the last valid day", () => {
    expect(
      toDateKey(advanceRecurringDate(new Date("2026-01-31T14:00:00"), "monthly")),
    ).toBe("2026-02-28");
  });

  it("uses the task recurrence only when the entry does not override it", () => {
    expect(calendarEntryRecurrence(scheduledEntry, recurringTask)).toBe("weekly");
    expect(
      calendarEntryRecurrence({ ...scheduledEntry, recurrence: "daily" }, recurringTask),
    ).toBe("daily");
  });

  it("uses a stable fallback key for legacy calendar series", () => {
    expect(calendarSeriesKey(scheduledEntry)).toBe("legacy:task-1:14:00");
  });

  it("stops week-limited repeats at the end of their week", () => {
    const repeatUntil = repeatLimitEnd("2026-01-14T14:00", "week");
    expect(repeatUntil).toBe("2026-01-18");
    expect(isWithinRepeatLimit("2026-01-18T14:00", repeatUntil)).toBe(true);
    expect(isWithinRepeatLimit("2026-01-19T14:00", repeatUntil)).toBe(false);
  });
});
