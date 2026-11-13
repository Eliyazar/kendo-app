import { useEffect, useRef, useState } from 'react'
import type { PubCategory, PublishedSnapshot } from '../../src/contract'
import { fetchSnapshot } from './api'

/** While a match is on a court (Workers Paid plan: 10 million requests a month). */
export const POLL_LIVE_MS = 5_000
/** Between matches, before the start and after the end. */
export const POLL_IDLE_MS = 15_000
export const STALE_AFTER_MS = 60_000

const pollDelay = (s: PublishedSnapshot | null, ok: boolean): number => {
  if (!ok) return 10_000
  return s?.courts.some((c) => c.view.match) ? POLL_LIVE_MS : POLL_IDLE_MS
}

export interface LiveState {
  snapshot: PublishedSnapshot | null
  /** Time of the last successful poll (also counts "not modified"). */
  lastOkAt: number | null
  /** The most recent poll failed. */
  failing: boolean
  notFound: boolean
  loaded: boolean
}

/** Polls the snapshot every 5 s during matches (15 s otherwise) while the page is visible. */
export function useSnapshot(slug: string): LiveState {
  const [state, setState] = useState<LiveState>({ snapshot: null, lastOkAt: null, failing: false, notFound: false, loaded: false })
  const etag = useRef<string | null>(null)

  useEffect(() => {
    let stopped = false
    let timer: number | undefined
    let ctrl: AbortController | undefined
    etag.current = null

    let last: PublishedSnapshot | null = null
    const schedule = (ok: boolean) => {
      window.clearTimeout(timer)
      if (!stopped && document.visibilityState === 'visible') timer = window.setTimeout(tick, pollDelay(last, ok))
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
        last = res.snapshot
        setState({ snapshot: res.snapshot, lastOkAt: now, failing: false, notFound: false, loaded: true })
      } else if (res.kind === 'same') {
        setState((s) => ({ ...s, lastOkAt: now, failing: false, notFound: false, loaded: true }))
      } else if (res.kind === 'missing') {
        etag.current = null
        setState((s) => ({ ...s, lastOkAt: now, failing: false, notFound: true, loaded: true }))
      } else {
        setState((s) => ({ ...s, failing: true, loaded: true }))
      }
      schedule(res.kind !== 'error' && res.kind !== 'missing')
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

/**
 * The category shown on Pools / Bracket / Results. The last choice is remembered per tournament slug;
 * default is the category on court A now, else the first one.
 */
export function useCategory(slug: string, snapshot: PublishedSnapshot | null): [PubCategory | null, (id: string) => void] {
  const key = `kendo-live-category:${slug}`
  const [stored, setStored] = useState(() => {
    try {
      return window.localStorage.getItem(key) ?? ''
    } catch {
      return ''
    }
  })
  const cats = snapshot?.categories ?? []
  const onCourtA = snapshot?.courts[0]?.categoryId
  const category = cats.find((c) => c.id === stored) ?? cats.find((c) => c.id === onCourtA) ?? cats[0] ?? null
  const choose = (id: string) => {
    setStored(id)
    try {
      window.localStorage.setItem(key, id)
    } catch {
      /* storage unavailable: keep it in memory only */
    }
  }
  return [category, choose]
}
