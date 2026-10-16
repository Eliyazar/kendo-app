// App-level reducer: routes AdminActions to the active match and handles
// tournament-level transitions (approve -> load next match).

import type { AdminAction } from './ipc'
import { reduceMatch, RuleError, type Effect, type MatchAction } from './match-engine'
import { nextScheduledMatch } from './public-view'
import { createDemoTournament } from './demo'
import { SCHEMA_VERSION, type AppState, type Match, type Tournament } from './types'

export type AppAction = AdminAction | { type: 'TICK' }

export interface AppUpdate {
  state: AppState
  effects: Effect[]
  /** False when nothing changed (e.g. a TICK with no state transition). */
  changed: boolean
}

export const initialState = (): AppState => ({ schemaVersion: SCHEMA_VERSION, tournament: null, revision: 0 })

function withTournament(state: AppState, t: Tournament, now: number): AppState {
  return { ...state, tournament: { ...t, updatedAt: now }, revision: state.revision + 1 }
}

function withMatch(t: Tournament, m: Match): Tournament {
  return { ...t, matches: { ...t.matches, [m.id]: m } }
}

function activeMatch(t: Tournament | null): Match {
  const m = t?.activeMatchId ? t.matches[t.activeMatchId] : undefined
  if (!m) throw new RuleError('No active match.')
  return m
}

export function reduceApp(state: AppState, action: AppAction, now: number): AppUpdate {
  const t = state.tournament

  switch (action.type) {
    case 'DEV_LOAD_DEMO': {
      const demo = createDemoTournament(now)
      return { state: { ...state, tournament: demo, revision: state.revision + 1 }, effects: [], changed: true }
    }

    case 'LOAD_MATCH': {
      if (!t) throw new RuleError('No tournament loaded.')
      const target = t.matches[action.matchId]
      if (!target) throw new RuleError('Unknown match.')
      const current = t.activeMatchId ? t.matches[t.activeMatchId] : undefined
      if (current && (current.status === 'awaiting-confirmation' || current.timer.runningSince !== null)) {
        throw new RuleError('Finish or pause the current match before switching.')
      }
      return { state: withTournament(state, { ...t, activeMatchId: target.id }, now), effects: [], changed: true }
    }

    case 'TICK': {
      if (!t?.activeMatchId) return { state, effects: [], changed: false }
      const m = activeMatch(t)
      const { match, effects } = reduceMatch(m, { type: 'TICK' }, now)
      if (match === m) return { state, effects, changed: false }
      return { state: withTournament(state, withMatch(t, match), now), effects, changed: true }
    }

    default: {
      if (!t) throw new RuleError('No tournament loaded.')
      const m = activeMatch(t)
      const { match, effects } = reduceMatch(m, action satisfies MatchAction, now)
      if (match === m) return { state, effects, changed: false }
      let next = withMatch(t, match)
      if (action.type === 'APPROVE_MATCH') {
        // Result is saved; clear the board and load the next match in the queue.
        next = { ...next, activeMatchId: nextScheduledMatch({ ...next, activeMatchId: null })?.id ?? null }
      }
      return { state: withTournament(state, next, now), effects, changed: true }
    }
  }
}
