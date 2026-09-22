# Lockin Board contributor guide

## Project intent

Lockin Board is a private, offline-first React PWA for one person's tasks, calendar, Kanban board, and Pomodoro sessions. It has no accounts, telemetry, sync, or runtime network requests. Preserve that local-first model unless the user explicitly changes scope.

## Fast orientation

- `src/app/WorkspacePreview.tsx` composes application state and interactions.
- `src/app/workspace/` owns persisted types, constraints, formatting, and backup migration/validation.
- `src/app/calendar/` contains pure scheduling and recurrence logic.
- `src/app/pomodoro/` owns timer persistence.
- `src/app/components/` contains focused visual components.
- `src/lib/workspaceStorage.ts` owns the single IndexedDB workspace snapshot.
- `src/styles/global.css` is intentionally imports only. Keep styles in the existing focused files; do not recreate a monolithic stylesheet.

Read only the files relevant to the requested change. Start with the named component/domain and trace outward only when necessary.

## Data and compatibility rules

- Treat existing IndexedDB workspaces and exported JSON backups as user data. Do not make schema changes casually.
- When changing persisted workspace fields, update `workspaceTypes.ts`, `workspaceValidation.ts`, backup export/import in `WorkspacePreview.tsx`, and focused tests together.
- `migrateWorkspaceSnapshot` must accept older valid backups and supply safe defaults for fields that did not exist yet.
- A missing Pomodoro state is valid. Default it safely; never reject an otherwise valid task-only backup.
- Calendar entries reference tasks; do not turn them into duplicate task records.
- Kanban membership is opt-in through `task.isInKanban`; do not remove a task from its folder merely because it moves on the Kanban board.
- Keep ordering stable. Folder and task order are meaningful and must survive local saves and JSON backup round-trips.

## UI and responsive rules

- Keep the five views on the same task model: Main, Calendar, Pomodoro, Kanban, Completed.
- Support keyboard access, visible focus states, and theme-safe contrast.
- Use the existing responsive layouts rather than adding one-off viewport hacks. The supported layout floor is 360 CSS pixels; below it, preserve usable control sizes instead of compressing text or buttons.
- Desktop and touch drag-and-drop must both work. When modifying drag behavior, preserve clear drop targets, task ordering, and safe removal zones.
- Reuse existing button/control patterns and theme variables. Do not add a theme-specific override when a shared control style or token can express the behavior.
- Keep interactions lightweight: avoid per-pointer-move state writes, avoid unnecessary effects, and debounce persisted workspace saves as the app already does.

## CSS structure

- `foundation.css`: reset, shell, shared structural styles.
- `themes.css` and `custom-theme.css`: preset/custom theme colors and overrides.
- `folders.css`: folders, tasks, and their interactions.
- `task-calendar.css`: calendar and task scheduling UI.
- `picker-pomodoro.css`: task pickers and Pomodoro UI.
- `pages.css` and `shell-responsive.css`: page-level and responsive rules.

Prefer a small shared selector or CSS variable over duplicate rules. Keep selector specificity low; use `!important` only where the established custom-theme layer requires it.

## Validation

After code or CSS edits, run:

```powershell
npm.cmd run format
npm.cmd test
npm.cmd run build
```

For a data-model, import/export, recurrence, or drag-order change, add or update the closest Vitest coverage. For visual work, inspect the relevant page in at least a desktop width, a normal phone width, and each affected theme.

## Working safely

- Preserve unrelated working-tree changes; never reset, checkout, or delete user work to simplify a task.
- Do not commit, deploy, clear local storage, import backups, or alter user data unless explicitly asked.
- Prefer concise changes that fit the existing architecture over new dependencies or broad rewrites.
