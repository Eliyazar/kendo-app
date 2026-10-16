// PLACEHOLDER admin panel: a bare harness to exercise the IPC bridge.
// The real control panel UI is built in the next phase.

import { useEffect, useState } from 'react'
import type { AdminAction, AdminSnapshot } from '@shared/ipc'
import { timerDisplayMs } from '@shared/match-engine'
import type { Side, Technique } from '@shared/types'

function useAdminSnapshot(): AdminSnapshot | null {
  const [snap, setSnap] = useState<AdminSnapshot | null>(null)
  useEffect(() => {
    const off = window.kendoAdmin.onState(setSnap)
    void window.kendoAdmin.getState().then(setSnap)
    return off
  }, [])
  return snap
}

/** Re-render a few times per second so the clock moves between snapshots. */
function useNow(intervalMs = 100): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

const fmt = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function AdminApp() {
  const snap = useAdminSnapshot()
  const now = useNow()
  const [error, setError] = useState<string | null>(null)

  const send = async (action: AdminAction): Promise<void> => {
    const r = await window.kendoAdmin.dispatch(action)
    setError(r.ok ? null : r.error)
  }

  const t = snap?.state.tournament
  const match = t?.activeMatchId ? t.matches[t.activeMatchId] : undefined

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <h1 className="text-xl font-bold">Admin — IPC harness (placeholder)</h1>
      {snap?.recovered && <p className="text-hansoku">Restored after an unclean shutdown.</p>}
      {error && <p className="text-red-400">{error}</p>}

      {!t && (
        <button className="w-fit rounded bg-neutral-700 px-4 py-2" onClick={() => send({ type: 'DEV_LOAD_DEMO' })}>
          Load demo tournament
        </button>
      )}

      {match && (
        <>
          <div className="font-mono text-5xl">
            {fmt(timerDisplayMs(match.timer, now))} {match.encho && 'ENCHO'} — {match.status}
          </div>
          <div className="flex flex-wrap gap-2">
            {(['TIMER_START', 'TIMER_PAUSE', 'TIMER_RESET', 'UNDO', 'START_ENCHO', 'APPROVE_MATCH'] as const).map((type) => (
              <button key={type} className="rounded bg-neutral-700 px-3 py-1" onClick={() => send({ type })}>
                {type}
              </button>
            ))}
            <button className="rounded bg-neutral-700 px-3 py-1" onClick={() => send({ type: 'TIMER_ADJUST', deltaMs: 1000 })}>
              +1s
            </button>
            <button className="rounded bg-neutral-700 px-3 py-1" onClick={() => send({ type: 'TIMER_ADJUST', deltaMs: -1000 })}>
              −1s
            </button>
          </div>
          <div className="flex gap-8">
            {(['aka', 'shiro'] as Side[]).map((side) => (
              <div key={side} className="flex gap-2">
                <span className="w-14 font-bold">{side}</span>
                {(['M', 'K', 'D', 'T'] as Technique[]).map((technique) => (
                  <button
                    key={technique}
                    className="rounded bg-neutral-700 px-3 py-1"
                    onClick={() => send({ type: 'ADD_IPPON', side, technique })}
                  >
                    {technique}
                  </button>
                ))}
                <button className="rounded bg-yellow-700 px-3 py-1" onClick={() => send({ type: 'ADD_HANSOKU', side })}>
                  H
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {snap && (
        <pre className="overflow-auto rounded bg-neutral-900 p-3 text-xs">{JSON.stringify(snap.publicView, null, 2)}</pre>
      )}
    </div>
  )
}
