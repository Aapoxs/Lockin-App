# Lockin Board

Lockin Board is a private, local-first **Progressive Web App** (PWA) for organizing tasks in folders and Kanban boards, then completing them with a configurable Pomodoro timer.

For testing and private usage: [https://lockinboard.netlify.app/](https://lockinboard.netlify.app/)

## Development setup

Install a current Node.js LTS release, then run:

```powershell
npm install
npm run dev
```

Open the local URL (usually `http://127.0.0.1:1420`). For a production build, run `npm run build` and serve the `dist` folder from a local or HTTPS web server. Install it from Edge or Chrome's **Install app** option.

Lockin Board stores its workspace in the browser's IndexedDB database for its installed site. It makes no network requests at runtime. Use **Export backup** regularly: it downloads a portable, versioned JSON snapshot containing tasks, folders, calendar entries, and Pomodoro history. **Restore backup** validates the complete structure before replacing the current local workspace.

## Privacy, backups, and publishing

- Lockin Board has: **no accounts, telemetry, server database, or default cross-device sync.**
- Keep exported backups somewhere you trust and do not commit them to a public repository. Files named `lockin-board-backup-*.json` are ignored by Git by default.
- Use a browser or Windows profile that only you trust if your tasks are sensitive. This app is not an encrypted password manager or secure document vault.
- A public deployment gives each visitor a separate local workspace; visitors cannot see one another's tasks.
- Only restore backup files you trust. The app accepts versioned Lockin Board JSON backups up to 5 MB and verifies their expected data structure before importing them.

## Chosen direction

Build an offline-first PWA with **React + TypeScript + IndexedDB**.

- A web manifest lets it install and run in its own window on Windows without an unsigned executable.
- The service worker caches the app shell after first use, allowing it to open while offline.
- IndexedDB saves the complete workspace atomically after edits; the app requests persistent browser storage where the browser supports it.
- Portable JSON backups protect against browser-profile resets, manual site-data clearing, or moving to a different laptop.

See [product specification](docs/01-product-spec.md) and [architecture](docs/02-technical-architecture.md).

## Possible future goals.

- Cloud sync, accounts, collaboration, or telemetry.
- Automatic multi-device sync.
- Third-party task integrations.

Keeping the project local-only is deliberate: it reduces attack surface, CPU/RAM use, and complexity.
