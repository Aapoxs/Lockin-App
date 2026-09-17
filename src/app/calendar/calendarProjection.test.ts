import { describe, expect, it } from "vitest";
import {
  buildProjectedRecurringTasks,
  buildStoredScheduledTasks,
  getRecurringTasksForSlot,
} from "./calendarProjection";
import type { CalendarEntry, Task } from "../workspace/workspaceTypes";

const task: Task = {
  id: "task-1",
  title: "Daily task",
  detail: "",
  tone: "neutral",
  column: "To do",
  destination: "Main",
  mode: "recurring",
  status: "active",
  recurrence: "daily",
  completedOccurrences: 0,
};

const anchor: CalendarEntry = {
  id: "entry-1",
  taskId: task.id,
  seriesId: "series-1",
  recurrence: "daily",
  repeatUntil: "2026-01-03",
  scheduledAt: "2026-01-01T14:00",
  status: "scheduled",
};

describe("calendar projection", () => {
  it("normalizes stored calendar timestamps without changing task links", () => {
    const [stored] = buildStoredScheduledTasks(
      [task],
      [{ ...anchor, scheduledAt: "2026-01-01T14:00:00" }],
    );

    expect(stored.task.id).toBe(task.id);
    expect(stored.entry.scheduledAt).toBe("2026-01-01T14:00");
  });

  it("projects only missing occurrences within the repeat limit", () => {
    const projected = buildProjectedRecurringTasks(
      [task],
      [anchor],
      new Date("2026-01-01T12:00:00"),
    );

    expect(projected.map(({ entry }) => entry.scheduledAt)).toEqual([
      "2026-01-02T14:00",
      "2026-01-03T14:00",
    ]);
  });

  it("returns a generated occurrence only for the requested empty slot", () => {
    expect(getRecurringTasksForSlot([task], [anchor], "2026-01-02T14:00")).toHaveLength(
      1,
    );
    expect(getRecurringTasksForSlot([task], [anchor], "2026-01-02T15:00")).toHaveLength(
      0,
    );
    expect(getRecurringTasksForSlot([task], [anchor], "2026-01-01T14:00")).toHaveLength(
      0,
    );
  });
});
