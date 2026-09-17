import type { DragEvent, ReactNode } from "react";
import type { Column, Task } from "../workspace/workspaceTypes";

type KanbanPageProps = {
  tasks: Task[];
  renderTask: (task: Task) => ReactNode;
  onDropTask: (event: DragEvent<HTMLElement>, column: Column) => void;
};

const columns: Column[] = ["To do", "Doing", "Done"];

/** Kanban presentation; task mutation remains with the workspace coordinator. */
export function KanbanPage({ tasks, renderTask, onDropTask }: KanbanPageProps) {
  return (
    <section className="kanban-page" aria-labelledby="kanban-title">
      <header className="kanban-heading">
        <div>
          <p className="eyebrow">Task flow</p>
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
                <h2>{column}</h2>
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
