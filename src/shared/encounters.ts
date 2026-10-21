// Creating matches and team encounters, team lineups, and tallying team results.

import { uid } from './ids'
import type { Id, Match, MatchConfig, MatchKind, Side, Team, TeamMatch, TeamMatchResult, Tournament } from './types'

export class LineupError extends Error {}

export function newMatch(id: Id, kind: MatchKind, akaId: Id | null, shiroId: Id | null, config: MatchConfig, courtId: Id = 'court'): Match {
  return {
    id,
    kind,
    courtId,
    aka: { playerId: akaId },
    shiro: { playerId: shiroId },
    config,
    status: 'scheduled',
    timer: { mode: 'countdown', durationMs: config.durationMs, elapsedMs: 0, runningSince: null },
    encho: false,
    events: []
  }
}

/** Player (individual) or team (team mode) withdrew after the draw. */
export function isWithdrawn(t: Tournament, entrantId: Id): boolean {
  return Boolean(t.mode === 'team' ? t.teams[entrantId]?.withdrawn : t.players[entrantId]?.withdrawn)
}

/** Pool or bracket entrant on one side of a match: player id, or team id in team mode. */
export function entrantOf(t: Tournament, m: Match, side: Side): Id | null {
  return t.mode === 'team' ? (m[side].teamId ?? null) : m[side].playerId
}

export interface Placement {
  courtId: Id
  poolId?: Id
  bracketNodeId?: Id
}

export interface Scheduled {
  t: Tournament
  /** Match id (individual / representative bout) or team match id (team encounter). */
  meetingId: Id
  /** Bout ids added to the fight order. */
  boutIds: Id[]
}

function configFor(t: Tournament, kind: MatchKind): MatchConfig {
  if (kind === 'tie-breaker') return t.deciderConfig
  const base = kind === 'pool' ? t.poolMatchConfig : t.bracketMatchConfig
  // Individual bouts inside a team encounter may end in a draw; only the daihyo-sen goes to Encho.
  return t.mode === 'team' ? { ...base, enchoOnDraw: false } : base
}

/**
 * Create one meeting between two entrants and return the new bouts (not yet queued).
 * Individual: a single match. Team: an encounter with one bout per position,
 * except tie-breakers, which are a single representative bout.
 */
export function createMeeting(t: Tournament, kind: MatchKind, akaId: Id, shiroId: Id, place: Placement): Scheduled {
  if (t.mode === 'individual') {
    const m: Match = { ...newMatch(uid('m'), kind, akaId, shiroId, configFor(t, kind), place.courtId), ...place }
    return { t: { ...t, matches: { ...t.matches, [m.id]: m } }, meetingId: m.id, boutIds: [m.id] }
  }

  if (kind === 'tie-breaker') {
    const m = representativeBout(t, kind, akaId, shiroId, place)
    return { t: { ...t, matches: { ...t.matches, [m.id]: m } }, meetingId: m.id, boutIds: [m.id] }
  }

  const aka = t.teams[akaId]
  const shiro = t.teams[shiroId]
  if (!aka || !shiro) throw new Error('Unknown team.')
  const tmId = uid('tm')
  const config = configFor(t, kind)
  const bouts: Match[] = aka.order.map((_, pos) => ({
    ...newMatch(uid('m'), kind, null, null, config, place.courtId),
    aka: { playerId: aka.order[pos] ?? null, teamId: aka.id },
    shiro: { playerId: shiro.order[pos] ?? null, teamId: shiro.id },
    teamMatchId: tmId,
    position: pos,
    ...place
  }))
  const tm: TeamMatch = {
    id: tmId,
    kind,
    akaTeamId: aka.id,
    shiroTeamId: shiro.id,
    boutIds: bouts.map((b) => b.id),
    status: 'scheduled',
    ...place
  }
  return {
    t: {
      ...t,
      matches: { ...t.matches, ...Object.fromEntries(bouts.map((b) => [b.id, b])) },
      teamMatches: { ...t.teamMatches, [tm.id]: tm }
    },
    meetingId: tm.id,
    boutIds: tm.boutIds
  }
}

/** A bout between two teams whose fighters the operator picks (daihyo-sen / team tie-breaker). */
function representativeBout(t: Tournament, kind: MatchKind, akaTeamId: Id, shiroTeamId: Id, place: Placement): Match {
  return {
    ...newMatch(uid('m'), kind, null, null, t.deciderConfig, place.courtId),
    aka: { playerId: null, teamId: akaTeamId },
    shiro: { playerId: null, teamId: shiroTeamId },
    representative: true,
    ...place
  }
}

/** Insert ids into the fight order right after `afterId` (or at the end). */
export function enqueue(t: Tournament, ids: Id[], afterId?: Id): Tournament {
  const at = afterId ? t.matchQueue.indexOf(afterId) : -1
  const queue = at < 0 ? [...t.matchQueue, ...ids] : [...t.matchQueue.slice(0, at + 1), ...ids, ...t.matchQueue.slice(at + 1)]
  return { ...t, matchQueue: queue }
}

// ---------------------------------------------------------------------------
// Team lineups (oda)
// ---------------------------------------------------------------------------

/** No bout of the encounter has started: its order can still change. */
export function encounterOpen(t: Tournament, tm: TeamMatch): boolean {
  return tm.boutIds.every((id) => {
    const b = t.matches[id]
    return b && b.status === 'scheduled' && b.events.length === 0 && b.timer.elapsedMs === 0 && b.timer.runningSince === null
  })
}

export const sideOfTeam = (tm: TeamMatch, teamId: Id): Side | null =>
  tm.akaTeamId === teamId ? 'aka' : tm.shiroTeamId === teamId ? 'shiro' : null

/** Check a proposed order: one entry per position, members of the team only, nobody twice. */
export function validateLineup(team: Team, lineup: readonly (Id | null)[]): string | null {
  if (lineup.length !== team.size) return `The order needs exactly ${team.size} positions.`
  const ids = lineup.filter((id): id is Id => id !== null)
  if (ids.some((id) => !team.members.includes(id))) return 'Only members of the team can fight.'
  if (new Set(ids).size !== ids.length) return 'A player can only fight once per encounter.'
  return null
}

/** Put a lineup on the bouts of an encounter that has not started yet. */
export function setLineup(t: Tournament, tmId: Id, side: Side, lineup: (Id | null)[], explicit = true): Tournament {
  const tm = t.teamMatches[tmId]
  if (!tm) throw new LineupError('Unknown team match.')
  if (!encounterOpen(t, tm)) throw new LineupError('This encounter has started; its order is locked.')
  const team = t.teams[side === 'aka' ? tm.akaTeamId : tm.shiroTeamId]!
  const problem = validateLineup(team, lineup)
  if (problem) throw new LineupError(problem)
  const matches = { ...t.matches }
  tm.boutIds.forEach((id, pos) => {
    const b = matches[id]!
    matches[id] = { ...b, [side]: { ...b[side], playerId: lineup[pos] ?? null } }
  })
  const updated: TeamMatch = explicit ? { ...tm, lineupSet: { ...tm.lineupSet, [side]: true } } : tm
  return { ...t, matches, teamMatches: { ...t.teamMatches, [tm.id]: updated } }
}

/** Current lineup of one side of an encounter, read from its bouts. */
export function lineupOf(t: Tournament, tm: TeamMatch, side: Side): (Id | null)[] {
  return tm.boutIds.map((id) => t.matches[id]?.[side].playerId ?? null)
}

/** After a team's default order changes, refresh every open encounter that has no explicit order. */
export function syncDefaultOrder(t: Tournament, teamId: Id): Tournament {
  const team = t.teams[teamId]
  if (!team) return t
  for (const tm of Object.values(t.teamMatches)) {
    const side = sideOfTeam(tm, teamId)
    if (side && !tm.lineupSet?.[side] && encounterOpen(t, tm)) t = setLineup(t, tm.id, side, team.order, false)
  }
  return t
}

// ---------------------------------------------------------------------------
// Team encounter results
// ---------------------------------------------------------------------------

export interface EncounterTally extends TeamMatchResult {
  /** All regular bouts are completed. */
  complete: boolean
}

/** Wins > ippons > daihyo-sen. */
export function tallyEncounter(t: Tournament, tm: TeamMatch): EncounterTally {
  const s: EncounterTally = { winner: null, akaWins: 0, shiroWins: 0, akaIppons: 0, shiroIppons: 0, complete: true }
  for (const id of tm.boutIds) {
    const r = t.matches[id]?.result
    if (!r) {
      s.complete = false
      continue
    }
    if (r.winner === 'aka') s.akaWins++
    if (r.winner === 'shiro') s.shiroWins++
    s.akaIppons += r.akaIppons
    s.shiroIppons += r.shiroIppons
  }
  if (!s.complete) return s
  if (s.akaWins !== s.shiroWins) s.winner = s.akaWins > s.shiroWins ? 'aka' : 'shiro'
  else if (s.akaIppons !== s.shiroIppons) s.winner = s.akaIppons > s.shiroIppons ? 'aka' : 'shiro'
  else if (tm.daihyoMatchId) s.winner = t.matches[tm.daihyoMatchId]?.result?.winner ?? null
  return s
}

/**
 * Re-evaluate an encounter after one of its bouts was approved or edited.
 * A level bracket encounter gets a daihyo-sen queued right after `afterBoutId`.
 */
export function refreshEncounter(t: Tournament, tmId: Id, afterBoutId: Id): { t: Tournament; decided: boolean } {
  const tm = t.teamMatches[tmId]
  if (!tm) return { t, decided: false }
  const tally = tallyEncounter(t, tm)
  const started = !encounterOpen(t, tm)

  if (tally.complete && tally.winner === null && tm.kind === 'bracket' && !tm.daihyoMatchId) {
    const place: Placement = { courtId: tm.courtId }
    if (tm.bracketNodeId) place.bracketNodeId = tm.bracketNodeId
    const bout = { ...representativeBout(t, tm.kind, tm.akaTeamId, tm.shiroTeamId, place), teamMatchId: tm.id }
    const next: Tournament = {
      ...t,
      matches: { ...t.matches, [bout.id]: bout },
      teamMatches: { ...t.teamMatches, [tm.id]: { ...tm, status: 'in-progress', daihyoMatchId: bout.id } }
    }
    return { t: enqueue(next, [bout.id], afterBoutId), decided: false }
  }

  const decided = tally.complete && (tally.winner !== null || tm.kind !== 'bracket')
  const { complete: _c, ...result } = tally
  const { result: _old, ...rest } = tm
  const updated: TeamMatch = decided ? { ...tm, status: 'completed', result } : { ...rest, status: started ? 'in-progress' : 'scheduled' }
  return { t: { ...t, teamMatches: { ...t.teamMatches, [tm.id]: updated } }, decided }
}
