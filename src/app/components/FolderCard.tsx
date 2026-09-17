import { useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import type { Folder, FolderGroup, Task } from "../workspace/workspaceTypes";

type FolderCardProps = {
  folder: Folder;
  tasks: Task[];
  isMenuOpen: boolean;
  isRenaming: boolean;
  renameValue: string;
  renderTask: (task: Task) => ReactNode;
  onDragStart: (event: DragEvent<HTMLElement>, folderId: string) => void;
  onDrop: (event: DragEvent<HTMLElement>, folderId: string) => void;
  onOpenMenu: (folder: Folder) => void;
  onToggleRename: () => void;
  onRenameValueChange: (value: string) => void;
  onRenameSubmit: (folderId: string) => void;
  onGroupChange: (folderId: string, group: FolderGroup) => void;
  onColorChange: (folderId: string, color: string) => void;
  onUpNextVisibilityChange: (folderId: string, hidden: boolean) => void;
  onRemove: (folder: Folder) => void;
};

export function FolderCard({
  folder,
  tasks,
  isMenuOpen,
  isRenaming,
  renameValue,
  renderTask,
  onDragStart,
  onDrop,
  onOpenMenu,
  onToggleRename,
  onRenameValueChange,
  onRenameSubmit,
  onGroupChange,
  onColorChange,
  onUpNextVisibilityChange,
  onRemove,
}: FolderCardProps) {
  const [isTaskDragOver, setIsTaskDragOver] = useState(false);
  return (
    <section
      className={`folder-dropzone${isTaskDragOver ? " folder-dropzone-drag-over" : ""}`}
      id={`folder-panel-${folder.id}`}
      data-folder-id={folder.id}
      draggable
      style={{ "--folder-color": folder.color } as CSSProperties}
      onClick={(event) => event.stopPropagation()}
      onDragStart={(event) => onDragStart(event, folder.id)}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("application/x-focusboard-task"))
          setIsTaskDragOver(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setIsTaskDragOver(false);
      }}
      onDrop={(event) => {
        setIsTaskDragOver(false);
        onDrop(event, folder.id);
      }}
      aria-label={`Move task into ${folder.name}`}
    >
      <header>
        <h3>{folder.name}</h3>
        <span>{tasks.length}</span>
        <button
          className="folder-menu-button"
          type="button"
          aria-label={`Actions for ${folder.name}`}
          aria-expanded={isMenuOpen}
          onClick={(event) => {
            event.stopPropagation();
            onOpenMenu(folder);
          }}
        >
          •••
        </button>
      </header>
      {isMenuOpen && (
        <div className="folder-menu" role="menu">
          <button type="button" onClick={onToggleRename}>
            Rename
          </button>
          {isRenaming && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onRenameSubmit(folder.id);
              }}
            >
              <input
                aria-label="Folder name"
                autoFocus
                value={renameValue}
                onChange={(event) => onRenameValueChange(event.target.value)}
              />
              <button type="submit">Save</button>
            </form>
          )}
          <label className="folder-group-control">
            Section{" "}
            <select
              aria-label={`Section for ${folder.name}`}
              value={folder.group ?? "unassigned"}
              onChange={(event) =>
                onGroupChange(folder.id, event.target.value as FolderGroup)
              }
            >
              <option value="tasks">Tasks</option>
              <option value="events">Events</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </label>
          <label className="folder-color-control">
            Color{" "}
            <input
              type="color"
              value={folder.color}
              onChange={(event) => onColorChange(folder.id, event.target.value)}
            />
          </label>
          <label className="folder-up-next-control">
            <input
              type="checkbox"
              checked={Boolean(folder.hideFromUpNext)}
              onChange={(event) =>
                onUpNextVisibilityChange(folder.id, event.target.checked)
              }
            />
            Hide from Up next
          </label>
          <button
            className="folder-remove-button"
            type="button"
            onClick={() => onRemove(folder)}
          >
            Remove folder
          </button>
        </div>
      )}
      {tasks.length ? (
        <div className="folder-task-list">{tasks.map(renderTask)}</div>
      ) : (
        <p>Drop a task here</p>
      )}
    </section>
  );
}
