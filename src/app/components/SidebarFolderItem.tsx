import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";
import type { Folder } from "../workspace/workspaceTypes";

type SidebarFolderItemProps = {
  folder: Folder;
  taskCount: number;
  onDragStart: (event: DragEvent<HTMLElement>, folderId: string) => void;
  onDrop: (event: DragEvent<HTMLElement>, folderId: string) => void;
  onTouchReorder: (
    movingFolderId: string,
    targetFolderId?: string,
    targetGroup?: string,
  ) => void;
};

type DragPreview = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  background: string;
};

export function SidebarFolderItem({
  folder,
  taskCount,
  onDragStart,
  onDrop,
  onTouchReorder,
}: SidebarFolderItemProps) {
  const longPressTimer = useRef<number | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const isTouchGesture = useRef(false);
  const isTouchReordering = useRef(false);
  const documentTouchMoveLock = useRef<((event: globalThis.TouchEvent) => void) | null>(
    null,
  );
  const [isReordering, setIsReordering] = useState(false);
  const [touchPreview, setTouchPreview] = useState<DragPreview | null>(null);
  const [desktopPreview, setDesktopPreview] = useState<DragPreview | null>(null);

  const clearLongPress = () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };
  const constrainPreviewPosition = (
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    const sidebarBounds = rowRef.current
      ?.closest<HTMLElement>(".sidebar")
      ?.getBoundingClientRect();
    const folderAreaBounds = rowRef.current
      ?.closest<HTMLElement>(".sidebar-folder-groups")
      ?.getBoundingClientRect();
    const rowBounds = rowRef.current?.getBoundingClientRect();
    if (!sidebarBounds || !folderAreaBounds || !rowBounds) return { x, y };
    const minX = sidebarBounds.left + width / 2 + 6;
    const maxX = sidebarBounds.right - width / 2 - 6;
    const firstFolderGroup = rowRef.current
      ?.closest<HTMLElement>(".sidebar-folder-groups")
      ?.querySelector<HTMLElement>("[data-sidebar-folder-group]")
      ?.getBoundingClientRect();
    const minY = (firstFolderGroup?.top ?? folderAreaBounds.top) + height / 2;
    const maxY = folderAreaBounds.bottom - height / 2;
    return {
      x: Math.min(
        Math.max(rowBounds.left + width / 2, Math.min(minX, maxX)),
        Math.max(minX, maxX),
      ),
      y: Math.min(Math.max(y, Math.min(minY, maxY)), Math.max(minY, maxY)),
    };
  };
  const getDragPreview = (x: number, y: number): DragPreview => {
    const row = rowRef.current;
    const bounds = row?.getBoundingClientRect();
    const rowStyle = row ? getComputedStyle(row) : null;
    const rowBackground = rowStyle?.backgroundColor;
    const sidebarBackground = row?.closest<HTMLElement>(".sidebar");
    const background =
      !rowBackground ||
      rowBackground === "transparent" ||
      rowBackground === "rgba(0, 0, 0, 0)"
        ? sidebarBackground
          ? getComputedStyle(sidebarBackground).backgroundColor
          : "#18181b"
        : rowBackground;
    const position = constrainPreviewPosition(
      x,
      y,
      bounds?.width ?? 180,
      bounds?.height ?? 36,
    );
    return {
      ...position,
      width: bounds?.width ?? 180,
      height: bounds?.height ?? 36,
      color: rowStyle?.color ?? "#ffffff",
      background,
    };
  };
  const updatePreviewPosition =
    (x: number, y: number) => (current: DragPreview | null) => {
      if (!current) return current;
      return {
        ...current,
        ...constrainPreviewPosition(x, y, current.width, current.height),
      };
    };
  const unlockScroll = () => {
    if (documentTouchMoveLock.current)
      document.removeEventListener("touchmove", documentTouchMoveLock.current);
    documentTouchMoveLock.current = null;
  };
  const finishReordering = () => {
    isTouchReordering.current = false;
    isTouchGesture.current = false;
    pressOrigin.current = null;
    unlockScroll();
    setTouchPreview(null);
    setIsReordering(false);
  };
  useEffect(
    () => () => {
      clearLongPress();
      unlockScroll();
    },
    [],
  );
  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch || event.touches.length !== 1) return;
    event.stopPropagation();
    isTouchGesture.current = true;
    pressOrigin.current = { x: touch.clientX, y: touch.clientY };
    longPressTimer.current = window.setTimeout(() => {
      isTouchReordering.current = true;
      const lock = (moveEvent: globalThis.TouchEvent) => {
        if (isTouchReordering.current && moveEvent.cancelable) moveEvent.preventDefault();
      };
      documentTouchMoveLock.current = lock;
      document.addEventListener("touchmove", lock, { passive: false });
      setTouchPreview(getDragPreview(touch.clientX, touch.clientY));
      setIsReordering(true);
    }, 350);
  };
  const handleTouchMove = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    if (isTouchReordering.current) {
      // The drag's non-passive document listener prevents scrolling.
      setTouchPreview(updatePreviewPosition(touch.clientX, touch.clientY));
      return;
    }
    if (
      pressOrigin.current &&
      Math.hypot(
        touch.clientX - pressOrigin.current.x,
        touch.clientY - pressOrigin.current.y,
      ) > 8
    )
      clearLongPress();
  };
  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    clearLongPress();
    if (!isTouchReordering.current) {
      isTouchGesture.current = false;
      pressOrigin.current = null;
      return;
    }
    const touch = event.changedTouches[0];
    if (touch) {
      const target = document
        .elementFromPoint(touch.clientX, touch.clientY)
        ?.closest<HTMLElement>("[data-sidebar-folder-id]");
      const targetFolderId = target?.dataset.sidebarFolderId;
      const targetGroup = document
        .elementFromPoint(touch.clientX, touch.clientY)
        ?.closest<HTMLElement>("[data-sidebar-folder-group]")?.dataset.sidebarFolderGroup;
      if (targetFolderId || targetGroup)
        onTouchReorder(folder.id, targetFolderId, targetGroup);
    }
    finishReordering();
  };
  const preview = touchPreview ?? desktopPreview;

  return (
    <>
      <div
        ref={rowRef}
        className={`nav-item nav-folder-item${taskCount === 0 ? " sidebar-folder-empty" : ""}${isReordering || desktopPreview ? " sidebar-folder-reordering" : ""}`}
        data-sidebar-folder-id={folder.id}
        draggable={false}
        style={{ "--folder-color": folder.color } as CSSProperties}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => onDrop(event, folder.id)}
      >
        <span
          className="folder-nav-dot"
          style={{ background: folder.color }}
          aria-hidden="true"
        />
        {folder.name}
        <b>{taskCount || ""}</b>
        <span
          className="sidebar-folder-reorder-handle"
          role="button"
          tabIndex={0}
          aria-label={`Reorder ${folder.name}`}
          title="Hold and drag to reorder"
          draggable={!isReordering}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={() => {
            clearLongPress();
            finishReordering();
          }}
          onDragStart={(event) => {
            event.stopPropagation();
            if (isTouchGesture.current) {
              event.preventDefault();
              return;
            }
            const transparentDragImage = document.createElement("canvas");
            transparentDragImage.width = 1;
            transparentDragImage.height = 1;
            event.dataTransfer.setDragImage(transparentDragImage, 0, 0);
            setDesktopPreview(getDragPreview(event.clientX, event.clientY));
            onDragStart(event, folder.id);
          }}
          onDrag={(event) => {
            if (!event.clientX && !event.clientY) return;
            setDesktopPreview(updatePreviewPosition(event.clientX, event.clientY));
          }}
          onDragEnd={() => {
            setDesktopPreview(null);
          }}
        >
          ⠿
        </span>
      </div>
      {preview &&
        createPortal(
          <div
            className="sidebar-folder-drag-preview"
            aria-hidden="true"
            style={
              {
                "--sidebar-drag-x": `${preview.x}px`,
                "--sidebar-drag-y": `${preview.y}px`,
                width: `${preview.width}px`,
                height: `${preview.height}px`,
                color: preview.color,
                background: preview.background,
                "--folder-color": folder.color,
              } as CSSProperties
            }
          >
            <span className="folder-nav-dot" />
            <strong>{folder.name}</strong>
            {taskCount > 0 && <b>{taskCount}</b>}
          </div>,
          document.body,
        )}
    </>
  );
}
