import { useState } from "react";
import type { Folder, Task } from "../workspace/workspaceTypes";

type FolderTaskPickerProps = {
  activeTasks: Task[];
  folders: Folder[];
  label: string;
  selectedTaskId?: string | null;
  allowEmpty?: boolean;
  className?: string;
  onSelectTask: (taskId: string | null) => void;
};

/** A compact, two-step task picker that keeps event tasks out of focus workflows. */
export function FolderTaskPicker({
  activeTasks,
  folders,
  label,
  selectedTaskId = null,
  allowEmpty = false,
  className = "",
  onSelectTask,
}: FolderTaskPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const foldersWithTasks = [
    {
      id: "main",
      label: "Main",
      tasks: activeTasks.filter((task) => task.destination === "Main"),
    },
    ...folders
      .filter((folder) => (folder.group ?? "unassigned") !== "events")
      .map((folder) => ({
        id: folder.id,
        label: folder.name,
        tasks: activeTasks.filter((task) => task.destination === folder.id),
      })),
  ].filter((folder) => folder.tasks.length > 0);
  const selectedFolder = foldersWithTasks.find(
    (folder) => folder.id === selectedFolderId,
  );

  const closePicker = () => {
    setIsOpen(false);
    setSelectedFolderId(null);
  };

  return (
    <div className={`folder-task-picker ${className}`.trim()}>
      <button
        className={`folder-task-picker-trigger${selectedTaskId ? "" : " folder-task-picker-trigger-empty"}`}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => {
          setIsOpen((current) => !current);
          if (isOpen) setSelectedFolderId(null);
        }}
      >
        <span>{label}</span>
      </button>
      {isOpen && (
        <div className="folder-task-picker-menu" role="dialog" aria-label="Choose a task">
          {selectedFolder ? (
            <>
              <header className="folder-task-picker-menu-header">
                <strong>{selectedFolder.label}</strong>
                <button
                  className="folder-task-picker-back"
                  type="button"
                  onClick={() => setSelectedFolderId(null)}
                >
                  ← Back
                </button>
              </header>
              <div className="folder-task-picker-options folder-task-picker-task-options">
                {selectedFolder.tasks.map((task) => (
                  <button
                    className="folder-task-picker-option"
                    type="button"
                    key={task.id}
                    aria-pressed={selectedTaskId === task.id}
                    onClick={() => {
                      onSelectTask(task.id);
                      closePicker();
                    }}
                  >
                    <span>{task.title}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="folder-task-picker-options">
              {allowEmpty && (
                <button
                  className="folder-task-picker-option folder-task-picker-empty-option"
                  type="button"
                  aria-pressed={!selectedTaskId}
                  onClick={() => {
                    onSelectTask(null);
                    closePicker();
                  }}
                >
                  <span>No task</span>
                </button>
              )}
              {foldersWithTasks.map((folder) => (
                <button
                  className="folder-task-picker-option folder-task-picker-folder-option"
                  type="button"
                  key={folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                >
                  <span>{folder.label}</span>
                  <b>{folder.tasks.length}</b>
                </button>
              ))}
              {!foldersWithTasks.length && (
                <p className="folder-task-picker-empty">
                  No active tasks are available to choose.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
