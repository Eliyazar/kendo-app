// Post-match verification (gogi): nothing is saved until the operator approves.

import type { AdminAction } from '@shared/ipc'
import { pendingResult, lastUndoableEvent } from '@shared/match-engine'
import type { PublicMatch } from '@shared/public-view'
import type { Match, MatchEndReason } from '@shared/types'
import { describeEvent } from './TimerPanel'

const REASONS: Record<MatchEndReason, string> = {
  ippon: 'Nihon — two ippons scored',
  'time-up': 'Time up',
  'encho-ippon': 'Encho — first point scored',
  'fusen-gachi': 'Fusen-gachi — default win'
}

interface Props {
  match: Match
  view: PublicMatch
  send: (a: AdminAction) => void
}

export function ResultModal({ match, view, send }: Props) {
  const r = pendingResult(match)
  const last = lastUndoableEvent(match)
  const winnerName = r.winner ? view[r.winner].name : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-4xl animate-pop rounded-3xl border border-white/15 bg-neutral-900 p-8 shadow-2xl">
        <div className="text-sm font-bold tracking-[0.25em] text-amber-300 uppercase">
          {match.endReason ? REASONS[match.endReason] : 'Match ended'}
        </div>
        <h2 className="mt-2 text-xl font-semibold text-white/70">Result</h2>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6">
          <div className={`rounded-2xl bg-aka p-5 text-white ${r.winner === 'aka' ? 'ring-4 ring-amber-300' : ''}`}>
            <div className="truncate text-2xl font-black">{view.aka.name}</div>
            <div className="truncate text-sm opacity-75">{view.aka.dojo}</div>
          </div>
          <div className="tabular text-6xl font-black whitespace-nowrap">
            ({r.score.aka.ippons}) – ({r.score.shiro.ippons})
          </div>
          <div className={`rounded-2xl bg-shiro p-5 text-ink ${r.winner === 'shiro' ? 'ring-4 ring-amber-300' : ''}`}>
            <div className="truncate text-2xl font-black">{view.shiro.name}</div>
            <div className="truncate text-sm opacity-75">{view.shiro.dojo}</div>
          </div>
        </div>

        <p className="mt-6 text-center text-2xl font-bold">
          {r.needsEncho ? (
            <span className="text-amber-300">Draw in an elimination match — Encho required.</span>
          ) : winnerName ? (
            <>Winner: {winnerName}</>
          ) : (
            <>Hikiwake (draw)</>
          )}
        </p>
        <p className="mt-1 text-center text-lg text-white/50">Awaiting Referee Confirmation.</p>

        <div className="mt-8 grid grid-cols-2 gap-4">
          <button
            disabled={!last}
            onClick={() => send({ type: 'UNDO' })}
            className="flex h-20 flex-col items-center justify-center rounded-2xl border-2 border-white/25 bg-neutral-800 text-xl font-bold hover:bg-neutral-700 disabled:opacity-30"
          >
            Correction / Undo
            <span className="text-sm font-normal text-white/60">{last ? describeEvent(last) : 'Nothing to undo'}</span>
          </button>
          {r.needsEncho ? (
            <button
              onClick={() => send({ type: 'START_ENCHO' })}
              className="h-20 rounded-2xl bg-amber-500 text-2xl font-black text-ink hover:bg-amber-400"
            >
              Start Encho
            </button>
          ) : (
            <button
              onClick={() => send({ type: 'APPROVE_MATCH' })}
              className="h-20 rounded-2xl bg-emerald-600 text-2xl font-black hover:bg-emerald-500"
            >
              Approve &amp; End Match
            </button>
          )}
        </div>

        {match.endReason === 'time-up' && (
          <button
            onClick={() => send({ type: 'TIMER_ADJUST', deltaMs: 1000 })}
            className="mx-auto mt-4 block text-sm text-white/50 underline-offset-4 hover:text-white hover:underline"
          >
            Clock stopped too early? Add 1 s and resume the match
          </button>
        )}
      </div>
    </div>
  )
}
