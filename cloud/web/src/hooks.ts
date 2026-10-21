import { useEffect, useRef, useState } from 'react'
import type { PublishedSnapshot } from '../../src/contract'
import { fetchSnapshot } from './api'

export const POLL_MS = 3000
export const STALE_AFTER_MS = 30_000

export interface LiveState {
  snapshot: PublishedSnapshot | null
  /** Time of the last successful poll (also counts "not modified"). */
  lastOkAt: number | null
  /** The most recent poll failed. */
  failing: boolean
  notFound: boolean
  loaded: boolean
}

/** Polls the snapshot every 3 s while the page is visible (If-None-Match keeps unchanged polls tiny). */
export function useSnapshot(slug: string): LiveState {
  const [state, setState] = useState<LiveState>({ snapshot: null, lastOkAt: null, failing: false, notFound: false, loaded: false })
  const etag = useRef<string | null>(null)

  useEffect(() => {
    let stopped = false
    let timer: number | undefined
    let ctrl: AbortController | undefined
    etag.current = null

    const schedule = () => {
      window.clearTimeout(timer)
      if (!stopped && document.visibilityState === 'visible') timer = window.setTimeout(tick, POLL_MS)
    }

    async function tick() {
      if (stopped || document.visibilityState === 'hidden') return
      ctrl?.abort()
      const mine = new AbortController()
      ctrl = mine
      const res = await fetchSnapshot(slug, etag.current, mine.signal)
      if (stopped || res.kind === 'aborted') return
      const now = Date.now()
      if (res.kind === 'ok') {
        etag.current = res.etag
        setState({ snapshot: res.snapshot, lastOkAt: now, failing: false, notFound: false, loaded: true })
      } else if (res.kind === 'same') {
        setState((s) => ({ ...s, lastOkAt: now, failing: false, notFound: false, loaded: true }))
      } else if (res.kind === 'missing') {
        etag.current = null
        setState((s) => ({ ...s, lastOkAt: now, failing: false, notFound: true, loaded: true }))
      } else {
        setState((s) => ({ ...s, failing: true, loaded: true }))
      }
      schedule()
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer)
        void tick()
      } else {
        window.clearTimeout(timer)
        ctrl?.abort()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    void tick()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      ctrl?.abort()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [slug])

  return state
}

/** Re-renders once a second (for "updated Xs ago"). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

/** localStorage-backed string that never throws (private mode, blocked storage). */
export function usePersistedString(key: string, initial = ''): [string, (v: string) => void] {
  const [value, setValue] = useState(() => {
    try {
      return window.localStorage.getItem(key) ?? initial
    } catch {
      return initial
    }
  })
  const set = (v: string) => {
    setValue(v)
    try {
      window.localStorage.setItem(key, v)
    } catch {
      /* storage unavailable: keep it in memory only */
    }
  }
  return [value, set]
}
