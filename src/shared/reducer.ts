// App-level reducer: routes AdminActions to the active match and handles
// tournament-level transitions (setup, approve -> next match, pools -> bracket).

import { advance, buildBracket } from './bracket'
import { createDemoSetup } from './demo'
import { createMeeting, enqueue, entrantOf, refreshEncounter } from './encounters'
import type { AdminAction } from './ipc'
import { reduceMatch, RuleError, type MatchAction } from './match-engine'
import { nextScheduledMatch } from './public-view'
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

function activeMatch(t: Tournament | null): Match {
  const m = t?.activeMatchId ? t.matches[t.activeMatchId] : undefined
  if (!m) throw new RuleError('No active match.')
  return m
}

function requireTournament(t: Tournament | null): Tournament {
  if (!t) throw new RuleError('No tournament loaded.')
  return t
}

/** Load the next match in the fight order if nothing is on the board. */
function fillBoard(t: Tournament): Tournament {
  const current = t.activeMatchId ? t.matches[t.activeMatchId] : undefined
  if (current && current.status !== 'completed') return t
  return { ...t, activeMatchId: nextScheduledMatch({ ...t, activeMatchId: null })?.id ?? null }
}

/** Bookkeeping after a bout is approved: team encounters and bracket progression. */
function afterApprove(t: Tournament, m: Match): Tournament {
  if (m.teamMatchId) {
    const r = refreshEncounter(t, m.teamMatchId, m.id)
    t = r.t
    const tm = t.teamMatches[m.teamMatchId]
    if (r.decided && tm?.bracketNodeId && tm.result?.winner) {
      t = advance(t, tm.bracketNodeId, tm.result.winner === 'aka' ? tm.akaTeamId : tm.shiroTeamId)
    }
  } else if (m.bracketNodeId && m.result?.winner) {
    const winner = entrantOf(t, m, m.result.winner)
    if (winner) t = advance(t, m.bracketNodeId, winner)
  }
  return t
}

const BLOCKED_UNTIL_CHOSEN: ReadonlySet<AppAction['type']> = new Set([
  'TIMER_START',
  'ADD_IPPON',
  'ADD_HANSOKU',
  'FUSEN_GACHI'
])

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
      const m = t.activeMatchId ? t.matches[t.activeMatchId] : undefined
      if (m?.timer.runningSince != null) throw new RuleError('Pause the clock first.')
      return changed(null)
    }

    case 'LOAD_MATCH': {
      const tour = requireTournament(t)
      const target = tour.matches[action.matchId]
      if (!target) throw new RuleError('Unknown match.')
      if (target.status === 'completed') throw new RuleError('That match is already completed.')
      const current = tour.activeMatchId ? tour.matches[tour.activeMatchId] : undefined
      if (current && (current.status === 'awaiting-confirmation' || current.timer.runningSince !== null)) {
        throw new RuleError('Finish or pause the current match before switching.')
      }
      return changed({ ...tour, activeMatchId: target.id })
    }

    case 'SET_REPRESENTATIVE': {
      const tour = requireTournament(t)
      const m = activeMatch(tour)
      if (!m.representative || m.status !== 'scheduled') throw new RuleError('This bout has fixed fighters.')
      const team = m[action.side].teamId ? tour.teams[m[action.side].teamId!] : undefined
      if (!team?.roster.includes(action.playerId)) throw new RuleError('That player is not on this team.')
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
      for (const [a, b] of roundRobin(tie.entrantIds).flat()) {
        const s = createMeeting(tour, 'tie-breaker', a, b, { poolId: tie.poolId })
        tour = enqueue(s.t, s.boutIds)
      }
      return changed(fillBoard(tour))
    }

    case 'LOCK_POOLS': {
      const tour = requireTournament(t)
      if (tour.phase !== 'pools') throw new RuleError('Pools are already locked.')
      if (!poolsComplete(tour)) throw new RuleError('Finish all pool matches first.')
      if (unresolvedTies(tour).length) throw new RuleError('Resolve the flagged ties first.')
      return changed(fillBoard(buildBracket(tour)))
    }

    case 'TICK': {
      if (!t?.activeMatchId) return { state, changed: false }
      const m = activeMatch(t)
      const match = reduceMatch(m, { type: 'TICK' }, now)
      if (match === m) return { state, changed: false }
      return changed(withMatch(t, match))
    }

    default: {
      const tour = requireTournament(t)
      const m = activeMatch(tour)
      if (m.representative && (!m.aka.playerId || !m.shiro.playerId) && BLOCKED_UNTIL_CHOSEN.has(action.type)) {
        throw new RuleError('Choose both representatives first.')
      }
      const match = reduceMatch(m, action satisfies MatchAction, now)
      if (match === m) return { state, changed: false }
      let next = withMatch(tour, match)
      if (action.type === 'APPROVE_MATCH') {
        // Result is saved; clear the board and load the next match in the queue.
        next = fillBoard(afterApprove(next, match))
      }
      return changed(next)
    }
  }
}
