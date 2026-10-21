import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdminAction, AdminSnapshot } from '@shared/ipc'

export interface AdminApi {
  snap: AdminSnapshot | null
  /** Main-process time, interpolated locally between snapshots. */
  now: () => number
  send: (action: AdminAction) => Promise<boolean>
  saveSettings: (patch: unknown) => Promise<boolean>
  error: string | null
  clearError: () => void
}

export function useAdmin(): AdminApi {
  const [snap, setSnap] = useState<AdminSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const offset = useRef(0)

  useEffect(() => {
    const apply = (s: AdminSnapshot): void => {
      offset.current = s.serverNow - Date.now()
      setSnap(s)
    }
    const off = window.kendoAdmin.onState(apply)
    void window.kendoAdmin.getState().then(apply)
    return off
  }, [])

  // Errors fade out on their own; the operator should not have to dismiss them mid-match.
  useEffect(() => {
    if (!error) return
    const id = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(id)
  }, [error])

  const send = useCallback(async (action: AdminAction): Promise<boolean> => {
    const r = await window.kendoAdmin.dispatch(action)
    setError(r.ok ? null : r.error)
    return r.ok
  }, [])

  const saveSettings = useCallback(async (patch: unknown): Promise<boolean> => {
    const r = await window.kendoAdmin.setSettings(patch)
    setError(r.ok ? null : r.error)
    return r.ok
  }, [])

  const now = useCallback(() => Date.now() + offset.current, [])

  return { snap, now, send, saveSettings, error, clearError: () => setError(null) }
}

/** Re-render on an interval (used for the running clock). */
export function useTicker(active: boolean, intervalMs = 100): void {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])
}

/** Two-step confirm for destructive buttons: first click arms, second click fires. */
export function useConfirm(timeoutMs = 3000): [boolean, (fire: () => void) => void] {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const id = setTimeout(() => setArmed(false), timeoutMs)
    return () => clearTimeout(id)
  }, [armed, timeoutMs])
  const trigger = (fire: () => void): void => {
    if (armed) {
      setArmed(false)
      fire()
    } else setArmed(true)
  }
  return [armed, trigger]
}

export const formatClock = (ms: number, countUp = false): string => {
  const total = Math.max(0, countUp ? Math.floor(ms / 1000) : Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
