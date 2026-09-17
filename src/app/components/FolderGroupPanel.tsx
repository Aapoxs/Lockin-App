import type { DragEvent, ReactNode } from "react";
import type { Folder, FolderGroup } from "../workspace/workspaceTypes";

type FolderGroupPanelProps = {
  group: FolderGroup;
  label: string;
  folders: Folder[];
  onMoveFolder: (folderId: string, group: FolderGroup) => void;
  renderFolder: (folder: Folder) => ReactNode;
};

export function FolderGroupPanel({
  group,
  label,
  folders,
  onMoveFolder,
  renderFolder,
}: FolderGroupPanelProps) {
  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const folderId = event.dataTransfer.getData("application/x-lockin-folder");
    if (folderId) onMoveFolder(folderId, group);
  };

  return (
    <section
      className={`folder-group-panel folder-group-${group}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <header>
        <h3>{label}</h3>
        <span>{folders.length}</span>
      </header>
      <div className="folder-group-cards">{folders.map(renderFolder)}</div>
    </section>
  );
}
