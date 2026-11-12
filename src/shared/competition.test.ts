import { describe, expect, it } from 'vitest'
import { onCourt } from './competition'
import { competitionFromDrafts, courtsNeeded, draftsFromDraw } from './draw-setup'
import type { DrawImport } from './draw-import'
import type { AdminAction, CompetitionSetup } from './ipc'
import { podium } from './published'
import { toPublicView } from './public-view'
import { initialState, reduceApp } from './reducer'
import { computeStandings } from './standings'
import type { AppState, Side, Tournament } from './types'

let clock = 2_000_000
const act = (s: AppState, a: AdminAction | { type: 'TICK' }): AppState => reduceApp(s, a, (clock += 1000)).state
const comp = (s: AppState) => s.competition!
const cat = (s: AppState, i: number): Tournament => comp(s).categories[i]!
const court = (s: AppState, i: number) => comp(s).courts[i]!.id

/** Finish the match on a court: `side` wins 2-0 (1-0 in ippon-shobu bouts). */
function win(s: AppState, courtId: string, side: Side = 'aka'): AppState {
  s = act(s, { type: 'ADD_IPPON', side, technique: 'M', courtId })
  if (onCourt(comp(s), courtId)?.match?.status !== 'awaiting-confirmation') s = act(s, { type: 'ADD_IPPON', side, technique: 'K', courtId })
  return act(s, { type: 'APPROVE_MATCH', courtId })
}

const people = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ name: `${prefix} ${i + 1}`, dojo: `D${i}` }))
const category = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  mode: 'individual' as const,
  poolSize: 3,
  advancePerPool: 2,
  poolMatchMinutes: 3,
  bracketMatchMinutes: 3,
  entrants: people(name, 6),
  drawSeed: 1,
  ...over
})
const create = (setup: CompetitionSetup) => act(initialState(), { type: 'CREATE_COMPETITION', setup })

describe('competition with several categories', () => {
  it('a court runs its categories one after another; other courts are independent', () => {
    let s = create({
      name: 'Ruse Cup',
      date: '2026-11-07',
      courts: 2,
      categories: [
        category('Female', { courtLetters: ['A'], entrants: people('F', 4), poolSize: 2, advancePerPool: 1 }),
        category('Veterans', { courtLetters: ['B'] }),
        category('Children', { courtLetters: ['A'] })
      ]
    })
    const [A, B] = [court(s, 0), court(s, 1)]
    expect(comp(s).courts.map((c) => c.categoryId)).toEqual([cat(s, 0).id, cat(s, 1).id])
    expect(toPublicView(s, A).categoryName).toBe('Female')
    expect(toPublicView(s, B).categoryName).toBe('Veterans')

    // Court A: both Female pool matches, then it moves on to Children while Female waits for Pool Review.
    for (let i = 0; i < 2; i++) s = win(s, A)
    expect(cat(s, 0).phase).toBe('pools')
    expect(comp(s).courts[0]!.categoryId).toBe(cat(s, 2).id)
    expect(onCourt(comp(s), A)!.match!.poolId).toBeDefined()

    // Veterans on court B was never touched.
    expect(Object.values(cat(s, 1).matches).every((m) => m.status === 'scheduled')).toBe(true)

    // Locking Female's pools gives court A back to Female (first in order) after the current match.
    s = act(s, { type: 'LOCK_POOLS', categoryId: cat(s, 0).id })
    expect(comp(s).courts[0]!.categoryId).toBe(cat(s, 0).id)
  })

  it('a started match is never interrupted, and Load here pins a category to the court', () => {
    let s = create({ name: 'X', date: '2026-11-07', courts: 1, categories: [category('First'), category('Second')] })
    const A = court(s, 0)
    const second = Object.values(cat(s, 1).matches)[0]!
    s = act(s, { type: 'LOAD_MATCH', matchId: second.id, courtId: A })
    expect(comp(s).courts[0]!.categoryId).toBe(cat(s, 1).id)
    s = act(s, { type: 'TIMER_START', courtId: A })
    s = act(s, { type: 'TIMER_PAUSE', courtId: A })
    expect(onCourt(comp(s), A)!.match!.id).toBe(second.id)
    s = win(s, A)
    // Done: the court goes back to the first category.
    expect(comp(s).courts[0]!.categoryId).toBe(cat(s, 0).id)
  })

  it('needs a category for category actions when there are several', () => {
    const s = create({ name: 'X', date: '2026-11-07', courts: 1, categories: [category('First'), category('Second')] })
    expect(() => reduceApp(s, { type: 'LOCK_POOLS' }, clock)).toThrow(/Choose a category/)
  })
})

describe('pre-drawn categories (draw sheets)', () => {
  const female = {
    pools: [
      { name: 'Pool A', entrants: ['Ana', 'Bea', 'Cia'], matches: [['Ana', 'Bea'], ['Ana', 'Cia'], ['Bea', 'Cia']] as [string, string][] },
      {
        name: 'Pool B',
        entrants: ['Dora', 'Eva', 'Fay', 'Gia'],
        matches: [['Dora', 'Eva'], ['Dora', 'Fay'], ['Gia', 'Fay'], ['Gia', 'Dora'], ['Fay', 'Eva'], ['Gia', 'Eva']] as [string, string][]
      }
    ],
    bracket: [['A1', 'B1'], ['B2', 'A2']] as [string, string][]
  }
  const names = ['Ana', 'Bea', 'Cia', 'Dora', 'Eva', 'Fay', 'Gia']

  it('keeps pools, sides and fight order exactly; bracket pairings from the sheet', () => {
    let s = create({
      name: 'Ruse Cup',
      date: '2026-11-07',
      courts: 1,
      categories: [category('Senior female', { entrants: names.map((name) => ({ name, dojo: '' })), predrawn: female })]
    })
    const t = cat(s, 0)
    const order = t.matchQueue.map((id) => {
      const m = t.matches[id]!
      return `${t.players[m.aka.playerId!]!.name}-${t.players[m.shiro.playerId!]!.name}`
    })
    // Default: all of pool A as written, then all of pool B.
    expect(order).toEqual(['Ana-Bea', 'Ana-Cia', 'Bea-Cia', 'Dora-Eva', 'Dora-Fay', 'Gia-Fay', 'Gia-Dora', 'Fay-Eva', 'Gia-Eva'])
    // 'alternate': one match of every pool in turn.
    const alt = cat(create({ name: 'R', date: '2026-11-07', courts: 1, categories: [category('F', { entrants: names.map((name) => ({ name, dojo: '' })), predrawn: female, fightOrder: 'alternate' })] }), 0)
    expect(alt.matchQueue.map((id) => alt.players[alt.matches[id]!.aka.playerId!]!.name).slice(0, 4)).toEqual(['Ana', 'Dora', 'Ana', 'Dora'])
    expect(t.advancePerPool).toBe(2)

    // Pool winners: aka always wins.
    const A = court(s, 0)
    while (onCourt(comp(s), A)?.match) s = win(s, A)
    s = act(s, { type: 'LOCK_POOLS', categoryId: t.id })
    const after = cat(s, 0)
    const first = Object.values(after.bracket!.nodes).filter((n) => n.round === 0).sort((a, b) => a.slot - b.slot)
    const placeOf = (pool: number, place: number) => computeStandings(after, after.pools[pool]!)[place - 1]!.entrantId
    expect([first[0]!.akaEntrantId, first[0]!.shiroEntrantId]).toEqual([placeOf(0, 1), placeOf(1, 1)])
    expect([first[1]!.akaEntrantId, first[1]!.shiroEntrantId]).toEqual([placeOf(1, 2), placeOf(0, 2)])
  })

  it('a single pool without bracket: the pool ranking gives 1st, 2nd, 3rd', () => {
    let s = create({
      name: 'X',
      date: '2026-11-07',
      courts: 1,
      categories: [
        category('Children U12', {
          entrants: ['K', 'L', 'M', 'N'].map((name) => ({ name, dojo: '' })),
          predrawn: { pools: [{ name: 'Pool A', entrants: ['K', 'L', 'M', 'N'], matches: [['K', 'L'], ['M', 'N'], ['K', 'M'], ['L', 'N'], ['K', 'N'], ['L', 'M']] }], bracket: [] }
        })
      ]
    })
    const A = court(s, 0)
    while (onCourt(comp(s), A)?.match) s = win(s, A)
    s = act(s, { type: 'LOCK_POOLS', categoryId: cat(s, 0).id })
    expect(cat(s, 0).phase).toBe('finished')
    expect(podium(cat(s, 0)).map((p) => [p.place, cat(s, 0).players[p.entrantId]!.name])).toEqual([
      [1, 'K'],
      [2, 'L'],
      [3, 'M']
    ])
    expect(toPublicView(s, A).champion?.name).toBe('K')
  })

  it('rejects a pre-drawn pool naming someone who is not registered', () => {
    expect(() =>
      reduceApp(
        initialState(),
        {
          type: 'CREATE_COMPETITION',
          setup: { name: 'X', date: '2026-11-07', courts: 1, categories: [category('C', { entrants: [{ name: 'A', dojo: '' }, { name: 'B', dojo: '' }], predrawn: { pools: [{ name: 'Pool A', entrants: ['A', 'Z'], matches: [['A', 'Z']] }], bracket: [] } })] }
        },
        clock
      )
    ).toThrow(/"Z" is not in the participant list/)
  })

  it('draw sheets become a competition setup (teams with members, courts from the sheet)', () => {
    const draw: DrawImport = {
      eventName: 'Cup',
      date: '2026-11-07',
      warnings: [],
      categories: [
        {
          name: 'Veterans individual',
          mode: 'individual',
          court: 'B',
          entrants: [
            { key: 'a', name: 'Al', country: 'BUL' },
            { key: 'b', name: 'Bo' },
            { key: 'c', name: 'Cy' }
          ],
          pools: [{ name: 'Pool A', entrantKeys: ['a', 'b', 'c'], matches: [['a', 'b'], ['a', 'c'], ['b', 'c']] }],
          bracket: [],
          source: { file: 'v.xlsx', sheet: 'Sheet1' },
          warnings: []
        },
        {
          name: 'Senior Teams',
          mode: 'team',
          entrants: ['T1', 'T2', 'T3'].map((n) => ({ key: n, name: n, members: [1, 2, 3, 4, 5].map((i) => ({ name: `${n} P${i}` })) })),
          pools: [],
          bracket: [],
          teamSize: 5,
          source: { file: 't.xlsx', sheet: 'Sheet1' },
          warnings: []
        }
      ]
    }
    const drafts = draftsFromDraw(draw)
    expect(courtsNeeded(drafts)).toBe(2)
    const s = create(competitionFromDrafts('Cup', '2026-11-07', 2, drafts))
    expect(comp(s).categories.map((c) => [c.name, c.mode])).toEqual([
      ['Veterans individual', 'individual'],
      ['Senior Teams', 'team']
    ])
    expect(Object.values(cat(s, 0).matches).every((m) => m.courtId === court(s, 1))).toBe(true)
    expect(Object.values(cat(s, 1).teams).every((t) => t.members.length === 5)).toBe(true)
  })
})

describe('removing someone from a group', () => {
  it('deletes the entrant and all their pool matches; standings recalculate', () => {
    let s = create({ name: 'X', date: '2026-11-07', courts: 1, categories: [category('Only', { entrants: people('P', 4), poolSize: 4, advancePerPool: 2 })] })
    const A = court(s, 0)
    s = win(s, A)
    const t = cat(s, 0)
    const played = Object.values(t.matches).find((m) => m.status === 'completed')!
    const gone = played.aka.playerId!
    s = act(s, { type: 'REMOVE_ENTRANT', entrantId: gone })
    const after = cat(s, 0)
    expect(after.players[gone]).toBeUndefined()
    expect(after.pools[0]!.entrantIds).not.toContain(gone)
    expect(Object.values(after.matches).some((m) => m.aka.playerId === gone || m.shiro.playerId === gone)).toBe(false)
    expect(Object.values(after.matches)).toHaveLength(3) // round robin of the remaining 3
    expect(computeStandings(after, after.pools[0]!).every((r) => r.wins === 0)).toBe(true)
  })

  it('works for teams too, and not after the pools are locked', () => {
    let s = create({
      name: 'X',
      date: '2026-11-07',
      courts: 1,
      categories: [
        category('Teams', {
          mode: 'team',
          teamSize: 3,
          poolSize: 3,
          advancePerPool: 1,
          entrants: ['T1', 'T2', 'T3'].flatMap((team) => [1, 2, 3].map((i) => ({ name: `${team} P${i}`, dojo: team, team })))
        })
      ]
    })
    const team = Object.values(cat(s, 0).teams)[0]!
    s = act(s, { type: 'REMOVE_ENTRANT', entrantId: team.id })
    expect(cat(s, 0).teams[team.id]).toBeUndefined()
    expect(Object.values(cat(s, 0).teamMatches)).toHaveLength(1)
    expect(Object.values(cat(s, 0).players)).toHaveLength(6)
  })
})

describe('team country from the team name', () => {
  it('reads countries, ignores clubs', async () => {
    const { countryFromTeamName } = await import('./draw-setup')
    expect(countryFromTeamName('Serbia 1')).toBe('SRB')
    expect(countryFromTeamName('Romania mix')).toBe('ROU')
    expect(countryFromTeamName('North Macedonia')).toBe('MKD')
    expect(countryFromTeamName('CRK 2')).toBeUndefined()
    expect(countryFromTeamName('Meiyo')).toBeUndefined()
  })
})
