// Fight order for this court (or all courts): results, load, correct, move.

import { useEffect, useRef, useState } from 'react'
import type { AdminAction } from '@shared/ipc'
import { describeCompetitor, matchLabel, positionLabel } from '@shared/public-view'
import type { Match, Tournament } from '@shared/types'
import { EditResultDialog } from './EditResultDialog'

const STATUS_STYLE: Record<Match['status'], string> = {
  scheduled: 'bg-white/10 text-white/60',
  'in-progress': 'bg-emerald-600 text-white',
  'awaiting-confirmation': 'bg-amber-500 text-ink',
  completed: 'bg-white/5 text-white/40'
}

const DECISION: Partial<Record<string, string>> = { hikiwake: ' (draw)', encho: ' (E)', kiken: ' (kiken)', 'fusen-gachi': ' (fusen)' }

function resultText(m: Match): string | null {
  const r = m.result
  if (!r) return null
  return `${r.akaIppons} – ${r.shiroIppons}${DECISION[r.decision] ?? ''}${r.editedAt ? ' ✎' : ''}`
}

export function MatchQueue({
  t,
  courtId,
  send
}: {
  t: Tournament
  courtId: string | null
  send: (a: AdminAction) => Promise<boolean>
}) {
  const [allCourts, setAllCourts] = useState(false)
  const [editing, setEditing] = useState<Match | null>(null)
  const activeId = t.courts.find((c) => c.id === courtId)?.activeMatchId ?? null
  const activeRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    // Block body on purpose: newer Chromium returns a Promise here, which React would treat as a cleanup.
    void activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeId])

  const multi = t.courts.length > 1
  const courtName = (id: string) => t.courts.find((c) => c.id === id)?.name.replace('Shiai-jo ', '') ?? ''
  const loadedElsewhere = new Set(t.courts.filter((c) => c.id !== courtId).map((c) => c.activeMatchId))

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-bold tracking-widest text-muted uppercase">Match order</h2>
        {multi && (
          <button onClick={() => setAllCourts((v) => !v)} className="rounded-md bg-surface-2 px-2 py-1 text-xs font-semibold text-muted hover:text-white">
            {allCourts ? 'All courts' : 'This court'}
          </button>
        )}
      </div>
      <ol className="flex-1 overflow-y-auto">
        {t.matchQueue.map((id, i) => {
          const m = t.matches[id]
          if (!m || (multi && !allCourts && m.courtId !== courtId)) return null
          const active = id === activeId
          const aka = describeCompetitor(t, m.aka)
          const shiro = describeCompetitor(t, m.shiro)
          const result = resultText(m)
          return (
            <li
              ref={active ? activeRef : undefined}
              key={id}
              className={`border-b border-line px-4 py-3 ${active ? 'bg-white/10' : ''} ${m.status === 'completed' ? 'opacity-70' : ''}`}
            >
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="truncate">
                  #{i + 1} · {[matchLabel(t, m), positionLabel(t, m)].filter(Boolean).join(' · ')}
                  {multi && allCourts && <b className="ml-1 text-white/70">· {courtName(m.courtId)}</b>}
                </span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[m.status]}`}>
                  {active && m.status === 'scheduled' ? 'loaded' : loadedElsewhere.has(id) ? 'on court' : m.status.replace('-', ' ')}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <span className={`h-3 w-3 shrink-0 rounded-full bg-aka ${m.result?.winner === 'aka' ? 'ring-2 ring-amber-300' : ''}`} />
                <span className="truncate font-semibold">{aka.name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className={`h-3 w-3 shrink-0 rounded-full bg-shiro ${m.result?.winner === 'shiro' ? 'ring-2 ring-amber-300' : ''}`} />
                <span className="truncate font-semibold">{shiro.name}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="tabular text-sm text-white/60">{result}</span>
                <span className="flex gap-1">
                  {m.status === 'completed' && (
                    <button onClick={() => setEditing(m)} className="rounded-md bg-neutral-800 px-2 py-0.5 text-xs font-semibold hover:bg-neutral-700">
                      Edit
                    </button>
                  )}
                  {!active && m.status === 'scheduled' && !loadedElsewhere.has(id) && (
                    <button
                      onClick={() => void send({ type: 'LOAD_MATCH', matchId: id })}
                      className="rounded-md bg-neutral-700 px-2 py-0.5 text-xs font-semibold hover:bg-neutral-600"
                      title={m.courtId !== courtId ? 'Moves this match to your court' : undefined}
                    >
                      {m.courtId !== courtId ? 'Load here' : 'Load'}
                    </button>
                  )}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
      {editing && <EditResultDialog t={t} match={editing} send={send} onClose={() => setEditing(null)} />}
    </aside>
  )
}
