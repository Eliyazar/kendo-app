# Kendo Tournament Manager

Offline-first desktop app (Windows/macOS) for running Kendo tournaments: an **Admin Control Panel** on the laptop and a **Public Scoreboard** on the TV/projector.

## Stack

Electron · React 19 + TypeScript · Vite (electron-vite) · Tailwind CSS 4 · crash-safe JSON persistence · Vitest

## Getting started

```bash
npm install
npm run dev        # starts both windows with hot reload
npm test           # rules-engine unit tests
npm run typecheck
npm run build
```

## Architecture

```
src/
  shared/        Pure TypeScript, used by every process
    types.ts         Data schema: Tournament, Match, Player, Team, PointEvent, ...
    match-engine.ts  Kendo rules: timer, Nihon Shobu, Hansoku math, Encho, undo
    reducer.ts       App-level reducer (routes actions, approve -> next match)
    public-view.ts   Redacted projection for the public screen (no clock!)
    ipc.ts           IPC channel names, AdminAction union, bridge interfaces
  main/          Electron main process
    index.ts         App lifecycle, menu, single-instance lock
    windows.ts       AdminWindow + PublicWindow (fullscreen on external display)
    store.ts         Authoritative state, 100 ms clock loop, auto-save
    persistence.ts   Atomic JSON writes (tmp + fsync + rename, .bak fallback)
    ipc.ts           ipcMain handlers, sender checks, action validation, broadcast
  preload/       contextBridge APIs
    admin.ts         window.kendoAdmin  { dispatch, getState, onState }
    public.ts        window.kendoPublic { getView, onView, onBuzzer }  (read-only)
  renderer/      React apps (admin.html, public.html)
```

### Data flow

1. The Admin window calls `window.kendoAdmin.dispatch(action)`.
2. Main validates the sender and payload, runs the pure reducer, **persists to disk**, then pushes:
   - an `AdminSnapshot` (full state + main clock) to the Admin window,
   - a `PublicView` (names, points, penalties, next match, *never the clock*) to the Public window,
   - a `buzzer` event to the Public window when time runs out.

The state lives in the main process (driven only by Admin actions) so the clock keeps running even if a renderer reloads, and every change is on disk before anyone sees it.

### Crash recovery

The state file is rewritten on every action and every second while the clock runs. A running clock is saved as *paused at the current time*, so after a crash or power loss the match restores to the same score and second, paused, waiting for the operator. A clean quit is flagged; anything else shows a "restored" notice.

The state file lives in the OS user-data folder (`%APPDATA%/Kendo Tournament Manager` on Windows, `~/Library/Application Support/Kendo Tournament Manager` on macOS).
