import { useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Folder, Task } from "../workspace/workspaceTypes";

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
  onColorChange: (folderId: string, color: string) => void;
  onUpNextVisibilityChange: (folderId: string, hidden: boolean) => void;
  onRemove: (folder: Folder) => void;
};

type FolderDragPreview = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  background: string;
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
  onColorChange,
  onUpNextVisibilityChange,
  onRemove,
}: FolderCardProps) {
  const [isTaskDragOver, setIsTaskDragOver] = useState(false);
  const [desktopPreview, setDesktopPreview] = useState<FolderDragPreview | null>(null);
  const isFinePointer = () =>
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const createDesktopPreview = (event: DragEvent<HTMLElement>) => {
    const source = event.currentTarget;
    const bounds = source.getBoundingClientRect();
    const sourceStyle = getComputedStyle(source);
    return {
      x: event.clientX || bounds.left + bounds.width / 2,
      y: event.clientY || bounds.top + 25,
      width: bounds.width,
      height: bounds.height,
      color: sourceStyle.color,
      background: sourceStyle.backgroundColor,
    };
  };
  return (
    <>
      <section
        className={`folder-dropzone${isTaskDragOver ? " folder-dropzone-drag-over" : ""}${desktopPreview ? " folder-dropzone-dragging" : ""}`}
        id={`folder-panel-${folder.id}`}
        data-folder-id={folder.id}
        draggable
        style={{ "--folder-color": folder.color } as CSSProperties}
        onClick={(event) => event.stopPropagation()}
        onDragStart={(event) => {
          const dragTarget = event.target as HTMLElement;
          if (dragTarget.closest(".task-card, button, input, select, textarea")) return;
          if (isFinePointer()) {
            const transparentDragImage = document.createElement("canvas");
            transparentDragImage.width = 1;
            transparentDragImage.height = 1;
            event.dataTransfer.setDragImage(transparentDragImage, 0, 0);
            setDesktopPreview(createDesktopPreview(event));
          }
          onDragStart(event, folder.id);
        }}
        onDrag={(event) => {
          if (!desktopPreview || (!event.clientX && !event.clientY)) return;
          setDesktopPreview((current) =>
            current ? { ...current, x: event.clientX, y: event.clientY } : current,
          );
        }}
        onDragEnd={() => setDesktopPreview(null)}
        onDragEnter={(event) => {
          if (event.dataTransfer.types.includes("application/x-focusboard-task"))
            setIsTaskDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setIsTaskDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
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
            <label className="folder-color-control">
              <span>Color</span>
              <input
                type="color"
                value={folder.color}
                onChange={(event) => onColorChange(folder.id, event.target.value)}
              />
            </label>
            <label className="folder-up-next-control">
              <span>Hide from Up next</span>
              <input
                type="checkbox"
                checked={Boolean(folder.hideFromUpNext)}
                onChange={(event) =>
                  onUpNextVisibilityChange(folder.id, event.target.checked)
                }
              />
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
          <p
            className="folder-empty-drop-target"
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsTaskDragOver(false);
              onDrop(event, folder.id);
            }}
          >
            Drop a task here
          </p>
        )}
      </section>
      {desktopPreview &&
        createPortal(
          <div
            className="folder-drag-preview"
            aria-hidden="true"
            style={
              {
                "--folder-drag-x": `${desktopPreview.x}px`,
                "--folder-drag-y": `${desktopPreview.y}px`,
                "--folder-color": folder.color,
                width: `${desktopPreview.width}px`,
                height: `${desktopPreview.height}px`,
                color: desktopPreview.color,
                background: desktopPreview.background,
              } as CSSProperties
            }
          >
            <strong>{folder.name}</strong>
            <span>{tasks.length}</span>
          </div>,
          document.body,
        )}
    </>
  );
}
