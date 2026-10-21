// App-level reducer: routes AdminActions to the right court's match and handles
// tournament-level changes (setup, editing, approve -> next match, pools -> bracket).

import { buildBracket } from './bracket'
import { activeMatchOn, courtOf, fillCourts, withCourt } from './courts'
import { createDemoSetup } from './demo'
import {
  addEntrant,
  addTeamMember,
  editPlayer,
  editResult,
  editTeam,
  moveToCourt,
  removeTeamMember,
  setEncounterLineup,
  setTeamOrder,
  withdrawEntrant,
  type ScoreEntry
} from './editing'
import { createMeeting, enqueue } from './encounters'
import type { AdminAction } from './ipc'
import { reduceMatch, RuleError, type MatchAction } from './match-engine'
import { afterMatchCompleted } from './progress'
import { createTournament, roundRobin, validateSetup } from './setup'
import { poolsComplete, unresolvedTies } from './standings'
import { SCHEMA_VERSION, type AppState, type Match, type Tournament } from './types'

export type AppAction = AdminAction | { type: 'TICK' }

export interface AppUpdate {
  state: AppState
  /** False when nothing changed (e.g. a TICK with no state transition). */
  changed: boolean
}

export const initialState = (): AppState => ({ schemaVersion: SCHEMA_VERSION, tournament: null, revision: 0 })

function withTournament(state: AppState, t: Tournament | null, now: number): AppState {
  return { ...state, tournament: t && { ...t, updatedAt: now }, revision: state.revision + 1 }
}

function withMatch(t: Tournament, m: Match): Tournament {
  return { ...t, matches: { ...t.matches, [m.id]: m } }
}

function requireTournament(t: Tournament | null): Tournament {
  if (!t) throw new RuleError('No tournament loaded.')
  return t
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

/** Advance every court's clock; returns the same tournament when nothing changed. */
function tickCourts(t: Tournament, now: number): Tournament {
  let next = t
  for (const court of t.courts) {
    const m = court.activeMatchId ? next.matches[court.activeMatchId] : undefined
    if (!m) continue
    const ticked = reduceMatch(m, { type: 'TICK' }, now)
    if (ticked !== m) next = withMatch(next, ticked)
  }
  return next
}

export function reduceApp(state: AppState, action: AppAction, now: number): AppUpdate {
  const t = state.tournament
  const changed = (next: Tournament | null): AppUpdate => ({ state: withTournament(state, next, now), changed: true })

  switch (action.type) {
    case 'DEV_LOAD_DEMO':
      if (t) throw new RuleError('Close the current tournament first.')
      return changed(createTournament(createDemoSetup(now), now))

    case 'CREATE_TOURNAMENT': {
      if (t) throw new RuleError('Close the current tournament first.')
      const setup = validateSetup(action.setup)
      if (typeof setup === 'string') throw new RuleError(setup)
      return changed(createTournament(setup, now))
    }

    case 'RESET_TOURNAMENT': {
      if (!t) return { state, changed: false }
      if (t.courts.some((c) => (c.activeMatchId ? t.matches[c.activeMatchId]?.timer.runningSince != null : false))) {
        throw new RuleError('Pause every clock first.')
      }
      return changed(null)
    }

    case 'LOAD_MATCH': {
      const tour = requireTournament(t)
      const court = courtOf(tour, action.courtId)
      const target = tour.matches[action.matchId]
      if (!target) throw new RuleError('Unknown match.')
      if (target.status === 'completed') throw new RuleError('That match is already completed.')
      if (tour.courts.some((c) => c.id !== court.id && c.activeMatchId === target.id)) throw new RuleError('That match is on another court.')
      const current = activeMatchOn(tour, court.id)
      if (current && (current.status === 'awaiting-confirmation' || current.timer.runningSince !== null)) {
        throw new RuleError('Finish or pause the current match before switching.')
      }
      // Loading a match from another court's list moves it here.
      const moved = target.courtId === court.id ? tour : moveToCourt(tour, target.id, court.id)
      return changed(withCourt(moved, { ...courtOf(moved, court.id), activeMatchId: target.id }))
    }

    case 'SET_REPRESENTATIVE': {
      const tour = requireTournament(t)
      const m = requireActive(tour, action.courtId)
      if (!m.representative || m.status !== 'scheduled') throw new RuleError('This bout has fixed fighters.')
      const team = m[action.side].teamId ? tour.teams[m[action.side].teamId!] : undefined
      if (!team?.members.includes(action.playerId)) throw new RuleError('That player is not on this team.')
      return changed(withMatch(tour, { ...m, [action.side]: { ...m[action.side], playerId: action.playerId } }))
    }

    case 'GENERATE_TIE_BREAKER': {
      let tour = requireTournament(t)
      if (tour.phase !== 'pools') throw new RuleError('Tie-breakers are only for the pool phase.')
      if (!poolsComplete(tour)) throw new RuleError('Finish all pool matches first.')
      const tie = unresolvedTies(tour).find(
        (g) =>
          g.poolId === action.poolId &&
          g.entrantIds.length === action.entrantIds.length &&
          action.entrantIds.every((id) => g.entrantIds.includes(id))
      )
      if (!tie) throw new RuleError('There is no such tie to break.')
      const courtId = Object.values(tour.matches).find((m) => m.poolId === tie.poolId)?.courtId ?? tour.courts[0]!.id
      for (const [a, b] of roundRobin(tie.entrantIds).flat()) {
        const s = createMeeting(tour, 'tie-breaker', a, b, { poolId: tie.poolId, courtId })
        tour = enqueue(s.t, s.boutIds)
      }
      return changed(fillCourts(tour))
    }

    case 'LOCK_POOLS': {
      const tour = requireTournament(t)
      if (tour.phase !== 'pools') throw new RuleError('Pools are already locked.')
      if (!poolsComplete(tour)) throw new RuleError('Finish all pool matches first.')
      if (unresolvedTies(tour).length) throw new RuleError('Resolve the flagged ties first.')
      return changed(fillCourts(buildBracket(tour)))
    }

    case 'ADD_ENTRANT':
      return changed(addEntrant(requireTournament(t), action.entrant))

    case 'WITHDRAW_ENTRANT': {
      const tour = requireTournament(t)
      const busy = tour.courts.some((c) => {
        const m = c.activeMatchId ? tour.matches[c.activeMatchId] : undefined
        return m?.timer.runningSince != null && [m.aka.playerId, m.shiro.playerId, m.aka.teamId, m.shiro.teamId].includes(action.entrantId)
      })
      if (busy) throw new RuleError('Pause the clock of their match first.')
      return changed(withdrawEntrant(tour, action.entrantId, now))
    }

    case 'EDIT_PLAYER':
      return changed(editPlayer(requireTournament(t), action.playerId, action.patch ?? { name: '' }))

    case 'EDIT_TEAM':
      return changed(editTeam(requireTournament(t), action.teamId, action.patch ?? { name: '' }))

    case 'ADD_TEAM_MEMBER':
      return changed(addTeamMember(requireTournament(t), action.teamId, action.member ?? { name: '' }))

    case 'REMOVE_TEAM_MEMBER':
      return changed(removeTeamMember(requireTournament(t), action.teamId, action.playerId))

    case 'SET_TEAM_ORDER':
      if (!isIdList(action.order, 5)) throw new RuleError('Invalid order.')
      return changed(setTeamOrder(requireTournament(t), action.teamId, action.order))

    case 'SET_LINEUP':
      if (!isIdList(action.lineup, 5)) throw new RuleError('Invalid order.')
      return changed(setEncounterLineup(requireTournament(t), action.teamMatchId, action.teamId, action.lineup))

    case 'EDIT_RESULT':
      return changed(fillCourts(editResult(requireTournament(t), action.matchId, cleanEntries(action.entries), now)))

    case 'MOVE_MATCH':
      return changed(moveToCourt(requireTournament(t), action.matchId, action.courtId))

    case 'TICK': {
      if (!t) return { state, changed: false }
      const next = tickCourts(t, now)
      return next === t ? { state, changed: false } : changed(next)
    }

    default: {
      const tour = requireTournament(t)
      const { courtId, ...matchAction } = action
      const m = requireActive(tour, courtId)
      if (m.representative && (!m.aka.playerId || !m.shiro.playerId) && BLOCKED_UNTIL_CHOSEN.has(action.type)) {
        throw new RuleError('Choose both representatives first.')
      }
      const match = reduceMatch(m, matchAction satisfies MatchAction, now)
      if (match === m) return { state, changed: false }
      let next = withMatch(tour, match)
      // Result is saved; clear this court's board and load its next match.
      if (action.type === 'APPROVE_MATCH') next = fillCourts(afterMatchCompleted(next, match))
      return changed(next)
    }
  }
}
