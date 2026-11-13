// Tools for the day: a free shiai-jo takes over a whole group, postpone a match,
// kiken during a match, swap Aka and Shiro before the start.

import { onCourt, peopleIn } from './competition'
import { buildBracket } from './bracket'
import { fillCourts } from './courts'
import { parseBracketText, poolLetter } from './setup'
import { createMeeting, enqueue, setLineup } from './encounters'
import { kiken, opponent, RuleError } from './match-engine'
import { afterMatchCompleted } from './progress'
import type { Competition, Id, Match, Side, TeamMatch, Tournament } from './types'

const started = (m: Match): boolean =>
  m.status !== 'scheduled' || m.events.length > 0 || m.timer.elapsedMs > 0 || m.timer.runningSince !== null

/** A meeting (a match, or a whole team encounter) as one unit of the fight order. */
function unitIds(t: Tournament, m: Match): Id[] {
  const tm = m.teamMatchId ? t.teamMatches[m.teamMatchId] : undefined
  return tm ? [...tm.boutIds, ...(tm.daihyoMatchId ? [tm.daihyoMatchId] : [])] : [m.id]
}
const unitKey = (m: Match): Id => m.teamMatchId ?? m.id

// ---------------------------------------------------------------------------
// Take over a whole group
// ---------------------------------------------------------------------------

/** Remaining (not completed) matches of a pool, tie-breakers included. */
const poolLeft = (t: Tournament, poolId: Id): Match[] => Object.values(t.matches).filter((m) => m.poolId === poolId && m.status !== 'completed')

/** Move every remaining match of a pool to another court. Only while none of them is under way. */
export function takePool(t: Tournament, poolId: Id, courtId: Id): Tournament {
  const pool = t.pools.find((p) => p.id === poolId)
  if (!pool) throw new RuleError('Unknown pool.')
  if (!t.courts.some((c) => c.id === courtId)) throw new RuleError('Unknown court.')
  const left = poolLeft(t, poolId)
  if (!left.length) throw new RuleError(`${pool.name} has no matches left.`)
  if (left.some(started)) throw new RuleError(`A match of ${pool.name} is under way. Take it over when it is finished.`)
  const ids = new Set(left.map((m) => m.id))
  const matches = { ...t.matches }
  for (const id of ids) matches[id] = { ...matches[id]!, courtId }
  const teamMatches = { ...t.teamMatches }
  for (const tm of Object.values(t.teamMatches)) if (tm.boutIds.some((id) => ids.has(id))) teamMatches[tm.id] = { ...tm, courtId }
  // Unload them wherever they were waiting; the courts pick again.
  const courts = t.courts.map((c) => (c.activeMatchId && ids.has(c.activeMatchId) ? { ...c, activeMatchId: null } : c))
  return fillCourts({ ...t, matches, teamMatches, courts })
}

export interface HelpOption {
  categoryId: Id
  categoryName: string
  poolId: Id
  poolName: string
  fromCourt: string
  matchesLeft: number
}

/**
 * Groups a free court can take over: from a court that still has two or more groups
 * waiting, the last one in its order (that court carries on with what it was about to do).
 * Groups with a match under way are never split.
 */
export function helpOptions(comp: Competition, courtId: Id): HelpOption[] {
  const out: HelpOption[] = []
  for (const slot of comp.courts) {
    if (slot.id === courtId) continue
    const waiting: (HelpOption & { order: number })[] = []
    for (const t of comp.categories) {
      if (t.phase !== 'pools') continue
      for (const pool of t.pools) {
        const left = poolLeft(t, pool.id).filter((m) => m.courtId === slot.id)
        if (!left.length || poolLeft(t, pool.id).some(started)) continue
        const shown = onCourt(comp, slot.id)?.match
        if (shown && shown.poolId === pool.id) continue
        const order = Math.min(...left.map((m) => t.matchQueue.indexOf(m.id)))
        waiting.push({ categoryId: t.id, categoryName: t.name, poolId: pool.id, poolName: pool.name, fromCourt: slot.name, matchesLeft: new Set(left.map(unitKey)).size, order: comp.categories.indexOf(t) * 1e6 + order })
      }
    }
    if (waiting.length < 2 && !onCourt(comp, slot.id)?.match) continue
    if (!waiting.length) continue
    const last = waiting.sort((a, b) => b.order - a.order)[0]!
    const { order: _o, ...option } = last
    out.push(option)
  }
  return out
}

// ---------------------------------------------------------------------------
// Later: a fighter is not there yet
// ---------------------------------------------------------------------------

/** Meetings after this one on the same court, in order (team encounters count once). */
function laterUnits(t: Tournament, m: Match): Id[][] {
  const mine = new Set(unitIds(t, m))
  const seen = new Map<Id, Id[]>()
  for (const id of t.matchQueue) {
    const x = t.matches[id]
    if (!x || mine.has(id) || x.courtId !== m.courtId || x.status !== 'scheduled') continue
    const key = unitKey(x)
    seen.set(key, [...(seen.get(key) ?? []), id])
  }
  return [...seen.values()]
}

export const canPostpone = (t: Tournament, m: Match): boolean => !started(m) && laterUnits(t, m).length > 0

/** Push the loaded meeting back behind the next two on this court. */
export function postpone(t: Tournament, m: Match): Tournament {
  const ids = unitIds(t, m)
  if (ids.some((id) => started(t.matches[id]!))) throw new RuleError('This match has started. Use Kiken if a fighter cannot continue.')
  const later = laterUnits(t, m)
  if (!later.length) throw new RuleError('No other match on this court to fight first.')
  // Count only meetings without these fighters, so two matches with other people come first.
  const mine = peopleIn(t, m)
  const others = later.filter((ids) => ![...peopleIn(t, t.matches[ids[0]!]!)].some((k) => mine.has(k)))
  const pool = others.length ? others : later
  const behind = pool[Math.min(1, pool.length - 1)]!
  const block = t.matchQueue.filter((id) => ids.includes(id))
  const rest = t.matchQueue.filter((id) => !ids.includes(id))
  const at = rest.indexOf(behind[behind.length - 1]!) + 1
  const matchQueue = [...rest.slice(0, at), ...block, ...rest.slice(at)]
  const courts = t.courts.map((c) => (c.activeMatchId && ids.includes(c.activeMatchId) ? { ...c, activeMatchId: null } : c))
  return fillCourts({ ...t, matchQueue, courts })
}

// ---------------------------------------------------------------------------
// Kiken during a match
// ---------------------------------------------------------------------------

/** The fighter on `side` cannot continue (injury): the opponent wins this match by kiken. */
export function kikenOnCourt(t: Tournament, m: Match, side: Side, now: number): Tournament {
  if (m.status === 'completed') throw new RuleError('Match is completed.')
  if (!started(m)) throw new RuleError('The match has not started: use Fusen-gachi for an absent fighter.')
  const done = kiken(m, opponent(side), now)
  return afterMatchCompleted({ ...t, matches: { ...t.matches, [m.id]: done } }, done)
}

// ---------------------------------------------------------------------------
// Swap Aka and Shiro
// ---------------------------------------------------------------------------

const swapped = (m: Match): Match => ({ ...m, aka: m.shiro, shiro: m.aka })

export function canSwap(t: Tournament, m: Match): boolean {
  const tm = m.teamMatchId ? t.teamMatches[m.teamMatchId] : undefined
  return tm ? tm.boutIds.every((id) => !started(t.matches[id]!)) && !tm.daihyoMatchId : !started(m)
}

/** Fighters stand on the wrong sides: swap them before the start (a team encounter swaps as a whole). */
export function swapSides(t: Tournament, m: Match): Tournament {
  if (!canSwap(t, m)) throw new RuleError('Sides can only be swapped before the match starts.')
  const matches = { ...t.matches }
  const tm = m.teamMatchId ? t.teamMatches[m.teamMatchId] : undefined
  for (const id of tm ? tm.boutIds : [m.id]) matches[id] = swapped(matches[id]!)
  let teamMatches = t.teamMatches
  if (tm) {
    const lineupSet: TeamMatch['lineupSet'] = {}
    if (tm.lineupSet?.shiro) lineupSet.aka = true
    if (tm.lineupSet?.aka) lineupSet.shiro = true
    teamMatches = { ...t.teamMatches, [tm.id]: { ...tm, akaTeamId: tm.shiroTeamId, shiroTeamId: tm.akaTeamId, lineupSet } }
  }
  let bracket = t.bracket
  const nodeId = tm?.bracketNodeId ?? m.bracketNodeId
  const node = nodeId && bracket ? bracket.nodes[nodeId] : undefined
  if (bracket && node) bracket = { ...bracket, nodes: { ...bracket.nodes, [node.id]: { ...node, akaEntrantId: node.shiroEntrantId, shiroEntrantId: node.akaEntrantId } } }
  return { ...t, matches, teamMatches, ...(bracket ? { bracket } : {}) }
}

// ---------------------------------------------------------------------------
// Extra matches and the fight order, by hand
// ---------------------------------------------------------------------------

/**
 * The table adds a match between two members of a pool (a playoff when they are level).
 * It is fought as a tie-breaker (ippon-shobu with encho) and decides between equal wins.
 */
export function addPlayoff(t: Tournament, poolId: Id, a: Id, b: Id, encho = true): Tournament {
  if (t.phase !== 'pools') throw new RuleError('Extra matches can only be added during the pool phase.')
  const pool = t.pools.find((p) => p.id === poolId)
  if (!pool) throw new RuleError('Unknown pool.')
  if (a === b || !pool.entrantIds.includes(a) || !pool.entrantIds.includes(b)) throw new RuleError(`Choose two different members of ${pool.name}.`)
  const courtId = Object.values(t.matches).find((m) => m.poolId === poolId)?.courtId ?? t.courts[0]!.id
  const s = createMeeting(t, 'tie-breaker', a, b, { poolId, courtId })
  let next = s.t
  if (!encho) {
    // Without encho a draw at time-up stays a draw (hikiwake).
    const matches = { ...next.matches }
    for (const id of s.boutIds) matches[id] = { ...matches[id]!, config: { ...matches[id]!.config, enchoOnDraw: false } }
    next = { ...next, matches }
  }
  return fillCourts(enqueue(next, s.boutIds))
}

/** Delete an extra match (tie-breaker or playoff) that has not started. Regular pool matches stay. */
export function removeExtraMatch(t: Tournament, matchId: Id): Tournament {
  const m = t.matches[matchId]
  if (!m) throw new RuleError('Unknown match.')
  if (m.kind !== 'tie-breaker') throw new RuleError('Only an added match (tie-breaker / playoff) can be deleted.')
  const ids = unitIds(t, m)
  if (ids.some((id) => started(t.matches[id]!))) throw new RuleError('This match has started.')
  const matches = { ...t.matches }
  for (const id of ids) delete matches[id]
  const teamMatches = { ...t.teamMatches }
  if (m.teamMatchId) delete teamMatches[m.teamMatchId]
  const courts = t.courts.map((c) => (c.activeMatchId && ids.includes(c.activeMatchId) ? { ...c, activeMatchId: null } : c))
  return fillCourts({ ...t, matches, teamMatches, courts, matchQueue: t.matchQueue.filter((id) => !ids.includes(id)) })
}

/** Units (meetings) not yet under way on the match's court, in fight order. */
function openUnitsOnCourt(t: Tournament, courtId: Id): Id[] {
  const keys: Id[] = []
  for (const id of t.matchQueue) {
    const m = t.matches[id]
    if (!m || m.courtId !== courtId || m.status !== 'scheduled') continue
    const key = unitKey(m)
    const all = unitIds(t, m).map((x) => t.matches[x]!)
    if (all.some(started) || keys.includes(key)) continue
    keys.push(key)
  }
  return keys
}

/** Move a meeting one place earlier or later among this court's waiting meetings. */
export function moveInQueue(t: Tournament, matchId: Id, direction: 'up' | 'down'): Tournament {
  const m = t.matches[matchId]
  if (!m) throw new RuleError('Unknown match.')
  const units = openUnitsOnCourt(t, m.courtId)
  const i = units.indexOf(unitKey(m))
  if (i < 0) throw new RuleError('Only matches that have not started can be moved.')
  const j = direction === 'up' ? i - 1 : i + 1
  if (j < 0 || j >= units.length) return t
  const a = units[i]!
  const b = units[j]!
  // Group the whole fight order by meeting, swap the two meetings, flatten again.
  const groups: { key: Id; ids: Id[] }[] = []
  for (const id of t.matchQueue) {
    const x = t.matches[id]
    const key = x ? unitKey(x) : id
    const g = groups.find((y) => y.key === key)
    if (g) g.ids.push(id)
    else groups.push({ key, ids: [id] })
  }
  const ga = groups.findIndex((g) => g.key === a)
  const gb = groups.findIndex((g) => g.key === b)
  ;[groups[ga], groups[gb]] = [groups[gb]!, groups[ga]!]
  return fillCourts({ ...t, matchQueue: groups.flatMap((g) => g.ids) })
}

export const canMove = (t: Tournament, m: Match): { up: boolean; down: boolean } => {
  const units = openUnitsOnCourt(t, m.courtId)
  const i = units.indexOf(unitKey(m))
  return { up: i > 0, down: i >= 0 && i < units.length - 1 }
}

// ---------------------------------------------------------------------------
// Restart: same draw, every result cleared
// ---------------------------------------------------------------------------

/**
 * Back to the start of the category with the same pools and fight order: every pool match
 * is unplayed again, added matches and the bracket are gone, withdrawals are undone.
 * Names, countries, teams and team orders stay as they were edited.
 */
export function restartCategory(t: Tournament): Tournament {
  const keep = (m: Match) => m.kind === 'pool'
  const matches: Tournament['matches'] = {}
  for (const m of Object.values(t.matches)) {
    if (!keep(m)) continue
    const { endReason: _e, result: _r, enchoFromEvent: _f, ...rest } = m
    matches[m.id] = { ...rest, status: 'scheduled', events: [], encho: false, timer: { mode: 'countdown', durationMs: m.config.durationMs, elapsedMs: 0, runningSince: null } }
  }
  const teamMatches: Tournament['teamMatches'] = {}
  for (const tm of Object.values(t.teamMatches)) {
    if (tm.kind !== 'pool') continue
    const { result: _r, daihyoMatchId: _d, lineupSet: _l, ...rest } = tm
    teamMatches[tm.id] = { ...rest, status: 'scheduled', boutIds: tm.boutIds.filter((id) => matches[id]) }
  }
  const players = Object.fromEntries(Object.entries(t.players).map(([id, p]) => {
    const { withdrawn: _w, ...rest } = p
    return [id, rest]
  }))
  const teams = Object.fromEntries(Object.entries(t.teams).map(([id, team]) => {
    const { withdrawn: _w, ...rest } = team
    return [id, rest]
  }))
  let next: Tournament = {
    ...t,
    bracket: null,
    phase: 'pools',
    players,
    teams,
    matches,
    teamMatches,
    matchQueue: t.matchQueue.filter((id) => matches[id]),
    courts: t.courts.map((c) => ({ ...c, activeMatchId: null }))
  }
  // Team encounters fight in each team's default order again.
  for (const tm of Object.values(next.teamMatches)) {
    for (const side of ['aka', 'shiro'] as const) {
      const team = next.teams[side === 'aka' ? tm.akaTeamId : tm.shiroTeamId]
      if (team) next = setLineup(next, tm.id, side, team.order, false)
    }
  }
  return fillCourts(next)
}

// ---------------------------------------------------------------------------
// Change the elimination during the competition
// ---------------------------------------------------------------------------

/** The bracket can still change: pools not locked yet, or no elimination match has started. */
export function canChangeBracket(t: Tournament): boolean {
  if (t.pools.length < 2) return false
  if (t.phase === 'pools') return true
  if (t.phase !== 'bracket') return false
  return Object.values(t.matches).every((m) => m.kind !== 'bracket' || !started(m))
}

/**
 * Set the elimination pairings ("A1–B2, B1–A2", see parseBracketText; empty = drawn by the app).
 * If the bracket already exists and nothing in it has started, it is rebuilt with the same qualifiers.
 */
export function setBracket(t: Tournament, text: string): Tournament {
  if (!canChangeBracket(t)) throw new RuleError('The elimination has started; it can no longer be changed.')
  const pairs = parseBracketText(text, t.pools.map((p) => poolLetter(p.name)))
  if (typeof pairs === 'string') throw new RuleError(pairs)
  const plan: Tournament['bracketPlan'] = pairs.length ? { kind: 'pairs', pairs } : { kind: 'auto' }
  if (t.phase === 'pools') return { ...t, bracketPlan: plan }
  // Rebuild: drop the unstarted elimination meetings and build again from the pool standings.
  const drop = new Set(Object.values(t.matches).filter((m) => m.kind === 'bracket').map((m) => m.id))
  const matches = Object.fromEntries(Object.entries(t.matches).filter(([id]) => !drop.has(id)))
  const teamMatches = Object.fromEntries(Object.entries(t.teamMatches).filter(([, tm]) => tm.kind !== 'bracket'))
  const cleared: Tournament = {
    ...t,
    bracketPlan: plan,
    bracket: null,
    phase: 'pools',
    matches,
    teamMatches,
    matchQueue: t.matchQueue.filter((id) => !drop.has(id)),
    courts: t.courts.map((c) => (c.activeMatchId && drop.has(c.activeMatchId) ? { ...c, activeMatchId: null } : c))
  }
  try {
    return fillCourts(buildBracket(cleared))
  } catch (err) {
    throw new RuleError(err instanceof Error ? err.message : String(err))
  }
}
