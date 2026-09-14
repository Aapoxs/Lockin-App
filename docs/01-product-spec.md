# Lockin Board product specification

Lockin Board is a private, offline-first task and focus board for one person. It runs as an installable PWA on Windows and keeps its workspace on the device.

## Core experience

- Main, Calendar, Pomodoro, Kanban, and Completed views share one task model.
- Tasks can be one-time, recurring, or deadline-based; tasks can be grouped in color-coded folders.
- Calendar entries are copies of tasks, so a task can appear in more than one time slot.
- Completing a one-time or deadline task archives it. Completing a recurring task creates its next occurrence.
- Pomodoro sessions can be linked to active tasks and are retained as local history.

## Data safety

- Every edit is saved to IndexedDB after a short debounce.
- The app requests persistent browser storage when available.
- Users can export a versioned JSON backup and restore a valid backup from the Data section of the sidebar.
- No sign-in, telemetry, cloud sync, or background server is part of v1.

## Constraints

- The PWA must remain usable without an internet connection after its first successful load.
- Browser-site data may be cleared by the user or browser reset, so exported backups are the recovery mechanism.
- The UI must remain keyboard-operable with adequate contrast and visible focus states.
