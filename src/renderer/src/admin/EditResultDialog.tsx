// Correct an approved result: rebuild the score per side, preview, save.

import { useMemo, useState } from 'react'
import type { ScoreEntry } from '@shared/editing'
import type { AdminAction } from '@shared/ipc'
import { computeScore } from '@shared/match-engine'
import { describeCompetitor } from '@shared/public-view'
import type { Match, PointEvent, Side, Technique, Tournament } from '@shared/types'
import { MarkBadge } from '../components/Marks'

interface SideDraft {
  ippons: Technique[]
  hansoku: number
}

function fromEvents(events: PointEvent[]): Record<Side, SideDraft> & { fusen: Side | null } {
  const d = { aka: { ippons: [] as Technique[], hansoku: 0 }, shiro: { ippons: [] as Technique[], hansoku: 0 }, fusen: null as Side | null }
  for (const e of events) {
    if (e.kind === 'ippon') d[e.side].ippons.push(e.technique)
    if (e.kind === 'hansoku') d[e.side].hansoku++
    if (e.kind === 'fusen-gachi') d.fusen = e.side
  }
  return d
}

function toEntries(d: ReturnType<typeof fromEvents>): ScoreEntry[] {
  if (d.fusen) return [{ kind: 'fusen-gachi', side: d.fusen }]
  return [
    ...(['aka', 'shiro'] as Side[]).flatMap((side) => d[side].ippons.map((technique) => ({ kind: 'ippon', side, technique }) as ScoreEntry)),
    ...(['aka', 'shiro'] as Side[]).flatMap((side) => Array.from({ length: d[side].hansoku }, () => ({ kind: 'hansoku', side }) as ScoreEntry))
  ]
}

export function EditResultDialog({
  t,
  match,
  send,
  onClose
}: {
  t: Tournament
  match: Match
  send: (a: AdminAction) => Promise<boolean>
  onClose: () => void
}) {
  const [draft, setDraft] = useState(() => fromEvents(match.events))
  const entries = useMemo(() => toEntries(draft), [draft])
  const preview = computeScore(entries.map((e, i) => ({ ...e, id: String(i), at: 0, matchTimeMs: 0 }) as PointEvent))
  const update = (side: Side, fn: (s: SideDraft) => SideDraft) => setDraft((d) => ({ ...d, fusen: null, [side]: fn(d[side]) }))

  const save = async (): Promise<void> => {
    if (await send({ type: 'EDIT_RESULT', matchId: match.id, entries })) onClose()
  }

  const panel = (side: Side) => {
    const who = describeCompetitor(t, match[side])
    const s = draft[side]
    return (
      <div className={`flex-1 rounded-2xl border-t-4 bg-surface-2 p-4 ${side === 'aka' ? 'border-aka' : 'border-shiro'}`}>
        <div className="truncate text-lg font-bold">{who.name}</div>
        <div className="mb-3 truncate text-sm text-muted">{who.dojo}</div>
        <div className="mb-3 flex min-h-12 items-center gap-2">
          {preview[side].marks.map((mk, i) => (
            <MarkBadge key={i} mark={mk} size={44} side={side} />
          ))}
          <span className="tabular ml-auto text-3xl font-black">{preview[side].ippons}</span>
        </div>
        <div className="mb-2 flex gap-2">
          {(['M', 'K', 'D', 'T'] as Technique[]).map((tq) => (
            <button key={tq} onClick={() => update(side, (x) => ({ ...x, ippons: [...x.ippons, tq] }))} className="h-10 flex-1 rounded-lg bg-neutral-700 font-bold hover:bg-neutral-600">
              +{tq}
            </button>
          ))}
          <button
            disabled={!s.ippons.length}
            onClick={() => update(side, (x) => ({ ...x, ippons: x.ippons.slice(0, -1) }))}
            className="h-10 rounded-lg bg-neutral-800 px-3 text-sm hover:bg-neutral-700 disabled:opacity-30"
          >
            Remove
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">Hansoku</span>
          <button onClick={() => update(side, (x) => ({ ...x, hansoku: Math.max(0, x.hansoku - 1) }))} className="h-8 w-8 rounded bg-neutral-800 hover:bg-neutral-700">
            −
          </button>
          <span className="tabular w-6 text-center font-bold">{s.hansoku}</span>
          <button onClick={() => update(side, (x) => ({ ...x, hansoku: x.hansoku + 1 }))} className="h-8 w-8 rounded bg-neutral-800 hover:bg-neutral-700">
            +
          </button>
        </div>
      </div>
    )
  }

  const winner = preview.aka.ippons === preview.shiro.ippons ? null : preview.aka.ippons > preview.shiro.ippons ? 'aka' : 'shiro'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-3xl animate-pop rounded-3xl border border-line bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-black">Correct result</h2>
        <p className="mb-4 text-sm text-muted">
          Rebuild the final score. Every 2nd hansoku gives the opponent an ippon (H). Standings and the bracket update automatically; a bracket
          result can only change while the next round has not started.
        </p>
        <div className="flex gap-4">
          {panel('aka')}
          {panel('shiro')}
        </div>
        <div className="mt-4 text-center font-semibold">
          {winner ? `Winner: ${describeCompetitor(t, match[winner]).name}` : 'Draw (hikiwake)'}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-5 py-3 font-semibold text-muted hover:bg-neutral-800 hover:text-white">
            Cancel
          </button>
          <button onClick={save} className="rounded-xl bg-emerald-600 px-6 py-3 font-bold hover:bg-emerald-500">
            Save correction
          </button>
        </div>
      </div>
    </div>
  )
}
