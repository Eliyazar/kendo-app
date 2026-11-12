// Reducers.
//   Competition level: routes an action to the category it concerns (by court
//   for scoring, by id for editing) and re-arranges which category each court shows.
//   Category level: one category's rules (setup, editing, approve -> next match,
//   pools -> bracket). A category is a Tournament.

import { buildBracket } from './bracket'
import { arrangeCourts, categoryById, categoryOwning, fightingElsewhere, onCourt, withCategory } from './competition'
import { addPlayoff, kikenOnCourt, moveInQueue, postpone, removeExtraMatch, swapSides, takePool } from './court-tools'
import { activeMatchOn, courtOf, makeCourts, withCourt } from './courts'
import { createDemoSetup } from './demo'
import {
  addEntrant,
  addTeamMember,
  editPlayer,
  editResult,
  editTeam,
  moveToCourt,
  removeEntrant,
  removeTeamMember,
  setEncounterLineup,
  setTeamOrder,
  withdrawEntrant,
  type ScoreEntry
} from './editing'
import { createMeeting, enqueue } from './encounters'
import { uid } from './ids'
import type { AdminAction, CompetitionSetup } from './ipc'
import { reduceMatch, RuleError, type MatchAction } from './match-engine'
import { afterMatchCompleted } from './progress'
import { createTournament, roundRobin, SETUP_LIMITS, validateSetup, type TournamentSetup } from './setup'
import { poolMatchesComplete, poolsComplete, unresolvedTies } from './standings'
import { SCHEMA_VERSION, type AppState, type Competition, type Match, type Tournament } from './types'

export type AppAction = AdminAction | { type: 'TICK' }

export interface AppUpdate {
  state: AppState
  /** False when nothing changed (e.g. a TICK with no state transition). */
  changed: boolean
}

export const initialState = (): AppState => ({ schemaVersion: SCHEMA_VERSION, competition: null, revision: 0 })

function withMatch(t: Tournament, m: Match): Tournament {
  return { ...t, matches: { ...t.matches, [m.id]: m } }
}

function requireActive(t: Tournament, courtId?: string): Match {
  const m = activeMatchOn(t, courtId)
  if (!m) throw new RuleError('No match loaded on this court.')
  return m
}

const isIdList = (v: unknown, max: number): v is (string | null)[] =>
  Array.isArray(v) && v.length <= max && v.every((x) => x === null || typeof x === 'string')

const SIDES = new Set(['aka', 'shiro'])
const TECHNIQUES = new Set(['M', 'K', 'D', 'T'])

function cleanEntries(v: unknown): ScoreEntry[] {
  if (!Array.isArray(v) || v.length > 12) throw new RuleError('Invalid score.')
  return v.map((e: unknown) => {
    const x = (e ?? {}) as Record<string, unknown>
    if (!SIDES.has(x['side'] as string)) throw new RuleError('Invalid score.')
    const side = x['side'] as 'aka' | 'shiro'
    if (x['kind'] === 'ippon' && TECHNIQUES.has(x['technique'] as string)) return { kind: 'ippon', side, technique: x['technique'] } as ScoreEntry
    if (x['kind'] === 'hansoku' || x['kind'] === 'fusen-gachi') return { kind: x['kind'], side } as ScoreEntry
    throw new RuleError('Invalid score.')
  })
}

const BLOCKED_UNTIL_CHOSEN: ReadonlySet<AppAction['type']> = new Set(['TIMER_START', 'ADD_IPPON', 'ADD_HANSOKU', 'FUSEN_GACHI'])

const runningClock = (t: Tournament): boolean => Object.values(t.matches).some((m) => m.timer.runningSince !== null)

/** Advance the clocks of a category's loaded matches; returns the same category when nothing changed. */
function tickCategory(t: Tournament, now: number): Tournament {
  let next = t
  for (const court of t.courts) {
    const m = court.activeMatchId ? next.matches[court.activeMatchId] : undefined
    if (!m || m.timer.runningSince === null) continue
    const ticked = reduceMatch(m, { type: 'TICK' }, now)
    if (ticked !== m) next = withMatch(next, ticked)
  }
  return next
}

// ---------------------------------------------------------------------------
// Category level
// ---------------------------------------------------------------------------

type CategoryAction = Exclude<AppAction, { type: 'TICK' | 'DEV_LOAD_DEMO' | 'CREATE_TOURNAMENT' | 'CREATE_COMPETITION' | 'RESET_TOURNAMENT' }>

export function reduceCategory(t: Tournament, action: CategoryAction, now: number): Tournament {
  switch (action.type) {
    case 'LOAD_MATCH': {
      const court = courtOf(t, action.courtId)
      const target = t.matches[action.matchId]
      if (!target) throw new RuleError('Unknown match.')
      if (target.status === 'completed') throw new RuleError('That match is already completed.')
      // Loading a match from another court's list moves it here.
      const moved = target.courtId === court.id ? t : moveToCourt(t, target.id, court.id)
      // If it was waiting on another court's slot of this category, free that slot.
      const freed = { ...moved, courts: moved.courts.map((c) => (c.id !== court.id && c.activeMatchId === target.id ? { ...c, activeMatchId: null } : c)) }
      return withCourt(freed, { ...courtOf(freed, court.id), activeMatchId: target.id })
    }

    case 'SHOW_PODIUM':
      return t // competition level

        case 'POSTPONE_MATCH':
      return postpone(t, requireActive(t, action.courtId))

    case 'KIKEN':
      return kikenOnCourt(t, requireActive(t, action.courtId), action.side, now)

    case 'SWAP_SIDES':
      return swapSides(t, requireActive(t, action.courtId))

    case 'TAKE_POOL':
      return takePool(t, action.poolId, action.courtId ?? t.courts[0]!.id)

    case 'SET_REPRESENTATIVE': {
      const m = requireActive(t, action.courtId)
      if (!m.representative || m.status !== 'scheduled') throw new RuleError('This bout has fixed fighters.')
      const team = m[action.side].teamId ? t.teams[m[action.side].teamId!] : undefined
      if (!team?.members.includes(action.playerId)) throw new RuleError('That player is not on this team.')
      return withMatch(t, { ...m, [action.side]: { ...m[action.side], playerId: action.playerId } })
    }

    case 'GENERATE_TIE_BREAKER': {
      if (t.phase !== 'pools') throw new RuleError('Tie-breakers are only for the pool phase.')
      if (!poolMatchesComplete(t)) throw new RuleError('Finish all pool matches first.')
      const tie = unresolvedTies(t).find(
        (g) => g.poolId === action.poolId && g.entrantIds.length === action.entrantIds.length && action.entrantIds.every((id) => g.entrantIds.includes(id))
      )
      if (!tie) throw new RuleError('There is no such tie to break.')
      const courtId = Object.values(t.matches).find((m) => m.poolId === tie.poolId)?.courtId ?? t.courts[0]!.id
      let next = t
      for (const [a, b] of roundRobin(tie.entrantIds).flat()) {
        const s = createMeeting(next, 'tie-breaker', a, b, { poolId: tie.poolId, courtId })
        next = enqueue(s.t, s.boutIds)
      }
      return next
    }

    case 'LOCK_POOLS': {
      if (t.phase !== 'pools') throw new RuleError('Pools are already locked.')
      if (!poolsComplete(t)) throw new RuleError('Finish all pool matches first.')
      if (unresolvedTies(t).length) throw new RuleError('Resolve the flagged ties first.')
      try {
        return buildBracket(t)
      } catch (err) {
        throw err instanceof RuleError ? err : new RuleError(err instanceof Error ? err.message : String(err))
      }
    }

    case 'ADD_ENTRANT':
      return addEntrant(t, action.entrant)

    case 'WITHDRAW_ENTRANT':
    case 'REMOVE_ENTRANT': {
      const busy = t.courts.some((c) => {
        const m = c.activeMatchId ? t.matches[c.activeMatchId] : undefined
        return m?.timer.runningSince != null && [m.aka.playerId, m.shiro.playerId, m.aka.teamId, m.shiro.teamId].includes(action.entrantId)
      })
      if (busy) throw new RuleError('Pause the clock of their match first.')
      return action.type === 'WITHDRAW_ENTRANT' ? withdrawEntrant(t, action.entrantId, now) : removeEntrant(t, action.entrantId)
    }

    case 'EDIT_PLAYER':
      return editPlayer(t, action.playerId, action.patch ?? { name: '' })

    case 'EDIT_TEAM':
      return editTeam(t, action.teamId, action.patch ?? { name: '' })

    case 'ADD_TEAM_MEMBER':
      return addTeamMember(t, action.teamId, action.member ?? { name: '' })

    case 'REMOVE_TEAM_MEMBER':
      return removeTeamMember(t, action.teamId, action.playerId)

    case 'SET_TEAM_ORDER':
      if (!isIdList(action.order, 5)) throw new RuleError('Invalid order.')
      return setTeamOrder(t, action.teamId, action.order)

    case 'SET_LINEUP':
      if (!isIdList(action.lineup, 5)) throw new RuleError('Invalid order.')
      return setEncounterLineup(t, action.teamMatchId, action.teamId, action.lineup)

    case 'EDIT_RESULT':
      return editResult(t, action.matchId, cleanEntries(action.entries), now)

    case 'ADD_PLAYOFF':
      return addPlayoff(t, action.poolId, action.entrantIds[0]!, action.entrantIds[1]!)

    case 'REMOVE_MATCH':
      return removeExtraMatch(t, action.matchId)

    case 'MOVE_IN_QUEUE':
      return moveInQueue(t, action.matchId, action.direction)

    case 'MOVE_MATCH':
      return moveToCourt(t, action.matchId, action.courtId)

    default: {
      const { courtId, ...matchAction } = action
      const m = requireActive(t, courtId)
      if (m.representative && (!m.aka.playerId || !m.shiro.playerId) && BLOCKED_UNTIL_CHOSEN.has(action.type)) {
        throw new RuleError('Choose both representatives first.')
      }
      const match = reduceMatch(m, matchAction satisfies MatchAction, now)
      if (match === m) return t
      const next = withMatch(t, match)
      // Result is saved: progress the team encounter / bracket. The court loads its next match when re-arranged.
      return action.type === 'APPROVE_MATCH' ? afterMatchCompleted(next, match) : next
    }
  }
}

// ---------------------------------------------------------------------------
// Competition level
// ---------------------------------------------------------------------------

function validateCompetition(input: unknown): { name: string; date: string; courts: number; categories: (TournamentSetup & { courtLetters?: string[] })[] } | string {
  if (typeof input !== 'object' || input === null) return 'Invalid competition.'
  const c = input as Record<string, unknown>
  const name = typeof c['name'] === 'string' && c['name'].trim() ? c['name'].trim().slice(0, 80) : null
  if (!name) return 'Competition name is required.'
  const date = typeof c['date'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c['date']) ? c['date'] : null
  if (!date) return 'Date is required.'
  const courts = c['courts']
  if (!Number.isInteger(courts) || (courts as number) < SETUP_LIMITS.courts[0] || (courts as number) > SETUP_LIMITS.courts[1]) return 'Courts must be 1–4.'
  if (!Array.isArray(c['categories']) || c['categories'].length < 1 || c['categories'].length > 40) return 'Add at least one category.'
  const categories: (TournamentSetup & { courtLetters?: string[] })[] = []
  for (const raw of c['categories'] as unknown[]) {
    const cat = (raw ?? {}) as Record<string, unknown>
    const setup = validateSetup({ ...cat, date, courts })
    if (typeof setup === 'string') return `${typeof cat['name'] === 'string' ? cat['name'] : 'Category'}: ${setup}`
    const letters = Array.isArray(cat['courtLetters']) ? (cat['courtLetters'] as unknown[]).filter((l): l is string => typeof l === 'string' && /^[A-D]$/.test(l)) : []
    categories.push(letters.length ? { ...setup, courtLetters: letters } : setup)
  }
  return { name, date, courts: courts as number, categories }
}

function newCompetition(spec: { name: string; date: string; courts: number; categories: (TournamentSetup & { courtLetters?: string[] })[] }, now: number): Competition {
  const courts = makeCourts(spec.courts, () => uid('court'))
  const categories = spec.categories.map((setup) => {
    const courtIds = (setup.courtLetters ?? []).map((l) => courts[l.charCodeAt(0) - 65]?.id).filter((id): id is string => Boolean(id))
    const { courtLetters: _l, ...rest } = setup
    return createTournament(courtIds.length ? { ...rest, courtIds } : rest, now, courts)
  })
  return arrangeCourts({
    id: uid('comp'),
    name: spec.name,
    date: spec.date,
    courts: courts.map((c) => ({ id: c.id, name: c.name, categoryId: null })),
    categories,
    createdAt: now,
    updatedAt: now
  })
}

/** Category an action concerns: by category id, by the id it names, or the only category. */
function targetCategory(comp: Competition, action: CategoryAction): Tournament {
  const a = action as Record<string, unknown>
  if (typeof a['categoryId'] === 'string') {
    const c = categoryById(comp, a['categoryId'])
    if (!c) throw new RuleError('Unknown category.')
    return c
  }
  for (const key of ['matchId', 'teamMatchId', 'entrantId', 'playerId', 'teamId', 'poolId']) {
    if (typeof a[key] === 'string') {
      const c = categoryOwning(comp, a[key])
      if (!c) throw new RuleError('Not found.')
      return c
    }
  }
  if (comp.categories.length === 1) return comp.categories[0]!
  throw new RuleError('Choose a category first.')
}

const COURT_ACTIONS: ReadonlySet<AppAction['type']> = new Set([
  'TIMER_START',
  'TIMER_PAUSE',
  'TIMER_RESET',
  'TIMER_ADJUST',
  'TIMER_SET_DURATION',
  'ADD_IPPON',
  'ADD_HANSOKU',
  'FUSEN_GACHI',
  'UNDO',
  'START_ENCHO',
  'APPROVE_MATCH',
  'SET_REPRESENTATIVE',
  'POSTPONE_MATCH',
  'KIKEN',
  'SWAP_SIDES'
])

export function reduceApp(state: AppState, action: AppAction, now: number): AppUpdate {
  const comp = state.competition
  const commit = (next: Competition | null): AppUpdate => ({
    state: { ...state, competition: next && { ...arrangeCourts(next), updatedAt: now }, revision: state.revision + 1 },
    changed: true
  })

  switch (action.type) {
    case 'DEV_LOAD_DEMO':
    case 'CREATE_TOURNAMENT': {
      if (comp) throw new RuleError('Close the current competition first.')
      const setup = action.type === 'DEV_LOAD_DEMO' ? createDemoSetup(now) : validateSetup(action.setup)
      if (typeof setup === 'string') throw new RuleError(setup)
      return commit(newCompetition({ name: setup.name, date: setup.date, courts: setup.courts, categories: [setup] }, now))
    }

    case 'CREATE_COMPETITION': {
      if (comp) throw new RuleError('Close the current competition first.')
      const spec = validateCompetition(action.setup satisfies CompetitionSetup)
      if (typeof spec === 'string') throw new RuleError(spec)
      return commit(newCompetition(spec, now))
    }

    case 'RESET_TOURNAMENT': {
      if (!comp) return { state, changed: false }
      if (comp.categories.some(runningClock)) throw new RuleError('Pause every clock first.')
      return commit(null)
    }

    case 'TICK': {
      if (!comp) return { state, changed: false }
      let changed = false
      const categories = comp.categories.map((c) => {
        const next = tickCategory(c, now)
        if (next !== c) changed = true
        return next
      })
      return changed ? commit({ ...comp, categories }) : { state, changed: false }
    }

    case 'SHOW_PODIUM': {
      if (!comp) throw new RuleError('No competition loaded.')
      const courtId = action.courtId ?? comp.courts[0]!.id
      if (action.categoryId) {
        const c = categoryById(comp, action.categoryId)
        if (!c) throw new RuleError('Unknown category.')
        if (c.phase !== 'finished') throw new RuleError(`${c.name} is not finished yet.`)
      }
      return commit({
        ...comp,
        courts: comp.courts.map((s) => {
          if (s.id !== courtId) return s
          const { podiumCategoryId: _p, ...rest } = s
          return action.categoryId ? { ...rest, podiumCategoryId: action.categoryId } : rest
        })
      })
    }

    case 'LOAD_MATCH': {
      if (!comp) throw new RuleError('No competition loaded.')
      const category = categoryOwning(comp, action.matchId)
      if (!category) throw new RuleError('Unknown match.')
      const courtId = action.courtId ?? comp.courts[0]!.id
      const current = onCourt(comp, courtId)?.match
      if (current && current.id !== action.matchId && (current.status === 'awaiting-confirmation' || current.timer.runningSince !== null)) {
        throw new RuleError('Finish or pause the current match before switching.')
      }
      if (comp.categories.some((c) => c.courts.some((x) => x.id !== courtId && x.activeMatchId === action.matchId) && c.id !== category.id)) {
        throw new RuleError('That match is on another court.')
      }
      const target = category.matches[action.matchId]
      const busyOn = target ? fightingElsewhere(comp, courtId, category, target) : null
      if (busyOn) throw new RuleError(`A fighter of that match is fighting on ${busyOn} right now.`)
      const next = withCategory(comp, reduceCategory(category, { ...action, courtId }, now))
      return commit({ ...next, courts: next.courts.map((s) => (s.id === courtId ? { ...s, categoryId: category.id, pinnedMatchId: action.matchId } : s)) })
    }

    default: {
      if (!comp) throw new RuleError('No competition loaded.')
      if (COURT_ACTIONS.has(action.type)) {
        const courtId = ('courtId' in action && action.courtId) || comp.courts[0]!.id
        const on = onCourt(comp, courtId)
        if (!on?.match) throw new RuleError('No match loaded on this court.')
        const updated = reduceCategory(on.category, { ...action, courtId } as CategoryAction, now)
        return updated === on.category ? { state, changed: false } : commit(withCategory(comp, updated))
      }
      const category = targetCategory(comp, action)
      const updated = reduceCategory(category, action, now)
      return updated === category ? { state, changed: false } : commit(withCategory(comp, updated))
    }
  }
}
