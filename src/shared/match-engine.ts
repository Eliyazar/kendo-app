// Pure Kendo rules engine for a single match.
// No Electron, no I/O: every function takes `now` explicitly so it can be
// unit-tested and replayed deterministically.

import type {
  Match,
  MatchDecision,
  MatchEndReason,
  MatchResult,
  PointEvent,
  Side,
  Technique,
  TimerState
} from './types'

export class RuleError extends Error {}

export const opponent = (side: Side): Side => (side === 'aka' ? 'shiro' : 'aka')

const newId = (): string => globalThis.crypto.randomUUID()

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

export function timerElapsed(t: TimerState, now: number): number {
  const live = t.runningSince === null ? 0 : Math.max(0, now - t.runningSince)
  const elapsed = t.elapsedMs + live
  return t.mode === 'countdown' ? Math.min(elapsed, t.durationMs) : elapsed
}

/** Remaining regulation time (countdown) or elapsed time (stopwatch). */
export function timerDisplayMs(t: TimerState, now: number): number {
  const elapsed = timerElapsed(t, now)
  return t.mode === 'countdown' ? t.durationMs - elapsed : elapsed
}

export const isTimeUp = (t: TimerState, now: number): boolean =>
  t.mode === 'countdown' && timerElapsed(t, now) >= t.durationMs

export function startTimer(t: TimerState, now: number): TimerState {
  return t.runningSince === null ? { ...t, runningSince: now } : t
}

export function pauseTimer(t: TimerState, now: number): TimerState {
  return t.runningSince === null ? t : { ...t, elapsedMs: timerElapsed(t, now), runningSince: null }
}

export function resetTimer(t: TimerState): TimerState {
  return { ...t, elapsedMs: 0, runningSince: null }
}

/**
 * Shift the displayed clock by `deltaMs` (+1000 = clock shows one second more).
 * Returns the delta that was actually applied after clamping, so undo is exact.
 */
export function adjustTimer(t: TimerState, deltaMs: number, now: number): { timer: TimerState; applied: number } {
  const elapsed = timerElapsed(t, now)
  const wanted = t.mode === 'countdown' ? elapsed - deltaMs : elapsed + deltaMs
  const max = t.mode === 'countdown' ? t.durationMs : Number.POSITIVE_INFINITY
  const next = Math.min(Math.max(wanted, 0), max)
  const applied = t.mode === 'countdown' ? elapsed - next : next - elapsed
  return {
    timer: { ...t, elapsedMs: next, runningSince: t.runningSince === null ? null : now },
    applied
  }
}

// ---------------------------------------------------------------------------
// Score (always derived from the event log)
// ---------------------------------------------------------------------------

/** One mark on the scoreboard: a technique letter, an ippon from hansoku, or fusen-gachi. */
export type ScoreMark = { kind: 'technique'; technique: Technique } | { kind: 'hansoku' } | { kind: 'fusen' }

export interface SideScore {
  ippons: number
  hansoku: number
  marks: ScoreMark[]
}

export interface MatchScore {
  aka: SideScore
  shiro: SideScore
  fusenGachi: Side | null
}

export function computeScore(events: readonly PointEvent[]): MatchScore {
  const score: MatchScore = {
    aka: { ippons: 0, hansoku: 0, marks: [] },
    shiro: { ippons: 0, hansoku: 0, marks: [] },
    fusenGachi: null
  }
  for (const e of events) {
    switch (e.kind) {
      case 'ippon':
        score[e.side].ippons += 1
        score[e.side].marks.push({ kind: 'technique', technique: e.technique })
        break
      case 'hansoku': {
        const own = score[e.side]
        own.hansoku += 1
        // Hansoku math: every 2nd penalty gives the opponent an ippon.
        if (own.hansoku % 2 === 0) {
          const opp = score[opponent(e.side)]
          opp.ippons += 1
          opp.marks.push({ kind: 'hansoku' })
        }
        break
      }
      case 'fusen-gachi':
        score.fusenGachi = e.side
        score[e.side].ippons += 2
        score[e.side].marks.push({ kind: 'fusen' }, { kind: 'fusen' })
        break
      case 'time-adjust':
        break
    }
  }
  return score
}

// ---------------------------------------------------------------------------
// End-of-match detection
// ---------------------------------------------------------------------------

export function evaluateEnd(match: Match, now: number): MatchEndReason | null {
  const s = computeScore(match.events)
  if (s.fusenGachi) return 'fusen-gachi'
  if (match.encho) {
    // Encho starts from a draw, so the first ippon (incl. from hansoku) breaks it.
    return s.aka.ippons !== s.shiro.ippons ? 'encho-ippon' : null
  }
  if (Math.max(s.aka.ippons, s.shiro.ippons) >= match.config.ipponsToWin) return 'ippon'
  if (isTimeUp(match.timer, now)) return 'time-up'
  return null
}

export interface PendingResult {
  winner: Side | null
  decision: MatchDecision
  /** Draw in a match that must be decided: operator has to start Encho. */
  needsEncho: boolean
  score: MatchScore
}

export function pendingResult(match: Match): PendingResult {
  const score = computeScore(match.events)
  const { aka, shiro } = score
  if (score.fusenGachi) return { winner: score.fusenGachi, decision: 'fusen-gachi', needsEncho: false, score }
  if (aka.ippons === shiro.ippons) {
    return { winner: null, decision: 'hikiwake', needsEncho: match.config.enchoOnDraw && !match.encho, score }
  }
  const winner: Side = aka.ippons > shiro.ippons ? 'aka' : 'shiro'
  const decision: MatchDecision = match.encho
    ? 'encho'
    : score[winner].ippons >= match.config.ipponsToWin
      ? 'ippon'
      : 'time'
  return { winner, decision, needsEncho: false, score }
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/** The event UNDO would remove. Events from before Encho started are locked. */
export function lastUndoableEvent(m: Match): PointEvent | undefined {
  if (m.encho && m.events.length <= (m.enchoFromEvent ?? 0)) return undefined
  return m.events.at(-1)
}

export type MatchAction =
  | { type: 'TIMER_START' }
  | { type: 'TIMER_PAUSE' }
  | { type: 'TIMER_RESET' }
  | { type: 'TIMER_ADJUST'; deltaMs: number }
  | { type: 'ADD_IPPON'; side: Side; technique: Technique }
  | { type: 'ADD_HANSOKU'; side: Side }
  | { type: 'FUSEN_GACHI'; side: Side }
  | { type: 'UNDO' }
  | { type: 'START_ENCHO' }
  | { type: 'APPROVE_MATCH' }
  /** Internal: periodic timer check from the main process. */
  | { type: 'TICK' }

export type Effect = 'buzzer'

export interface MatchUpdate {
  match: Match
  effects: Effect[]
}

const isScoring = (m: Match): boolean => m.status === 'scheduled' || m.status === 'in-progress'

function requireScoring(m: Match): void {
  if (!isScoring(m)) throw new RuleError(`Match is ${m.status}; scoring is locked.`)
}

type NewEvent = PointEvent extends infer E ? (E extends PointEvent ? Omit<E, 'id' | 'at' | 'matchTimeMs'> : never) : never

function pushEvent(m: Match, now: number, event: NewEvent): Match {
  const full = { ...event, id: newId(), at: now, matchTimeMs: timerElapsed(m.timer, now) } as PointEvent
  return { ...m, status: 'in-progress', events: [...m.events, full] }
}

/**
 * Move the match into / out of `awaiting-confirmation` based on the rules.
 * Called after every action, and periodically via TICK.
 */
function settle(prev: Match, m: Match, now: number): MatchUpdate {
  if (m.status === 'completed') return { match: m, effects: [] }
  const reason = evaluateEnd(m, now)
  if (reason) {
    const next: Match = { ...m, status: 'awaiting-confirmation', endReason: reason, timer: pauseTimer(m.timer, now) }
    const justEnded = prev.status !== 'awaiting-confirmation' || prev.endReason !== reason
    return { match: next, effects: justEnded && reason === 'time-up' ? ['buzzer'] : [] }
  }
  if (m.status === 'awaiting-confirmation' || m.endReason) {
    // A correction (gogi) undid the deciding point or added time back: back to play, clock stays paused.
    const { endReason: _dropped, ...rest } = m
    return { match: { ...rest, status: 'in-progress' }, effects: [] }
  }
  return { match: m, effects: [] }
}

export function reduceMatch(m: Match, action: MatchAction, now: number): MatchUpdate {
  switch (action.type) {
    case 'TICK':
      return settle(m, m, now)

    case 'TIMER_START':
      requireScoring(m)
      if (isTimeUp(m.timer, now)) throw new RuleError('Time is up. Reset or adjust the clock first.')
      return settle(m, { ...m, status: 'in-progress', timer: startTimer(m.timer, now) }, now)

    case 'TIMER_PAUSE':
      return { match: { ...m, timer: pauseTimer(m.timer, now) }, effects: [] }

    case 'TIMER_RESET':
      if (m.status === 'completed') throw new RuleError('Match is completed.')
      return settle(m, { ...m, timer: resetTimer(m.timer) }, now)

    case 'TIMER_ADJUST': {
      if (m.status === 'completed') throw new RuleError('Match is completed.')
      const { timer, applied } = adjustTimer(m.timer, action.deltaMs, now)
      if (applied === 0) return { match: m, effects: [] }
      const withEvent = pushEvent({ ...m, timer }, now, { kind: 'time-adjust', deltaMs: applied })
      return settle(m, { ...withEvent, status: m.status === 'scheduled' ? 'scheduled' : withEvent.status }, now)
    }

    case 'ADD_IPPON':
      requireScoring(m)
      return settle(m, pushEvent(m, now, { kind: 'ippon', side: action.side, technique: action.technique }), now)

    case 'ADD_HANSOKU':
      requireScoring(m)
      return settle(m, pushEvent(m, now, { kind: 'hansoku', side: action.side }), now)

    case 'FUSEN_GACHI':
      requireScoring(m)
      if (m.events.some((e) => e.kind !== 'time-adjust') || m.timer.elapsedMs > 0 || m.timer.runningSince !== null) {
        throw new RuleError('Fusen-gachi is only possible before the match has started.')
      }
      return settle(m, pushEvent(m, now, { kind: 'fusen-gachi', side: action.side }), now)

    case 'UNDO': {
      if (m.status === 'completed') throw new RuleError('Match is completed.')
      const last = lastUndoableEvent(m)
      if (!last) throw new RuleError('Nothing to undo.')
      let timer = m.timer
      if (last.kind === 'time-adjust') timer = adjustTimer(timer, -last.deltaMs, now).timer
      return settle(m, { ...m, timer, events: m.events.slice(0, -1) }, now)
    }

    case 'START_ENCHO': {
      const r = pendingResult(m)
      if (m.status !== 'awaiting-confirmation' || !r.needsEncho) {
        throw new RuleError('Encho is only available after a drawn elimination match.')
      }
      const { endReason: _dropped, ...rest } = m
      return {
        match: {
          ...rest,
          status: 'in-progress',
          encho: true,
          enchoFromEvent: m.events.length,
          // Encho runs as a stopwatch; hansoku carry over because events are kept.
          timer: { mode: 'stopwatch', durationMs: 0, elapsedMs: 0, runningSince: null }
        },
        effects: []
      }
    }

    case 'APPROVE_MATCH': {
      if (m.status !== 'awaiting-confirmation') throw new RuleError('Match has not ended yet.')
      const r = pendingResult(m)
      if (r.needsEncho) throw new RuleError('Drawn elimination match: start Encho.')
      const result: MatchResult = {
        winner: r.winner,
        decision: r.decision,
        akaIppons: r.score.aka.ippons,
        shiroIppons: r.score.shiro.ippons,
        akaHansoku: r.score.aka.hansoku,
        shiroHansoku: r.score.shiro.hansoku,
        approvedAt: now
      }
      return { match: { ...m, status: 'completed', result }, effects: [] }
    }
  }
}
