import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";
import type { Task } from "../workspace/workspaceTypes";
import { TrashIcon } from "./TrashIcon";

type TaskCardProps = {
  task: Task;
  summary: string;
  dueText: string;
  modeText: string;
  isOverdue: boolean;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onTouchMove: (targetFolderId: string, targetTaskId?: string) => void;
  onDropOnTask: (event: DragEvent<HTMLElement>, targetTaskId: string) => void;
  onComplete: () => void;
  onDelete: () => void;
  deleteLabel?: string;
};

type DragPreview = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  background: string;
  borderColor: string;
};

export function TaskCard({
  task,
  summary,
  dueText,
  modeText,
  isOverdue,
  onDragStart,
  onDragEnd,
  onOpen,
  onTouchMove,
  onDropOnTask,
  onComplete,
  onDelete,
  deleteLabel = "Delete task",
}: TaskCardProps) {
  const longPressTimer = useRef<number | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const touchPosition = useRef<{ x: number; y: number } | null>(null);
  const autoScrollFrame = useRef<number | null>(null);
  const documentTouchMoveLock = useRef<((event: globalThis.TouchEvent) => void) | null>(
    null,
  );
  const suppressClick = useRef(false);
  const isTouchDraggingRef = useRef(false);
  const [isTouchDragging, setIsTouchDragging] = useState(false);
  const [touchPreview, setTouchPreview] = useState<DragPreview | null>(null);
  const [desktopPreview, setDesktopPreview] = useState<DragPreview | null>(null);
  const clearLongPress = () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };
  const getDragPreview = (
    x: number,
    y: number,
    width?: number,
    height?: number,
  ): DragPreview => {
    const card = cardRef.current;
    const bounds = card?.getBoundingClientRect();
    const cardStyle = card ? getComputedStyle(card) : null;
    return {
      x,
      y,
      width: width ?? bounds?.width ?? 180,
      height: height ?? bounds?.height ?? 104,
      color: cardStyle?.color ?? "#ffffff",
      background: cardStyle?.backgroundColor ?? "#27272a",
      borderColor: cardStyle?.borderColor ?? "#52525b",
    };
  };
  const stopAutoScroll = () => {
    if (autoScrollFrame.current !== null)
      window.cancelAnimationFrame(autoScrollFrame.current);
    autoScrollFrame.current = null;
  };
  const unlockDocumentScroll = () => {
    if (documentTouchMoveLock.current)
      document.removeEventListener("touchmove", documentTouchMoveLock.current);
    documentTouchMoveLock.current = null;
  };
  const scrollWhileDragging = () => {
    if (!isTouchDraggingRef.current || !touchPosition.current) {
      autoScrollFrame.current = null;
      return;
    }
    const edgeSize = 88;
    const { y } = touchPosition.current;
    let distance = 0;
    if (y < edgeSize) distance = -Math.ceil(((edgeSize - y) / edgeSize) * 14);
    if (y > window.innerHeight - edgeSize)
      distance = Math.ceil(((y - (window.innerHeight - edgeSize)) / edgeSize) * 14);
    if (distance) window.scrollBy(0, distance);
    autoScrollFrame.current = window.requestAnimationFrame(scrollWhileDragging);
  };
  const startAutoScroll = () => {
    stopAutoScroll();
    autoScrollFrame.current = window.requestAnimationFrame(scrollWhileDragging);
  };
  const lockDocumentScroll = () => {
    const lock = (event: globalThis.TouchEvent) => {
      if (isTouchDraggingRef.current && event.cancelable) event.preventDefault();
    };
    documentTouchMoveLock.current = lock;
    document.addEventListener("touchmove", lock, { passive: false });
  };
  const finishTouchDrag = () => {
    isTouchDraggingRef.current = false;
    touchPosition.current = null;
    stopAutoScroll();
    unlockDocumentScroll();
    setTouchPreview(null);
    setIsTouchDragging(false);
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  };
  useEffect(
    () => () => {
      clearLongPress();
      stopAutoScroll();
      unlockDocumentScroll();
    },
    [],
  );
  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch || event.touches.length !== 1) return;
    pressOrigin.current = { x: touch.clientX, y: touch.clientY };
    longPressTimer.current = window.setTimeout(() => {
      const card = cardRef.current;
      const bounds = card?.getBoundingClientRect();
      const taskList = card?.closest<HTMLElement>(".folder-task-list, .main-task-list");
      const listBounds = taskList?.getBoundingClientRect();
      const listStyle = taskList ? getComputedStyle(taskList) : null;
      const listGap = Number.parseFloat(listStyle?.columnGap ?? "") || 0;
      const previewWidth = listBounds
        ? Math.max(1, (listBounds.width - listGap) / 2)
        : (bounds?.width ?? 180);
      suppressClick.current = true;
      isTouchDraggingRef.current = true;
      touchPosition.current = { x: touch.clientX, y: touch.clientY };
      lockDocumentScroll();
      setTouchPreview({
        ...getDragPreview(
          touch.clientX,
          touch.clientY,
          previewWidth,
          taskList ? 104 : undefined,
        ),
      });
      setIsTouchDragging(true);
      startAutoScroll();
    }, 350);
  };
  const handleTouchMove = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    if (isTouchDraggingRef.current) {
      // React registers touch moves as passive; the non-passive document listener
      // installed for the drag owns scroll prevention.
      touchPosition.current = { x: touch.clientX, y: touch.clientY };
      setTouchPreview((current) =>
        current ? { ...current, x: touch.clientX, y: touch.clientY } : current,
      );
      return;
    }
    if (!pressOrigin.current || isTouchDraggingRef.current) return;
    if (
      Math.hypot(
        touch.clientX - pressOrigin.current.x,
        touch.clientY - pressOrigin.current.y,
      ) > 8
    )
      clearLongPress();
  };
  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    clearLongPress();
    pressOrigin.current = null;
    if (!isTouchDraggingRef.current) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const targetTask = element?.closest<HTMLElement>("[data-task-id]");
    const folder = element?.closest<HTMLElement>("[data-folder-id]");
    if (folder?.dataset.folderId)
      onTouchMove(folder.dataset.folderId, targetTask?.dataset.taskId);
    finishTouchDrag();
  };
  const preview = touchPreview ?? desktopPreview;
  return (
    <>
      <article
        ref={cardRef}
        className={`task-card${isOverdue ? " task-card-overdue" : ""}${isTouchDragging ? " task-card-touch-dragging" : ""}${desktopPreview ? " task-card-desktop-dragging" : ""}`}
        draggable={!isTouchDragging}
        data-task-id={task.id}
        role="button"
        tabIndex={0}
        aria-label={`Open ${task.title}`}
        onClick={(event) => {
          event.stopPropagation();
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          onOpen();
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          clearLongPress();
          pressOrigin.current = null;
          finishTouchDrag();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          onOpen();
        }}
        onDragStart={(event) => {
          if (isTouchDraggingRef.current) {
            event.preventDefault();
            return;
          }
          event.stopPropagation();
          const transparentDragImage = document.createElement("canvas");
          transparentDragImage.width = 1;
          transparentDragImage.height = 1;
          event.dataTransfer.setDragImage(transparentDragImage, 0, 0);
          const card = cardRef.current;
          const bounds = card?.getBoundingClientRect();
          const taskList = card?.closest<HTMLElement>(
            ".folder-task-list, .main-task-list",
          );
          const listBounds = taskList?.getBoundingClientRect();
          const listGap = Number.parseFloat(
            taskList ? getComputedStyle(taskList).columnGap : "",
          );
          const previewWidth = listBounds
            ? Math.min(
                bounds?.width ?? listBounds.width,
                Math.max(
                  1,
                  (listBounds.width - (Number.isFinite(listGap) ? listGap : 0)) / 2,
                ),
              )
            : undefined;
          setDesktopPreview(
            getDragPreview(
              event.clientX || (bounds?.left ?? 0) + (bounds?.width ?? 0) / 2,
              event.clientY || (bounds?.top ?? 0) + (bounds?.height ?? 0) / 2,
              previewWidth,
              previewWidth ? 104 : undefined,
            ),
          );
          onDragStart(event);
        }}
        onDrag={(event) => {
          if (!event.clientX && !event.clientY) return;
          setDesktopPreview((current) =>
            current ? { ...current, x: event.clientX, y: event.clientY } : current,
          );
        }}
        onDragEnd={(event) => {
          event.stopPropagation();
          setDesktopPreview(null);
          onDragEnd();
        }}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes("application/x-focusboard-task")) return;
          event.stopPropagation();
          onDropOnTask(event, task.id);
        }}
      >
        <h3>{task.title}</h3>
        {dueText && <span className="task-due">{dueText}</span>}
        <p>{summary}</p>
        <div className="task-footer">
          {isOverdue ? (
            <span className="task-overdue">Overdue</span>
          ) : (
            <span className="task-mode">{modeText}</span>
          )}
          <button
            className="task-complete-button"
            type="button"
            aria-label={`Complete ${task.title}`}
            title={task.mode === "recurring" ? "Complete occurrence" : "Complete task"}
            onClick={(event) => {
              event.stopPropagation();
              onComplete();
            }}
          >
            ✓
          </button>
          <button
            className="task-delete-button"
            type="button"
            aria-label={`${deleteLabel}: ${task.title}`}
            title={deleteLabel}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <TrashIcon />
          </button>
        </div>
      </article>
      {preview &&
        createPortal(
          <div
            className="task-touch-drag-preview"
            aria-hidden="true"
            style={
              {
                "--touch-drag-x": `${preview.x}px`,
                "--touch-drag-y": `${preview.y}px`,
                width: `${preview.width}px`,
                height: `${preview.height}px`,
                color: preview.color,
                background: preview.background,
                borderColor: preview.borderColor,
              } as CSSProperties
            }
          >
            <strong>{task.title}</strong>
            {summary && <span>{summary}</span>}
          </div>,
          document.body,
        )}
    </>
  );
}
