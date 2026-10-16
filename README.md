# Kendo Tournament Manager

Offline-first desktop app (Windows/macOS) for running Kendo tournaments: an **Admin Control Panel** on the laptop and a **Public Scoreboard** on the TV/projector.

## Stack

Electron · React 19 + TypeScript · Vite (electron-vite) · Tailwind CSS 4 · crash-safe JSON persistence · Vitest · electron-builder

## Getting started

```bash
npm install        # also downloads the Electron binary
npm run dev        # starts both windows with hot reload
npm test           # rules, tournament and import tests
npm run typecheck
npm run build
```

## Building installers

```bash
npm run dist:win   # Windows NSIS installer  -> release/<version>/
npm run dist:mac   # macOS .dmg (x64 + arm64), must run on a Mac
npm run dist:dir   # unpacked app only, quickest check
```

Installers are not code-signed, so Windows SmartScreen and macOS Gatekeeper will warn on first launch. The app uses the default Electron icon until a `build/icon.png` (1024×1024) is added.

## Running a tournament

1. **Setup**: enter the name, date and mode (individual or team with 3/4/5 players), pool size, qualifiers per pool and match times. Add participants by hand or with **Import CSV / Excel…** (see `samples/`).
   - Recognised columns: `Name` (or `First name` + `Last name`), `Dojo`/`Club`, `Team`, `Grade`, `Seed`. German and French header names work too. CSV with `,` or `;` and `.xlsx` (first sheet) are supported.
   - Team mode: players with the same `Team` value form one team, in file order. Short teams keep empty positions, and those bouts are won by fusen-gachi.
2. **Pools**: the draw spreads seeded entrants first and keeps dojo mates apart. The round-robin fight order is interleaved across pools, so fighters rest between matches.
3. **Pool Review** (Pools tab): standings are ranked by wins › (team: bouts won) › ippons scored › ippons conceded › head-to-head. An absolute tie on a qualifying place is flagged with **Generate Tie-Breaker Match**: an ippon-shobu with Encho (representatives in team mode). **Lock Pools & Generate Brackets** is enabled once every pool match is approved and no ties remain.
4. **Bracket**: pool winners are seeded first, and same-pool qualifiers go to opposite halves. Byes are handled, and winners advance automatically. A level team encounter (wins and ippons) gets a **daihyo-sen**, where the operator picks one representative per team.
5. **Close tournament** archives it to `archive/` in the data folder before starting a new one.

## Architecture

```
src/
  shared/        Pure TypeScript, used by every process
    types.ts         Data schema: Tournament, Match, Player, Team, PointEvent, ...
    match-engine.ts  Kendo rules: timer, Nihon Shobu, Hansoku math, Encho, undo
    setup.ts         Setup validation, pool draw, round-robin scheduling
    standings.ts     Pool standings, tie-break chain, absolute-tie detection
    bracket.ts       Seeding, byes, winner progression
    encounters.ts    Matches, team encounters, team tally, daihyo-sen
    import-parse.ts  Participant rows -> entrants (header aliases, dedupe)
    reducer.ts       App-level reducer (all admin actions)
    public-view.ts   Redacted projection for the public screen (no clock!)
    ipc.ts           IPC channel names, AdminAction union, bridge interfaces
  main/          Electron main process
    index.ts         App lifecycle, menu, single-instance lock
    windows.ts       AdminWindow + PublicWindow (fullscreen on external display)
    store.ts         Authoritative state, 100 ms clock loop, auto-save
    persistence.ts   Atomic JSON writes (tmp + fsync + rename, .bak fallback), archive
    import.ts        File picker + CSV/XLSX reading
    ipc.ts           ipcMain handlers, sender checks, action validation, broadcast
  preload/       contextBridge APIs
    admin.ts         window.kendoAdmin  { dispatch, getState, onState, importParticipants }
    public.ts        window.kendoPublic { getView, onView }  (read-only)
  renderer/      React apps (admin.html, public.html)
```

### Data flow

1. The Admin window calls `window.kendoAdmin.dispatch(action)`.
2. Main validates the sender and payload, runs the pure reducer, **persists to disk**, then pushes:
   - an `AdminSnapshot` (full state + main clock) to the Admin window,
   - a `PublicView` (names, points, penalties, next match, champion, *never the clock*) to the Public window.

The state lives in the main process (driven only by Admin actions) so the clock keeps running even if a renderer reloads, and every change is on disk before anyone sees it.

### Screens

- **Public Scoreboard**: drawn on a fixed 1920×1080 canvas and scaled to the display. It has a red/white split, names, dojo, circled ippon letters (M/K/D/T, H for an ippon from hansoku), yellow hansoku triangles, a team score band and a "Next Match" footer. It never shows the clock. At time-up it flashes **TIME UP** (no sound: the referees whistle). At the end it shows the champion.
- **Admin Control Panel** has three tabs:
  - **Shiai-jo**: live preview, master timer (Start/Pause, ±1 s, Reset), Aka/Shiro scoring (M, K, D, T, H, Fusen-gachi), Undo and the match order. When a match ends, a verification modal offers **Correction / Undo** and **Approve & End Match**, or **Start Encho** for a drawn elimination match.
  - **Pools**: standings and Pool Review.
  - **Bracket**: the elimination tree and the champion.
- Shortcuts: `Space` starts or pauses the clock, `Ctrl/Cmd+Z` undoes the last action, and `Ctrl/Cmd+Shift+P` reopens the public window.

### Crash recovery

The state file is rewritten on every action and every second while the clock runs. A running clock is saved as *paused at the current time*, so after a crash or power loss the match restores to the same score and second, paused, waiting for the operator. A clean quit is flagged; anything else shows a "restored" notice.

The state file lives in the OS user-data folder (`%APPDATA%/Kendo Tournament Manager` on Windows, `~/Library/Application Support/Kendo Tournament Manager` on macOS). To rehearse alongside a live tournament, start a second copy with its own data folder by setting `KENDO_PROFILE_DIR=<folder>`.
