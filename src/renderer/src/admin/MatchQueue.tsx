// Fight order on the shiai-jo, with results and a way to load a specific match.

import type { AdminAction } from '@shared/ipc'
import { describeCompetitor, matchLabel } from '@shared/public-view'
import type { Match, Tournament } from '@shared/types'

const STATUS_STYLE: Record<Match['status'], string> = {
  scheduled: 'bg-white/10 text-white/60',
  'in-progress': 'bg-emerald-600 text-white',
  'awaiting-confirmation': 'bg-amber-500 text-ink',
  completed: 'bg-white/5 text-white/40'
}

function resultText(m: Match): string | null {
  const r = m.result
  if (!r) return null
  return `${r.akaIppons} – ${r.shiroIppons}${r.decision === 'hikiwake' ? ' (draw)' : r.decision === 'encho' ? ' (E)' : ''}`
}

export function MatchQueue({ t, send }: { t: Tournament; send: (a: AdminAction) => void }) {
  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900">
      <h2 className="border-b border-white/10 px-4 py-3 text-sm font-bold tracking-widest text-white/50 uppercase">
        Match order
      </h2>
      <ol className="flex-1 overflow-y-auto">
        {t.matchQueue.map((id, i) => {
          const m = t.matches[id]
          if (!m) return null
          const active = id === t.activeMatchId
          const aka = describeCompetitor(t, m.aka)
          const shiro = describeCompetitor(t, m.shiro)
          const result = resultText(m)
          return (
            <li
              key={id}
              className={`border-b border-white/5 px-4 py-3 ${active ? 'bg-white/10' : ''} ${m.status === 'completed' ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center justify-between text-xs text-white/40">
                <span>
                  #{i + 1} · {matchLabel(t, m)}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[m.status]}`}>
                  {active && m.status === 'scheduled' ? 'loaded' : m.status.replace('-', ' ')}
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
              <div className="mt-1 flex items-center justify-between">
                <span className="tabular text-sm text-white/60">{result}</span>
                {!active && m.status === 'scheduled' && (
                  <button
                    onClick={() => send({ type: 'LOAD_MATCH', matchId: id })}
                    className="rounded-md bg-neutral-700 px-2 py-0.5 text-xs font-semibold hover:bg-neutral-600"
                  >
                    Load
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
