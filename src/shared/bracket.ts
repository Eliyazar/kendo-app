// Single-elimination bracket built from the pool qualifiers.

import { courtFor } from './courts'
import { createMeeting, encounterOpen, enqueue, isWithdrawn } from './encounters'
import { uid } from './ids'
import { computeStandings } from './standings'
import type { Bracket, BracketNode, Id, Side, Tournament } from './types'

/** Seed number at each slot of a standard bracket, e.g. 8 → [1, 8, 4, 5, 2, 7, 3, 6]. */
export function seedOrder(size: number): number[] {
  let order = [1, 2]
  while (order.length < size) {
    const n = order.length * 2 + 1
    order = order.flatMap((s) => [s, n - s])
  }
  return order.slice(0, size)
}

const nextPow2 = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(2, n)))

export interface Qualifier {
  entrantId: Id
  poolIndex: number
  place: number
}

export function qualifiers(t: Tournament): Qualifier[] {
  const out: Qualifier[] = []
  const tables = t.pools.map((p) => computeStandings(t, p))
  // Withdrawn entrants never qualify; the next in line moves up.
  const eligible = tables.map((table) => table.filter((row) => !isWithdrawn(t, row.entrantId)))
  for (let place = 1; place <= t.advancePerPool; place++) {
    eligible.forEach((table, poolIndex) => {
      const row = table[place - 1]
      if (row) out.push({ entrantId: row.entrantId, poolIndex, place })
    })
  }
  return out
}

/**
 * Assign seeds: pool winners get the top seeds (pool order). Every lower
 * qualifier goes to the best free seed in the *other* half from its own pool
 * winner, so two fighters from one pool can only meet again in the final.
 */
export function assignSeeds(qs: Qualifier[], size: number): Map<number, Id> {
  const order = seedOrder(size)
  const half = (seed: number): number => (order.indexOf(seed) < size / 2 ? 0 : 1)
  const seeds = new Map<number, Id>()
  const winnerHalf = new Map<number, number>()
  const free = new Set(Array.from({ length: qs.length }, (_, i) => i + 1))

  for (const q of qs.filter((q) => q.place === 1)) {
    const seed = Math.min(...free)
    free.delete(seed)
    seeds.set(seed, q.entrantId)
    winnerHalf.set(q.poolIndex, half(seed))
  }
  for (const q of qs.filter((q) => q.place > 1)) {
    const avoid = winnerHalf.get(q.poolIndex)
    const options = [...free].sort((a, b) => a - b)
    const seed = options.find((s) => half(s) !== avoid) ?? options[0]!
    free.delete(seed)
    seeds.set(seed, q.entrantId)
  }
  return seeds
}

/** Final on the first court; earlier rounds spread over all courts. */
const courtForNode = (t: Tournament, node: BracketNode): Id => (node.next ? courtFor(t, node.slot) : t.courts[0]!.id)

/** Create a match for a node once both sides are known; queue it. A withdrawn side is a walkover. */
function scheduleNode(t: Tournament, node: BracketNode): Tournament {
  if (!node.akaEntrantId || !node.shiroEntrantId || node.matchId || node.winnerEntrantId) return t
  if (isWithdrawn(t, node.akaEntrantId)) return advance(t, node.id, node.shiroEntrantId)
  if (isWithdrawn(t, node.shiroEntrantId)) return advance(t, node.id, node.akaEntrantId)
  const s = createMeeting(t, 'bracket', node.akaEntrantId, node.shiroEntrantId, { bracketNodeId: node.id, courtId: courtForNode(t, node) })
  const bracket = t.bracket!
  return enqueue(
    {
      ...s.t,
      bracket: { ...bracket, nodes: { ...bracket.nodes, [node.id]: { ...node, matchId: s.meetingId } } }
    },
    s.boutIds
  )
}

/** Record a node's winner, move them to the next round, and schedule it if ready. */
export function advance(t: Tournament, nodeId: Id, winner: Id): Tournament {
  const bracket = t.bracket
  const node = bracket?.nodes[nodeId]
  if (!bracket || !node) return t
  let nodes = { ...bracket.nodes, [nodeId]: { ...node, winnerEntrantId: winner } }
  if (!node.next) return { ...t, bracket: { ...bracket, nodes }, phase: 'finished' }
  const target = nodes[node.next.nodeId]!
  const filled: BracketNode = { ...target, [node.next.side === 'aka' ? 'akaEntrantId' : 'shiroEntrantId']: winner }
  nodes = { ...nodes, [filled.id]: filled }
  return scheduleNode({ ...t, bracket: { ...bracket, nodes } }, filled)
}

/** The meeting at a node has not started (so it can still be replaced). */
function nodeMeetingOpen(t: Tournament, node: BracketNode): boolean {
  if (!node.matchId) return true
  const tm = t.teamMatches[node.matchId]
  if (tm) return encounterOpen(t, tm)
  const m = t.matches[node.matchId]
  return !m || (m.status === 'scheduled' && m.events.length === 0 && m.timer.elapsedMs === 0 && m.timer.runningSince === null)
}

/** Remove a node's (unstarted) meeting from the tournament. */
function dropNodeMeeting(t: Tournament, node: BracketNode): Tournament {
  if (!node.matchId) return t
  const tm = t.teamMatches[node.matchId]
  const ids = new Set(tm ? [...tm.boutIds, ...(tm.daihyoMatchId ? [tm.daihyoMatchId] : [])] : [node.matchId])
  const matches = Object.fromEntries(Object.entries(t.matches).filter(([id]) => !ids.has(id)))
  const teamMatches = tm ? Object.fromEntries(Object.entries(t.teamMatches).filter(([id]) => id !== tm.id)) : t.teamMatches
  return {
    ...t,
    matches,
    teamMatches,
    matchQueue: t.matchQueue.filter((id) => !ids.has(id)),
    courts: t.courts.map((c) => (c.activeMatchId && ids.has(c.activeMatchId) ? { ...c, activeMatchId: null } : c))
  }
}

export class BracketError extends Error {}

/**
 * Change who won a node after a result was corrected. Allowed only while the
 * next round's meeting has not started; that meeting is rebuilt with the new winner.
 * `winner` null = the node is undecided again (e.g. a daihyo-sen is now needed).
 */
export function replaceWinner(t: Tournament, nodeId: Id, winner: Id | null): Tournament {
  const node = t.bracket?.nodes[nodeId]
  if (!t.bracket || !node || node.winnerEntrantId === winner) return t
  if (!node.next) {
    const nodes = { ...t.bracket.nodes, [node.id]: { ...node, winnerEntrantId: winner } }
    return { ...t, bracket: { ...t.bracket, nodes }, phase: winner ? 'finished' : 'bracket' }
  }
  const target = t.bracket.nodes[node.next.nodeId]!
  if (target.winnerEntrantId || !nodeMeetingOpen(t, target)) {
    throw new BracketError('The next round has already been fought; this result can no longer change who advances.')
  }
  t = dropNodeMeeting(t, target)
  const key = node.next.side === 'aka' ? 'akaEntrantId' : 'shiroEntrantId'
  const cleared: BracketNode = { ...target, [key]: null, matchId: null }
  const bracket = t.bracket!
  t = { ...t, phase: 'bracket', bracket: { ...bracket, nodes: { ...bracket.nodes, [node.id]: { ...node, winnerEntrantId: null }, [cleared.id]: cleared } } }
  return winner ? advance(t, node.id, winner) : t
}

export function buildBracket(t: Tournament): Tournament {
  const qs = qualifiers(t)
  if (qs.length === 1) {
    // A single qualifier is the champion.
    const id = uid('bn')
    const node: BracketNode = { id, round: 0, slot: 0, akaEntrantId: qs[0]!.entrantId, shiroEntrantId: null, matchId: null, winnerEntrantId: qs[0]!.entrantId, next: null }
    return { ...t, bracket: { rounds: 1, nodes: { [id]: node } }, phase: 'finished' }
  }

  const size = nextPow2(qs.length)
  const rounds = Math.log2(size)
  const seeds = assignSeeds(qs, size)
  const order = seedOrder(size)

  // Build every node, last round first so `next` links exist.
  const ids: Id[][] = []
  for (let r = 0; r < rounds; r++) ids.push(Array.from({ length: size / 2 ** (r + 1) }, () => uid('bn')))
  const nodes: Record<Id, BracketNode> = {}
  ids.forEach((roundIds, r) =>
    roundIds.forEach((id, slot) => {
      const nextId = ids[r + 1]?.[Math.floor(slot / 2)]
      const side: Side = slot % 2 === 0 ? 'aka' : 'shiro'
      nodes[id] = {
        id,
        round: r,
        slot,
        akaEntrantId: r === 0 ? (seeds.get(order[slot * 2]!) ?? null) : null,
        shiroEntrantId: r === 0 ? (seeds.get(order[slot * 2 + 1]!) ?? null) : null,
        matchId: null,
        winnerEntrantId: null,
        next: nextId ? { nodeId: nextId, side } : null
      }
    })
  )

  let next: Tournament = { ...t, phase: 'bracket', bracket: { rounds, nodes } satisfies Bracket }
  for (const id of ids[0]!) {
    const node = next.bracket!.nodes[id]!
    const lone = node.akaEntrantId && !node.shiroEntrantId ? node.akaEntrantId : !node.akaEntrantId ? node.shiroEntrantId : null
    next = lone ? advance(next, id, lone) : scheduleNode(next, node) // bye: straight through
  }
  return next
}
