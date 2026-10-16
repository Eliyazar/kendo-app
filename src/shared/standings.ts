// Pool standings and tie detection.
//
// Order: Wins > (team mode: bouts won) > Ippons scored > Ippons conceded
//        > Head-to-head > Tie-breaker matches.
// Entrants still level after all of that are an "absolute tie".

import { entrantOf, tallyEncounter } from './encounters'
import type { Id, Pool, Side, Tournament } from './types'

export interface Standing {
  entrantId: Id
  played: number
  wins: number
  draws: number
  losses: number
  /** Team mode: individual bouts won across all encounters. */
  boutWins: number
  ipponsScored: number
  ipponsConceded: number
  tieBreakWins: number
  /** 1-based; entrants in an absolute tie share a rank. */
  rank: number
  /** Other entrants this one is absolutely tied with. */
  tiedWith: Id[]
}

interface Meeting {
  aka: Id
  shiro: Id
  winner: Side | null
  akaBouts: number
  shiroBouts: number
  akaIppons: number
  shiroIppons: number
}

/** Completed pool meetings (matches or team encounters) of one pool. */
function poolMeetings(t: Tournament, poolId: Id): Meeting[] {
  if (t.mode === 'team') {
    return Object.values(t.teamMatches)
      .filter((tm) => tm.kind === 'pool' && tm.poolId === poolId && tm.status === 'completed')
      .map((tm) => {
        const r = tallyEncounter(t, tm)
        return {
          aka: tm.akaTeamId,
          shiro: tm.shiroTeamId,
          winner: r.winner,
          akaBouts: r.akaWins,
          shiroBouts: r.shiroWins,
          akaIppons: r.akaIppons,
          shiroIppons: r.shiroIppons
        }
      })
  }
  return Object.values(t.matches)
    .filter((m) => m.kind === 'pool' && m.poolId === poolId && m.result)
    .map((m) => ({
      aka: m.aka.playerId!,
      shiro: m.shiro.playerId!,
      winner: m.result!.winner,
      akaBouts: 0,
      shiroBouts: 0,
      akaIppons: m.result!.akaIppons,
      shiroIppons: m.result!.shiroIppons
    }))
}

function tieBreakWins(t: Tournament, poolId: Id): Map<Id, number> {
  const wins = new Map<Id, number>()
  for (const m of Object.values(t.matches)) {
    if (m.kind !== 'tie-breaker' || m.poolId !== poolId || !m.result?.winner) continue
    const id = entrantOf(t, m, m.result.winner)
    if (id) wins.set(id, (wins.get(id) ?? 0) + 1)
  }
  return wins
}

/** Split `group` into ordered sub-groups by a score (higher first). */
function splitBy(group: Standing[], score: (s: Standing) => number): Standing[][] {
  const byScore = new Map<number, Standing[]>()
  for (const s of group) byScore.set(score(s), [...(byScore.get(score(s)) ?? []), s])
  return [...byScore].sort((a, b) => b[0] - a[0]).map(([, g]) => g)
}

export function computeStandings(t: Tournament, pool: Pool): Standing[] {
  const rows = new Map<Id, Standing>(
    pool.entrantIds.map((id) => [
      id,
      { entrantId: id, played: 0, wins: 0, draws: 0, losses: 0, boutWins: 0, ipponsScored: 0, ipponsConceded: 0, tieBreakWins: 0, rank: 0, tiedWith: [] }
    ])
  )
  const meetings = poolMeetings(t, pool.id)
  for (const m of meetings) {
    const a = rows.get(m.aka)
    const s = rows.get(m.shiro)
    if (!a || !s) continue
    a.played++
    s.played++
    a.boutWins += m.akaBouts
    s.boutWins += m.shiroBouts
    a.ipponsScored += m.akaIppons
    a.ipponsConceded += m.shiroIppons
    s.ipponsScored += m.shiroIppons
    s.ipponsConceded += m.akaIppons
    if (m.winner === 'aka') (a.wins++, s.losses++)
    else if (m.winner === 'shiro') (s.wins++, a.losses++)
    else (a.draws++, s.draws++)
  }
  for (const [id, w] of tieBreakWins(t, pool.id)) {
    const r = rows.get(id)
    if (r) r.tieBreakWins = w
  }

  /** Wins against the other members of `group` only (head-to-head mini league). */
  const h2h = (group: Standing[]) => {
    const ids = new Set(group.map((g) => g.entrantId))
    return (s: Standing): number =>
      meetings.filter(
        (m) =>
          ids.has(m.aka) &&
          ids.has(m.shiro) &&
          ((m.winner === 'aka' && m.aka === s.entrantId) || (m.winner === 'shiro' && m.shiro === s.entrantId))
      ).length
  }

  const keys: ((group: Standing[]) => (s: Standing) => number)[] = [
    () => (s) => s.wins,
    () => (s) => s.boutWins,
    () => (s) => s.ipponsScored,
    () => (s) => -s.ipponsConceded,
    h2h,
    () => (s) => s.tieBreakWins
  ]

  const resolve = (group: Standing[], level: number): Standing[][] => {
    if (group.length < 2 || level >= keys.length) return [group]
    return splitBy(group, keys[level]!(group)).flatMap((g) => resolve(g, level + 1))
  }

  const ordered: Standing[] = []
  for (const group of resolve([...rows.values()], 0)) {
    const rank = ordered.length + 1
    for (const s of group) {
      s.rank = rank
      s.tiedWith = group.length > 1 ? group.filter((o) => o !== s).map((o) => o.entrantId) : []
      ordered.push(s)
    }
  }
  return ordered
}

/** All pool bouts (and pool tie-breakers) are approved. */
export function poolsComplete(t: Tournament): boolean {
  return Object.values(t.matches).every((m) => (m.kind === 'pool' || m.kind === 'tie-breaker' ? m.status === 'completed' : true))
}

export interface TieGroup {
  poolId: Id
  entrantIds: Id[]
}

/**
 * Absolute ties that affect qualification or bracket placement: any tied
 * group that includes a qualifying rank.
 */
export function unresolvedTies(t: Tournament): TieGroup[] {
  const ties: TieGroup[] = []
  for (const pool of t.pools) {
    const seen = new Set<Id>()
    for (const s of computeStandings(t, pool)) {
      if (!s.tiedWith.length || s.rank > t.advancePerPool || seen.has(s.entrantId)) continue
      const group = [s.entrantId, ...s.tiedWith]
      group.forEach((id) => seen.add(id))
      ties.push({ poolId: pool.id, entrantIds: group })
    }
  }
  return ties
}
