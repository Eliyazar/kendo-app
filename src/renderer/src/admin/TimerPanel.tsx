// Master timer: visible only on the admin screen.

import { useState } from 'react'
import type { AdminAction } from '@shared/ipc'
import { isTimeUp, timerDisplayMs, timerElapsed, lastUndoableEvent } from '@shared/match-engine'
import type { Match, PointEvent } from '@shared/types'
import { formatClock, useConfirm, useTicker } from './useAdmin'

const TECHNIQUE_NAMES = { M: 'Men', K: 'Kote', D: 'Do', T: 'Tsuki' } as const
const SIDE_NAMES = { aka: 'Aka', shiro: 'Shiro' } as const

export function describeEvent(e: PointEvent): string {
  switch (e.kind) {
    case 'ippon':
      return `${SIDE_NAMES[e.side]} · ${TECHNIQUE_NAMES[e.technique]}`
    case 'hansoku':
      return `${SIDE_NAMES[e.side]} · Hansoku`
    case 'fusen-gachi':
      return `${SIDE_NAMES[e.side]} · Fusen-gachi`
    case 'time-adjust':
      return `Clock ${e.deltaMs > 0 ? '+' : '−'}${Math.abs(e.deltaMs / 1000)}s`
  }
}

/** "1:30", "1.30", "90" (seconds) or "2:" -> milliseconds; null when not a time. */
export function parseClock(text: string): number | null {
  const v = text.trim().replace(/[.,]/g, ':')
  const m = /^(\d{1,2}):(\d{0,2})$/.exec(v)
  if (m) {
    const sec = m[2] ? Number(m[2]) : 0
    return sec < 60 ? (Number(m[1]) * 60 + sec) * 1000 : null
  }
  return /^\d{1,4}$/.test(v) ? Number(v) * 1000 : null
}

/** Small inline "m:ss" editor; Enter saves, Escape cancels. */
function ClockInput({ initial, onSave, onCancel, className }: { initial: string; onSave: (ms: number) => void; onCancel: () => void; className: string }) {
  const [v, setV] = useState(initial)
  const ms = parseClock(v)
  return (
    <form
      className="flex items-center justify-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (ms !== null) onSave(ms)
      }}
    >
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        className={`tabular rounded-xl border-2 bg-neutral-800 text-center outline-none ${ms === null ? 'border-red-500' : 'border-amber-500'} ${className}`}
      />
      <button type="submit" disabled={ms === null} className="rounded-lg bg-emerald-600 px-4 py-2 font-bold hover:bg-emerald-500 disabled:opacity-30">
        Set
      </button>
      <button type="button" onClick={onCancel} className="rounded-lg bg-neutral-700 px-3 py-2 font-semibold hover:bg-neutral-600">
        Cancel
      </button>
    </form>
  )
}

interface Props {
  match: Match
  now: () => number
  send: (a: AdminAction) => void
}

export function TimerPanel({ match, now, send }: Props) {
  const running = match.timer.runningSince !== null
  useTicker(running)
  const t = now()
  const stopwatch = match.timer.mode === 'stopwatch'
  const display = formatClock(timerDisplayMs(match.timer, t), stopwatch)
  const timeUp = isTimeUp(match.timer, t)
  const locked = match.status === 'awaiting-confirmation' || match.status === 'completed'
  const [resetArmed, confirmReset] = useConfirm()
  const last = lastUndoableEvent(match)
  const [editing, setEditing] = useState<null | 'clock' | 'length'>(null)
  const canEdit = !running && match.status !== 'completed'

  /** Put the clock on exactly `ms` (remaining time; elapsed time in Encho). Longer than the regulation time extends it. */
  const setClock = (ms: number) => {
    const shown = timerDisplayMs(match.timer, t)
    if (!stopwatch && ms > match.timer.durationMs) send({ type: 'TIMER_SET_DURATION', durationMs: timerElapsed(match.timer, t) + ms })
    else if (ms !== shown) send({ type: 'TIMER_ADJUST', deltaMs: ms - shown })
    setEditing(null)
  }

  const clockColor = timeUp ? 'text-red-500' : running ? 'text-emerald-400' : 'text-amber-300'

  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-white/10 bg-neutral-900 p-5">
      <div className="flex items-center justify-between text-sm font-semibold tracking-widest text-white/50 uppercase">
        <span>Master timer {match.encho && <span className="ml-2 rounded bg-amber-500 px-2 py-0.5 text-ink">Encho · stopwatch</span>}</span>
        <span>{running ? 'Running' : timeUp ? 'Time up' : 'Paused'}</span>
      </div>

      {editing === 'clock' ? (
        <div className="my-6">
          <ClockInput initial={display} onSave={setClock} onCancel={() => setEditing(null)} className="w-56 py-2 text-6xl font-black" />
        </div>
      ) : (
        <button
          disabled={!canEdit}
          onClick={() => setEditing('clock')}
          title={canEdit ? 'Click to set the time' : 'Pause the clock to set the time'}
          className={`tabular my-2 rounded-xl text-center text-[112px] leading-none font-black enabled:hover:bg-white/5 ${clockColor}`}
        >
          {display}
        </button>
      )}
      <div className="mb-4 text-center text-sm text-white/40">
        {stopwatch ? (
          'First point wins'
        ) : editing === 'length' ? (
          <ClockInput
            initial={formatClock(match.timer.durationMs)}
            onSave={(ms) => {
              send({ type: 'TIMER_SET_DURATION', durationMs: ms })
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
            className="w-24 py-1 text-lg font-bold text-white"
          />
        ) : (
          <button
            disabled={!canEdit}
            onClick={() => setEditing('length')}
            className="rounded px-2 enabled:hover:bg-white/5 enabled:hover:text-white"
            title={canEdit ? 'Change the match time for this match' : 'Pause the clock to change the match time'}
          >
            Regulation {formatClock(match.timer.durationMs)} {canEdit && <span aria-hidden>✎</span>}
          </button>
        )}
      </div>

      <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3">
        <button
          disabled={locked || (!running && timeUp)}
          onClick={() => send({ type: running ? 'TIMER_PAUSE' : 'TIMER_START' })}
          className={`h-16 rounded-xl text-2xl font-black transition disabled:opacity-30 ${
            running ? 'bg-amber-500 text-ink hover:bg-amber-400' : 'bg-emerald-600 hover:bg-emerald-500'
          }`}
          title="Space"
        >
          {running ? 'Pause' : 'Start'}
        </button>
        <button
          disabled={match.status === 'completed'}
          onClick={() => send({ type: 'TIMER_ADJUST', deltaMs: -1000 })}
          className="h-16 rounded-xl bg-neutral-700 text-xl font-bold hover:bg-neutral-600 disabled:opacity-30"
        >
          −1 s
        </button>
        <button
          disabled={match.status === 'completed'}
          onClick={() => send({ type: 'TIMER_ADJUST', deltaMs: 1000 })}
          className="h-16 rounded-xl bg-neutral-700 text-xl font-bold hover:bg-neutral-600 disabled:opacity-30"
        >
          +1 s
        </button>
        <button
          disabled={match.status === 'completed'}
          onClick={() => confirmReset(() => send({ type: 'TIMER_RESET' }))}
          className={`h-16 rounded-xl text-lg font-bold disabled:opacity-30 ${
            resetArmed ? 'bg-red-600 hover:bg-red-500' : 'bg-neutral-700 hover:bg-neutral-600'
          }`}
        >
          {resetArmed ? 'Confirm?' : 'Reset'}
        </button>
      </div>

      <button
        disabled={!last || match.status === 'completed'}
        onClick={() => send({ type: 'UNDO' })}
        className="mt-3 flex h-14 items-center justify-center gap-3 rounded-xl border border-white/15 bg-neutral-800 text-lg font-semibold hover:bg-neutral-700 disabled:opacity-30"
        title="Ctrl+Z"
      >
        <span aria-hidden>↶</span> Undo{last ? `: ${describeEvent(last)}` : ''}
        <kbd className="ml-2 rounded bg-white/10 px-1.5 text-xs text-white/60">Ctrl+Z</kbd>
      </button>
    </section>
  )
}
