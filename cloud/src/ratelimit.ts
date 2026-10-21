// PIN brute-force protection, two layers (state = lists of attempt timestamps kept in the Durable Object):
//  1. per team + client IP: at most MAX_FAILURES_PER_IP failed attempts per WINDOW_MS -> that IP is blocked, others are not.
//  2. per team, all IPs together: at most MAX_FAILURES_GLOBAL failed attempts per WINDOW_MS. Once reached, wrong PINs
//     are refused outright, but a correct PIN from an IP that is not itself blocked still gets in, so a stranger
//     cannot lock the real captain out.

export const MAX_FAILURES_PER_IP = 5
export const MAX_FAILURES_GLOBAL = 30
export const WINDOW_MS = 15 * 60 * 1000

export type Attempts = number[]

const recent = (attempts: Attempts, now: number): Attempts => attempts.filter((t) => t > now - WINDOW_MS && t <= now)

export type LimitCheck = { blocked: false; attempts: Attempts } | { blocked: true; retryAfterMs: number; attempts: Attempts }

/** Is another attempt allowed right now, given `max` failures per window? */
export function checkLimit(attempts: Attempts, now: number, max: number = MAX_FAILURES_PER_IP): LimitCheck {
  const live = recent(attempts, now)
  if (live.length < max) return { blocked: false, attempts: live }
  const oldest = Math.min(...live)
  return { blocked: true, retryAfterMs: Math.max(0, oldest + WINDOW_MS - now), attempts: live }
}

/** Records an attempt before the PIN is verified (so parallel guesses cannot sneak past the limit). */
export const recordAttempt = (attempts: Attempts, now: number): Attempts => [...recent(attempts, now), now]

/** Takes back one recorded attempt (the one made by a login that turned out to be correct). */
export function removeAttempt(attempts: Attempts, at: number): Attempts {
  const i = attempts.indexOf(at)
  return i < 0 ? attempts : [...attempts.slice(0, i), ...attempts.slice(i + 1)]
}

export type AttemptStart =
  | { allowed: false; retryAfterMs: number }
  | {
      allowed: true
      /** New lists to store (this attempt already recorded in both). */
      ip: Attempts
      global: Attempts
      /** The team-wide cap was already reached before this attempt: only a correct PIN may pass. */
      globalFull: boolean
      /** Failed attempts this IP may still make after this one (if it is wrong). */
      ipLeft: number
      /** When the team-wide cap frees up again (only meaningful if globalFull). */
      globalRetryAfterMs: number
    }

/** Step 1 of a login attempt, before the PIN is checked. Blocked IPs are refused even with the right PIN. */
export function beginAttempt(ipAttempts: Attempts, globalAttempts: Attempts, now: number): AttemptStart {
  const ip = checkLimit(ipAttempts, now, MAX_FAILURES_PER_IP)
  if (ip.blocked) return { allowed: false, retryAfterMs: ip.retryAfterMs }
  const global = checkLimit(globalAttempts, now, MAX_FAILURES_GLOBAL)
  const nextIp = recordAttempt(ip.attempts, now)
  return {
    allowed: true,
    ip: nextIp,
    global: recordAttempt(global.attempts, now),
    globalFull: global.blocked,
    ipLeft: MAX_FAILURES_PER_IP - nextIp.length,
    globalRetryAfterMs: global.blocked ? global.retryAfterMs : 0
  }
}

/** Step 2 after a correct PIN: take back only this attempt; other IPs' counters are untouched. */
export function finishSuccess(ipAttempts: Attempts, globalAttempts: Attempts, at: number): { ip: Attempts; global: Attempts } {
  return { ip: removeAttempt(ipAttempts, at), global: removeAttempt(globalAttempts, at) }
}

export const retryMessage = (retryAfterMs: number): string => {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60000))
  return `Too many wrong PIN attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or ask the tournament table.`
}

export const globalLimitMessage = (retryAfterMs: number): string => {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60000))
  return `Too many wrong PIN attempts for this team from all devices. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or ask the tournament table.`
}
