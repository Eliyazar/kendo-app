# Kendo Tournament Manager

> 🇧🇬 Ръководство на български: [docs/РЪКОВОДСТВО.md](docs/РЪКОВОДСТВО.md)

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

### A competition with several categories, from draw files

When the groups are made by someone else in Excel, use **Setup → Import draw files (all categories)…** and pick all the files at once (individual sheets and a team-composition sheet).

- Each sheet becomes a **category** (e.g. "Senior female individual", "Veterans individual", "Senior Teams"). The title, date and shiai-jo letter ("Shiai-jo A") are read from the sheet.
- **Pools and the fight order** are taken exactly as written ("1 – 2", "2 – 3"…). Bracket pairings such as "A1 – B1, B2 – A2" are used for the elimination. A category with a single pool and no bracket gets its podium from the pool ranking.
- Team-composition sheets (team name, then members) become team categories; their pools are drawn by the app.
- The preview lets you untick, rename, move a category to other shiai-jo, and change minutes, team size, pool size and qualifiers. Categories that cannot be created (e.g. a team without members) start unticked with the reason shown.
- During the day, every shiai-jo fights its categories in order: when one category's matches on that court are done (or waiting for Pool Review), the next one starts. The operator can load any match by hand. A started match is never interrupted.
- The Pools, Bracket and Participants tabs have a **category selector**. The TV and stream overlay show the category name. Results and diplomas are saved per category as soon as it finishes.

### A single tournament

1. **Setup**: enter the name, date, mode (individual, or teams of 3/4/5), pool size, qualifiers per pool, match times and number of courts. Add participants by hand or with **Import CSV / Excel…** (see `samples/`). Tick **Here** for everyone who checks in; once anyone is ticked, absent people are left out of the draw.
   - Recognised columns: `Name` (or `First name` + `Last name`), `Dojo`/`Club`, `Country`, `Team`, `Grade`, `Seed`. German, French and Bulgarian header names work too. CSV with `,` or `;` and `.xlsx` (first sheet) are supported.
   - **Country** accepts names or codes in many spellings (`Bulgaria`, `BGR`, `България`) and is stored as the **IOC code** (`BUL`, `SRB`, `GER`).
   - Team mode: players with the same `Team` value form one team, in file order. The first ones are the default order, and up to 2 more are reserves. Short teams keep empty positions, and those bouts are won by fusen-gachi. Each team gets a 6-digit **captain PIN**.
2. **Pools**: the draw spreads seeded entrants first and keeps dojo mates apart. The round-robin fight order is interleaved across pools, so fighters rest between matches.
3. **Pool Review** (Pools tab): standings are ranked by wins › (team: bouts won) › ippons scored › ippons conceded › head-to-head. An absolute tie on a qualifying place is flagged with **Generate Tie-Breaker Match**: an ippon-shobu with Encho (representatives in team mode). **Lock Pools & Generate Brackets** is enabled once every pool match is approved and no ties remain.
4. **Bracket**: pool winners are seeded first, and same-pool qualifiers go to opposite halves. Byes are handled, and winners advance automatically. A level team encounter (wins and ippons) gets a **daihyo-sen**, where the operator picks one representative per team.
5. **When the final is approved**, the results are saved automatically to `Documents/Kendo Tournament Manager/<date> <name>/<category>/`:
   - `results.pdf` and `results.csv`.
   - `diplomas/`: one PDF each for 1st, 2nd and both semi-final losers (3rd); in team mode, one for every team member.
   - `captain-pins.pdf` (team mode).

   **Settings → Export results now** does the same at any time.

   **Your own diploma design**: *Settings → Results & diplomas → Choose design (PDF)…* and *Choose font (TTF/OTF)…* (an installed Lumios Typewriter is found by itself). The name (team members: `Name (Team)`), the place and the category are written on the design's three lines, sized to fit; each category gets one `diplomas.pdf`. **Test diploma (PDF)…** shows three samples. The line positions are set in `src/main/diploma-pdf.ts` (`LAYOUT`) for the Ruse Cup design. On every laptop that makes diplomas, choose the design and font once (they are not part of the app or the repository).
6. **Close competition** archives it to `archive/` in the data folder before starting a new one.

### Changing a running tournament (Participants tab, match order)

- **Edit** names, dojos, countries and grades at any time.
- **Withdraw** someone: if nobody in their pool has fought yet, they simply leave the pool. Otherwise their remaining matches are lost by **kiken** (the opponent wins 2–0). In the bracket, the opponent advances.
- **During a match** (shiai-jo screen): click the big clock to set any time (e.g. `1:23`), or click **Regulation** to change this match's length; the clock must be paused. The ✎ next to a fighter's name fixes the name, country and club on the spot.
- **Team orders on paper**: the **Team orders** strip on the shiai-jo screen lists the next encounters on this court (with how many orders are set). Click one and pick each position as written on the captain's paper; picking a player who is already placed swaps the two.
- **Single-group categories** give 1st, 2nd and two 3rd places (ranks 3 and 4; a group of three has one 3rd). Only ties that change a medal are decided by a tie-breaker.
- **Late entry**: Participants → add → the group list shows each group's size, progress and club mates, with the best fit first. The new matches are fought right after that group's other matches.
- **Suggest** next to the Elimination field fills in the standard pairing for the current groups (winners apart, seconds against other groups, byes when needed).
- **Bracket sheets are read column by column**: a bracket drawn as two columns (`A1 B1` / `B2 A2`) means A1–B2 and B1–A2. **Bracket tab → Elimination** changes the pairings during the competition; if the bracket already exists and no elimination match has started, it is rebuilt with the same qualifiers.
- **Online code**: made from the competition name and date, so Restart, Close + re-import of the same competition keep the same link and QR code.
- **Eliminations right after the pools** (default): when the last pool match of a category is approved, a pool with a flagged tie gets its tie-breaker right after its own matches (before the next pool), and then the pools lock and the bracket is fought straight away, before the next category. If a tie-breaker ends in a circle again, the table decides in Pool Review. Untick the switch in the Pools tab to review and lock by hand (e.g. to add a playoff first).
- **Category order**: ▲ ▼ next to a category's name in the match order moves the whole category earlier or later on the courts (a started match is never interrupted).
- **Restart** (top right, two clicks): the same groups and fight order from the start; every result, added match and bracket is deleted, withdrawals are undone, edited names and countries stay. The previous state is archived.
- **Elimination from a bracket sheet** (import preview, *Elimination* field): write the bracket top to bottom — `A1–B2` is a first-round match, a lone `C1` goes straight to the next round (bye). Example for 11 pools: `A1, B2–D2, C1, J2, E1, I1–F2, H2–G2, K1, A2, E2–C2, B1, J1, D1, H1–I2, K2–F1, G1`. Empty = drawn by the app. Pools drawn side by side are put in name order (A, B, C…); a title like "Men individual - Pools" becomes "Men individual". Old `.xls` files must be saved as `.xlsx` first. ▲ ▼ in the preview set the category order.
- **Fight order**: by default all matches of pool A, then pool B, and so on (as written in the sheet); *Alternate pools* is an option per category. **▲ ▼** in the match order moves a waiting match earlier or later on its court.
- **Extra match (playoff)**: Pools tab → a pool → **+ Add a match**: ippon-shobu between two members, with or without encho (a checkbox); its winner ranks above the loser when their wins are equal (before ippons). An added match that has not started can be deleted (✕ in the match order). Absolute ties on a qualifying place — or on 1st–3rd in a single-pool category, where the pool ranking is the final result — are flagged with **Generate Tie-Breaker Match**.
- **Match screen tools**: **Later — fighter not here** pushes the loaded match behind the next two with other fighters; **Swap Aka / Shiro** before the start; **Kiken** (after the start) when a fighter cannot continue: the opponent wins 2–0, points already scored stand.
- **Award ceremony**: **Show podium on TV** (Bracket tab, or the free-court screen) shows 1st, 2nd and both 3rd places on this court's TV until **Back to the match**.
- **Group sheets**: *Settings → Results & diplomas → Group sheets to print* — every group with fighters and fight order (played results filled in).
- **Remove from group** (pool phase only): deletes the person or team from their pool together with all their pool matches, played ones too, as if they had never been drawn. Use **Withdraw** instead when results against them should stand.
- **Late entry** (pool phase): joins the smallest pool and gets a match against every member.
- **Edit result** (✎ in the match order) corrects an approved match. Pool results can change until the pools are locked. A bracket result can change who advances only while the next round has not started.
- **Teams**: rename, add or remove members, set the default order, and set the order for a specific encounter. Each order locks when that encounter's first bout starts. Captains can also send it from their phone (see Online results), and the table can always override it.

### Stream overlay (OBS)

**Settings → Stream overlay**: turn on *Share on the local network* and copy the address (e.g. `http://192.168.1.20:7777/overlay?court=A`). In OBS on the streaming PC, add a **Browser Source** with that URL at 1920×1080. It shows a transparent lower-third score bar (names, country, points, hansoku, team score) that updates instantly, and never the clock. Windows asks once to allow the app on private networks.

### Several courts

Every court has its own laptop and TV:
- One laptop is the **host**: it owns the tournament, runs every clock and saves everything. Turn on local network sharing there. Settings shows the host address and a **join code**.
- Each other court's laptop chooses **Join a host as a court**, enters the address and code, and picks its court.
- Pools are spread over the courts. **Load here** in the match order moves a waiting match to your court. The final is on the first court.
- **No fighter on two courts at once**: the same person in two categories (matched by name) is never called on one court while fighting on another; the court takes the next possible match, or shows "Waiting: X is fighting on Shiai-jo B".
- **A free court helps**: when a court has nothing left, it offers **Take over** for a whole group another court has not started (the last one in that court's order). Groups are never split.
- **Host laptop broken**: on any court laptop, *Settings → Courts → Take over as host*. It continues with its own copy; the other court laptops join it.
- **Backups** every 2 minutes to `Documents/Kendo Tournament Manager/backups` (and a second folder, e.g. a USB stick). *Settings → Backups → Restore from backup…* loads one on any laptop.
- **Network**: use your own router (cable for the host if possible) rather than the venue Wi-Fi; a court laptop cannot score while it is disconnected.

### Online results (phones, people at home)

The `cloud/` folder is a small Cloudflare Workers site (see `cloud/README.md` for the one-time setup).
- Enter its URL and publish key under **Settings → Online results**. The laptop publishes every change, and spectators open the link or scan the QR code, using their own mobile data.
- Spectators find the QR code on the **TV** (large between matches, small in the corner during a match) and on the **A4 poster** (**Settings → Online results → Poster with QR code (PDF)**) for the entrance and the walls.
- Phones refresh every 5 s while a match is on (15 s otherwise) and the laptop uploads at most every 2 s. This needs the Workers Paid plan ($5/month); on the free plan (100,000 requests a day) slow it down in `cloud/web/src/hooks.ts` and `src/main/publisher.ts`.
- The page shows live courts, schedule, pools, bracket and results, and team captains set their team order with their PIN.
- An encounter's order stays hidden from everyone else until that encounter starts.
- If the internet drops, the tournament is unaffected; publishing resumes automatically.

### Rehearsal copy

Start a second copy with its own data folder, e.g. to practise next to a live tournament, by setting `KENDO_PROFILE_DIR=<folder>`. Its exports stay in that folder.

## Architecture

```
src/
  shared/        Pure TypeScript, used by every process
    types.ts         Data schema: Tournament, Match, Player, Team, PointEvent, ...
    match-engine.ts  Kendo rules: timer, Nihon Shobu, Hansoku math, Encho, undo, kiken
    courts.ts        Courts: which match each one shows, loading the next
    editing.ts       Withdrawals, late entries, result corrections, teams and orders
    progress.ts      After a bout: team tally, bracket advance (also on corrections)
    countries.ts     IOC country codes and spellings
    published.ts     Snapshot for the online page (+ secret part for the worker)
    report.ts        Results report, diplomas, captain PIN slips, CSV
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
    context.ts       Host or court laptop: tournament source, settings, notices
    server.ts        Local network server: OBS overlay, live events, court laptops
    court-client.ts  Court laptop: mirror the host, send this court's actions
    publisher.ts     Online publishing and captains' team orders
    export.ts        PDFs (report, diplomas, PIN slips) and CSV
    settings.ts      Per-laptop settings
    ipc.ts           ipcMain handlers, sender checks, action validation, broadcast
  preload/       contextBridge APIs
    admin.ts         window.kendoAdmin  { dispatch, getState, onState, importParticipants }
    public.ts        window.kendoPublic { getView, onView }  (read-only)
  renderer/      React apps (admin.html, public.html, overlay.html)
cloud/           Cloudflare Workers site for online results (own package.json)
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
