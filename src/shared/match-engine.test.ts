import { describe, expect, it } from 'vitest'
import { newMatch } from './demo'
import { computeScore, reduceMatch, RuleError, timerDisplayMs, type MatchAction } from './match-engine'
import type { Match, MatchConfig } from './types'

const POOL: MatchConfig = { durationMs: 180_000, ipponsToWin: 2, enchoOnDraw: false }
const BRACKET: MatchConfig = { ...POOL, enchoOnDraw: true }

function run(m: Match, steps: [MatchAction, number][]) {
  let effects: string[] = []
  for (const [action, now] of steps) {
    const r = reduceMatch(m, action, now)
    m = r.match
    effects = [...effects, ...r.effects]
  }
  return { m, effects }
}

describe('timer', () => {
  it('counts down from the start time and pauses exactly', () => {
    const { m } = run(newMatch('x', 'pool', 'a', 'b', POOL), [
      [{ type: 'TIMER_START' }, 1000],
      [{ type: 'TIMER_PAUSE' }, 11_000]
    ])
    expect(timerDisplayMs(m.timer, 99_999)).toBe(170_000)
  })

  it('adjusts by ±1s and undo restores it', () => {
    const { m } = run(newMatch('x', 'pool', 'a', 'b', POOL), [
      [{ type: 'TIMER_START' }, 0],
      [{ type: 'TIMER_PAUSE' }, 10_000],
      [{ type: 'TIMER_ADJUST', deltaMs: 1000 }, 10_000]
    ])
    expect(timerDisplayMs(m.timer, 0)).toBe(171_000)
    const undone = reduceMatch(m, { type: 'UNDO' }, 10_000).match
    expect(timerDisplayMs(undone.timer, 0)).toBe(170_000)
  })

  it('ends the match with a buzzer when time runs out', () => {
    const { m, effects } = run(newMatch('x', 'pool', 'a', 'b', POOL), [
      [{ type: 'TIMER_START' }, 0],
      [{ type: 'TICK' }, 180_050]
    ])
    expect(m.status).toBe('awaiting-confirmation')
    expect(m.endReason).toBe('time-up')
    expect(m.timer.runningSince).toBeNull()
    expect(effects).toEqual(['buzzer'])
  })
})

describe('scoring rules', () => {
  it('Nihon Shobu: second ippon ends the match and locks scoring', () => {
    const { m } = run(newMatch('x', 'pool', 'a', 'b', POOL), [
      [{ type: 'TIMER_START' }, 0],
      [{ type: 'ADD_IPPON', side: 'aka', technique: 'M' }, 5000],
      [{ type: 'ADD_IPPON', side: 'aka', technique: 'K' }, 9000]
    ])
    expect(m.status).toBe('awaiting-confirmation')
    expect(m.endReason).toBe('ippon')
    expect(() => reduceMatch(m, { type: 'ADD_IPPON', side: 'shiro', technique: 'D' }, 9500)).toThrow(RuleError)
  })

  it('Hansoku math: every 2nd hansoku gives the opponent an ippon', () => {
    const { m } = run(newMatch('x', 'pool', 'a', 'b', POOL), [
      [{ type: 'ADD_HANSOKU', side: 'shiro' }, 0],
      [{ type: 'ADD_HANSOKU', side: 'shiro' }, 0],
      [{ type: 'ADD_HANSOKU', side: 'shiro' }, 0]
    ])
    const s = computeScore(m.events)
    expect(s.aka.ippons).toBe(1)
    expect(s.aka.marks).toEqual([{ kind: 'hansoku' }])
    expect(s.shiro.hansoku).toBe(3)
    const fourth = reduceMatch(m, { type: 'ADD_HANSOKU', side: 'shiro' }, 0).match
    expect(computeScore(fourth.events).aka.ippons).toBe(2)
    expect(fourth.status).toBe('awaiting-confirmation')
  })

  it('Gogi correction: undoing the deciding point reopens the match', () => {
    const { m } = run(newMatch('x', 'pool', 'a', 'b', POOL), [
      [{ type: 'ADD_IPPON', side: 'aka', technique: 'M' }, 0],
      [{ type: 'ADD_IPPON', side: 'aka', technique: 'K' }, 0],
      [{ type: 'UNDO' }, 0]
    ])
    expect(m.status).toBe('in-progress')
    expect(m.endReason).toBeUndefined()
    expect(computeScore(m.events).aka.ippons).toBe(1)
  })

  it('approve stores the result', () => {
    const { m } = run(newMatch('x', 'pool', 'a', 'b', POOL), [
      [{ type: 'TIMER_START' }, 0],
      [{ type: 'ADD_IPPON', side: 'shiro', technique: 'D' }, 1000],
      [{ type: 'TICK' }, 181_000],
      [{ type: 'APPROVE_MATCH' }, 182_000]
    ])
    expect(m.status).toBe('completed')
    expect(m.result).toMatchObject({ winner: 'shiro', decision: 'time', shiroIppons: 1, akaIppons: 0 })
  })

  it('fusen-gachi awards two ippons before the match starts', () => {
    const { m } = run(newMatch('x', 'pool', 'a', null, POOL), [[{ type: 'FUSEN_GACHI', side: 'aka' }, 0]])
    expect(m.endReason).toBe('fusen-gachi')
    expect(computeScore(m.events).aka.ippons).toBe(2)
  })
})

describe('encho', () => {
  it('draw in a bracket match requires encho; hansoku carry over; first point wins', () => {
    let { m } = run(newMatch('x', 'bracket', 'a', 'b', BRACKET), [
      [{ type: 'ADD_HANSOKU', side: 'aka' }, 0],
      [{ type: 'TIMER_START' }, 0],
      [{ type: 'TICK' }, 180_000]
    ])
    expect(() => reduceMatch(m, { type: 'APPROVE_MATCH' }, 0)).toThrow(/Encho/)
    m = reduceMatch(m, { type: 'START_ENCHO' }, 0).match
    expect(m.encho).toBe(true)
    expect(m.timer.mode).toBe('stopwatch')

    // Aka's carried-over hansoku + a second one gives Shiro the winning point.
    m = reduceMatch(m, { type: 'ADD_HANSOKU', side: 'aka' }, 1000).match
    expect(m.status).toBe('awaiting-confirmation')
    expect(m.endReason).toBe('encho-ippon')
    m = reduceMatch(m, { type: 'APPROVE_MATCH' }, 2000).match
    expect(m.result).toMatchObject({ winner: 'shiro', decision: 'encho' })
  })

  it('draw in a pool match is hikiwake', () => {
    const { m } = run(newMatch('x', 'pool', 'a', 'b', POOL), [
      [{ type: 'TIMER_START' }, 0],
      [{ type: 'TICK' }, 180_000],
      [{ type: 'APPROVE_MATCH' }, 180_000]
    ])
    expect(m.result).toMatchObject({ winner: null, decision: 'hikiwake' })
  })
})
