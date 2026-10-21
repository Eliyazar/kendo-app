// New tournament: settings + participant list (import or manual), then draw.

import { useEffect, useMemo, useState } from 'react'
import type { ImportedEntrant } from '@shared/import-parse'
import type { AdminAction } from '@shared/ipc'
import { poolCount, validateSetup, type TournamentSetup } from '@shared/setup'
import type { TeamSize, TournamentMode } from '@shared/types'

const DRAFT_KEY = 'kendo-setup-draft'

type Draft = Omit<TournamentSetup, 'drawSeed'>

const today = (): string => new Date().toISOString().slice(0, 10)

const emptyDraft = (): Draft => ({
  name: '',
  date: today(),
  mode: 'individual',
  teamSize: 5,
  poolSize: 3,
  advancePerPool: 2,
  poolMatchMinutes: 3,
  bracketMatchMinutes: 3,
  courts: 1,
  entrants: []
})

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? { ...emptyDraft(), ...(JSON.parse(raw) as Partial<Draft>) } : emptyDraft()
  } catch {
    return emptyDraft()
  }
}

const field = 'w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 outline-none focus:border-amber-400'
const label = 'mb-1 block text-xs font-semibold tracking-widest text-white/50 uppercase'

function Num(props: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className={label}>{props.label}</span>
      <input
        type="number"
        className={field}
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  )
}

export function SetupScreen({ send, devMode }: { send: (a: AdminAction) => Promise<boolean>; devMode: boolean }) {
  const [draft, setDraft] = useState<Draft>(loadDraft)
  const [importNote, setImportNote] = useState<{ file: string; warnings: string[] } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => setDraft((d) => ({ ...d, [key]: value }))

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      /* draft persistence is a convenience only */
    }
  }, [draft])

  const team = draft.mode === 'team'
  // Check-in: once anyone is marked present, only present entrants go into the draw.
  const checkIn = draft.entrants.some((e) => e.present)
  const presentCount = draft.entrants.filter((e) => e.present).length
  const inDraw = useMemo(
    () => (checkIn ? draft.entrants.filter((e) => e.present) : draft.entrants).map(({ present: _p, ...e }) => e),
    [draft.entrants, checkIn]
  )
  const check = useMemo(() => validateSetup({ ...draft, entrants: inDraw, drawSeed: 1 }), [draft, inDraw])
  const entrantCount = team ? new Set(inDraw.map((e) => e.team ?? '')).size : inDraw.length
  const pools = poolCount(entrantCount, draft.poolSize)
  const sizes = [Math.floor(entrantCount / pools), Math.ceil(entrantCount / pools)]

  const updateEntrant = (i: number, patch: Partial<ImportedEntrant>): void =>
    set(
      'entrants',
      draft.entrants.map((e, j) => (j === i ? { ...e, ...patch } : e))
    )

  const doImport = async (): Promise<void> => {
    const r = await window.kendoAdmin.importParticipants()
    if (!r) return
    if (!r.ok) {
      setImportError(r.error)
      return
    }
    setImportError(null)
    setImportNote({ file: r.fileName, warnings: r.warnings })
    const anyTeam = r.entrants.some((e) => e.team)
    setDraft((d) => ({ ...d, entrants: r.entrants, mode: anyTeam ? 'team' : d.mode }))
  }

  const create = async (): Promise<void> => {
    const ok = await send({ type: 'CREATE_TOURNAMENT', setup: { ...draft, entrants: inDraw, drawSeed: Math.floor(Math.random() * 2 ** 31) } })
    if (ok) {
      try {
        localStorage.removeItem(DRAFT_KEY)
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[360px_1fr] gap-4">
      <section className="flex flex-col gap-4 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 p-5">
        <h2 className="text-xl font-black">New tournament</h2>
        <label className="block">
          <span className={label}>Name</span>
          <input className={field} value={draft.name} placeholder="e.g. Vienna Kendo Cup" onChange={(e) => set('name', e.target.value)} />
        </label>
        <label className="block">
          <span className={label}>Date</span>
          <input type="date" className={field} value={draft.date} onChange={(e) => set('date', e.target.value)} />
        </label>

        <div>
          <span className={label}>Mode</span>
          <div className="grid grid-cols-2 gap-2">
            {(['individual', 'team'] as TournamentMode[]).map((m) => (
              <button
                key={m}
                onClick={() => set('mode', m)}
                className={`rounded-lg py-2 font-bold capitalize ${draft.mode === m ? 'bg-amber-500 text-ink' : 'bg-neutral-800 hover:bg-neutral-700'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {team && (
          <div>
            <span className={label}>Team size</span>
            <div className="grid grid-cols-3 gap-2">
              {([3, 4, 5] as TeamSize[]).map((n) => (
                <button
                  key={n}
                  onClick={() => set('teamSize', n)}
                  className={`rounded-lg py-2 font-bold ${draft.teamSize === n ? 'bg-amber-500 text-ink' : 'bg-neutral-800 hover:bg-neutral-700'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Num label={team ? 'Teams per pool' : 'Pool size'} value={draft.poolSize} min={2} max={8} onChange={(n) => set('poolSize', n)} />
          <Num label="Qualifiers / pool" value={draft.advancePerPool} min={1} max={4} onChange={(n) => set('advancePerPool', n)} />
          <Num label="Pool match (min)" value={draft.poolMatchMinutes} min={0.5} max={15} step={0.5} onChange={(n) => set('poolMatchMinutes', n)} />
          <Num label="Bracket match (min)" value={draft.bracketMatchMinutes} min={0.5} max={15} step={0.5} onChange={(n) => set('bracketMatchMinutes', n)} />
          <Num label="Courts (shiai-jo)" value={draft.courts} min={1} max={4} onChange={(n) => set('courts', n)} />
        </div>

        <div className="rounded-xl bg-white/5 p-3 text-sm text-white/70">
          {entrantCount >= 2 ? (
            <>
              {entrantCount} {team ? 'teams' : 'participants'} → {pools} pool{pools > 1 ? 's' : ''} of{' '}
              {sizes[0] === sizes[1] ? sizes[0] : `${sizes[0]}–${sizes[1]}`}, {Math.min(pools * draft.advancePerPool, entrantCount)} to the
              bracket.
              <div className="mt-1 text-white/40">Dojo mates are kept in different pools where possible.</div>
            </>
          ) : (
            'Add at least two participants.'
          )}
        </div>

        <div className="flex-1" />
        {typeof check === 'string' && draft.entrants.length > 0 && <p className="text-sm text-red-400">{check}</p>}
        <button
          disabled={typeof check === 'string'}
          onClick={create}
          className="h-14 rounded-xl bg-emerald-600 text-lg font-black hover:bg-emerald-500 disabled:opacity-30"
        >
          Create tournament &amp; draw pools
        </button>
      </section>

      <section className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-neutral-900">
        <div className="flex items-center gap-3 border-b border-white/10 p-4">
          <h2 className="text-lg font-bold">
            Participants <span className="text-white/40">({draft.entrants.length})</span>
          </h2>
          {draft.entrants.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className={checkIn ? 'font-semibold text-ok' : 'text-muted'}>
                {checkIn ? `Check-in: ${presentCount} here, ${draft.entrants.length - presentCount} absent (left out of the draw)` : 'Check-in: tick who has arrived'}
              </span>
              <button
                onClick={() => set('entrants', draft.entrants.map((e) => ({ ...e, present: !checkIn })))}
                className="rounded-md px-2 py-1 text-xs font-semibold text-muted hover:bg-neutral-800 hover:text-white"
              >
                {checkIn ? 'Clear' : 'All here'}
              </button>
            </div>
          )}
          <div className="flex-1" />
          {devMode && (
            <button
              onClick={() => send({ type: 'DEV_LOAD_DEMO' })}
              className="rounded-lg px-3 py-2 text-sm text-white/50 hover:bg-neutral-800 hover:text-white"
            >
              Load demo
            </button>
          )}
          <button
            onClick={() => set('entrants', [...draft.entrants, { name: '', dojo: '', ...(team ? { team: '' } : {}) }])}
            className="rounded-lg bg-neutral-700 px-4 py-2 font-semibold hover:bg-neutral-600"
          >
            + Add
          </button>
          <button onClick={doImport} className="rounded-lg bg-amber-500 px-4 py-2 font-bold text-ink hover:bg-amber-400">
            Import CSV / Excel…
          </button>
        </div>

        {(importNote || importError) && (
          <div className="border-b border-white/10 px-4 py-2 text-sm">
            {importError ? (
              <span className="text-red-400">{importError}</span>
            ) : (
              <>
                <span className="text-emerald-400">Imported {importNote!.file}.</span>{' '}
                {importNote!.warnings.length > 0 && <span className="text-amber-300">{importNote!.warnings.join(' ')}</span>}
              </>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {draft.entrants.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-white/50">
              <p>Import a .csv or .xlsx file, or add participants by hand.</p>
              <p className="text-sm text-white/30">
                Recognised columns: Name (or First name + Last name), Dojo / Club, Team, Grade, Seed. Players with the same Team value form one
                team, in file order.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-neutral-900 text-left text-xs tracking-widest text-white/40 uppercase">
                <tr>
                  <th className="w-10 px-4 py-2">#</th>
                  <th className="w-16 px-2 py-2" title="Check-in: tick everyone who has arrived">Here</th>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Dojo / Club</th>
                  <th className="w-24 px-2 py-2">Country</th>
                  {team && <th className="px-2 py-2">Team</th>}
                  <th className="w-24 px-2 py-2">Grade</th>
                  <th className="w-16 px-2 py-2">Seed</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {draft.entrants.map((e, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="px-4 text-white/40">{i + 1}</td>
                    <td className="px-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-emerald-500"
                        checked={Boolean(e.present)}
                        onChange={(ev) => updateEntrant(i, { present: ev.target.checked })}
                      />
                    </td>
                    {(['name', 'dojo', 'country', ...(team ? ['team'] : []), 'grade'] as const).map((k) => (
                      <td key={k} className="px-1 py-1">
                        <input
                          className="w-full rounded bg-transparent px-2 py-1 outline-none hover:bg-white/5 focus:bg-neutral-800"
                          value={(e[k as keyof ImportedEntrant] as string | undefined) ?? ''}
                          onChange={(ev) => updateEntrant(i, { [k]: ev.target.value })}
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        min={1}
                        className="w-full rounded bg-transparent px-2 py-1 outline-none hover:bg-white/5 focus:bg-neutral-800"
                        value={e.seed ?? ''}
                        onChange={(ev) => {
                          const n = Number.parseInt(ev.target.value, 10)
                          const { seed: _s, ...rest } = e
                          set('entrants', draft.entrants.map((x, j) => (j === i ? (n > 0 ? { ...rest, seed: n } : rest) : x)))
                        }}
                      />
                    </td>
                    <td className="pr-3 text-right">
                      <button
                        onClick={() => set('entrants', draft.entrants.filter((_, j) => j !== i))}
                        className="rounded px-2 text-white/40 hover:bg-red-600 hover:text-white"
                        aria-label="Remove"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
