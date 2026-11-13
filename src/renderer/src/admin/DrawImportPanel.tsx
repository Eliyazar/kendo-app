// Preview of imported draw files (several categories, pre-drawn pools) before the competition is created.

import { useState } from 'react'
import type { AdminAction, DrawImportResult } from '@shared/ipc'
import { competitionFromDrafts, courtsNeeded, draftsFromDraw, type CategoryDraft } from '@shared/draw-setup'
import { poolLetter, validateSetup } from '@shared/setup'
import { BracketField } from './BracketField'
import type { TeamSize } from '@shared/types'

type Loaded = Extract<DrawImportResult, { ok: true }>

const field = 'w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-white outline-none focus:border-amber-500'
const small = 'rounded-md border border-white/10 bg-neutral-800 px-2 py-1 text-sm'
const LETTERS = ['A', 'B', 'C', 'D']

export function DrawImportPanel({ loaded, send, onCancel }: { loaded: Loaded; send: (a: AdminAction) => Promise<boolean>; onCancel: () => void }) {
  const [name, setName] = useState(loaded.eventName ?? '')
  const [date, setDate] = useState(loaded.date ?? new Date().toISOString().slice(0, 10))
  // Categories that cannot be created as they are (e.g. a team without members) start unticked.
  const [initial] = useState(() => {
    const ds = draftsFromDraw(loaded, Math.floor(Math.random() * 2 ** 30))
    const n = courtsNeeded(ds)
    return { courts: n, drafts: ds.map((d) => ({ ...d, include: typeof validateSetup({ ...d, date: '2000-01-01', courts: n }) !== 'string' })) }
  })
  const [drafts, setDrafts] = useState<CategoryDraft[]>(initial.drafts)
  const [courts, setCourts] = useState(initial.courts)
  const [busy, setBusy] = useState(false)

  const patch = (i: number, p: Partial<CategoryDraft>) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...p } : d)))
  const move = (i: number, by: number) =>
    setDrafts((ds) => {
      const next = [...ds]
      const [d] = next.splice(i, 1)
      next.splice(i + by, 0, d!)
      return next
    })
  const errorOf = (d: CategoryDraft): string | null => {
    const v = validateSetup({ ...d, date, courts })
    return typeof v === 'string' ? v : null
  }
  const included = drafts.filter((d) => d.include)
  const blocking = included.filter((d) => errorOf(d))
  const canCreate = name.trim() && included.length > 0 && blocking.length === 0 && !busy

  const create = async () => {
    setBusy(true)
    const ok = await send({ type: 'CREATE_COMPETITION', setup: competitionFromDrafts(name.trim(), date, courts, drafts) })
    setBusy(false)
    if (ok) onCancel()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 p-5">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-xl font-black">Import draw — {loaded.files.length} file(s)</h2>
        <label className="block w-72">
          <span className="mb-1 block text-xs font-bold tracking-widest text-white/50 uppercase">Competition name</span>
          <input className={field} value={name} placeholder="e.g. Ruse Kendo Cup" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold tracking-widest text-white/50 uppercase">Date</span>
          <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold tracking-widest text-white/50 uppercase">Shiai-jo</span>
          <select className={field} value={courts} onChange={(e) => setCourts(Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loaded.warnings.length > 0 && (
        <ul className="rounded-lg bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          {loaded.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        {drafts.map((d, i) => {
          const err = d.include ? errorOf(d) : null
          const units = d.mode === 'team' ? new Set(d.entrants.map((e) => e.team)).size : d.entrants.length
          return (
            <div key={`${d.source}-${d.drawSeed}`} className={`rounded-xl border p-4 ${err ? 'border-red-500/60' : 'border-white/10'} ${d.include ? '' : 'opacity-50'}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex flex-col">
                  <button disabled={i === 0} onClick={() => move(i, -1)} className="px-1 text-xs text-white/60 hover:text-white disabled:opacity-20" title="Fight this category earlier">
                    ▲
                  </button>
                  <button disabled={i === drafts.length - 1} onClick={() => move(i, 1)} className="px-1 text-xs text-white/60 hover:text-white disabled:opacity-20" title="Fight this category later">
                    ▼
                  </button>
                </span>
                <span className="w-5 text-center text-sm font-bold text-white/40">{i + 1}</span>
                <input type="checkbox" className="h-5 w-5" checked={d.include} onChange={(e) => patch(i, { include: e.target.checked })} />
                <input className={`${small} w-64 font-bold`} value={d.name} onChange={(e) => patch(i, { name: e.target.value })} />
                <span className="text-sm text-white/60">
                  {d.mode === 'team' ? `${units} teams` : `${units} players`} ·{' '}
                  {d.predrawn ? `${d.predrawn.pools.length} pool(s) from the file${d.predrawn.pools.length === 1 && !d.predrawn.bracket.length ? ', no elimination (pool ranking = 1st, 2nd, 3rd)' : ''}` : 'pools drawn by the app'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <span className="text-white/50">Shiai-jo</span>
                  {LETTERS.slice(0, courts).map((l) => (
                    <button
                      key={l}
                      onClick={() => patch(i, { courtLetters: d.courtLetters.includes(l) ? d.courtLetters.filter((x) => x !== l) : [...d.courtLetters, l].sort() })}
                      className={`h-7 w-7 rounded-md font-bold ${d.courtLetters.includes(l) ? 'bg-amber-500 text-ink' : 'bg-neutral-800'}`}
                    >
                      {l}
                    </button>
                  ))}
                  {!d.courtLetters.length && <span className="text-white/40">(all)</span>}
                </span>
                <label className="flex items-center gap-1">
                  <span className="text-white/50">Minutes</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className={`${small} w-14`}
                    value={d.poolMatchMinutes}
                    onChange={(e) => patch(i, { poolMatchMinutes: Number(e.target.value), bracketMatchMinutes: Number(e.target.value) })}
                  />
                </label>
                <label className="flex items-center gap-1" title="In which order the pool matches are fought">
                  <span className="text-white/50">Order</span>
                  <select className={small} value={d.fightOrder ?? 'pools'} onChange={(e) => patch(i, { fightOrder: e.target.value as 'pools' | 'alternate' })}>
                    <option value="pools">Pool by pool (all of A, then B…)</option>
                    <option value="alternate">Alternate pools (A, B, C, A, B…)</option>
                  </select>
                </label>
                {d.mode === 'team' && (
                  <label className="flex items-center gap-1">
                    <span className="text-white/50">Team size</span>
                    <select className={small} value={d.teamSize} onChange={(e) => patch(i, { teamSize: Number(e.target.value) as TeamSize })}>
                      {[3, 4, 5].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                )}
                {!d.predrawn && (
                  <>
                    <label className="flex items-center gap-1">
                      <span className="text-white/50">Pool size</span>
                      <select className={small} value={d.poolSize} onChange={(e) => patch(i, { poolSize: Number(e.target.value) })}>
                        {[2, 3, 4, 5].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-1">
                      <span className="text-white/50">Advance</span>
                      <select className={small} value={d.advancePerPool} onChange={(e) => patch(i, { advancePerPool: Number(e.target.value) })}>
                        {[1, 2].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <span className="ml-auto text-xs text-white/40">{d.source}</span>
              </div>
              {d.predrawn && d.predrawn.pools.length > 1 && (
                <BracketField
                  value={d.predrawn.bracket}
                  letters={d.predrawn.pools.map((pl) => poolLetter(pl.name))}
                  onChange={(bracket) => patch(i, { predrawn: { ...d.predrawn!, bracket } })}
                />
              )}
              {err && <p className="mt-2 text-sm font-semibold text-red-400">✖ {err}</p>}
              {d.warnings.map((w) => (
                <p key={w} className="mt-1 text-xs text-amber-300">
                  ⚠ {w}
                </p>
              ))}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="rounded-xl bg-neutral-800 px-5 py-3 font-semibold hover:bg-neutral-700">
          Cancel
        </button>
        <span className="flex-1 text-sm text-white/50">
          {blocking.length ? `Fix or untick ${blocking.length} categor${blocking.length === 1 ? 'y' : 'ies'} with errors.` : `${included.length} categories will be created.`}
        </span>
        <button disabled={!canCreate} onClick={create} className="rounded-xl bg-emerald-600 px-6 py-3 font-bold hover:bg-emerald-500 disabled:opacity-30">
          Create competition
        </button>
      </div>
    </div>
  )
}
