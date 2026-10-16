// Admin Control Panel (laptop screen).

import { useEffect, useState } from 'react'
import type { AdminAction } from '@shared/ipc'
import type { Match } from '@shared/types'
import { ScaledStage } from '../components/ScaledStage'
import { Scoreboard } from '../components/Scoreboard'
import { MatchQueue } from './MatchQueue'
import { ResultModal } from './ResultModal'
import { ScoringPanel } from './ScoringPanel'
import { TimerPanel } from './TimerPanel'
import { useAdmin } from './useAdmin'

const isScoring = (m: Match): boolean => m.status === 'scheduled' || m.status === 'in-progress'

const notStarted = (m: Match): boolean =>
  isScoring(m) && m.timer.elapsedMs === 0 && m.timer.runningSince === null && m.events.every((e) => e.kind === 'time-adjust')

/** Space = start/pause, Ctrl/Cmd+Z = undo. */
function useShortcuts(match: Match | undefined, send: (a: AdminAction) => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!match || e.repeat) return
      if (e.code === 'Space' && isScoring(match)) {
        e.preventDefault()
        send({ type: match.timer.runningSince === null ? 'TIMER_START' : 'TIMER_PAUSE' })
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        send({ type: 'UNDO' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [match, send])
}

export function AdminApp() {
  const { snap, now, send, error, clearError } = useAdmin()
  const [recoveryDismissed, setRecoveryDismissed] = useState(false)
  const fire = (a: AdminAction): void => void send(a)

  const t = snap?.state.tournament ?? null
  const match = t?.activeMatchId ? t.matches[t.activeMatchId] : undefined
  const pm = snap?.publicView.match ?? null
  useShortcuts(match, fire)

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <header className="flex items-center gap-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-aka text-lg font-black">剣</div>
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-widest text-white/40 uppercase">Kendo Tournament Manager</div>
          <div className="truncate text-lg font-bold">
            {t ? t.name : 'No tournament loaded'}
            {pm && <span className="ml-3 font-normal text-white/50">{[pm.label, pm.positionLabel].filter(Boolean).join(' · ')}</span>}
          </div>
        </div>
        <div className="flex-1" />
        {snap?.recovered && !recoveryDismissed && (
          <div className="flex items-center gap-3 rounded-lg bg-amber-500/15 px-3 py-1.5 text-sm text-amber-200">
            Restored after an unexpected shutdown. Clock is paused at the last saved second.
            <button onClick={() => setRecoveryDismissed(true)} className="font-bold hover:text-white" aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
      </header>

      {error && (
        <button
          onClick={clearError}
          className="fixed top-4 left-1/2 z-[60] -translate-x-1/2 animate-pop rounded-xl bg-red-600 px-5 py-3 font-semibold shadow-xl"
        >
          {error}
        </button>
      )}

      {!t ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/15">
          <p className="text-white/60">Tournament setup and participant import are not built yet.</p>
          <button onClick={() => fire({ type: 'DEV_LOAD_DEMO' })} className="rounded-xl bg-neutral-700 px-5 py-3 font-semibold hover:bg-neutral-600">
            Load demo tournament
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex gap-4">
              <section className="flex w-[46%] shrink-0 flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-semibold tracking-widest text-white/40 uppercase">
                  <span>Live preview — public screen</span>
                  <span>Ctrl+Shift+P to reopen</span>
                </div>
                <ScaledStage className="aspect-video w-full rounded-xl border border-white/10 bg-black">
                  <Scoreboard view={snap?.publicView ?? null} />
                </ScaledStage>
              </section>
              {match ? (
                <TimerPanel match={match} now={now} send={fire} />
              ) : (
                <section className="flex flex-1 items-center justify-center rounded-2xl border border-white/10 bg-neutral-900 text-white/50">
                  All matches in the queue are completed.
                </section>
              )}
            </div>

            {match && pm && (
              <div className="flex min-h-0 flex-1 gap-4">
                <ScoringPanel side="aka" competitor={pm.aka} scoring={isScoring(match)} canFusen={notStarted(match)} send={fire} />
                <ScoringPanel side="shiro" competitor={pm.shiro} scoring={isScoring(match)} canFusen={notStarted(match)} send={fire} />
              </div>
            )}
          </div>
          <MatchQueue t={t} send={fire} />
        </div>
      )}

      {match && pm && match.status === 'awaiting-confirmation' && <ResultModal match={match} view={pm} send={fire} />}
    </div>
  )
}
