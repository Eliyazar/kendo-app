// Admin Control Panel (laptop screen).

import { useEffect, useState } from 'react'
import type { AdminAction } from '@shared/ipc'
import { champion } from '@shared/public-view'
import { poolsComplete } from '@shared/standings'
import type { Match, Side, Tournament } from '@shared/types'
import { ScaledStage } from '../components/ScaledStage'
import { Scoreboard } from '../components/Scoreboard'
import { BracketView } from './BracketView'
import { MatchQueue } from './MatchQueue'
import { PoolsView } from './PoolsView'
import { ResultModal } from './ResultModal'
import { ScoringPanel } from './ScoringPanel'
import { SetupScreen } from './SetupScreen'
import { TimerPanel } from './TimerPanel'
import { useAdmin, useConfirm } from './useAdmin'

type Tab = 'match' | 'pools' | 'bracket'

const PHASE_LABEL: Record<Tournament['phase'], string> = {
  setup: 'Setup',
  pools: 'Pools',
  'pool-review': 'Pool review',
  bracket: 'Elimination',
  finished: 'Finished'
}

const isScoring = (m: Match): boolean => m.status === 'scheduled' || m.status === 'in-progress'

const notStarted = (m: Match): boolean =>
  isScoring(m) && m.timer.elapsedMs === 0 && m.timer.runningSince === null && m.events.every((e) => e.kind === 'time-adjust')

/** Space = start/pause, Ctrl/Cmd+Z = undo. Ignored while typing in a field. */
function useShortcuts(match: Match | undefined, enabled: boolean, send: (a: AdminAction) => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement
      if (!enabled || !match || e.repeat || typing) return
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
  }, [match, enabled, send])
}

/** Daihyo-sen / team tie-breaker: pick one fighter per team before the bout starts. */
function RepresentativePicker({ t, match, send }: { t: Tournament; match: Match; send: (a: AdminAction) => void }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-3">
      <span className="font-bold text-amber-300">Choose representatives</span>
      {(['aka', 'shiro'] as Side[]).map((side) => {
        const team = match[side].teamId ? t.teams[match[side].teamId!] : undefined
        return (
          <label key={side} className="flex flex-1 items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${side === 'aka' ? 'bg-aka' : 'bg-shiro'}`} />
            <span className="w-32 truncate text-sm text-white/70">{team?.name}</span>
            <select
              className="flex-1 rounded-lg border border-white/10 bg-neutral-800 px-3 py-2"
              value={match[side].playerId ?? ''}
              onChange={(e) => send({ type: 'SET_REPRESENTATIVE', side, playerId: e.target.value })}
            >
              <option value="" disabled>
                Select player…
              </option>
              {team?.roster
                .filter((id): id is string => id !== null)
                .map((id) => (
                  <option key={id} value={id}>
                    {t.players[id]?.name}
                  </option>
                ))}
            </select>
          </label>
        )
      })}
    </div>
  )
}

function IdleBoard({ t, onReview }: { t: Tournament; onReview: () => void }) {
  const champ = champion(t)
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-neutral-900 p-6 text-center">
      {t.phase === 'pools' && poolsComplete(t) ? (
        <>
          <div className="text-xl font-black">All pool matches are done</div>
          <p className="text-white/50">Review the standings, break any ties, then lock the pools.</p>
          <button onClick={onReview} className="mt-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold hover:bg-emerald-500">
            Open Pool Review
          </button>
        </>
      ) : champ ? (
        <>
          <div className="text-4xl">🏆</div>
          <div className="text-2xl font-black">{champ.name}</div>
          <div className="text-white/50">{champ.dojo} — tournament champion</div>
        </>
      ) : (
        <div className="text-white/50">No match loaded. Pick one from the match order.</div>
      )}
    </section>
  )
}

export function AdminApp() {
  const { snap, now, send, error, clearError } = useAdmin()
  const [tab, setTab] = useState<Tab>('match')
  const [recoveryDismissed, setRecoveryDismissed] = useState(false)
  const [closeArmed, confirmClose] = useConfirm(4000)
  const fire = (a: AdminAction): void => void send(a)

  const t = snap?.state.tournament ?? null
  const match = t?.activeMatchId ? t.matches[t.activeMatchId] : undefined
  const pm = snap?.publicView.match ?? null
  useShortcuts(match, tab === 'match', fire)

  // After Lock Pools the first bracket match is loaded: go back to the shiai-jo.
  const phase = t?.phase
  useEffect(() => {
    if (phase === 'bracket') setTab('match')
  }, [phase])

  const needsReps = match?.representative && match.status === 'scheduled'
  const repsMissing = Boolean(match?.representative && (!match.aka.playerId || !match.shiro.playerId))
  const scoring = Boolean(match && isScoring(match) && !repsMissing)
  const canFusen = Boolean(match && notStarted(match) && !repsMissing)

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <header className="flex items-center gap-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-aka text-lg font-black">剣</div>
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-widest text-white/40 uppercase">Kendo Tournament Manager</div>
          <div className="truncate text-lg font-bold">
            {t ? t.name : 'New tournament'}
            {t && <span className="ml-3 rounded bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/60 uppercase">{PHASE_LABEL[t.phase]}</span>}
          </div>
        </div>

        {t && (
          <nav className="ml-6 flex gap-1 rounded-xl bg-neutral-900 p-1">
            {(['match', 'pools', 'bracket'] as Tab[]).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-lg px-4 py-1.5 text-sm font-bold capitalize ${tab === k ? 'bg-white text-ink' : 'text-white/60 hover:text-white'}`}
              >
                {k === 'match' ? 'Shiai-jo' : k}
              </button>
            ))}
          </nav>
        )}

        <div className="flex-1" />
        {snap?.recovered && !recoveryDismissed && (
          <div className="flex items-center gap-3 rounded-lg bg-amber-500/15 px-3 py-1.5 text-sm text-amber-200">
            Restored after an unexpected shutdown. Clock is paused at the last saved second.
            <button onClick={() => setRecoveryDismissed(true)} className="font-bold hover:text-white" aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
        {t && (
          <button
            onClick={() => confirmClose(() => fire({ type: 'RESET_TOURNAMENT' }))}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${closeArmed ? 'bg-red-600' : 'text-white/40 hover:bg-neutral-800 hover:text-white'}`}
            title="The tournament is archived, then a new one can be set up"
          >
            {closeArmed ? 'Click again to close tournament' : 'Close tournament'}
          </button>
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
        <SetupScreen send={send} devMode={snap?.devMode ?? false} />
      ) : tab === 'pools' ? (
        <PoolsView t={t} send={fire} />
      ) : tab === 'bracket' ? (
        <BracketView t={t} />
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
              {match ? <TimerPanel match={match} now={now} send={fire} /> : <IdleBoard t={t} onReview={() => setTab('pools')} />}
            </div>

            {match && needsReps && <RepresentativePicker t={t} match={match} send={fire} />}

            {match && pm && (
              <div className="flex min-h-0 flex-1 gap-4">
                <ScoringPanel side="aka" competitor={pm.aka} scoring={scoring} canFusen={canFusen} send={fire} />
                <ScoringPanel side="shiro" competitor={pm.shiro} scoring={scoring} canFusen={canFusen} send={fire} />
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
