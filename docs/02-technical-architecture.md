# Lockin Board PWA architecture

## Runtime

- **React + TypeScript** renders the workspace.
- **Vite** builds the static application bundle.
- A **web manifest** allows installation in a standalone app window.
- A **service worker** caches the application shell after first load for offline startup.

## Local data

`src/lib/workspaceStorage.ts` owns browser persistence. It stores one versioned workspace snapshot in IndexedDB and writes it through a read-write transaction. The snapshot contains tasks, folders, calendar entries, and Pomodoro sessions.

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
