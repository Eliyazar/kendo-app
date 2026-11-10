// Tournament creation: validate the operator's setup, draw pools, schedule
// the round-robin fight order.

import { toIocCode } from './countries'
import { courtFor, fillCourts, makeCourts } from './courts'
import { createMeeting, enqueue } from './encounters'
import { newPin, rng, shuffle, uid } from './ids'
import type { ImportedEntrant } from './import-parse'
import { MAX_RESERVES, type Id, type MatchConfig, type Player, type Pool, type Team, type TeamSize, type Tournament, type TournamentMode } from './types'

export interface TournamentSetup {
  name: string
  /** YYYY-MM-DD */
  date: string
  mode: TournamentMode
  teamSize?: TeamSize
  /** Preferred pool size; pools are this size or one larger. */
  poolSize: number
  advancePerPool: number
  poolMatchMinutes: number
  bracketMatchMinutes: number
  /** Number of courts (shiai-jo) fighting in parallel. */
  courts: number
  entrants: ImportedEntrant[]
  /** Seed for the random part of the draw (same seed + same list = same pools). */
  drawSeed: number
  /** Courts (ids of the competition) this category is fought on; default all. */
  courtIds?: Id[]
  /** Pools, fight order and bracket already decided elsewhere (e.g. a draw sheet). */
  predrawn?: Predrawn
}

/** A pool exactly as drawn: names refer to entrants (individual) or team names (team mode). */
export interface PredrawnPool {
  name: string
  entrants: string[]
  /** [aka, shiro] in fight order. */
  matches: [string, string][]
}

export interface Predrawn {
  pools: PredrawnPool[]
  /** First-round pairings by pool place, e.g. [["A1","B1"],["B2","A2"]]; [] = none. */
  bracket: [string, string][]
}

const nameKey = (v: string): string =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** Pool letter of "Pool A" (or "A"). */
export const poolLetter = (name: string): string => (name.trim().match(/([A-Z0-9]+)$/i)?.[1] ?? name).toUpperCase()

function validatePredrawn(input: unknown, names: Set<string>): Predrawn | string {
  if (typeof input !== 'object' || input === null) return 'Invalid pre-drawn pools.'
  const p = input as Record<string, unknown>
  if (!Array.isArray(p['pools']) || p['pools'].length === 0 || p['pools'].length > 32) return 'Invalid pre-drawn pools.'
  const pools: PredrawnPool[] = []
  for (const raw of p['pools'] as unknown[]) {
    const pool = (raw ?? {}) as Record<string, unknown>
    const name = text(pool['name'])
    const entrants = Array.isArray(pool['entrants']) ? (pool['entrants'] as unknown[]).map(text) : []
    const matches = Array.isArray(pool['matches']) ? (pool['matches'] as unknown[]) : []
    if (!name || entrants.length < 1 || entrants.some((e) => !e) || matches.length > 300) return 'Invalid pre-drawn pool.'
    const unknown = entrants.find((e) => !names.has(nameKey(e!)))
    if (unknown) return `${name}: "${unknown}" is not in the participant list.`
    const pairs: [string, string][] = []
    for (const m of matches) {
      if (!Array.isArray(m) || m.length !== 2) return `${name}: invalid match.`
      const a = text(m[0])
      const b = text(m[1])
      if (!a || !b || nameKey(a) === nameKey(b)) return `${name}: invalid match.`
      if (![a, b].every((x) => entrants.some((e) => nameKey(e!) === nameKey(x)))) return `${name}: a match names someone outside the pool.`
      pairs.push([a, b])
    }
    pools.push({ name, entrants: entrants as string[], matches: pairs })
  }
  const letters = new Set(pools.map((pl) => poolLetter(pl.name)))
  const bracket: [string, string][] = []
  for (const pair of Array.isArray(p['bracket']) ? (p['bracket'] as unknown[]) : []) {
    if (!Array.isArray(pair) || pair.length !== 2) return 'Invalid bracket pairing.'
    const refs = pair.map((r) => (typeof r === 'string' ? r.trim().toUpperCase() : ''))
    if (refs.some((r) => !/^[A-Z0-9]+\d$/.test(r) || !letters.has(r.slice(0, -1)))) {
      return `Bracket pairing ${refs.join(' – ')} refers to a pool that does not exist.`
    }
    bracket.push([refs[0]!, refs[1]!])
  }
  return { pools, bracket }
}

export const SETUP_LIMITS = {
  poolSize: [2, 8],
  advancePerPool: [1, 4],
  minutes: [0.5, 15],
  courts: [1, 4],
  entrants: 512
} as const

const MAX_TEXT = 80

const inRange = (n: unknown, [lo, hi]: readonly [number, number]): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi

const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_TEXT ? v.trim() : null

/** Entrants of the draw: players (individual) or teams (team mode). */
interface DrawEntrant {
  id: Id
  dojo: string
  seed?: number
}

/** Validate untrusted setup input. Returns the cleaned setup or an error message. */
export function validateSetup(input: unknown): TournamentSetup | string {
  if (typeof input !== 'object' || input === null) return 'Invalid setup.'
  const s = input as Record<string, unknown>
  const name = text(s['name'])
  if (!name) return 'Tournament name is required.'
  const date = typeof s['date'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s['date']) ? s['date'] : null
  if (!date) return 'Date is required.'
  const mode = s['mode'] === 'team' ? 'team' : s['mode'] === 'individual' ? 'individual' : null
  if (!mode) return 'Choose individual or team mode.'
  const teamSize = mode === 'team' ? ([3, 4, 5].includes(s['teamSize'] as number) ? (s['teamSize'] as TeamSize) : null) : undefined
  if (teamSize === null) return 'Team size must be 3, 4 or 5.'
  if (!Number.isInteger(s['poolSize']) || !inRange(s['poolSize'], SETUP_LIMITS.poolSize)) return 'Pool size must be 2–8.'
  if (!Number.isInteger(s['advancePerPool']) || !inRange(s['advancePerPool'], SETUP_LIMITS.advancePerPool)) {
    return 'Qualifiers per pool must be 1–4.'
  }
  if (!inRange(s['poolMatchMinutes'], SETUP_LIMITS.minutes) || !inRange(s['bracketMatchMinutes'], SETUP_LIMITS.minutes)) {
    return 'Match time must be between 0.5 and 15 minutes.'
  }
  const courts = s['courts'] === undefined ? 1 : s['courts']
  if (!Number.isInteger(courts) || !inRange(courts, SETUP_LIMITS.courts)) return 'Courts must be 1–4.'
  const drawSeed = Number.isInteger(s['drawSeed']) ? (s['drawSeed'] as number) : 1
  if (!Array.isArray(s['entrants']) || s['entrants'].length > SETUP_LIMITS.entrants) return 'Invalid participant list.'

  const entrants: ImportedEntrant[] = []
  for (const raw of s['entrants'] as unknown[]) {
    const e = (raw ?? {}) as Record<string, unknown>
    const ename = text(e['name'])
    if (!ename) return 'Every participant needs a name.'
    const entrant: ImportedEntrant = { name: ename, dojo: text(e['dojo']) ?? '' }
    const team = text(e['team'])
    const grade = text(e['grade'])
    const countryText = text(e['country'])
    if (countryText) {
      const code = toIocCode(countryText)
      if (!code) return `Unknown country "${countryText}" for ${ename}. Use a name or IOC code such as BUL or SRB.`
      entrant.country = code
    }
    if (team) entrant.team = team
    if (grade) entrant.grade = grade
    if (Number.isInteger(e['seed']) && (e['seed'] as number) > 0) entrant.seed = e['seed'] as number
    entrants.push(entrant)
  }

  const setup: TournamentSetup = {
    name,
    date,
    mode,
    poolSize: s['poolSize'] as number,
    advancePerPool: s['advancePerPool'] as number,
    poolMatchMinutes: s['poolMatchMinutes'] as number,
    bracketMatchMinutes: s['bracketMatchMinutes'] as number,
    courts: courts as number,
    entrants,
    drawSeed
  }
  if (teamSize) setup.teamSize = teamSize
  if (Array.isArray(s['courtIds']) && s['courtIds'].length <= 8 && s['courtIds'].every((x) => typeof x === 'string')) {
    setup.courtIds = s['courtIds'] as string[]
  }

  const count = mode === 'team' ? groupTeams(entrants).length : entrants.length
  if (mode === 'team') {
    if (entrants.some((e) => !e.team)) return 'In team mode every player needs a team name.'
    const tooBig = groupTeams(entrants).find((g) => g.players.length > teamSize! + MAX_RESERVES)
    if (tooBig) {
      return `Team "${tooBig.name}" has ${tooBig.players.length} players; the most is ${teamSize! + MAX_RESERVES} (${teamSize} + ${MAX_RESERVES} reserves).`
    }
  }
  if (count < 2) return mode === 'team' ? 'At least 2 teams are needed.' : 'At least 2 participants are needed.'
  if (s['predrawn'] !== undefined) {
    const names = new Set((mode === 'team' ? groupTeams(entrants).map((g) => g.name) : entrants.map((e) => e.name)).map(nameKey))
    const predrawn = validatePredrawn(s['predrawn'], names)
    if (typeof predrawn === 'string') return predrawn
    setup.predrawn = predrawn
    // Qualifiers per pool = the deepest place the bracket refers to. Without a bracket
    // the pool ranking gives the medals, so the top 3 must be free of ties.
    const smallestPool = Math.min(...predrawn.pools.map((p) => p.entrants.length))
    setup.advancePerPool = predrawn.bracket.length
      ? Math.max(1, ...predrawn.bracket.flat().map((r) => Number(r.slice(-1))))
      : Math.max(1, Math.min(predrawn.pools.length === 1 ? 3 : 2, smallestPool - 1))
    return setup
  }
  const smallest = Math.floor(count / poolCount(count, setup.poolSize))
  if (setup.advancePerPool >= smallest) {
    return `With pools of ${smallest}, at most ${smallest - 1} can qualify per pool.`
  }
  return setup
}

function groupTeams(entrants: ImportedEntrant[]): { name: string; players: ImportedEntrant[] }[] {
  const groups = new Map<string, ImportedEntrant[]>()
  for (const e of entrants) {
    const key = e.team ?? ''
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  return [...groups].map(([name, players]) => ({ name, players }))
}

export const poolCount = (entrants: number, poolSize: number): number => Math.max(1, Math.floor(entrants / poolSize))

export function poolName(i: number): string {
  return i < 26 ? `Pool ${String.fromCharCode(65 + i)}` : `Pool ${i + 1}`
}

/**
 * Spread entrants over pools: seeded entrants first (one per pool), then the
 * rest in random order with the largest dojos placed first, each into the
 * open pool that has the fewest members of the same dojo.
 */
export function drawPools(entrants: DrawEntrant[], pools: number, seed: number): Id[][] {
  const random = rng(seed)
  const capacity = Array.from({ length: pools }, (_, i) => Math.floor(entrants.length / pools) + (i < entrants.length % pools ? 1 : 0))
  const result: DrawEntrant[][] = Array.from({ length: pools }, () => [])

  const seeded = entrants.filter((e) => e.seed !== undefined).sort((a, b) => a.seed! - b.seed!)
  const dojoSize = new Map<string, number>()
  for (const e of entrants) dojoSize.set(e.dojo, (dojoSize.get(e.dojo) ?? 0) + 1)
  const rest = shuffle(
    entrants.filter((e) => e.seed === undefined),
    random
  ).sort((a, b) => (a.dojo && b.dojo ? dojoSize.get(b.dojo)! - dojoSize.get(a.dojo)! : 0))

  const place = (e: DrawEntrant): void => {
    let best = -1
    let bestScore = Number.POSITIVE_INFINITY
    result.forEach((pool, i) => {
      if (pool.length >= capacity[i]!) return
      const sameDojo = e.dojo ? pool.filter((p) => p.dojo === e.dojo).length : 0
      const score = sameDojo * 1000 + pool.length
      if (score < bestScore) {
        best = i
        bestScore = score
      }
    })
    result[best]!.push(e)
  }
  seeded.forEach((e, i) => (i < pools ? result[i]!.push(e) : place(e)))
  rest.forEach(place)
  return result.map((p) => p.map((e) => e.id))
}

/**
 * Round-robin rounds (circle method). Nobody fights twice in one round, and
 * sides alternate between rounds so no one is always Aka.
 */
export function roundRobin<T>(items: readonly T[]): [T, T][][] {
  const list: (T | null)[] = items.length % 2 ? [...items, null] : [...items]
  const n = list.length
  const rounds: [T, T][][] = []
  for (let r = 0; r < n - 1; r++) {
    const pairs: [T, T][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = list[i]
      const b = list[n - 1 - i]
      if (a !== null && a !== undefined && b !== null && b !== undefined) pairs.push(r % 2 ? [b, a] : [a, b])
    }
    rounds.push(pairs)
    list.splice(1, 0, list.pop()!)
  }
  return rounds
}

const minutes = (m: number): number => Math.round(m * 60_000)

/**
 * Create a category. `courts` are the competition's courts; without them the
 * category gets its own (single-category setup).
 */
export function createTournament(setup: TournamentSetup, now: number, courts?: { id: Id; name: string }[]): Tournament {
  const poolCfg: MatchConfig = { durationMs: minutes(setup.poolMatchMinutes), ipponsToWin: 2, enchoOnDraw: false }
  const bracketCfg: MatchConfig = { durationMs: minutes(setup.bracketMatchMinutes), ipponsToWin: 2, enchoOnDraw: true }

  const players: Record<Id, Player> = {}
  const teams: Record<Id, Team> = {}
  let drawEntrants: DrawEntrant[]

  if (setup.mode === 'team') {
    const size = setup.teamSize!
    drawEntrants = groupTeams(setup.entrants).map((g) => {
      const team: Team = { id: uid('t'), name: g.name, dojo: g.players[0]?.dojo ?? '', size, members: [], order: [], pin: newPin() }
      const country = g.players.find((e) => e.country)?.country
      if (country) team.country = country
      for (const e of g.players) {
        const p: Player = { id: uid('p'), name: e.name, dojo: e.dojo, teamId: team.id }
        if (e.grade) p.grade = e.grade
        if (e.country) p.country = e.country
        players[p.id] = p
        team.members.push(p.id)
      }
      // File order is the default fighting order; players beyond the team size are reserves.
      // Missing positions stay empty: those bouts are won by fusen-gachi.
      team.order = Array.from({ length: size }, (_, i) => team.members[i] ?? null)
      teams[team.id] = team
      const seeds = g.players.map((e) => e.seed).filter((x): x is number => x !== undefined)
      return seeds.length ? { id: team.id, dojo: team.dojo, seed: Math.min(...seeds) } : { id: team.id, dojo: team.dojo }
    })
  } else {
    drawEntrants = setup.entrants.map((e) => {
      const p: Player = { id: uid('p'), name: e.name, dojo: e.dojo }
      if (e.grade) p.grade = e.grade
      if (e.seed) p.seed = e.seed
      if (e.country) p.country = e.country
      players[p.id] = p
      return e.seed ? { id: p.id, dojo: e.dojo, seed: e.seed } : { id: p.id, dojo: e.dojo }
    })
  }

  // Pre-drawn: pools exactly as given. Otherwise: draw them here.
  const byName = new Map<string, Id>(
    setup.mode === 'team'
      ? Object.values(teams).map((x): [string, Id] => [nameKey(x.name), x.id])
      : Object.values(players).map((x): [string, Id] => [nameKey(x.name), x.id])
  )
  const idOf = (name: string): Id => byName.get(nameKey(name))!
  const pools: Pool[] = setup.predrawn
    ? setup.predrawn.pools.map((p) => ({ id: uid('pool'), name: p.name, entrantIds: p.entrants.map(idOf) }))
    : drawPools(drawEntrants, poolCount(drawEntrants.length, setup.poolSize), setup.drawSeed).map((entrantIds, i) => ({
        id: uid('pool'),
        name: poolName(i),
        entrantIds
      }))
  // Entrants left out of every pre-drawn pool are not part of this category.
  if (setup.predrawn) {
    const inPools = new Set(pools.flatMap((p) => p.entrantIds))
    for (const id of Object.keys(setup.mode === 'team' ? teams : players)) {
      if (inPools.has(id)) continue
      if (setup.mode === 'team') {
        teams[id]!.members.forEach((m) => delete players[m])
        delete teams[id]
      } else delete players[id]
    }
  }

  let t: Tournament = {
    id: uid('tour'),
    name: setup.name,
    date: setup.date,
    mode: setup.mode,
    phase: 'pools',
    poolMatchConfig: poolCfg,
    bracketMatchConfig: bracketCfg,
    deciderConfig: { durationMs: bracketCfg.durationMs, ipponsToWin: 1, enchoOnDraw: true },
    advancePerPool: setup.advancePerPool,
    players,
    teams,
    pools,
    matches: {},
    teamMatches: {},
    bracket: null,
    courts: courts ? courts.map((c) => ({ id: c.id, name: c.name, activeMatchId: null })) : makeCourts(setup.courts, () => uid('court')),
    matchQueue: [],
    createdAt: now,
    updatedAt: now
  }
  if (setup.teamSize) t.teamSize = setup.teamSize
  if (setup.courtIds?.length) t.homeCourtIds = setup.courtIds
  t.bracketPlan = !setup.predrawn
    ? { kind: 'auto' }
    : setup.predrawn.bracket.length
      ? { kind: 'pairs', pairs: setup.predrawn.bracket }
      : pools.length === 1
        ? { kind: 'none' }
        : { kind: 'auto' }

  if (setup.predrawn) {
    // Fight order as written: the n-th match of every pool, pool by pool (row by row in the sheet).
    const rows = Math.max(0, ...setup.predrawn.pools.map((p) => p.matches.length))
    for (let r = 0; r < rows; r++) {
      setup.predrawn.pools.forEach((p, i) => {
        const m = p.matches[r]
        if (!m) return
        const sch = createMeeting(t, 'pool', idOf(m[0]), idOf(m[1]), { poolId: pools[i]!.id, courtId: courtFor(t, i) })
        t = enqueue(sch.t, sch.boutIds)
      })
    }
    return fillCourts(t)
  }

  // Interleave pools round by round so fighters rest between their matches.
  const schedules = pools.map((p) => roundRobin(p.entrantIds))
  const maxRounds = Math.max(0, ...schedules.map((s) => s.length))
  for (let r = 0; r < maxRounds; r++) {
    pools.forEach((pool, i) => {
      for (const [a, b] of schedules[i]![r] ?? []) {
        const s = createMeeting(t, 'pool', a, b, { poolId: pool.id, courtId: courtFor(t, i) })
        t = enqueue(s.t, s.boutIds)
      }
    })
  }
  return fillCourts(t)
}
