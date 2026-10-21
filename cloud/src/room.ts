// One Durable Object per tournament slug. Holds the latest snapshot (public), the secret part
// (PIN hashes + open orders), the inbox of captain submissions and the PIN rate-limit counters.
import { DurableObject } from 'cloudflare:workers'
import type { LineupSubmission, PublishPayload, PublishedSecret, PublishedSnapshot, TeamLoginResponse } from './contract'
import { buildEncounterInfos, openEncountersFor, overlayPending, validateLineup } from './lineup'
import { verifyPin } from './pin'
import { WINDOW_MS, beginAttempt, finishSuccess, globalLimitMessage, retryMessage } from './ratelimit'

export interface Env {
  TOURNAMENT: DurableObjectNamespace<TournamentRoom>
  ASSETS: Fetcher
  /** Worker secret (wrangler secret put PUBLISH_KEY) shared with the desktop app. */
  PUBLISH_KEY?: string
}

export interface SnapshotJson {
  json: string
  etag: string
}

export type RoomReply<T = object> = ({ ok: true } & T) | { ok: false; status: number; error: string; retryAfterSec?: number }

// Strings are stored in chunks so a large snapshot never hits the per-value storage limit.
const CHUNK_CHARS = 400_000
const SNAP_PREFIX = 'snap:'
const SUB_PREFIX = 'sub:'
const DONE_PREFIX = 'done:'
const RL_PREFIX = 'rl:'
const RLG_PREFIX = 'rlg:'

export class TournamentRoom extends DurableObject<Env> {
  private snapJson: string | null | undefined
  private snapObj: PublishedSnapshot | null = null
  private secretObj: PublishedSecret | null | undefined

  // ---- loading -----------------------------------------------------------

  private async loadSnapshotJson(): Promise<string | null> {
    if (this.snapJson !== undefined) return this.snapJson
    const count = await this.ctx.storage.get<number>('snapChunks')
    if (!count) {
      this.snapJson = null
      return null
    }
    const parts = await this.ctx.storage.get<string>(Array.from({ length: count }, (_, i) => `${SNAP_PREFIX}${i}`))
    let json = ''
    for (let i = 0; i < count; i++) json += parts.get(`${SNAP_PREFIX}${i}`) ?? ''
    this.snapJson = json
    return json
  }

  private async loadSnapshot(): Promise<PublishedSnapshot | null> {
    if (this.snapObj) return this.snapObj
    const json = await this.loadSnapshotJson()
    if (!json) return null
    this.snapObj = JSON.parse(json) as PublishedSnapshot
    return this.snapObj
  }

  private async loadSecret(): Promise<PublishedSecret | null> {
    if (this.secretObj !== undefined) return this.secretObj
    this.secretObj = (await this.ctx.storage.get<PublishedSecret>('secret')) ?? null
    return this.secretObj
  }

  private async pending(): Promise<LineupSubmission[]> {
    const all = await this.ctx.storage.list<LineupSubmission>({ prefix: SUB_PREFIX })
    return [...all.values()].sort((a, b) => a.at - b.at)
  }

  // ---- publish / read ----------------------------------------------------

  async publish(payload: PublishPayload): Promise<void> {
    const json = JSON.stringify(payload.snapshot)
    const oldCount = (await this.ctx.storage.get<number>('snapChunks')) ?? 0
    const chunks: string[] = []
    for (let i = 0; i < json.length; i += CHUNK_CHARS) chunks.push(json.slice(i, i + CHUNK_CHARS))

    // Keep captains' not-yet-collected submissions visible, and drop those whose encounter has started.
    const live: LineupSubmission[] = []
    const dead: string[] = []
    for (const [key, sub] of await this.ctx.storage.list<LineupSubmission>({ prefix: SUB_PREFIX })) {
      if (openEncountersFor(payload.snapshot, payload.secret.openLineups, sub.teamId).some((e) => e.teamMatchId === sub.teamMatchId)) live.push(sub)
      else dead.push(key)
    }
    const secret: PublishedSecret = {
      salt: payload.secret.salt,
      pinHashes: payload.secret.pinHashes,
      openLineups: overlayPending(payload.snapshot, payload.secret, live)
    }

    const entries: Record<string, unknown> = { snapChunks: chunks.length, secret, publishedAt: payload.snapshot.publishedAt }
    chunks.forEach((c, i) => (entries[`${SNAP_PREFIX}${i}`] = c))
    await this.ctx.storage.put(entries)
    const stale = [...dead]
    for (let i = chunks.length; i < oldCount; i++) stale.push(`${SNAP_PREFIX}${i}`)
    if (stale.length) await this.ctx.storage.delete(stale)

    this.snapJson = json
    this.snapObj = payload.snapshot
    this.secretObj = secret
  }

  async getSnapshot(): Promise<SnapshotJson | null> {
    const json = await this.loadSnapshotJson()
    if (!json) return null
    const publishedAt = (await this.ctx.storage.get<number>('publishedAt')) ?? 0
    return { json, etag: `"${publishedAt}"` }
  }

  // ---- captain endpoints -------------------------------------------------

  /** PIN check with two-layer brute-force protection (see ratelimit.ts). `ip` is the client address. */
  private async authenticate(
    teamId: string,
    pin: string,
    ip: string
  ): Promise<{ ok: true; snap: PublishedSnapshot; secret: PublishedSecret } | { ok: false; status: number; error: string; retryAfterSec?: number }> {
    const snap = await this.loadSnapshot()
    const secret = await this.loadSecret()
    if (!snap || !secret) return { ok: false, status: 404, error: 'Tournament not found' }
    if (!snap.teams.some((t) => t.id === teamId)) return { ok: false, status: 401, error: 'Wrong team or PIN' }

    const ipKey = `${RL_PREFIX}${teamId}:${ip}`
    const globalKey = `${RLG_PREFIX}${teamId}`
    const now = Date.now()
    const stored = await this.ctx.storage.get<number[]>([ipKey, globalKey])
    const start = beginAttempt(stored.get(ipKey) ?? [], stored.get(globalKey) ?? [], now)
    if (!start.allowed) return { ok: false, status: 429, error: retryMessage(start.retryAfterMs), retryAfterSec: Math.ceil(start.retryAfterMs / 1000) }
    // Record the attempt before the (async) hash check so parallel guesses all count.
    await this.ctx.storage.put({ [ipKey]: start.ip, [globalKey]: start.global })

    if (!(await verifyPin(secret, teamId, pin))) {
      if (start.globalFull) {
        return { ok: false, status: 429, error: globalLimitMessage(start.globalRetryAfterMs), retryAfterSec: Math.ceil(start.globalRetryAfterMs / 1000) }
      }
      const left = start.ipLeft
      return { ok: false, status: 401, error: left > 0 ? `Wrong PIN. ${left} attempt${left === 1 ? '' : 's'} left.` : retryMessage(WINDOW_MS) }
    }
    // Correct PIN (also when the team-wide cap is full): take back only this attempt, other IPs keep their counters.
    const again = await this.ctx.storage.get<number[]>([ipKey, globalKey])
    const done = finishSuccess(again.get(ipKey) ?? [], again.get(globalKey) ?? [], now)
    if (done.ip.length) await this.ctx.storage.put(ipKey, done.ip)
    else await this.ctx.storage.delete(ipKey)
    if (done.global.length) await this.ctx.storage.put(globalKey, done.global)
    else await this.ctx.storage.delete(globalKey)
    return { ok: true, snap, secret }
  }

  private async confirmedKeys(): Promise<Set<string>> {
    const keys = await this.ctx.storage.list({ prefix: DONE_PREFIX })
    return new Set([...keys.keys()].map((k) => k.slice(DONE_PREFIX.length)))
  }

  async teamLogin(teamId: string, pin: string, ip: string): Promise<RoomReply<Pick<Extract<TeamLoginResponse, { ok: true }>, 'team' | 'players' | 'encounters'>>> {
    const auth = await this.authenticate(teamId, pin, ip)
    if (!auth.ok) return auth
    const { snap, secret } = auth
    const team = snap.teams.find((t) => t.id === teamId)!
    const members = new Set(team.members)
    return {
      ok: true,
      team,
      players: snap.players.filter((p) => members.has(p.id)),
      encounters: buildEncounterInfos(snap, secret.openLineups, teamId, await this.pending(), await this.confirmedKeys())
    }
  }

  async submitLineup(teamId: string, pin: string, ip: string, teamMatchId: string, lineup: (string | null)[]): Promise<RoomReply> {
    const auth = await this.authenticate(teamId, pin, ip)
    if (!auth.ok) return auth
    const { snap, secret } = auth
    const check = validateLineup(snap, secret.openLineups, teamId, teamMatchId, lineup)
    if (!check.ok) return { ok: false, status: 400, error: check.error }

    const submission: LineupSubmission = { id: crypto.randomUUID(), teamId, teamMatchId, lineup, at: Date.now() }
    // One pending submission per team+encounter: the key is fixed, so a newer one replaces the older.
    const next: PublishedSecret = { ...secret, openLineups: { ...secret.openLineups, [teamMatchId]: { ...secret.openLineups[teamMatchId], [teamId]: lineup } } }
    await this.ctx.storage.put({ [`${SUB_PREFIX}${teamMatchId}:${teamId}`]: submission, secret: next })
    await this.ctx.storage.delete(`${DONE_PREFIX}${teamMatchId}:${teamId}`)
    this.secretObj = next
    return { ok: true }
  }

  // ---- admin (laptop) ----------------------------------------------------

  async inbox(): Promise<LineupSubmission[]> {
    return this.pending()
  }

  async ack(ids: string[]): Promise<number> {
    const wanted = new Set(ids)
    const toDelete: string[] = []
    const done: Record<string, number> = {}
    for (const [key, sub] of await this.ctx.storage.list<LineupSubmission>({ prefix: SUB_PREFIX })) {
      if (!wanted.has(sub.id)) continue
      toDelete.push(key)
      done[`${DONE_PREFIX}${sub.teamMatchId}:${sub.teamId}`] = sub.at
    }
    if (toDelete.length) {
      await this.ctx.storage.put(done)
      await this.ctx.storage.delete(toDelete)
    }
    return toDelete.length
  }
}
