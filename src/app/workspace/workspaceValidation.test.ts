import { describe, expect, it } from "vitest";
import { maxTaskTitleLength } from "./workspaceConstants";
import {
  isHexColor,
  isValidWorkspaceSnapshot,
  migrateWorkspaceSnapshot,
} from "./workspaceValidation";
import type { WorkspaceSnapshot } from "./workspaceTypes";

const validSnapshot: WorkspaceSnapshot = {
  tasks: [
    {
      id: "task-1",
      title: "A valid task",
      detail: "",
      tone: "neutral",
      column: "To do",
      destination: "Main",
      mode: "one-time",
      status: "active",
      completedOccurrences: 0,
    },
  ],
  folders: [
    {
      id: "folder-1",
      name: "Work",
      color: "#2563eb",
      group: "tasks",
    },
  ],
  calendarEntries: [
    {
      id: "entry-1",
      taskId: "task-1",
      scheduledAt: "2026-01-14T14:00",
      status: "scheduled",
    },
  ],
  focusSessions: [],
  preferences: {
    showAllRecurringUpNext: false,
  },
};

describe("workspace validation", () => {
  it("accepts a complete valid snapshot", () => {
    expect(isValidWorkspaceSnapshot(validSnapshot)).toBe(true);
  });

  it("validates Pomodoro queue and break settings in a backup", () => {
    const snapshot = {
      ...validSnapshot,
      pomodoro: {
        durationMinutes: 25,
        remainingSeconds: 1500,
        endsAt: null,
        selectedTaskId: "task-1",
        queueTaskIds: ["task-1"],
        breaksEnabled: true,
        breakMinutes: 5,
        isBreakSession: false,
        isAutomaticQueueEnabled: true,
      },
    };
    expect(isValidWorkspaceSnapshot(snapshot)).toBe(true);
    expect(
      isValidWorkspaceSnapshot({
        ...snapshot,
        pomodoro: { ...snapshot.pomodoro, queueTaskIds: [1] },
      }),
    ).toBe(false);
  });

  it("migrates an older export without newer workspace fields", () => {
    const legacySnapshot = {
      tasks: [
        { id: "legacy-1", title: "First imported task" },
        {
          id: "legacy-2",
          title: "Second imported task",
          destination: "folder-1",
          mode: "recurring",
        },
      ],
    };
    const migrated = migrateWorkspaceSnapshot(legacySnapshot);

    expect(migrated?.tasks.map((task) => task.title)).toEqual([
      "First imported task",
      "Second imported task",
    ]);
    expect(migrated?.tasks[1]).toMatchObject({
      destination: "folder-1",
      mode: "recurring",
      recurrence: "weekly",
      status: "active",
      isInKanban: false,
    });
    expect(migrated?.folders).toEqual([]);
    expect(migrated?.calendarEntries).toEqual([]);
  });

  it("rejects invalid folder colors before restore", () => {
    const snapshot = {
      ...validSnapshot,
      folders: [{ ...validSnapshot.folders[0], color: "not-a-color" }],
    };
    expect(isValidWorkspaceSnapshot(snapshot)).toBe(false);
  });

  it("rejects calendar entries that point to a missing task", () => {
    const snapshot = {
      ...validSnapshot,
      calendarEntries: [{ ...validSnapshot.calendarEntries[0], taskId: "gone" }],
    };
    expect(isValidWorkspaceSnapshot(snapshot)).toBe(false);
  });

  it("rejects task text longer than the supported limits", () => {
    const snapshot = {
      ...validSnapshot,
      tasks: [
        {
          ...validSnapshot.tasks[0],
          title: "x".repeat(maxTaskTitleLength + 1),
        },
      ],
    };
    expect(isValidWorkspaceSnapshot(snapshot)).toBe(false);
  });

  it("only accepts six-digit hexadecimal colors", () => {
    expect(isHexColor("#abcdef")).toBe(true);
    expect(isHexColor("#abc")).toBe(false);
    expect(isHexColor("blue")).toBe(false);
  });
});
