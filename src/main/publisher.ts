// Publishes the tournament to the online results page and pulls captains'
// team orders. Never blocks the tournament: failures only change the status.

import type { AdminAction, DispatchResult, OnlineStatus } from '@shared/ipc'
import { openLineups, pinHash, slugFor, toPublished, type LineupSubmission, type PublishPayload } from '@shared/published'
import type { AppState } from '@shared/types'

const MIN_INTERVAL_MS = 1000
const INBOX_INTERVAL_MS = 5000
const TIMEOUT_MS = 8000

export interface PublisherDeps {
  getState(): AppState
  config(): { enabled: boolean; url: string; key: string }
  dispatch(action: AdminAction): DispatchResult
  notice(text: string, tone: 'info' | 'warn'): void
  onStatus(): void
}

async function request(url: string, key: string, init: { method: string; body?: unknown }): Promise<unknown> {
  const res = await fetch(url, {
    method: init.method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: init.body === undefined ? null : JSON.stringify(init.body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  if (res.status === 401 || res.status === 403) throw new Error('The online key was rejected.')
  if (!res.ok) throw new Error(`Server answered ${res.status}.`)
  return res.json()
}

export class Publisher {
  private status: OnlineStatus = { state: 'off', lastPublishedAt: null, publicUrl: null }
  private dirty = false
  private busy = false
  private lastSent = 0
  private failures = 0
  private timer: NodeJS.Timeout | null = null
  private inboxTimer: NodeJS.Timeout | null = null

  constructor(private readonly deps: PublisherDeps) {}

  start(): void {
    this.inboxTimer ??= setInterval(() => void this.pullInbox(), INBOX_INTERVAL_MS)
    this.schedule()
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.inboxTimer) clearInterval(this.inboxTimer)
    this.timer = this.inboxTimer = null
  }

  getStatus(): OnlineStatus {
    const { enabled, url } = this.deps.config()
    const t = this.deps.getState().tournament
    const publicUrl = enabled && url && t ? `${url}/t/${slugFor(t)}` : null
    return enabled ? { ...this.status, publicUrl } : { state: 'off', lastPublishedAt: null, publicUrl: null }
  }

  /** Something changed: publish soon (at most once per second, retries back off). */
  schedule(): void {
    this.dirty = true
    if (this.timer || this.busy) return
    const backoff = this.failures ? Math.min(30_000, 2 ** this.failures * 1000) : 0
    const wait = Math.max(0, this.lastSent + MIN_INTERVAL_MS - Date.now(), backoff)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.publish()
    }, wait)
  }

  private setStatus(next: OnlineStatus): void {
    this.status = next
    this.deps.onStatus()
  }

  private async publish(): Promise<void> {
    const { enabled, url, key } = this.deps.config()
    const state = this.deps.getState()
    const t = state.tournament
    if (!enabled || !url || !key || !t) {
      this.dirty = false
      return
    }
    this.busy = true
    this.dirty = false
    try {
      const snapshot = toPublished(state, Date.now())!
      const salt = t.id
      const pinHashes = Object.fromEntries(await Promise.all(Object.values(t.teams).map(async (team) => [team.id, await pinHash(salt, team.id, team.pin)])))
      const payload: PublishPayload = { slug: slugFor(t), snapshot, secret: { salt, pinHashes, openLineups: openLineups(t) } }
      await request(`${url}/api/publish`, key, { method: 'POST', body: payload })
      this.failures = 0
      this.lastSent = Date.now()
      this.setStatus({ state: 'ok', lastPublishedAt: this.lastSent, publicUrl: null })
    } catch (err) {
      this.failures++
      this.dirty = true
      this.setStatus({ ...this.status, state: 'error', error: err instanceof Error ? err.message : String(err) })
    } finally {
      this.busy = false
      if (this.dirty) this.schedule()
    }
  }

  /** Apply captains' order submissions, then acknowledge them. */
  private async pullInbox(): Promise<void> {
    const { enabled, url, key } = this.deps.config()
    const t = this.deps.getState().tournament
    if (!enabled || !url || !key || !t || t.mode !== 'team') return
    try {
      const slug = slugFor(t)
      const inbox = (await request(`${url}/api/admin/${slug}/inbox`, key, { method: 'GET' })) as { submissions?: LineupSubmission[] }
      const subs = inbox.submissions ?? []
      if (!subs.length) return
      for (const s of subs) {
        const team = t.teams[s.teamId]?.name ?? 'A team'
        const r = this.deps.dispatch({ type: 'SET_LINEUP', teamMatchId: s.teamMatchId, teamId: s.teamId, lineup: s.lineup })
        this.deps.notice(r.ok ? `${team}: captain's order received and applied.` : `${team}: captain's order not applied — ${r.error}`, r.ok ? 'info' : 'warn')
      }
      await request(`${url}/api/admin/${slug}/ack`, key, { method: 'POST', body: { ids: subs.map((s) => s.id) } })
      this.schedule()
    } catch {
      /* status is reported by publish(); inbox retries on the next tick */
    }
  }
}
