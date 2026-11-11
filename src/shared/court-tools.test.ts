import { describe, expect, it } from 'vitest'
import { onCourt, peopleIn, waitingOn } from './competition'
import { helpOptions } from './court-tools'
import type { AdminAction, CompetitionSetup } from './ipc'
import { initialState, reduceApp } from './reducer'
import type { AppState, Side } from './types'

let clock = 5_000_000
const act = (s: AppState, a: AdminAction): AppState => reduceApp(s, a, (clock += 1000)).state
const tryAct = (s: AppState, a: AdminAction) => reduceApp(s, a, (clock += 1000))
const comp = (s: AppState) => s.competition!
const court = (s: AppState, i: number) => comp(s).courts[i]!.id
const shown = (s: AppState, courtId: string) => onCourt(comp(s), courtId)?.match

function win(s: AppState, courtId: string, side: Side = 'aka'): AppState {
  s = act(s, { type: 'ADD_IPPON', side, technique: 'M', courtId })
  if (shown(s, courtId)?.status !== 'awaiting-confirmation') s = act(s, { type: 'ADD_IPPON', side, technique: 'K', courtId })
  return act(s, { type: 'APPROVE_MATCH', courtId })
}

const people = (names: string[]) => names.map((name, i) => ({ name, dojo: `D${i}` }))
const category = (name: string, entrants: { name: string; dojo: string }[], over: Record<string, unknown> = {}) => ({
  name,
  mode: 'individual' as const,
  poolSize: 3,
  advancePerPool: 1,
  poolMatchMinutes: 3,
  bracketMatchMinutes: 3,
  entrants,
  drawSeed: 1,
  ...over
})
const create = (setup: CompetitionSetup) => act(initialState(), { type: 'CREATE_COMPETITION', setup })

describe('one fighter, two courts', () => {
  it('a court does not call someone who is fighting on the other court', () => {
    // "Ana Petrova" is in both categories; each category has one pool with her first match first.
    let s = create({
      name: 'Cup',
      date: '2026-11-07',
      courts: 2,
      categories: [
        category('Female', people(['Ana Petrova', 'Bea', 'Cvetelina']), { courtLetters: ['A'], predrawn: { pools: [{ name: 'A', entrants: ['Ana Petrova', 'Bea', 'Cvetelina'], matches: [['Ana Petrova', 'Bea'], ['Bea', 'Cvetelina'], ['Ana Petrova', 'Cvetelina']] }], bracket: [] } }),
        category('Mixed', people(['ANA PETROVA', 'Dimo', 'Emil', 'Filip']), { courtLetters: ['B'], poolSize: 4, predrawn: { pools: [{ name: 'A', entrants: ['ANA PETROVA', 'Dimo', 'Emil', 'Filip'], matches: [['ANA PETROVA', 'Dimo'], ['Emil', 'Filip'], ['ANA PETROVA', 'Emil']] }], bracket: [] } })
      ]
    })
    const [A, B] = [court(s, 0), court(s, 1)]
    // Court A starts Ana's match; court B must skip her and call Emil vs Filip instead.
    s = act(s, { type: 'TIMER_START', courtId: A })
    const onA = onCourt(comp(s), A)!
    const onB = onCourt(comp(s), B)!
    expect([...peopleIn(onA.category, onA.match!)]).toContain('ana petrova')
    expect([...peopleIn(onB.category, onB.match!)]).not.toContain('ana petrova')
    // Loading her other match by hand is refused while she fights.
    const anaOnB = Object.values(onB.category.matches).find((m) => m.status === 'scheduled' && peopleIn(onB.category, m).has('ana petrova'))!
    expect(() => reduceApp(s, { type: 'LOAD_MATCH', matchId: anaOnB.id, courtId: B }, clock)).toThrow(/fighting on Shiai-jo A/)
    // After Emil vs Filip, B has only Ana's matches left: it waits and says why.
    s = win(s, B)
    expect(shown(s, B)).toBeUndefined()
    expect(waitingOn(comp(s), B)).toEqual({ name: 'ANA PETROVA', courtName: 'Shiai-jo A' })
    // Her match on A ends: B calls her.
    s = win(s, A)
    expect(peopleIn(onCourt(comp(s), B)!.category, shown(s, B)!).has('ana petrova') || peopleIn(onCourt(comp(s), A)!.category, shown(s, A)!).has('ana petrova')).toBe(true)
  })
})

describe('a free court takes over a whole group', () => {
  it('offers the last waiting group of the busy court and moves all its matches', () => {
    let s = create({
      name: 'Cup',
      date: '2026-11-07',
      courts: 2,
      categories: [
        category('Short', people(['A1', 'A2']), { courtLetters: ['A'], poolSize: 2 }),
        category('Long', people(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9']), { courtLetters: ['B'] })
      ]
    })
    const [A, B] = [court(s, 0), court(s, 1)]
    s = win(s, A)
    expect(shown(s, A)).toBeUndefined()
    const options = helpOptions(comp(s), A)
    expect(options).toHaveLength(1)
    const long = comp(s).categories[1]!
    const lastPool = long.pools[long.pools.length - 1]!
    expect(options[0]).toMatchObject({ poolId: lastPool.id, fromCourt: 'Shiai-jo B', matchesLeft: 3 })
    s = act(s, { type: 'TAKE_POOL', poolId: lastPool.id, courtId: A })
    expect(shown(s, A)?.poolId).toBe(lastPool.id)
    expect(Object.values(comp(s).categories[1]!.matches).filter((m) => m.poolId === lastPool.id).every((m) => m.courtId === A)).toBe(true)
    expect(shown(s, B)?.poolId).not.toBe(lastPool.id)
    // A group with a match under way is never split.
    const running = shown(s, B)!.poolId!
    s = act(s, { type: 'TIMER_START', courtId: B })
    expect(() => tryAct(s, { type: 'TAKE_POOL', poolId: running, courtId: A })).toThrow()
  })
})

describe('match tools', () => {
  const one = () =>
    create({ name: 'Cup', date: '2026-11-07', courts: 1, categories: [category('Solo', people(['P1', 'P2', 'P3', 'P4']), { poolSize: 4 })] })

  it('Later moves the loaded match behind the next two', () => {
    let s = one()
    const A = court(s, 0)
    const t = comp(s).categories[0]!
    const first = shown(s, A)!.id
    const order = t.matchQueue
    s = act(s, { type: 'POSTPONE_MATCH', courtId: A })
    expect(shown(s, A)!.id).toBe(order[1])
    // It comes after the next two matches with other fighters (here only one exists: P3 vs P4).
    const mine = peopleIn(t, t.matches[first]!)
    const others = order.filter((id) => ![...peopleIn(t, t.matches[id]!)].some((k) => mine.has(k))).slice(0, 2)
    const queue = comp(s).categories[0]!.matchQueue
    expect(others.length).toBeGreaterThan(0)
    for (const id of others) expect(queue.indexOf(first)).toBeGreaterThan(queue.indexOf(id))
    s = act(s, { type: 'TIMER_START', courtId: A })
    expect(() => tryAct(s, { type: 'POSTPONE_MATCH', courtId: A })).toThrow()
  })

  it('Kiken during a match: the opponent wins 2-0, points already scored stand', () => {
    let s = one()
    const A = court(s, 0)
    s = act(s, { type: 'ADD_IPPON', side: 'aka', technique: 'M', courtId: A })
    const id = shown(s, A)!.id
    s = act(s, { type: 'KIKEN', side: 'shiro', courtId: A })
    const m = comp(s).categories[0]!.matches[id]!
    expect(m.status).toBe('completed')
    expect(m.result).toMatchObject({ winner: 'aka', decision: 'kiken', akaIppons: 2, shiroIppons: 0 })
    expect(shown(s, A)!.id).not.toBe(id)
  })

  it('Swap sides before the start only', () => {
    let s = one()
    const A = court(s, 0)
    const before = shown(s, A)!
    s = act(s, { type: 'SWAP_SIDES', courtId: A })
    expect(shown(s, A)!.aka.playerId).toBe(before.shiro.playerId)
    s = act(s, { type: 'TIMER_START', courtId: A })
    expect(() => tryAct(s, { type: 'SWAP_SIDES', courtId: A })).toThrow()
  })
})
