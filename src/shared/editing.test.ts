import { describe, expect, it } from 'vitest'
import { countryName, toIocCode } from './countries'
import { lineupOf } from './encounters'
import type { AdminAction } from './ipc'
import { initialState, reduceApp } from './reducer'
import type { TournamentSetup } from './setup'
import { computeStandings } from './standings'
import type { AppState, Side, Tournament } from './types'

let clock = 5_000_000
const act = (s: AppState, a: AdminAction | { type: 'TICK' }): AppState => reduceApp(s, a, (clock += 1000)).state
const fails = (s: AppState, a: AdminAction, msg: RegExp) => expect(() => reduceApp(s, a, clock)).toThrow(msg)
const tour = (s: AppState): Tournament => s.tournament!
const activeOn = (s: AppState, court = 0) => {
  const id = tour(s).courts[court]!.activeMatchId
  return id ? tour(s).matches[id]! : undefined
}

function win(s: AppState, side: Side, courtId?: string): AppState {
  const c = courtId ? { courtId } : {}
  s = act(s, { type: 'ADD_IPPON', side, technique: 'M', ...c })
  const m = tour(s).courts.find((x) => !courtId || x.id === courtId)!.activeMatchId!
  if (tour(s).matches[m]!.status !== 'awaiting-confirmation') s = act(s, { type: 'ADD_IPPON', side, technique: 'K', ...c })
  return act(s, { type: 'APPROVE_MATCH', ...c })
}

const base = (over: Partial<TournamentSetup>): TournamentSetup => ({
  name: 'T',
  date: '2026-10-21',
  mode: 'individual',
  poolSize: 3,
  advancePerPool: 1,
  poolMatchMinutes: 3,
  bracketMatchMinutes: 3,
  courts: 1,
  entrants: Array.from({ length: 6 }, (_, i) => ({ name: `P${i}`, dojo: `D${i}`, country: i % 2 ? 'Bulgaria' : 'SRB' })),
  drawSeed: 1,
  ...over
})

const create = (over: Partial<TournamentSetup> = {}) => act(initialState(), { type: 'CREATE_TOURNAMENT', setup: base(over) })

describe('countries', () => {
  it('maps names, ISO and native spellings to IOC codes', () => {
    expect(toIocCode('Bulgaria')).toBe('BUL')
    expect(toIocCode('bgr')).toBe('BUL')
    expect(toIocCode('България')).toBe('BUL')
    expect(toIocCode('Deutschland')).toBe('GER')
    expect(toIocCode('Atlantis')).toBeNull()
    expect(countryName('SRB')).toBe('Serbia')
  })

  it('stores IOC codes on players', () => {
    const s = create()
    expect(Object.values(tour(s).players).map((p) => p.country).sort()).toEqual(['BUL', 'BUL', 'BUL', 'SRB', 'SRB', 'SRB'])
  })
})

describe('participants after the draw', () => {
  it('withdrawal before anyone in the pool fought removes the entrant cleanly', () => {
    let s = create()
    const pool = tour(s).pools[0]!
    const leaving = pool.entrantIds[0]!
    s = act(s, { type: 'WITHDRAW_ENTRANT', entrantId: leaving })
    expect(tour(s).pools[0]!.entrantIds).not.toContain(leaving)
    expect(Object.values(tour(s).matches).filter((m) => m.poolId === pool.id)).toHaveLength(1)
  })

  it('withdrawal mid-pool loses the remaining matches by kiken', () => {
    let s = create()
    s = win(s, 'aka') // first pool A match fought
    const pool = tour(s).pools[0]!
    const leaving = pool.entrantIds.find((id) => {
      const fought = Object.values(tour(s).matches).find((m) => m.status === 'completed')!
      return id !== fought.aka.playerId && id !== fought.shiro.playerId
    })!
    s = act(s, { type: 'WITHDRAW_ENTRANT', entrantId: leaving })
    const theirs = Object.values(tour(s).matches).filter((m) => m.aka.playerId === leaving || m.shiro.playerId === leaving)
    expect(theirs.every((m) => m.status === 'completed' && m.result?.decision === 'kiken')).toBe(true)
    const row = computeStandings(tour(s), tour(s).pools[0]!).find((r) => r.entrantId === leaving)!
    expect(row.losses).toBe(2)
    fails(s, { type: 'WITHDRAW_ENTRANT', entrantId: leaving }, /Already/)
  })

  it('late entry joins the smallest pool with a match against each member', () => {
    let s = create({ entrants: Array.from({ length: 7 }, (_, i) => ({ name: `P${i}`, dojo: `D${i}` })) }) // pools of 4 and 3
    const before = tour(s).matchQueue.length
    s = act(s, { type: 'ADD_ENTRANT', entrant: { name: 'Late Comer', dojo: 'X', country: 'GER' } })
    const late = Object.values(tour(s).players).find((p) => p.name === 'Late Comer')!
    expect(late.country).toBe('GER')
    expect(tour(s).pools.find((p) => p.entrantIds.includes(late.id))!.entrantIds).toHaveLength(4)
    expect(tour(s).matchQueue.length - before).toBe(3)
    fails(s, { type: 'ADD_ENTRANT', entrant: { name: 'X', country: 'Atlantis' } }, /Unknown country/)
  })

  it('edits a player', () => {
    let s = create()
    const id = Object.keys(tour(s).players)[0]!
    s = act(s, { type: 'EDIT_PLAYER', playerId: id, patch: { name: 'New Name', dojo: 'New Dojo', country: 'Japan' } })
    expect(tour(s).players[id]).toMatchObject({ name: 'New Name', dojo: 'New Dojo', country: 'JPN' })
  })
})

describe('result corrections', () => {
  it('pool result can be corrected until the pools are locked', () => {
    let s = create()
    s = win(s, 'aka')
    const done = Object.values(tour(s).matches).find((m) => m.status === 'completed')!
    s = act(s, {
      type: 'EDIT_RESULT',
      matchId: done.id,
      entries: [
        { kind: 'ippon', side: 'shiro', technique: 'D' },
        { kind: 'ippon', side: 'shiro', technique: 'D' }
      ]
    })
    expect(tour(s).matches[done.id]!.result).toMatchObject({ winner: 'shiro', shiroIppons: 2, akaIppons: 0 })
    expect(tour(s).matches[done.id]!.result!.editedAt).toBeDefined()
  })

  it('bracket correction swaps who advances while the next round has not started', () => {
    let s = create({ entrants: base({}).entrants.slice(0, 4), poolSize: 2, advancePerPool: 1 })
    // two pools of 2 -> final directly; make it 4 pools of... use 8 players for a semi-final round
    s = create({ entrants: Array.from({ length: 8 }, (_, i) => ({ name: `P${i}`, dojo: `D${i}` })), poolSize: 2 })
    while (activeOn(s)) s = win(s, 'aka')
    s = act(s, { type: 'LOCK_POOLS' })
    const sf = activeOn(s)!
    s = win(s, 'aka') // semi-final 1 decided, final waits for semi-final 2
    const final = Object.values(tour(s).bracket!.nodes).find((n) => !n.next)!
    expect(final.akaEntrantId).toBe(sf.aka.playerId)
    s = act(s, {
      type: 'EDIT_RESULT',
      matchId: sf.id,
      entries: [{ kind: 'ippon', side: 'shiro', technique: 'M' }, { kind: 'ippon', side: 'shiro', technique: 'M' }]
    })
    const fixed = Object.values(tour(s).bracket!.nodes).find((n) => !n.next)!
    expect(fixed.akaEntrantId).toBe(sf.shiro.playerId)

    s = win(s, 'aka') // semi-final 2 -> final is scheduled
    s = act(s, { type: 'ADD_IPPON', side: 'aka', technique: 'M' }) // final starts
    fails(
      s,
      { type: 'EDIT_RESULT', matchId: sf.id, entries: [{ kind: 'ippon', side: 'aka', technique: 'M' }, { kind: 'ippon', side: 'aka', technique: 'M' }] },
      /next round/
    )
    // Pool results are locked now.
    const poolMatch = Object.values(tour(s).matches).find((m) => m.kind === 'pool')!
    fails(s, { type: 'EDIT_RESULT', matchId: poolMatch.id, entries: [] }, /locked/)
  })

  it('bracket withdrawal lets the opponent advance', () => {
    let s = create({ entrants: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, dojo: `D${i}` })), poolSize: 2 })
    while (activeOn(s)) s = win(s, 'aka')
    s = act(s, { type: 'LOCK_POOLS' })
    const final = activeOn(s)!
    s = act(s, { type: 'WITHDRAW_ENTRANT', entrantId: final.aka.playerId! })
    expect(tour(s).phase).toBe('finished')
    expect(tour(s).matches[final.id]!.result).toMatchObject({ winner: 'shiro', decision: 'kiken', shiroIppons: 2 })
  })
})

describe('teams', () => {
  const teamEntrants = (teams: number, size: number) =>
    Array.from({ length: teams }, (_, t) => Array.from({ length: size }, (_, p) => ({ name: `T${t}P${p}`, dojo: `D${t}`, team: `Team ${t}` }))).flat()

  const createTeams = (size = 4) =>
    create({ mode: 'team', teamSize: 3, poolSize: 2, entrants: teamEntrants(2, size) })

  it('keeps reserves out of the default order', () => {
    const s = createTeams(5)
    const team = Object.values(tour(s).teams)[0]!
    expect(team.members).toHaveLength(5)
    expect(team.order).toEqual(team.members.slice(0, 3))
    fails(initialState(), { type: 'CREATE_TOURNAMENT', setup: base({ mode: 'team', teamSize: 3, poolSize: 2, entrants: teamEntrants(2, 6) }) }, /the most is 5/)
  })

  it('sets an encounter order, rejects bad ones, and locks it once the encounter starts', () => {
    let s = createTeams()
    const tm = Object.values(tour(s).teamMatches)[0]!
    const team = tour(s).teams[tm.akaTeamId]!
    const [a, b, c, reserve] = team.members
    s = act(s, { type: 'SET_LINEUP', teamMatchId: tm.id, teamId: team.id, lineup: [reserve!, a!, null] })
    expect(lineupOf(tour(s), tour(s).teamMatches[tm.id]!, 'aka')).toEqual([reserve, a, null])
    fails(s, { type: 'SET_LINEUP', teamMatchId: tm.id, teamId: team.id, lineup: [a!, a!, b!] }, /once per encounter/)
    fails(s, { type: 'SET_LINEUP', teamMatchId: tm.id, teamId: team.id, lineup: [a!, b!] }, /exactly 3/)
    // A new default order does not override the explicit encounter order.
    s = act(s, { type: 'SET_TEAM_ORDER', teamId: team.id, order: [c!, b!, a!] })
    expect(lineupOf(tour(s), tour(s).teamMatches[tm.id]!, 'aka')).toEqual([reserve, a, null])
    s = act(s, { type: 'TIMER_START' })
    fails(s, { type: 'SET_LINEUP', teamMatchId: tm.id, teamId: team.id, lineup: [a!, b!, c!] }, /locked/)
  })

  it('default order changes flow into encounters without their own order', () => {
    let s = createTeams()
    const tm = Object.values(tour(s).teamMatches)[0]!
    const team = tour(s).teams[tm.shiroTeamId]!
    const [a, b, c] = team.members
    s = act(s, { type: 'SET_TEAM_ORDER', teamId: team.id, order: [c!, b!, a!] })
    expect(lineupOf(tour(s), tour(s).teamMatches[tm.id]!, 'shiro')).toEqual([c, b, a])
    s = act(s, { type: 'REMOVE_TEAM_MEMBER', teamId: team.id, playerId: b! })
    expect(lineupOf(tour(s), tour(s).teamMatches[tm.id]!, 'shiro')).toEqual([c, null, a])
    s = act(s, { type: 'ADD_TEAM_MEMBER', teamId: team.id, member: { name: 'New Member' } })
    const added = tour(s).teams[team.id]!.members.at(-1)!
    expect(lineupOf(tour(s), tour(s).teamMatches[tm.id]!, 'shiro')).toEqual([c, added, a])
    s = act(s, { type: 'EDIT_TEAM', teamId: team.id, patch: { name: 'Renamed', country: 'Austria' } })
    expect(tour(s).teams[team.id]).toMatchObject({ name: 'Renamed', country: 'AUT' })
  })
})

describe('courts', () => {
  it('spreads pools over courts; each court runs its own matches', () => {
    let s = create({ courts: 2, entrants: Array.from({ length: 6 }, (_, i) => ({ name: `P${i}`, dojo: `D${i}` })) })
    const [a, b] = tour(s).courts
    expect(activeOn(s, 0)!.courtId).toBe(a!.id)
    expect(activeOn(s, 1)!.courtId).toBe(b!.id)
    expect(activeOn(s, 0)!.poolId).not.toBe(activeOn(s, 1)!.poolId)

    const onB = activeOn(s, 1)!.id
    s = win(s, 'aka', b!.id)
    expect(tour(s).matches[onB]!.status).toBe('completed')
    expect(activeOn(s, 1)!.courtId).toBe(b!.id)
    expect(activeOn(s, 1)!.id).not.toBe(onB)

    // Clocks run independently.
    s = act(s, { type: 'TIMER_START', courtId: a!.id })
    expect(activeOn(s, 0)!.timer.runningSince).not.toBeNull()
    expect(activeOn(s, 1)!.timer.runningSince).toBeNull()

    // Move a scheduled match from court A to court B.
    const queued = tour(s).matchQueue.map((id) => tour(s).matches[id]!).find((m) => m.courtId === a!.id && m.status === 'scheduled' && m.id !== activeOn(s, 0)!.id)!
    s = act(s, { type: 'MOVE_MATCH', matchId: queued.id, courtId: b!.id })
    expect(tour(s).matches[queued.id]!.courtId).toBe(b!.id)
  })
})
