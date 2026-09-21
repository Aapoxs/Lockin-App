import type { DragEvent, ReactNode } from "react";
import type { Column, Folder, Task } from "../workspace/workspaceTypes";
import { FolderTaskPicker } from "./FolderTaskPicker";

type KanbanPageProps = {
  tasks: Task[];
  availableTasks: Task[];
  folders: Folder[];
  renderTask: (task: Task) => ReactNode;
  onDropTask: (event: DragEvent<HTMLElement>, column: Column) => void;
  onAddTaskToKanban: (taskId: string) => void;
};

const columns: Column[] = ["To do", "Doing", "Done"];

/** Kanban presentation; task mutation remains with the workspace coordinator. */
export function KanbanPage({
  tasks,
  availableTasks,
  folders,
  renderTask,
  onDropTask,
  onAddTaskToKanban,
}: KanbanPageProps) {
  return (
    <section className="kanban-page" aria-labelledby="kanban-title">
      <header className="kanban-heading">
        <div>
          <h1 id="kanban-title">Kanban</h1>
          <p>
            Move active tasks between stages; completed tasks are archived separately.
          </p>
        </div>
      </header>
      <div className="kanban-board">
        {columns.map((column) => {
          const columnTasks = tasks.filter((task) => task.column === column);
          return (
            <section
              className="kanban-column"
              key={column}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onDropTask(event, column)}
            >
              <header>
                <div className="kanban-column-heading">
                  <h2>{column}</h2>
                  {column === "To do" && (
                    <FolderTaskPicker
                      activeTasks={availableTasks}
                      folders={folders}
                      label="+ Add task"
                      className="kanban-task-picker"
                      onSelectTask={(taskId) => {
                        if (taskId) onAddTaskToKanban(taskId);
                      }}
                    />
                  )}
                </div>
                <span>{columnTasks.length}</span>
              </header>
              <div>{columnTasks.map(renderTask)}</div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
