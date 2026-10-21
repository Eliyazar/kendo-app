// Pure input validation (no Workers runtime needed, unit-tested).
import type { PublishPayload } from './contract'

export const SLUG_RE = /^[a-z0-9]{6,32}$/
export const MAX_BODY_BYTES = 4 * 1024 * 1024
export const MAX_SMALL_BODY_BYTES = 16 * 1024

export const isSlug = (v: unknown): v is string => typeof v === 'string' && SLUG_RE.test(v)

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const isString = (v: unknown): v is string => typeof v === 'string'
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string }
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** (Id | null)[] */
export function isLineupArray(v: unknown): v is (string | null)[] {
  return Array.isArray(v) && v.length <= 16 && v.every((x) => x === null || isId(x))
}

/**
 * Shape check of a publish payload. Checks the parts the worker relies on (and the secret part completely);
 * the display-only parts of the snapshot are only checked structurally.
 */
export function validatePublishPayload(body: unknown): Checked<PublishPayload> {
  if (!isRecord(body)) return fail('Body must be a JSON object')
  if (!isSlug(body.slug)) return fail('Invalid slug (use 6-32 lowercase letters or digits)')
  const snap = body.snapshot
  if (!isRecord(snap)) return fail('Missing snapshot')
  if (snap.version !== 1) return fail('Unsupported snapshot version')
  if (!isFiniteNumber(snap.publishedAt)) return fail('Invalid snapshot.publishedAt')
  const tour = snap.tournament
  if (!isRecord(tour)) return fail('Missing snapshot.tournament')
  if (!isString(tour.name) || (tour.mode !== 'individual' && tour.mode !== 'team')) return fail('Invalid snapshot.tournament')
  if (tour.teamSize !== undefined && (!Number.isInteger(tour.teamSize) || (tour.teamSize as number) < 1 || (tour.teamSize as number) > 16)) {
    return fail('Invalid snapshot.tournament.teamSize')
  }
  for (const key of ['courts', 'players', 'teams', 'pools', 'matches', 'encounters', 'podium'] as const) {
    if (!Array.isArray(snap[key])) return fail(`snapshot.${key} must be an array`)
  }
  if (snap.bracket !== null && !isRecord(snap.bracket)) return fail('Invalid snapshot.bracket')

  for (const c of snap.courts as unknown[]) if (!isRecord(c) || !isId(c.id) || !isString(c.name) || !isRecord(c.view)) return fail('Invalid court')
  for (const t of snap.teams as unknown[]) {
    if (!isRecord(t) || !isId(t.id) || !isString(t.name) || !Array.isArray(t.members) || !t.members.every(isId)) return fail('Invalid team')
  }
  for (const p of snap.players as unknown[]) if (!isRecord(p) || !isId(p.id) || !isString(p.name)) return fail('Invalid player')
  for (const m of snap.matches as unknown[]) if (!isRecord(m) || !isId(m.id) || !isFiniteNumber(m.order)) return fail('Invalid match')
  for (const e of snap.encounters as unknown[]) {
    if (!isRecord(e) || !isId(e.id) || !isId(e.akaTeamId) || !isId(e.shiroTeamId) || !isString(e.label)) return fail('Invalid encounter')
  }

  const sec = body.secret
  if (!isRecord(sec)) return fail('Missing secret')
  if (!isString(sec.salt) || sec.salt.length > 256) return fail('Invalid secret.salt')
  if (!isRecord(sec.pinHashes)) return fail('Invalid secret.pinHashes')
  for (const [team, hash] of Object.entries(sec.pinHashes)) {
    if (!isId(team) || typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) return fail('Invalid PIN hash')
  }
  if (!isRecord(sec.openLineups)) return fail('Invalid secret.openLineups')
  for (const [tm, perTeam] of Object.entries(sec.openLineups)) {
    if (!isId(tm) || !isRecord(perTeam)) return fail('Invalid openLineups')
    for (const [team, lineup] of Object.entries(perTeam)) if (!isId(team) || !isLineupArray(lineup)) return fail('Invalid openLineups lineup')
  }
  return { ok: true, value: body as unknown as PublishPayload }
}

/** Body of the team login endpoint. */
export function validateTeamLogin(body: unknown): Checked<{ teamId: string; pin: string }> {
  if (!isRecord(body) || !isId(body.teamId) || typeof body.pin !== 'string') return fail('Expected { teamId, pin }')
  if (!/^\d{6}$/.test(body.pin)) return fail('The PIN has 6 digits')
  return { ok: true, value: { teamId: body.teamId, pin: body.pin } }
}

export function validateLineupBody(body: unknown): Checked<{ teamId: string; pin: string; teamMatchId: string; lineup: (string | null)[] }> {
  const login = validateTeamLogin(body)
  if (!login.ok) return login
  const b = body as Record<string, unknown>
  if (!isId(b.teamMatchId)) return fail('Missing teamMatchId')
  if (!isLineupArray(b.lineup)) return fail('Invalid lineup')
  return { ok: true, value: { ...login.value, teamMatchId: b.teamMatchId, lineup: b.lineup } }
}

export function validateAckBody(body: unknown): Checked<{ ids: string[] }> {
  if (!isRecord(body) || !Array.isArray(body.ids) || body.ids.length > 1000 || !body.ids.every(isId)) return fail('Expected { ids: string[] }')
  return { ok: true, value: { ids: body.ids as string[] } }
}
