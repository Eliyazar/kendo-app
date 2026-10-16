// Creating matches and team encounters, and tallying team results.

import { uid } from './ids'
import type { Id, Match, MatchConfig, MatchKind, Side, TeamMatch, TeamMatchResult, Tournament } from './types'

export function newMatch(id: Id, kind: MatchKind, akaId: Id | null, shiroId: Id | null, config: MatchConfig): Match {
  return {
    id,
    kind,
    aka: { playerId: akaId },
    shiro: { playerId: shiroId },
    config,
    status: 'scheduled',
    timer: { mode: 'countdown', durationMs: config.durationMs, elapsedMs: 0, runningSince: null },
    encho: false,
    events: []
  }
}

/** Pool or bracket entrant on one side of a match: player id, or team id in team mode. */
export function entrantOf(t: Tournament, m: Match, side: Side): Id | null {
  return t.mode === 'team' ? (m[side].teamId ?? null) : m[side].playerId
}

export interface Placement {
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
    const m: Match = { ...newMatch(uid('m'), kind, akaId, shiroId, configFor(t, kind)), ...place }
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
  const bouts: Match[] = aka.roster.map((_, pos) => ({
    ...newMatch(uid('m'), kind, aka.roster[pos] ?? null, shiro.roster[pos] ?? null, config),
    aka: { playerId: aka.roster[pos] ?? null, teamId: aka.id },
    shiro: { playerId: shiro.roster[pos] ?? null, teamId: shiro.id },
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
    ...newMatch(uid('m'), kind, null, null, t.deciderConfig),
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
 * Re-evaluate an encounter after one of its bouts was approved.
 * A level bracket encounter gets a daihyo-sen queued right after `afterBoutId`.
 */
export function refreshEncounter(t: Tournament, tmId: Id, afterBoutId: Id): { t: Tournament; decided: boolean } {
  const tm = t.teamMatches[tmId]
  if (!tm) return { t, decided: false }
  const tally = tallyEncounter(t, tm)
  const started = tm.boutIds.some((id) => t.matches[id]?.status !== 'scheduled')

  if (tally.complete && tally.winner === null && tm.kind === 'bracket' && !tm.daihyoMatchId) {
    const bout = { ...representativeBout(t, tm.kind, tm.akaTeamId, tm.shiroTeamId, {}), teamMatchId: tm.id }
    if (tm.bracketNodeId) bout.bracketNodeId = tm.bracketNodeId
    const next: Tournament = {
      ...t,
      matches: { ...t.matches, [bout.id]: bout },
      teamMatches: { ...t.teamMatches, [tm.id]: { ...tm, status: 'in-progress', daihyoMatchId: bout.id } }
    }
    return { t: enqueue(next, [bout.id], afterBoutId), decided: false }
  }

  const decided = tally.complete && (tally.winner !== null || tm.kind !== 'bracket')
  const { complete: _c, ...result } = tally
  const updated: TeamMatch = decided
    ? { ...tm, status: 'completed', result }
    : { ...tm, status: started ? 'in-progress' : 'scheduled' }
  return { t: { ...t, teamMatches: { ...t.teamMatches, [tm.id]: updated } }, decided }
}
