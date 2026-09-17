# Lockin Board PWA architecture

## Runtime

- **React + TypeScript** renders the workspace.
- **Vite** builds the static application bundle.
- A **web manifest** allows installation in a standalone app window.
- A **service worker** caches the application shell after first load for offline startup.

## Local data

`src/lib/workspaceStorage.ts` owns browser persistence. It stores one versioned workspace snapshot in IndexedDB and writes it through a read-write transaction. The snapshot contains tasks, folders, calendar entries, and Pomodoro sessions.

The workspace domain is deliberately split so the page component remains the composition layer:

- `src/app/workspace/` contains the persisted data model, allowed values, formatters, and restore validation.
- `src/app/calendar/` contains pure scheduling helpers and recurrence projection.
- `src/app/pomodoro/` owns the separate local timer state.
- `src/app/components/` contains small visual components with explicit props.
- `src/app/WorkspacePreview.tsx` keeps UI state and coordinates page interactions; small visual components live beside it.

Each domain module keeps its focused Vitest file beside the implementation. That makes the scheduling and restore-safety rules visible without introducing a separate, detached test tree.

The UI asks the browser for persistent storage, but it must still present export and restore because browser profile resets and manual site-data clearing are outside the app's control.

## Backups

Export produces a readable JSON file containing a schema version, timestamp, and full workspace snapshot. Restore checks the version and the required collections before replacing the in-browser workspace. Keep backups outside browser-managed storage.

## Development

```powershell
npm ci
npm run dev
npm run build
npm test
```

No Rust toolchain, native build system, code-signing setup, or Windows application-control exception is required.
