// Changes to a running tournament: participants, teams, corrections, courts.

import { advance, BracketError, replaceWinner } from './bracket'
import { toIocCode } from './countries'
import { courtFor, fillCourts } from './courts'
import {
  createMeeting,
  encounterOpen,
  enqueue,
  entrantOf,
  isWithdrawn,
  LineupError,
  setLineup,
  syncDefaultOrder,
  tallyEncounter,
  validateLineup
} from './encounters'
import { newPin, uid } from './ids'
import { kiken, opponent, pendingResult, resultOf, RuleError } from './match-engine'
import { afterMatchCompleted } from './progress'
import { MAX_RESERVES, type Id, type Match, type Player, type PointEvent, type Side, type Team, type TeamMatch, type Technique, type Tournament } from './types'

const MAX_TEXT = 80

function cleanText(v: unknown, field: string, required = true): string {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
  if (required && !s) throw new RuleError(`${field} is required.`)
  if (s.length > MAX_TEXT) throw new RuleError(`${field} is too long.`)
  return s
}

function cleanCountry(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s) return undefined
  const code = toIocCode(s)
  if (!code) throw new RuleError(`Unknown country "${s}". Use a name or IOC code such as BUL or SRB.`)
  return code
}

const started = (m: Match): boolean => m.status !== 'scheduled' || m.events.length > 0 || m.timer.elapsedMs > 0 || m.timer.runningSince !== null

function rethrow<T>(fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    if (err instanceof LineupError || err instanceof BracketError) throw new RuleError(err.message)
    throw err
  }
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

export interface PersonInput {
  name: string
  dojo?: string
  country?: string
  grade?: string
}

export interface EntrantInput extends PersonInput {
  /** Team mode: the team's players in fighting order (reserves after the team size). */
  members?: PersonInput[]
  /** Pool to join; default: the pool with the fewest active entrants. */
  poolId?: Id
}

function makePlayer(input: PersonInput, teamId?: Id): Player {
  const p: Player = { id: uid('p'), name: cleanText(input.name, 'Name'), dojo: cleanText(input.dojo, 'Dojo', false) }
  const country = cleanCountry(input.country)
  const grade = cleanText(input.grade, 'Grade', false)
  if (country) p.country = country
  if (grade) p.grade = grade
  if (teamId) p.teamId = teamId
  return p
}

/** Matches / encounters of an entrant in the pools (incl. tie-breakers), as meeting ids. */
function poolMeetingsOf(t: Tournament, entrantId: Id): Match[] {
  return Object.values(t.matches).filter(
    (m) => (m.kind === 'pool' || m.kind === 'tie-breaker') && (entrantOf(t, m, 'aka') === entrantId || entrantOf(t, m, 'shiro') === entrantId)
  )
}

/** Late entry: joins a pool during the pool phase and gets a match against every active pool member. */
export function addEntrant(t: Tournament, input: EntrantInput): Tournament {
  if (t.phase !== 'pools') throw new RuleError('Participants can only be added during the pool phase.')
  const active = (ids: Id[]) => ids.filter((id) => !isWithdrawn(t, id))
  const pool = input.poolId
    ? t.pools.find((p) => p.id === input.poolId)
    : [...t.pools].sort((a, b) => active(a.entrantIds).length - active(b.entrantIds).length)[0]
  if (!pool) throw new RuleError('Unknown pool.')

  let entrantId: Id
  if (t.mode === 'team') {
    const size = t.teamSize!
    const people = input.members ?? []
    if (people.length > size + MAX_RESERVES) throw new RuleError(`A team has at most ${size + MAX_RESERVES} players.`)
    const team: Team = { id: uid('t'), name: cleanText(input.name, 'Team name'), dojo: cleanText(input.dojo, 'Dojo', false), size, members: [], order: [], pin: newPin() }
    const country = cleanCountry(input.country)
    if (country) team.country = country
    const players = people.map((p) => makePlayer({ dojo: team.dojo, ...p, country: p.country || team.country }, team.id))
    team.members = players.map((p) => p.id)
    team.order = Array.from({ length: size }, (_, i) => team.members[i] ?? null)
    t = { ...t, teams: { ...t.teams, [team.id]: team }, players: { ...t.players, ...Object.fromEntries(players.map((p) => [p.id, p])) } }
    entrantId = team.id
  } else {
    const p = makePlayer(input)
    t = { ...t, players: { ...t.players, [p.id]: p } }
    entrantId = p.id
  }

  const poolIndex = t.pools.indexOf(pool)
  const courtId = Object.values(t.matches).find((m) => m.poolId === pool.id)?.courtId ?? courtFor(t, poolIndex)
  const opponents = active(pool.entrantIds)
  t = { ...t, pools: t.pools.map((p) => (p.id === pool.id ? { ...p, entrantIds: [...p.entrantIds, entrantId] } : p)) }
  opponents.forEach((other, i) => {
    const [a, b] = i % 2 ? [other, entrantId] : [entrantId, other]
    const s = createMeeting(t, 'pool', a, b, { poolId: pool.id, courtId })
    t = enqueue(s.t, s.boutIds)
  })
  return fillCourts(t)
}

/** Remove meetings that never started (and their bouts) from the tournament. */
function dropMeetings(t: Tournament, matchIds: Set<Id>): Tournament {
  const teamIds = new Set(Object.values(t.teamMatches).filter((tm) => tm.boutIds.some((id) => matchIds.has(id))).map((tm) => tm.id))
  for (const id of teamIds) t.teamMatches[id]!.boutIds.forEach((b) => matchIds.add(b))
  return {
    ...t,
    matches: Object.fromEntries(Object.entries(t.matches).filter(([id]) => !matchIds.has(id))),
    teamMatches: Object.fromEntries(Object.entries(t.teamMatches).filter(([id]) => !teamIds.has(id))),
    matchQueue: t.matchQueue.filter((id) => !matchIds.has(id)),
    courts: t.courts.map((c) => (c.activeMatchId && matchIds.has(c.activeMatchId) ? { ...c, activeMatchId: null } : c))
  }
}

/** Lose a match by kiken (individual, or a team tie-breaker bout), then progress. */
function forfeitMatch(t: Tournament, m: Match, withdrawn: Id, now: number): Tournament {
  if (m.status === 'completed') return t
  const loserSide: Side = entrantOf(t, m, 'aka') === withdrawn ? 'aka' : 'shiro'
  const done = kiken(m, opponent(loserSide), now)
  t = { ...t, matches: { ...t.matches, [m.id]: done } }
  return afterMatchCompleted(t, done)
}

/** A withdrawing team loses the whole encounter: open bouts are kiken, the opponent wins. */
function forfeitEncounter(t: Tournament, tm: TeamMatch, withdrawn: Id, now: number): Tournament {
  if (tm.status === 'completed') return t
  const winSide: Side = tm.akaTeamId === withdrawn ? 'shiro' : 'aka'
  const matches = { ...t.matches }
  for (const id of [...tm.boutIds, ...(tm.daihyoMatchId ? [tm.daihyoMatchId] : [])]) {
    const b = matches[id]
    if (b && b.status !== 'completed') matches[id] = kiken(b, winSide, now)
  }
  t = { ...t, matches }
  const { complete: _c, ...tally } = tallyEncounter(t, tm)
  t = { ...t, teamMatches: { ...t.teamMatches, [tm.id]: { ...tm, status: 'completed', result: { ...tally, winner: winSide } } } }
  const node = tm.bracketNodeId ? t.bracket?.nodes[tm.bracketNodeId] : undefined
  if (!node) return t
  const winner = winSide === 'aka' ? tm.akaTeamId : tm.shiroTeamId
  return node.winnerEntrantId ? replaceWinner(t, node.id, winner) : advance(t, node.id, winner)
}

/** Withdraw from one pool or bracket meeting. */
function forfeitMeeting(t: Tournament, m: Match, withdrawn: Id, now: number): Tournament {
  const tm = m.teamMatchId ? t.teamMatches[m.teamMatchId] : undefined
  return tm ? forfeitEncounter(t, tm, withdrawn, now) : forfeitMatch(t, m, withdrawn, now)
}

/**
 * Withdrawal after the draw. If nobody in the pool has fought yet, the entrant
 * simply leaves the pool; otherwise every remaining match is lost by kiken.
 * In the bracket, the current opponent advances.
 */
export function withdrawEntrant(t: Tournament, entrantId: Id, now: number): Tournament {
  if (t.phase === 'finished') throw new RuleError('The tournament is finished.')
  if (isWithdrawn(t, entrantId)) throw new RuleError('Already withdrawn.')
  if (t.mode === 'team') {
    const team = t.teams[entrantId]
    if (!team) throw new RuleError('Unknown team.')
    t = { ...t, teams: { ...t.teams, [entrantId]: { ...team, withdrawn: true } } }
  } else {
    const p = t.players[entrantId]
    if (!p) throw new RuleError('Unknown participant.')
    t = { ...t, players: { ...t.players, [entrantId]: { ...p, withdrawn: true } } }
  }

  const pool = t.pools.find((p) => p.entrantIds.includes(entrantId))
  if (t.phase === 'pools' && pool) {
    const poolMatches = Object.values(t.matches).filter((m) => m.poolId === pool.id)
    if (!poolMatches.some(started)) {
      t = dropMeetings(t, new Set(poolMeetingsOf(t, entrantId).map((m) => m.id)))
      t = { ...t, pools: t.pools.map((p) => (p.id === pool.id ? { ...p, entrantIds: p.entrantIds.filter((id) => id !== entrantId) } : p)) }
      return fillCourts(t)
    }
    for (const m of poolMeetingsOf(t, entrantId)) t = forfeitMeeting(t, t.matches[m.id]!, entrantId, now)
    return fillCourts(t)
  }

  if (t.phase === 'bracket' && t.bracket) {
    const node = Object.values(t.bracket.nodes).find(
      (n) => !n.winnerEntrantId && (n.akaEntrantId === entrantId || n.shiroEntrantId === entrantId)
    )
    if (node?.matchId) {
      const tm = t.teamMatches[node.matchId]
      if (tm) t = forfeitEncounter(t, tm, entrantId, now)
      else if (t.matches[node.matchId]) t = forfeitMatch(t, t.matches[node.matchId]!, entrantId, now)
    }
    // If the opponent is not known yet, the walkover happens when they arrive.
  }
  return fillCourts(t)
}

export function editPlayer(t: Tournament, playerId: Id, patch: PersonInput): Tournament {
  const p = t.players[playerId]
  if (!p) throw new RuleError('Unknown participant.')
  const next: Player = { ...p, name: cleanText(patch.name, 'Name'), dojo: cleanText(patch.dojo, 'Dojo', false) }
  const country = cleanCountry(patch.country)
  const grade = cleanText(patch.grade, 'Grade', false)
  if (country) next.country = country
  else delete next.country
  if (grade) next.grade = grade
  else delete next.grade
  return { ...t, players: { ...t.players, [playerId]: next } }
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

function teamOf(t: Tournament, teamId: Id): Team {
  const team = t.teams[teamId]
  if (!team) throw new RuleError('Unknown team.')
  return team
}

export function editTeam(t: Tournament, teamId: Id, patch: { name: string; dojo?: string; country?: string }): Tournament {
  const team = teamOf(t, teamId)
  const next: Team = { ...team, name: cleanText(patch.name, 'Team name'), dojo: cleanText(patch.dojo, 'Dojo', false) }
  const country = cleanCountry(patch.country)
  if (country) next.country = country
  else delete next.country
  return { ...t, teams: { ...t.teams, [teamId]: next } }
}

/** New member; takes the first empty position, otherwise becomes a reserve. */
export function addTeamMember(t: Tournament, teamId: Id, input: PersonInput): Tournament {
  const team = teamOf(t, teamId)
  if (team.members.length >= team.size + MAX_RESERVES) throw new RuleError(`A team has at most ${team.size + MAX_RESERVES} players.`)
  const p = makePlayer({ dojo: team.dojo, ...input, country: input.country || team.country }, team.id)
  const empty = team.order.indexOf(null)
  const order = empty >= 0 ? team.order.map((id, i) => (i === empty ? p.id : id)) : team.order
  t = { ...t, players: { ...t.players, [p.id]: p }, teams: { ...t.teams, [teamId]: { ...team, members: [...team.members, p.id], order } } }
  return syncDefaultOrder(t, teamId)
}

/** Remove a member: their positions become empty in the default order and in every open encounter. */
export function removeTeamMember(t: Tournament, teamId: Id, playerId: Id): Tournament {
  const team = teamOf(t, teamId)
  if (!team.members.includes(playerId)) throw new RuleError('That player is not on this team.')
  t = {
    ...t,
    teams: {
      ...t.teams,
      [teamId]: { ...team, members: team.members.filter((id) => id !== playerId), order: team.order.map((id) => (id === playerId ? null : id)) }
    }
  }
  for (const tm of Object.values(t.teamMatches)) {
    const side: Side | null = tm.akaTeamId === teamId ? 'aka' : tm.shiroTeamId === teamId ? 'shiro' : null
    if (!side || !tm.lineupSet?.[side] || !encounterOpen(t, tm)) continue
    const lineup = tm.boutIds.map((id) => {
      const pid = t.matches[id]?.[side].playerId ?? null
      return pid === playerId ? null : pid
    })
    t = setLineup(t, tm.id, side, lineup)
  }
  return syncDefaultOrder(t, teamId)
}

/** Default fighting order of a team (applies to every encounter without its own order). */
export function setTeamOrder(t: Tournament, teamId: Id, order: (Id | null)[]): Tournament {
  const team = teamOf(t, teamId)
  const problem = validateLineup(team, order)
  if (problem) throw new RuleError(problem)
  t = { ...t, teams: { ...t.teams, [teamId]: { ...team, order } } }
  return rethrow(() => syncDefaultOrder(t, teamId))
}

/** Order for one encounter (table or captain). Locked once its first bout starts. */
export function setEncounterLineup(t: Tournament, teamMatchId: Id, teamId: Id, lineup: (Id | null)[]): Tournament {
  const tm = t.teamMatches[teamMatchId]
  if (!tm) throw new RuleError('Unknown team match.')
  const side: Side | null = tm.akaTeamId === teamId ? 'aka' : tm.shiroTeamId === teamId ? 'shiro' : null
  if (!side) throw new RuleError('That team does not fight in this encounter.')
  return rethrow(() => setLineup(t, teamMatchId, side, lineup))
}

// ---------------------------------------------------------------------------
// Corrections and courts
// ---------------------------------------------------------------------------

export type ScoreEntry = { kind: 'ippon'; side: Side; technique: Technique } | { kind: 'hansoku'; side: Side } | { kind: 'fusen-gachi'; side: Side }

/**
 * Correct an approved result by replacing its scoring events. Pool results can
 * change until the pools are locked; bracket results only while the next
 * round has not been fought.
 */
export function editResult(t: Tournament, matchId: Id, entries: ScoreEntry[], now: number): Tournament {
  const m = t.matches[matchId]
  if (!m || m.status !== 'completed' || !m.result) throw new RuleError('Only approved matches can be corrected.')
  if ((m.kind === 'pool' || (m.kind === 'tie-breaker' && m.poolId)) && t.phase !== 'pools') {
    throw new RuleError('Pools are locked; pool results can no longer change.')
  }
  if (m.result.decision === 'kiken') throw new RuleError('A kiken result cannot be edited.')
  const events: PointEvent[] = entries.map((e) => ({ ...e, id: uid('e'), at: now, matchTimeMs: 0 }) as PointEvent)
  const draft: Match = { ...m, events }
  const pending = pendingResult(draft)
  if (pending.winner === null && (m.config.enchoOnDraw || m.representative)) throw new RuleError('This match needs a winner.')
  const fixed: Match = { ...draft, result: { ...resultOf(draft, m.result.approvedAt), editedAt: now } }
  t = { ...t, matches: { ...t.matches, [m.id]: fixed } }
  return rethrow(() => afterMatchCompleted(t, fixed))
}

/** Move a scheduled match (a whole team encounter) to another court. */
export function moveToCourt(t: Tournament, matchId: Id, courtId: Id): Tournament {
  const m = t.matches[matchId]
  if (!m) throw new RuleError('Unknown match.')
  if (!t.courts.some((c) => c.id === courtId)) throw new RuleError('Unknown court.')
  const tm = m.teamMatchId ? t.teamMatches[m.teamMatchId] : undefined
  const ids = tm ? [...tm.boutIds, ...(tm.daihyoMatchId ? [tm.daihyoMatchId] : [])] : [m.id]
  if (ids.some((id) => started(t.matches[id]!) && t.matches[id]!.status !== 'completed')) {
    throw new RuleError('A match that has started cannot change court.')
  }
  if (t.courts.some((c) => c.activeMatchId && ids.includes(c.activeMatchId) && c.id !== courtId)) {
    t = { ...t, courts: t.courts.map((c) => (c.activeMatchId && ids.includes(c.activeMatchId) ? { ...c, activeMatchId: null } : c)) }
  }
  const matches = { ...t.matches }
  for (const id of ids) if (matches[id]!.status !== 'completed') matches[id] = { ...matches[id]!, courtId }
  const teamMatches = tm ? { ...t.teamMatches, [tm.id]: { ...tm, courtId } } : t.teamMatches
  return fillCourts({ ...t, matches, teamMatches })
}

