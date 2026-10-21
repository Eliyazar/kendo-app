import { describe, expect, it } from 'vitest'
import { assignSeeds, seedOrder } from './bracket'
import type { AdminAction } from './ipc'
import { initialState, reduceApp } from './reducer'
import { drawPools, roundRobin, validateSetup, type TournamentSetup } from './setup'
import { computeStandings, poolsComplete, unresolvedTies } from './standings'
import type { AppState, Side, Tournament } from './types'

let clock = 1_000_000
function act(s: AppState, a: AdminAction | { type: 'TICK' }): AppState {
  clock += 1000
  return reduceApp(s, a, clock).state
}
const tour = (s: AppState): Tournament => s.tournament!
const activeId = (s: AppState) => tour(s).courts[0]!.activeMatchId
const active = (s: AppState) => tour(s).matches[activeId(s)!]!

/** Finish the active match: 'aka' / 'shiro' win by ippon, 'draw' runs out the clock. */
function play(s: AppState, outcome: Side | 'draw'): AppState {
  if (outcome === 'draw') {
    s = act(s, { type: 'TIMER_START' })
    clock += active(s).timer.durationMs + 1000
    s = act(s, { type: 'TICK' })
  } else {
    s = act(s, { type: 'ADD_IPPON', side: outcome, technique: 'M' })
    // Tie-breakers and daihyo-sen end on the first point.
    if (active(s).status !== 'awaiting-confirmation') s = act(s, { type: 'ADD_IPPON', side: outcome, technique: 'K' })
  }
  return act(s, { type: 'APPROVE_MATCH' })
}

const setup = (over: Partial<TournamentSetup>): TournamentSetup => ({
  name: 'Test',
  date: '2026-10-16',
  mode: 'individual',
  poolSize: 3,
  advancePerPool: 2,
  poolMatchMinutes: 3,
  bracketMatchMinutes: 3,
  courts: 1,
  entrants: [],
  drawSeed: 1,
  ...over
})

const players = (n: number, dojos = n) =>
  Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, dojo: `D${i % dojos}` }))

describe('draw', () => {
  it('round-robin pairs everyone once and nobody twice per round', () => {
    const rounds = roundRobin(['a', 'b', 'c', 'd', 'e'])
    const pairs = rounds.flat().map((p) => [...p].sort().join(''))
    expect(new Set(pairs).size).toBe(10)
    for (const r of rounds) expect(new Set(r.flat()).size).toBe(r.length * 2)
  })

  it('balances pool sizes and keeps dojo mates apart', () => {
    const entrants = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, dojo: i < 3 ? 'Big' : `D${i}` }))
    const pools = drawPools(entrants, 3, 42)
    expect(pools.map((p) => p.length).sort()).toEqual([3, 3, 4])
    for (const p of pools) expect(p.filter((id) => Number(id.slice(1)) < 3)).toHaveLength(1)
  })

  it('rejects impossible setups', () => {
    expect(validateSetup(setup({ entrants: players(1) }))).toMatch(/At least 2/)
    expect(validateSetup(setup({ entrants: players(6), advancePerPool: 3 }))).toMatch(/at most 2/)
    expect(validateSetup(setup({ mode: 'team', teamSize: 3, entrants: players(4) }))).toMatch(/team name/)
    expect(typeof validateSetup(setup({ entrants: players(6) }))).toBe('object')
  })
})

describe('bracket seeding', () => {
  it('uses the standard seed order', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })

  it('puts same-pool qualifiers in opposite halves', () => {
    const qs = [0, 1, 2].flatMap((pool) => [1, 2].map((place) => ({ entrantId: `${'ABC'[pool]}${place}`, poolIndex: pool, place })))
    const seeds = assignSeeds(qs, 8)
    const order = seedOrder(8)
    const half = (id: string) => {
      const seed = [...seeds].find(([, e]) => e === id)![0]
      return order.indexOf(seed) < 4 ? 0 : 1
    }
    for (const p of 'ABC') expect(half(`${p}1`)).not.toBe(half(`${p}2`))
  })
})

describe('individual tournament', () => {
  it('runs pools, locks, plays the bracket to a champion', () => {
    let s = act(initialState(), { type: 'CREATE_TOURNAMENT', setup: setup({ entrants: players(9) }) })
    expect(tour(s).pools).toHaveLength(3)
    expect(tour(s).matchQueue).toHaveLength(9)
    // Locking early is refused.
    expect(() => reduceApp(s, { type: 'LOCK_POOLS' }, clock)).toThrow(/Finish all pool/)

    // Aka always wins: produces a clear 1st/2nd/3rd in each pool of three.
    while (activeId(s)) s = play(s, 'aka')
    expect(poolsComplete(tour(s))).toBe(true)

    const ties = unresolvedTies(tour(s))
    for (const tie of ties) {
      s = act(s, { type: 'GENERATE_TIE_BREAKER', poolId: tie.poolId, entrantIds: tie.entrantIds })
      // The first tied fighter wins all their tie-breakers, which settles the order.
      while (activeId(s)) s = play(s, active(s).shiro.playerId === tie.entrantIds[0] ? 'shiro' : 'aka')
    }
    expect(unresolvedTies(tour(s))).toEqual([])

    s = act(s, { type: 'LOCK_POOLS' })
    expect(tour(s).phase).toBe('bracket')
    expect(tour(s).bracket!.rounds).toBe(3) // 6 qualifiers -> 8-slot bracket, 2 byes

    let guard = 0
    while (activeId(s) && guard++ < 20) s = play(s, 'shiro')
    expect(tour(s).phase).toBe('finished')
    const final = Object.values(tour(s).bracket!.nodes).find((n) => !n.next)!
    expect(final.winnerEntrantId).toBeTruthy()
  })

  it('flags a three-way tie and resolves it with tie-breakers', () => {
    let s = act(initialState(), { type: 'CREATE_TOURNAMENT', setup: setup({ entrants: players(3), advancePerPool: 1 }) })
    // Circle of wins: every player 1 win, 2 ippons scored, 2 conceded.
    while (activeId(s)) s = play(s, 'aka')
    const [tie] = unresolvedTies(tour(s))
    expect(tie?.entrantIds).toHaveLength(3)
    expect(() => reduceApp(s, { type: 'LOCK_POOLS' }, clock)).toThrow(/ties/)

    s = act(s, { type: 'GENERATE_TIE_BREAKER', poolId: tie!.poolId, entrantIds: tie!.entrantIds })
    expect(active(s).kind).toBe('tie-breaker')
    expect(active(s).config.ipponsToWin).toBe(1)
    s = act(s, { type: 'ADD_IPPON', side: 'aka', technique: 'D' })
    s = act(s, { type: 'APPROVE_MATCH' })
    s = act(s, { type: 'ADD_IPPON', side: 'aka', technique: 'D' })
    s = act(s, { type: 'APPROVE_MATCH' })
    s = act(s, { type: 'ADD_IPPON', side: 'shiro', technique: 'D' })
    s = act(s, { type: 'APPROVE_MATCH' })

    const table = computeStandings(tour(s), tour(s).pools[0]!)
    expect(unresolvedTies(tour(s))).toEqual([])
    expect(table[0]!.tieBreakWins).toBe(2)
    s = act(s, { type: 'LOCK_POOLS' })
    expect(tour(s).phase).toBe('finished')
  })
})

describe('team tournament', () => {
  const teamEntrants = (teams: number, size: number, missing = 0) =>
    Array.from({ length: teams }, (_, t) =>
      Array.from({ length: size - (t === 0 ? missing : 0) }, (_, p) => ({ name: `T${t}P${p}`, dojo: `D${t}`, team: `Team ${t}` }))
    ).flat()

  it('keeps empty positions, tallies encounters and adds a daihyo-sen to a level bracket encounter', () => {
    let s = act(
      initialState(),
      {
        type: 'CREATE_TOURNAMENT',
        setup: setup({ mode: 'team', teamSize: 3, poolSize: 2, advancePerPool: 1, entrants: teamEntrants(4, 3, 1) })
      }
    )
    const t0 = Object.values(tour(s).teams).find((t) => t.name === 'Team 0')!
    expect(t0.order).toHaveLength(3)
    expect(t0.order[2]).toBeNull()
    expect(t0.pin).toMatch(/^\d{4}$/)
    expect(Object.keys(tour(s).teamMatches)).toHaveLength(2)

    // Pools: first bout aka wins (fusen-gachi if a player is missing), rest drawn.
    while (activeId(s)) {
      const m = active(s)
      if (m.position === 0 || !m.aka.playerId || !m.shiro.playerId) {
        const side: Side = m.aka.playerId ? 'aka' : 'shiro'
        s = m.aka.playerId && m.shiro.playerId ? play(s, 'aka') : act(act(s, { type: 'FUSEN_GACHI', side }), { type: 'APPROVE_MATCH' })
      } else s = play(s, 'draw')
    }
    expect(Object.values(tour(s).teamMatches).every((tm) => tm.status === 'completed')).toBe(true)

    s = act(s, { type: 'LOCK_POOLS' })
    expect(tour(s).phase).toBe('bracket')
    // Final: all three bouts drawn -> level -> daihyo-sen.
    for (let i = 0; i < 3; i++) s = play(s, 'draw')
    const daihyo = active(s)
    expect(daihyo.representative).toBe(true)
    expect(() => reduceApp(s, { type: 'TIMER_START' }, clock)).toThrow(/representatives/)

    const tm = tour(s).teamMatches[daihyo.teamMatchId!]!
    s = act(s, { type: 'SET_REPRESENTATIVE', side: 'aka', playerId: tour(s).teams[tm.akaTeamId]!.members[0]! })
    s = act(s, { type: 'SET_REPRESENTATIVE', side: 'shiro', playerId: tour(s).teams[tm.shiroTeamId]!.members[0]! })
    s = act(s, { type: 'ADD_IPPON', side: 'shiro', technique: 'M' })
    s = act(s, { type: 'APPROVE_MATCH' })
    expect(tour(s).teamMatches[tm.id]!.result?.winner).toBe('shiro')
    expect(tour(s).phase).toBe('finished')
  })
})
