// Admin Control Panel (laptop screen).

import { useEffect, useState } from 'react'
import type { AdminAction, AdminSnapshot, Notice } from '@shared/ipc'
import { champion } from '@shared/public-view'
import { onCourt } from '@shared/competition'
import { poolMatchesComplete } from '@shared/standings'
import type { Competition, Match, Side, Tournament } from '@shared/types'
import { ScaledStage } from '../components/ScaledStage'
import { Scoreboard } from '../components/Scoreboard'
import { BracketView } from './BracketView'
import { EditPersonDialog } from './EditPersonDialog'
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

/** Free court: categories waiting for Pool Review, champions, or what the other courts do. */
function IdleBoard({ comp, courtId, onReview }: { comp: Competition; courtId: string | null; onReview: (categoryId: string) => void }) {
  const waiting = comp.categories.filter((c) => c.phase === 'pools' && poolMatchesComplete(c))
  const finished = comp.categories.filter((c) => c.phase === 'finished' && champion(c))
  const busyElsewhere = comp.courts.filter((c) => c.id !== courtId && onCourt(comp, c.id)?.match).length
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl border border-line bg-surface p-6 text-center">
      {waiting.map((c) => (
        <div key={c.id} className="flex w-full max-w-md items-center gap-3 rounded-xl bg-surface-2 px-4 py-3 text-left">
          <span className="flex-1">
            <b>{c.name}</b>
            <span className="block text-sm text-muted">All pool matches done: review, break ties, lock the pools.</span>
          </span>
          <button onClick={() => onReview(c.id)} className="rounded-lg bg-emerald-600 px-4 py-2 font-bold hover:bg-emerald-500">
            Pool Review
          </button>
        </div>
      ))}
      {!waiting.length &&
        finished.slice(-3).map((c) => (
          <div key={c.id}>
            <div className="text-xs font-bold tracking-widest text-hansoku uppercase">🏆 {c.name}</div>
            <div className="display text-2xl font-bold">{champion(c)!.name}</div>
          </div>
        ))}
      {!waiting.length && !finished.length && (
        <div className="text-muted">
          {busyElsewhere ? `No more matches for this court right now. ${busyElsewhere} other court(s) still fighting.` : 'No match loaded. Pick one from the match order.'}
        </div>
      )}
    </section>
  )
}

/** Category chips for the Pools, Bracket and Participants tabs. */
function CategoryPicker({ comp, value, onChange }: { comp: Competition; value: string; onChange: (id: string) => void }) {
  if (comp.categories.length < 2) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {comp.categories.map((c) => (
        <button
          key={c.id}
          onClick={() => onChange(c.id)}
          className={`rounded-full px-3 py-1 text-sm font-semibold ${c.id === value ? 'bg-hansoku text-ink' : 'bg-surface text-white/70 hover:text-white'}`}
        >
          {c.name}
          <span className="ml-1.5 text-xs opacity-60">{PHASE_LABEL[c.phase]}</span>
        </button>
      ))}
    </div>
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

  const comp = snap?.state.competition ?? null
  const courtId = snap?.courtId ?? null
  const on = comp && courtId ? onCourt(comp, courtId) : undefined
  // The category fighting on this court (shiai-jo tab), and the one chosen for the other tabs.
  const courtCategory = on?.category ?? null
  const match = on?.match
  const [picked, setPicked] = useState<string | null>(null)
  const [editPerson, setEditPerson] = useState<string | null>(null)
  const t = comp?.categories.find((c) => c.id === picked) ?? courtCategory ?? comp?.categories[0] ?? null
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
  const tabs: Tab[] = comp ? ['match', 'pools', 'bracket', 'participants', 'settings'] : ['match', 'settings']
  const courtName = comp && comp.courts.length > 1 ? comp.courts.find((c) => c.id === courtId)?.name : null

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <header className="flex items-center gap-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-aka text-lg font-black">剣</div>
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-widest text-muted uppercase">Kendo Tournament Manager</div>
          <div className="truncate text-lg font-bold">
            {comp ? comp.name : client ? 'Court laptop' : 'New competition'}
            {comp && comp.categories.length === 1 && t && (
              <span className="ml-3 rounded bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/60 uppercase">{PHASE_LABEL[t.phase]}</span>
            )}
            {courtName && <span className="ml-2 rounded bg-hansoku px-2 py-0.5 text-xs font-bold text-ink uppercase">{courtName}</span>}
            {courtCategory && comp && comp.categories.length > 1 && <span className="ml-2 text-sm font-normal text-muted">{courtCategory.name}</span>}
          </div>
        </div>

        <nav className="ml-4 flex shrink-0 gap-1 rounded-xl bg-surface p-1">
          {tabs.map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-bold whitespace-nowrap ${tab === k ? 'bg-white text-ink' : 'text-white/60 hover:text-white'}`}
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
        {comp && !client && (
          <button
            onClick={() => confirmClose(() => fire({ type: 'RESET_TOURNAMENT' }))}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold whitespace-nowrap ${closeArmed ? 'bg-red-600' : 'text-muted hover:bg-neutral-800 hover:text-white'}`}
            title="The competition is archived, then a new one can be set up"
          >
            {closeArmed ? 'Click again to close competition' : 'Close competition'}
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
      ) : !comp || !t ? (
        client ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line text-muted">
            <p>{snap?.courtLink.connected ? 'Connected. The host has no competition yet.' : 'Waiting for the host laptop…'}</p>
            <button onClick={() => setTab('settings')} className="rounded-lg bg-surface-2 px-4 py-2 font-semibold text-white hover:bg-neutral-700">
              Connection settings
            </button>
          </div>
        ) : (
          <SetupScreen send={send} devMode={snap?.devMode ?? false} />
        )
      ) : tab === 'pools' || tab === 'bracket' || tab === 'participants' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <CategoryPicker comp={comp} value={t.id} onChange={setPicked} />
          {tab === 'pools' ? <PoolsView t={t} send={fire} /> : tab === 'bracket' ? <BracketView t={t} /> : <ParticipantsView t={t} send={send} />}
        </div>
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
              {match ? (
                <TimerPanel match={match} now={now} send={fire} />
              ) : (
                <IdleBoard
                  comp={comp}
                  courtId={courtId}
                  onReview={(id) => {
                    setPicked(id)
                    setTab('pools')
                  }}
                />
              )}
            </div>

            {match && needsReps && courtCategory && <RepresentativePicker t={courtCategory} match={match} send={fire} />}

            {match && pm && (
              <div className="flex min-h-0 flex-1 gap-4">
                <ScoringPanel side="aka" competitor={pm.aka} scoring={scoring} canFusen={canFusen} send={fire} onEdit={match?.aka.playerId ? () => setEditPerson(match.aka.playerId) : undefined} />
                <ScoringPanel side="shiro" competitor={pm.shiro} scoring={scoring} canFusen={canFusen} send={fire} onEdit={match?.shiro.playerId ? () => setEditPerson(match.shiro.playerId) : undefined} />
              </div>
            )}
          </div>
          <MatchQueue comp={comp} courtId={courtId} send={send} />
        </div>
      )}

      {match && pm && match.status === 'awaiting-confirmation' && <ResultModal match={match} view={pm} send={fire} />}
      {editPerson && courtCategory?.players[editPerson] && (
        <EditPersonDialog player={courtCategory.players[editPerson]!} send={send} onClose={() => setEditPerson(null)} />
      )}
      {snap && <Notices notices={snap.notices} />}
    </div>
  )
}
