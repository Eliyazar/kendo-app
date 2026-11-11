// Tools for the day: a free shiai-jo takes over a whole group, postpone a match,
// kiken during a match, swap Aka and Shiro before the start.

import { onCourt, peopleIn } from './competition'
import { fillCourts } from './courts'
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
