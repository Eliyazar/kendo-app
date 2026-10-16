// Master timer: visible only on the admin screen.

import type { AdminAction } from '@shared/ipc'
import { isTimeUp, timerDisplayMs, lastUndoableEvent } from '@shared/match-engine'
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

  const clockColor = timeUp ? 'text-red-500' : running ? 'text-emerald-400' : 'text-amber-300'

  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-white/10 bg-neutral-900 p-5">
      <div className="flex items-center justify-between text-sm font-semibold tracking-widest text-white/50 uppercase">
        <span>Master timer {match.encho && <span className="ml-2 rounded bg-amber-500 px-2 py-0.5 text-ink">Encho · stopwatch</span>}</span>
        <span>{running ? 'Running' : timeUp ? 'Time up' : 'Paused'}</span>
      </div>

      <div className={`tabular my-2 text-center text-[112px] leading-none font-black ${clockColor}`}>{display}</div>
      <div className="mb-4 text-center text-sm text-white/40">
        {stopwatch ? 'First point wins' : `Regulation ${formatClock(match.timer.durationMs)}`}
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
