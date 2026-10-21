// Admin Control Panel (laptop screen).

import { useEffect, useState } from 'react'
import type { AdminAction, AdminSnapshot, Notice } from '@shared/ipc'
import { champion } from '@shared/public-view'
import { poolsComplete } from '@shared/standings'
import type { Match, Side, Tournament } from '@shared/types'
import { ScaledStage } from '../components/ScaledStage'
import { Scoreboard } from '../components/Scoreboard'
import { BracketView } from './BracketView'
import { MatchQueue } from './MatchQueue'
import { ParticipantsView } from './ParticipantsView'
import { PoolsView } from './PoolsView'
import { ResultModal } from './ResultModal'
import { ScoringPanel } from './ScoringPanel'
import { SettingsView } from './SettingsView'
import { SetupScreen } from './SetupScreen'
import { TimerPanel } from './TimerPanel'
import { useAdmin, useConfirm } from './useAdmin'

type Tab = 'match' | 'pools' | 'bracket' | 'participants' | 'settings'

const TAB_LABEL: Record<Tab, string> = { match: 'Shiai-jo', pools: 'Pools', bracket: 'Bracket', participants: 'Participants', settings: 'Settings' }

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
      const target = e.target as HTMLElement
      const typing = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement
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
    <div className="flex items-center gap-4 rounded-2xl border border-hansoku/40 bg-hansoku/10 px-5 py-3">
      <span className="font-bold text-hansoku">Choose representatives</span>
      {(['aka', 'shiro'] as Side[]).map((side) => {
        const team = match[side].teamId ? t.teams[match[side].teamId!] : undefined
        return (
          <label key={side} className="flex flex-1 items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${side === 'aka' ? 'bg-aka' : 'bg-shiro'}`} />
            <span className="w-32 truncate text-sm text-white/70">{team?.name}</span>
            <select
              className="flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2"
              value={match[side].playerId ?? ''}
              onChange={(e) => send({ type: 'SET_REPRESENTATIVE', side, playerId: e.target.value })}
            >
              <option value="" disabled>
                Select player…
              </option>
              {team?.members.map((id) => (
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

function IdleBoard({ t, courtId, onReview }: { t: Tournament; courtId: string | null; onReview: () => void }) {
  const champ = champion(t)
  const busyElsewhere = t.courts.filter((c) => c.id !== courtId && c.activeMatchId).length
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-surface p-6 text-center">
      {champ ? (
        <>
          <div className="text-4xl">🏆</div>
          <div className="display text-3xl font-bold">{champ.name}</div>
          <div className="text-muted">{champ.dojo} — tournament champion</div>
        </>
      ) : t.phase === 'pools' && poolsComplete(t) ? (
        <>
          <div className="text-xl font-black">All pool matches are done</div>
          <p className="text-muted">Review the standings, break any ties, then lock the pools.</p>
          <button onClick={onReview} className="mt-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold hover:bg-emerald-500">
            Open Pool Review
          </button>
        </>
      ) : busyElsewhere ? (
        <div className="text-muted">No more matches for this court right now. {busyElsewhere} other court(s) still fighting.</div>
      ) : (
        <div className="text-muted">No match loaded. Pick one from the match order.</div>
      )}
    </section>
  )
}

function Notices({ notices }: { notices: Notice[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const recent = notices.filter((n) => !hidden.has(n.id) && Date.now() - n.at < 10 * 60_000).slice(0, 3)
  if (!recent.length) return null
  return (
    <div className="fixed right-4 bottom-4 z-[55] flex w-[420px] flex-col gap-2">
      {recent.map((n) => (
        <div key={n.id} className={`flex animate-rise items-start gap-3 rounded-xl border px-4 py-3 shadow-xl ${n.tone === 'warn' ? 'border-red-500/50 bg-red-950' : 'border-line bg-surface-2'}`}>
          <span className="flex-1 text-sm">{n.text}</span>
          {n.folder && (
            <button onClick={() => void window.kendoAdmin.openFolder(n.folder!)} className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-bold hover:bg-emerald-500">
              Open folder
            </button>
          )}
          <button onClick={() => setHidden((h) => new Set(h).add(n.id))} className="text-muted hover:text-white" aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

function OnlineDot({ snap }: { snap: AdminSnapshot }) {
  if (snap.settings.court.role === 'client') {
    return (
      <span className={`flex items-center gap-2 text-xs font-semibold ${snap.courtLink.connected ? 'text-ok' : 'text-red-400'}`}>
        <span className={`h-2 w-2 rounded-full ${snap.courtLink.connected ? 'bg-ok' : 'bg-red-500'}`} />
        {snap.courtLink.connected ? 'Host connected' : 'Host offline'}
      </span>
    )
  }
  if (snap.online.state === 'off') return null
  const ok = snap.online.state === 'ok'
  return (
    <span className={`flex items-center gap-2 text-xs font-semibold ${ok ? 'text-ok' : 'text-hansoku'}`} title={snap.online.error}>
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-ok' : 'bg-hansoku'}`} />
      {ok ? 'Online' : 'Online paused'}
    </span>
  )
}

export function AdminApp() {
  const { snap, now, send, saveSettings, error, clearError } = useAdmin()
  const [tab, setTab] = useState<Tab>('match')
  const [recoveryDismissed, setRecoveryDismissed] = useState(false)
  const [closeArmed, confirmClose] = useConfirm(4000)
  const fire = (a: AdminAction): void => void send(a)

  const t = snap?.state.tournament ?? null
  const courtId = snap?.courtId ?? null
  const activeId = t?.courts.find((c) => c.id === courtId)?.activeMatchId
  const match = activeId ? t?.matches[activeId] : undefined
  const pm = snap?.publicView.match ?? null
  const client = snap?.settings.court.role === 'client'
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
  const tabs: Tab[] = t ? ['match', 'pools', 'bracket', 'participants', 'settings'] : ['match', 'settings']
  const courtName = t && t.courts.length > 1 ? t.courts.find((c) => c.id === courtId)?.name : null

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <header className="flex items-center gap-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-aka text-lg font-black">剣</div>
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-widest text-muted uppercase">Kendo Tournament Manager</div>
          <div className="truncate text-lg font-bold">
            {t ? t.name : client ? 'Court laptop' : 'New tournament'}
            {t && <span className="ml-3 rounded bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/60 uppercase">{PHASE_LABEL[t.phase]}</span>}
            {courtName && <span className="ml-2 rounded bg-hansoku px-2 py-0.5 text-xs font-bold text-ink uppercase">{courtName}</span>}
          </div>
        </div>

        <nav className="ml-4 flex gap-1 rounded-xl bg-surface p-1">
          {tabs.map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-bold ${tab === k ? 'bg-white text-ink' : 'text-white/60 hover:text-white'}`}
            >
              {k === 'match' && !t ? (client ? 'Court' : 'Setup') : TAB_LABEL[k]}
            </button>
          ))}
        </nav>

        <div className="flex-1" />
        {snap && <OnlineDot snap={snap} />}
        {snap?.recovered && !recoveryDismissed && (
          <div className="flex items-center gap-3 rounded-lg bg-hansoku/15 px-3 py-1.5 text-sm text-amber-200">
            Restored after an unexpected shutdown. Clocks are paused at the last saved second.
            <button onClick={() => setRecoveryDismissed(true)} className="font-bold hover:text-white" aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
        {t && !client && (
          <button
            onClick={() => confirmClose(() => fire({ type: 'RESET_TOURNAMENT' }))}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${closeArmed ? 'bg-red-600' : 'text-muted hover:bg-neutral-800 hover:text-white'}`}
            title="The tournament is archived, then a new one can be set up"
          >
            {closeArmed ? 'Click again to close tournament' : 'Close tournament'}
          </button>
        )}
      </header>

      {error && (
        <button onClick={clearError} className="fixed top-4 left-1/2 z-[60] -translate-x-1/2 animate-pop rounded-xl bg-red-600 px-5 py-3 font-semibold shadow-xl">
          {error}
        </button>
      )}

      {tab === 'settings' && snap ? (
        <SettingsView snap={snap} save={saveSettings} />
      ) : !t ? (
        client ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line text-muted">
            <p>{snap?.courtLink.connected ? 'Connected. The host has no tournament yet.' : 'Waiting for the host laptop…'}</p>
            <button onClick={() => setTab('settings')} className="rounded-lg bg-surface-2 px-4 py-2 font-semibold text-white hover:bg-neutral-700">
              Connection settings
            </button>
          </div>
        ) : (
          <SetupScreen send={send} devMode={snap?.devMode ?? false} />
        )
      ) : tab === 'pools' ? (
        <PoolsView t={t} send={fire} />
      ) : tab === 'bracket' ? (
        <BracketView t={t} />
      ) : tab === 'participants' ? (
        <ParticipantsView t={t} send={send} />
      ) : (
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex gap-4">
              <section className="flex w-[46%] shrink-0 flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-semibold tracking-widest text-muted uppercase">
                  <span>Live preview — public screen</span>
                  <span>Ctrl+Shift+P to reopen</span>
                </div>
                <ScaledStage className="aspect-video w-full rounded-xl border border-line bg-black">
                  <Scoreboard view={snap?.publicView ?? null} />
                </ScaledStage>
              </section>
              {match ? <TimerPanel match={match} now={now} send={fire} /> : <IdleBoard t={t} courtId={courtId} onReview={() => setTab('pools')} />}
            </div>

            {match && needsReps && <RepresentativePicker t={t} match={match} send={fire} />}

            {match && pm && (
              <div className="flex min-h-0 flex-1 gap-4">
                <ScoringPanel side="aka" competitor={pm.aka} scoring={scoring} canFusen={canFusen} send={fire} />
                <ScoringPanel side="shiro" competitor={pm.shiro} scoring={scoring} canFusen={canFusen} send={fire} />
              </div>
            )}
          </div>
          <MatchQueue t={t} courtId={courtId} send={send} />
        </div>
      )}

      {match && pm && match.status === 'awaiting-confirmation' && <ResultModal match={match} view={pm} send={fire} />}
      {snap && <Notices notices={snap.notices} />}
    </div>
  )
}
