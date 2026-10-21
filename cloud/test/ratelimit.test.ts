import { describe, expect, it } from 'vitest'
import {
  MAX_FAILURES_GLOBAL,
  MAX_FAILURES_PER_IP,
  WINDOW_MS,
  beginAttempt,
  checkLimit,
  finishSuccess,
  recordAttempt,
  removeAttempt,
  retryMessage,
  type Attempts
} from '../src/ratelimit'

describe('attempt list helpers', () => {
  it('allows attempts until the limit is reached', () => {
    let attempts: number[] = []
    for (let i = 0; i < MAX_FAILURES_PER_IP; i++) {
      const c = checkLimit(attempts, 1000 + i)
      expect(c.blocked).toBe(false)
      attempts = recordAttempt(c.attempts, 1000 + i)
    }
    const blocked = checkLimit(attempts, 2000)
    expect(blocked.blocked).toBe(true)
    if (blocked.blocked) expect(blocked.retryAfterMs).toBe(1000 + WINDOW_MS - 2000)
  })

  it('forgets attempts after the window', () => {
    const attempts = [0, 1, 2, 3, 4]
    expect(checkLimit(attempts, WINDOW_MS - 1).blocked).toBe(true)
    expect(checkLimit(attempts, WINDOW_MS).blocked).toBe(false)
  })

  it('drops expired attempts when recording', () => {
    expect(recordAttempt([0, 5], WINDOW_MS + 100)).toEqual([WINDOW_MS + 100])
  })

  it('takes back exactly one attempt', () => {
    expect(removeAttempt([1, 2, 2, 3], 2)).toEqual([1, 2, 3])
    expect(removeAttempt([1, 3], 2)).toEqual([1, 3])
  })

  it('words the wait in minutes', () => {
    expect(retryMessage(30_000)).toContain('1 minute')
    expect(retryMessage(5 * 60_000)).toContain('5 minutes')
  })
})

/** Tiny in-memory model of the Durable Object's use of the limiter. */
class Sim {
  ip = new Map<string, Attempts>()
  global: Attempts = []

  /** One login attempt; returns what the server would answer. */
  login(ip: string, pinIsCorrect: boolean, now: number): 'ok' | 'wrong' | 'ip-blocked' | 'global-blocked' {
    const start = beginAttempt(this.ip.get(ip) ?? [], this.global, now)
    if (!start.allowed) return 'ip-blocked'
    this.ip.set(ip, start.ip)
    this.global = start.global
    if (!pinIsCorrect) return start.globalFull ? 'global-blocked' : 'wrong'
    const done = finishSuccess(this.ip.get(ip) ?? [], this.global, now)
    this.ip.set(ip, done.ip)
    this.global = done.global
    return 'ok'
  }
}

describe('two-layer PIN limiter', () => {
  it('locks an IP out after 5 wrong attempts, even for the correct PIN', () => {
    const s = new Sim()
    for (let i = 0; i < MAX_FAILURES_PER_IP; i++) expect(s.login('1.1.1.1', false, 1000 + i)).toBe('wrong')
    expect(s.login('1.1.1.1', false, 2000)).toBe('ip-blocked')
    expect(s.login('1.1.1.1', true, 2001)).toBe('ip-blocked')
    expect(s.login('1.1.1.1', true, 1000 + WINDOW_MS + 10)).toBe('ok') // window passed
  })

  it('leaves other IPs unaffected by one IP being locked out', () => {
    const s = new Sim()
    for (let i = 0; i < MAX_FAILURES_PER_IP + 1; i++) s.login('1.1.1.1', false, 1000 + i)
    expect(s.login('1.1.1.1', true, 2000)).toBe('ip-blocked')
    expect(s.login('2.2.2.2', true, 2001)).toBe('ok')
  })

  it('counts ipLeft down and reports it', () => {
    const start = beginAttempt([1, 2], [], 10)
    expect(start.allowed && start.ipLeft).toBe(2)
  })

  it('blocks further wrong guesses once the team-wide cap is reached, but the correct PIN still gets in', () => {
    const s = new Sim()
    // 6 IPs x 5 wrong attempts = 30 failures (each IP ends up locked, the team-wide cap is now full)
    for (let ip = 0; ip < MAX_FAILURES_GLOBAL / MAX_FAILURES_PER_IP; ip++) {
      for (let i = 0; i < MAX_FAILURES_PER_IP; i++) expect(s.login(`10.0.0.${ip}`, false, 1000 + ip * 10 + i)).toBe('wrong')
    }
    expect(s.global).toHaveLength(MAX_FAILURES_GLOBAL)
    // a fresh IP guessing wrong is refused outright
    expect(s.login('9.9.9.9', false, 5000)).toBe('global-blocked')
    // the real captain on another fresh IP still gets in with the right PIN
    expect(s.login('8.8.8.8', true, 5001)).toBe('ok')
    // ... but an IP that is itself blocked does not
    expect(s.login('10.0.0.0', true, 5002)).toBe('ip-blocked')
  })

  it('keeps counting wrong guesses while the cap is full (no free guesses)', () => {
    const s = new Sim()
    for (let i = 0; i < MAX_FAILURES_GLOBAL; i++) s.login(`10.0.${Math.floor(i / 5)}.1`, false, 1000 + i)
    for (let i = 0; i < 4; i++) expect(s.login('7.7.7.7', false, 6000 + i)).toBe('global-blocked')
    expect(s.login('7.7.7.7', false, 6004)).toBe('global-blocked') // 5th for this IP
    expect(s.login('7.7.7.7', false, 6005)).toBe('ip-blocked') // now this IP is locked too
  })

  it('a successful login does not reset other IPs counters, nor its own other failures', () => {
    const s = new Sim()
    for (let i = 0; i < 3; i++) s.login('1.1.1.1', false, 1000 + i)
    for (let i = 0; i < 2; i++) s.login('2.2.2.2', false, 1100 + i)
    expect(s.login('3.3.3.3', true, 1200)).toBe('ok')
    expect(s.ip.get('1.1.1.1')).toHaveLength(3)
    expect(s.ip.get('2.2.2.2')).toHaveLength(2)
    expect(s.global).toHaveLength(5)
    expect(s.login('1.1.1.1', true, 1300)).toBe('ok')
    expect(s.ip.get('1.1.1.1')).toHaveLength(3) // earlier failures are not forgiven
    expect(s.global).toHaveLength(5)
  })

  it('frees the team-wide cap after the window', () => {
    const s = new Sim()
    for (let i = 0; i < MAX_FAILURES_GLOBAL; i++) s.login(`10.0.${Math.floor(i / 5)}.1`, false, 1000)
    expect(s.login('9.9.9.9', false, 2000)).toBe('global-blocked')
    expect(s.login('9.9.9.9', false, 1000 + WINDOW_MS + 1)).toBe('wrong')
  })
})
