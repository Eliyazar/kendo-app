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
    public.ts        window.kendoPublic { getView, onView }  (read-only)
  renderer/      React apps (admin.html, public.html)
```

### Data flow

1. The Admin window calls `window.kendoAdmin.dispatch(action)`.
2. Main validates the sender and payload, runs the pure reducer, **persists to disk**, then pushes:
   - an `AdminSnapshot` (full state + main clock) to the Admin window,
   - a `PublicView` (names, points, penalties, next match, *never the clock*) to the Public window.

The state lives in the main process (driven only by Admin actions) so the clock keeps running even if a renderer reloads, and every change is on disk before anyone sees it.

### Screens

- **Public Scoreboard**: drawn on a fixed 1920×1080 canvas and scaled to the display. It has a red/white split, names, dojo, circled ippon letters (M/K/D/T, H for an ippon from hansoku), yellow hansoku triangles and a "Next Match" footer. It never shows the clock. At time-up it flashes **TIME UP** (no sound: the referees whistle).
- **Admin Control Panel**: a live preview of the public screen (the same component, scaled down), the master timer (Start/Pause, ±1 s, Reset), Aka/Shiro scoring panels (M, K, D, T, H, Fusen-gachi), Undo and the match order list. When a match ends, a verification modal offers **Correction / Undo** and **Approve & End Match**, or **Start Encho** for a drawn elimination match.
- Shortcuts: `Space` starts or pauses the clock, `Ctrl/Cmd+Z` undoes the last action, and `Ctrl/Cmd+Shift+P` reopens the public window.

### Crash recovery

The state file is rewritten on every action and every second while the clock runs. A running clock is saved as *paused at the current time*, so after a crash or power loss the match restores to the same score and second, paused, waiting for the operator. A clean quit is flagged; anything else shows a "restored" notice.

The state file lives in the OS user-data folder (`%APPDATA%/Kendo Tournament Manager` on Windows, `~/Library/Application Support/Kendo Tournament Manager` on macOS).
