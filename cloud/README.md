# Kendo Live (online results service)

A small Cloudflare Workers project that gives a tournament a public live-results page.

- The tournament laptop (the desktop app) POSTs a snapshot whenever something changes.
- Spectators open `https://<your-worker>/t/<code>` on their phones and see courts, schedule, pools, bracket and results, updated every 3 seconds.
- In team mode, captains can send their team's fighting order (oda) with a 6-digit team PIN. The laptop pulls those submissions and applies them.

Everything runs on Cloudflare Workers (API + static web app) with one SQLite-backed Durable Object per tournament. The data contract lives in `../src/shared/published.ts` (imported type-only).

## One-time setup

1. Create a free Cloudflare account at <https://dash.cloudflare.com/sign-up>.
2. In this folder (`cloud/`):
   ```
   npm install
   npx wrangler login
   npx wrangler secret put PUBLISH_KEY      # type a long random key; the desktop app needs the same one
   npm run deploy
   ```
3. Wrangler prints the address, e.g. `https://kendo-live.<your-subdomain>.workers.dev`.

## Connect the desktop app

In the app open **Settings -> Online results** and enter:

- **Server URL**: the worker address from the deploy step (no trailing path).
- **Publish key**: the value you gave `PUBLISH_KEY`.

The tournament code (slug) is derived from the tournament id; the public page is `<server URL>/t/<code>`. Put that link or a QR code on the poster.

## API

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/publish` | `Authorization: Bearer <PUBLISH_KEY>` | Body: `PublishPayload` (max 4 MB, `slug` matches `^[a-z0-9]{6,32}$`, `snapshot.version === 1`). Returns `{ ok: true }`. |
| `GET /api/t/:slug` | none | The public snapshot (never the secret). `ETag` + `If-None-Match` (304), `Cache-Control: no-cache`. 404 `{ error }` if unknown. |
| `POST /api/t/:slug/team` | team PIN | Body `{ teamId, pin }`. Returns `{ ok, team, players, encounters: [{ teamMatchId, label, courtName, opponentTeamName, side, lineup, submitted, confirmed }] }`; on failure `{ ok: false, error }`. |
| `POST /api/t/:slug/lineup` | team PIN | Body `{ teamId, pin, teamMatchId, lineup }`. Validates (encounter open for that team, right length, own members only, no duplicates), stores a `LineupSubmission` in the inbox (replaces an older pending one) and updates the team's visible order. Returns `{ ok: true }`. |
| `GET /api/admin/:slug/inbox` | Bearer | `{ submissions: LineupSubmission[] }` |
| `POST /api/admin/:slug/ack` | Bearer | Body `{ ids: string[] }`; removes those submissions (they then show as "confirmed" to the captain). |
| `GET /api/health` | none | `{ ok: true }` |

Notes:

- Wrong PINs: at most 5 failed attempts per team per client IP (`CF-Connecting-IP`) per 15 minutes, then HTTP 429 for that IP only. On top of that, all IPs together get at most 30 failed attempts per team per 15 minutes; once that is reached, wrong PINs are refused outright, but a correct PIN from an IP that is not itself blocked still works, so a stranger cannot lock the real captain out. A successful login only takes back its own attempt and does not reset anyone else's counters.
- Other teams' open orders are never served. Not-yet-started team bouts show only the team name.
- If the laptop publishes before it has pulled a captain's submission, the pending order is laid over the published one, so the captain does not see it jump back.
- Anything else is served from the built web app; `/t/<code>` falls back to `index.html` (single-page app).

## Costs

The free Workers plan (100,000 requests/day, Durable Objects with SQLite storage included) is fine for small events: each phone polls every 3 seconds only while the page is visible, and unchanged polls are tiny `304` answers cached for 2 seconds per worker instance. For a big event with hundreds of viewers watching all day, switch to Workers Paid (about $5/month) to avoid hitting the daily request limit.

## Local development and testing

```
npm install
cp .dev.vars.example .dev.vars     # then set PUBLISH_KEY, e.g. PUBLISH_KEY=test-key
npm run dev                         # builds the web app, then wrangler dev on http://localhost:8787
node scripts/sample-publish.mjs individual --key test-key
node scripts/sample-publish.mjs team --key test-key   # captain PINs: Alpha 123456, Beta 567890
```

Open `http://localhost:8787/t/demoind001` (individual) or `http://localhost:8787/t/demoteam01` (team, with the Captain tab).

On Windows with a very deep folder path, `wrangler dev` can fail with `SQLITE_CANTOPEN` for the Durable Object store; run it with a short state path: `npx wrangler dev --persist-to C:/kw-state`.

Other scripts: `npm run typecheck`, `npm test` (vitest, pure logic: PIN hash, lineup validation, rate limiter, payload validation), `npm run build` (web app into `dist/`), and `npx wrangler deploy --dry-run --outdir .wrangler/dry` (checks the bundle without an account). For web development with hot reload run `npx vite` next to `wrangler dev` (it proxies `/api` to port 8787).
