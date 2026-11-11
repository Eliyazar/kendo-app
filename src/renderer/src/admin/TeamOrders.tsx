// Team orders handed in on paper: type them in from the shiai-jo screen for the coming encounters on this court.

import { useState } from 'react'
import { encounterOpen, lineupOf } from '@shared/encounters'
import type { AdminAction } from '@shared/ipc'
import { matchLabel } from '@shared/public-view'
import type { Competition, Side, TeamMatch, Tournament } from '@shared/types'
import { OrderSelects } from './ParticipantsView'

interface Encounter {
  t: Tournament
  tm: TeamMatch
}

/** Encounters on this court whose order can still change (no bout started), in fighting order. */
function openEncounters(comp: Competition, courtId: string | null, limit: number): Encounter[] {
  const out: Encounter[] = []
  for (const t of comp.categories) {
    if (t.mode !== 'team') continue
    for (const id of t.matchQueue) {
      const m = t.matches[id]
      if (!m?.teamMatchId || m.position !== 0 || (courtId && m.courtId !== courtId)) continue
      const tm = t.teamMatches[m.teamMatchId]
      if (tm && encounterOpen(t, tm)) out.push({ t, tm })
      if (out.length >= limit) return out
    }
  }
  return out
}

const title = ({ t, tm }: Encounter) => `${t.teams[tm.akaTeamId]?.name ?? '—'} vs ${t.teams[tm.shiroTeamId]?.name ?? '—'}`

function EncounterDialog({ enc, send, onClose }: { enc: Encounter; send: (a: AdminAction) => Promise<boolean>; onClose: () => void }) {
  const { t, tm } = enc
  const first = t.matches[tm.boutIds[0]!]
  const side = (s: Side) => {
    const team = t.teams[s === 'aka' ? tm.akaTeamId : tm.shiroTeamId]
    if (!team) return null
    return (
      <div className={`rounded-xl border-2 p-4 ${s === 'aka' ? 'border-aka' : 'border-shiro'}`}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-lg font-black">
            <span className={`mr-2 inline-block h-3 w-3 rounded-full ${s === 'aka' ? 'bg-aka' : 'bg-shiro'}`} />
            {team.name}
          </span>
          <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${tm.lineupSet?.[s] ? 'bg-emerald-600' : 'bg-white/10 text-white/60'}`}>
            {tm.lineupSet?.[s] ? 'Order set' : 'Default order'}
          </span>
        </div>
        <OrderSelects team={team} t={t} value={lineupOf(t, tm, s)} onChange={(lineup) => void send({ type: 'SET_LINEUP', teamMatchId: tm.id, teamId: team.id, lineup })} />
      </div>
    )
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onMouseDown={onClose}>
      <div className="w-[min(1100px,94vw)] rounded-2xl border border-white/10 bg-neutral-900 p-6" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-1 text-sm text-white/50">
          {t.name} · {first ? matchLabel(t, first) : ''}
        </div>
        <h2 className="mb-1 text-2xl font-black">Team order: {title(enc)}</h2>
        <p className="mb-4 text-sm text-white/50">Choose each position as written on the captain's paper. Saved immediately; it locks when the first bout starts. Empty position = that bout is lost by fusen-gachi.</p>
        <div className="flex flex-col gap-4">
          {side('aka')}
          {side('shiro')}
        </div>
        <div className="mt-5 text-right">
          <button onClick={onClose} className="rounded-xl bg-emerald-600 px-6 py-2.5 font-bold hover:bg-emerald-500">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

/** Strip on the shiai-jo screen: the next team encounters on this court, each opening its order editor. */
export function TeamOrdersBar({ comp, courtId, send }: { comp: Competition; courtId: string | null; send: (a: AdminAction) => Promise<boolean> }) {
  const [open, setOpen] = useState<string | null>(null)
  const list = openEncounters(comp, courtId, 3)
  if (!list.length) return null
  const current = list.find((e) => e.tm.id === open)
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2">
      <span className="mr-1 text-xs font-bold tracking-widest text-muted uppercase">Team orders</span>
      {list.map((e, i) => {
        const set = Number(Boolean(e.tm.lineupSet?.aka)) + Number(Boolean(e.tm.lineupSet?.shiro))
        return (
          <button
            key={e.tm.id}
            onClick={() => setOpen(e.tm.id)}
            className="flex min-w-0 items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-semibold hover:bg-neutral-700"
            title="Enter the order from the captains' paper"
          >
            <span className="text-xs text-muted">{i === 0 ? 'Next' : `+${i}`}</span>
            <span className="truncate">{title(e)}</span>
            <span className={`rounded px-1.5 text-[10px] font-bold ${set === 2 ? 'bg-emerald-600' : 'bg-amber-500 text-ink'}`}>{set}/2 set</span>
          </button>
        )
      })}
      {current && <EncounterDialog enc={current} send={send} onClose={() => setOpen(null)} />}
    </div>
  )
}
