import { describe, expect, it } from 'vitest'
import { onCourt, peopleIn, waitingOn } from './competition'
import { helpOptions } from './court-tools'
import { computeStandings, unresolvedTies } from './standings'
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

describe('flexible pools', () => {
  const trio = () =>
    create({
      name: 'Cup',
      date: '2026-11-07',
      courts: 1,
      categories: [
        category('U12', people(['Ana', 'Bea', 'Cia']), {
          predrawn: { pools: [{ name: 'A', entrants: ['Ana', 'Bea', 'Cia'], matches: [['Ana', 'Bea'], ['Bea', 'Cia'], ['Ana', 'Cia']] }], bracket: [] }
        })
      ]
    })

  it('a single pool of three: a circular tie on the podium needs a decision', () => {
    let s = trio()
    const A = court(s, 0)
    // Ana beats Bea, Bea beats Cia, Cia beats Ana: all 2-0, a perfect circle.
    s = win(s, A, 'aka')
    s = win(s, A, 'aka')
    s = win(s, A, 'shiro')
    const t = comp(s).categories[0]!
    expect(t.bracketPlan?.kind).toBe('none')
    expect(unresolvedTies(t)).toHaveLength(1)
    expect(() => tryAct(s, { type: 'LOCK_POOLS', categoryId: t.id })).toThrow(/ties/)
  })

  it('the table adds a playoff that decides between equal wins, and can delete it before it starts', () => {
    let s = trio()
    const A = court(s, 0)
    const t0 = comp(s).categories[0]!
    const id = (n: string) => Object.values(t0.players).find((p) => p.name === n)!.id
    s = win(s, A, 'aka') // Ana beats Bea
    const oneNil = (side: Side) => {
      s = act(s, { type: 'ADD_IPPON', side, technique: 'M', courtId: A })
      s = act(s, { type: 'TIMER_ADJUST', deltaMs: -600_000, courtId: A }) // time is up
      s = act(s, { type: 'APPROVE_MATCH', courtId: A })
    }
    oneNil('aka') // Bea beats Cia 1-0
    oneNil('shiro') // Cia beats Ana 1-0
    const pool = comp(s).categories[0]!.pools[0]!
    // Ana has more ippons than Bea; the table still wants Ana and Bea to fight it out.
    s = act(s, { type: 'ADD_PLAYOFF', poolId: pool.id, entrantIds: [id('Ana'), id('Bea')] })
    const extra = shown(s, A)!
    expect(extra.kind).toBe('tie-breaker')
    s = act(s, { type: 'REMOVE_MATCH', matchId: extra.id })
    expect(comp(s).categories[0]!.matches[extra.id]).toBeUndefined()
    // Without encho: a draw at time-up stays a draw.
    s = act(s, { type: 'ADD_PLAYOFF', poolId: pool.id, entrantIds: [id('Ana'), id('Bea')], encho: false })
    const noEncho = shown(s, A)!
    expect(noEncho.config.enchoOnDraw).toBe(false)
    s = act(s, { type: 'REMOVE_MATCH', matchId: noEncho.id })
    s = act(s, { type: 'ADD_PLAYOFF', poolId: pool.id, entrantIds: [id('Bea'), id('Ana')] })
    expect(shown(s, A)!.config.enchoOnDraw).toBe(true)
    s = act(s, { type: 'ADD_IPPON', side: 'aka', technique: 'M', courtId: A }) // Bea wins the playoff
    s = act(s, { type: 'APPROVE_MATCH', courtId: A })
    const t = comp(s).categories[0]!
    const ranks = computeStandings(t, t.pools[0]!).map((r) => t.players[r.entrantId]!.name)
    expect(ranks.indexOf('Bea')).toBeLessThan(ranks.indexOf('Ana'))
    expect(() => tryAct(s, { type: 'REMOVE_MATCH', matchId: t.matchQueue[0]! })).toThrow()
  })

  it('moves a waiting match up and down; the loaded match follows the order', () => {
    let s = trio()
    const A = court(s, 0)
    const q = comp(s).categories[0]!.matchQueue
    s = act(s, { type: 'MOVE_IN_QUEUE', matchId: q[2]!, direction: 'up' })
    expect(comp(s).categories[0]!.matchQueue).toEqual([q[0], q[2], q[1]])
    s = act(s, { type: 'MOVE_IN_QUEUE', matchId: q[2]!, direction: 'up' })
    expect(comp(s).categories[0]!.matchQueue).toEqual([q[2], q[0], q[1]])
    expect(shown(s, A)!.id).toBe(q[2])
    s = act(s, { type: 'TIMER_START', courtId: A })
    expect(() => tryAct(s, { type: 'MOVE_IN_QUEUE', matchId: q[2]!, direction: 'down' })).toThrow()
  })
})

describe('restart and category order', () => {
  it('restart: same pools and fight order, every result cleared, edits kept', () => {
    let s = create({ name: 'Cup', date: '2026-11-07', courts: 1, categories: [category('Solo', people(['P1', 'P2', 'P3', 'P4']), { poolSize: 2, advancePerPool: 1 })] })
    const A = court(s, 0)
    const before = comp(s).categories[0]!
    const poolQueue = [...before.matchQueue]
    s = act(s, { type: 'EDIT_PLAYER', playerId: Object.keys(before.players)[0]!, patch: { name: 'Renamed', country: 'BUL' } })
    for (let i = 0; i < 2; i++) s = win(s, A)
    s = act(s, { type: 'LOCK_POOLS', categoryId: before.id })
    s = win(s, A)
    expect(comp(s).categories[0]!.phase).toBe('finished')
    s = act(s, { type: 'RESTART_COMPETITION' })
    const t = comp(s).categories[0]!
    expect(t.phase).toBe('pools')
    expect(t.bracket).toBeNull()
    expect(t.matchQueue).toEqual(poolQueue)
    expect(Object.values(t.matches).every((m) => m.status === 'scheduled' && !m.result && m.events.length === 0)).toBe(true)
    expect(Object.values(t.players).some((p) => p.name === 'Renamed' && p.country === 'BUL')).toBe(true)
    expect(shown(s, A)!.id).toBe(poolQueue[0])
  })

  it('moving a category up makes the court fight it first (a started match is not interrupted)', () => {
    let s = create({
      name: 'Cup',
      date: '2026-11-07',
      courts: 1,
      categories: [category('First', people(['A1', 'A2', 'A3'])), category('Second', people(['B1', 'B2', 'B3']))]
    })
    const A = court(s, 0)
    const [first, second] = comp(s).categories
    expect(onCourt(comp(s), A)!.category.id).toBe(first!.id)
    s = act(s, { type: 'MOVE_CATEGORY', categoryId: second!.id, direction: 'up' })
    expect(comp(s).categories.map((c) => c.name)).toEqual(['Second', 'First'])
    expect(onCourt(comp(s), A)!.category.id).toBe(second!.id)
    s = act(s, { type: 'TIMER_START', courtId: A })
    s = act(s, { type: 'MOVE_CATEGORY', categoryId: first!.id, direction: 'up' })
    expect(onCourt(comp(s), A)!.category.id).toBe(second!.id)
  })
})
