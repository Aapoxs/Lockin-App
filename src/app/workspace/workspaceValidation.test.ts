import { describe, expect, it } from "vitest";
import { maxTaskTitleLength } from "./workspaceConstants";
import { isHexColor, isValidWorkspaceSnapshot } from "./workspaceValidation";
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
