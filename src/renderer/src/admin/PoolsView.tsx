// Pool standings and the Pool Review step before the bracket is generated.

import { useState } from 'react'
import type { AdminAction } from '@shared/ipc'
import { describeEntrant } from '@shared/public-view'
import { computeStandings, poolDone, poolMatchesComplete, poolsComplete, tieBreakPending, unresolvedTies } from '@shared/standings'
import type { Pool, Tournament } from '@shared/types'
import { useConfirm } from './useAdmin'

function poolProgress(t: Tournament, pool: Pool): [number, number] {
  const ms = Object.values(t.matches).filter((m) => (m.kind === 'pool' || m.kind === 'tie-breaker') && m.poolId === pool.id)
  return [ms.filter((m) => m.status === 'completed').length, ms.length]
}

/** The table adds a match between two members of this pool (playoff). */
function AddMatch({ t, pool, send }: { t: Tournament; pool: Pool; send: (a: AdminAction) => void }) {
  const [open, setOpen] = useState(false)
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [encho, setEncho] = useState(true)
  const name = (id: string) => describeEntrant(t, id).name
  if (t.phase !== 'pools') return null
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full border-t border-white/10 px-4 py-2 text-left text-sm font-semibold text-white/50 hover:bg-white/5 hover:text-white">
        + Add a match (playoff)
      </button>
    )
  }
  const select = (v: string, set: (v: string) => void) => (
    <select value={v} onChange={(e) => set(e.target.value)} className="min-w-0 flex-1 rounded-md border border-white/10 bg-neutral-800 px-2 py-1 text-sm">
      <option value="">—</option>
      {pool.entrantIds.map((id) => (
        <option key={id} value={id}>
          {name(id)}
        </option>
      ))}
    </select>
  )
  return (
    <div className="border-t border-white/10 px-4 py-3">
      <p className="mb-2 text-xs text-white/50">One point wins. Its winner ranks above the loser when they have the same wins. It goes to the end of the match order (move it with ▲▼).</p>
      <div className="flex items-center gap-2">
        {select(a, setA)}
        <span className="text-xs text-white/40">vs</span>
        {select(b, setB)}
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={encho} onChange={(e) => setEncho(e.target.checked)} />
        With encho (no point at time-up: extra time until the first point)
      </label>
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="rounded-md px-3 py-1 text-sm text-white/60 hover:bg-white/10">
          Cancel
        </button>
        <button
          disabled={!a || !b || a === b}
          onClick={() => {
            send({ type: 'ADD_PLAYOFF', poolId: pool.id, entrantIds: [a, b], encho })
            setOpen(false)
            setA('')
            setB('')
          }}
          className="rounded-md bg-emerald-600 px-3 py-1 text-sm font-bold hover:bg-emerald-500 disabled:opacity-30"
        >
          Add match
        </button>
      </div>
    </div>
  )
}

function PoolTable({ t, pool, review, send }: { t: Tournament; pool: Pool; review: boolean; send: (a: AdminAction) => void }) {
  const rows = computeStandings(t, pool)
  const [done, total] = poolProgress(t, pool)
  const team = t.mode === 'team'
  const hasTb = rows.some((r) => r.tieBreakWins > 0)
  const th = 'px-2 py-1.5 text-right font-semibold'

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <h3 className="text-lg font-black">{pool.name}</h3>
        <span className={`text-xs font-semibold ${done === total ? 'text-emerald-400' : 'text-white/40'}`}>
          {done}/{total} {team ? 'bouts' : 'matches'}
        </span>
      </div>
      <table className="tabular w-full text-sm">
        <thead className="text-[11px] tracking-wider text-white/40 uppercase">
          <tr>
            <th className="w-8 py-1.5 pl-4 text-left">#</th>
            <th className="px-2 py-1.5 text-left">{team ? 'Team' : 'Player'}</th>
            <th className={th} title="Wins">W</th>
            <th className={th} title="Draws">D</th>
            <th className={th} title="Losses">L</th>
            {team && (
              <th className={th} title="Individual bouts won">
                Bouts
              </th>
            )}
            <th className={th} title="Ippons scored">
              IS
            </th>
            <th className={th} title="Ippons conceded">
              IC
            </th>
            {hasTb && (
              <th className={`${th} pr-4`} title="Tie-breaker wins">
                TB
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const who = describeEntrant(t, r.entrantId)
            const qualifies = r.rank <= t.advancePerPool
            const tied = review && r.tiedWith.length > 0 && qualifies
            return (
              <tr
                key={r.entrantId}
                className={`border-t border-white/5 ${tied ? 'bg-amber-500/15' : review && qualifies ? 'bg-emerald-500/10' : ''}`}
              >
                <td className="py-1.5 pl-4 font-bold text-white/60">
                  {r.rank}
                  {tied && <span className="ml-1 text-amber-300">⚠</span>}
                </td>
                <td className="max-w-0 px-2 py-1.5">
                  <div className="truncate font-semibold">{who.name}</div>
                  {!team && <div className="truncate text-xs text-white/40">{who.dojo}</div>}
                </td>
                <td className="px-2 text-right font-bold">{r.wins}</td>
                <td className="px-2 text-right text-white/60">{r.draws}</td>
                <td className="px-2 text-right text-white/60">{r.losses}</td>
                {team && <td className="px-2 text-right">{r.boutWins}</td>}
                <td className="px-2 text-right">{r.ipponsScored}</td>
                <td className="px-2 text-right">{r.ipponsConceded}</td>
                {hasTb && <td className="px-2 pr-4 text-right">{r.tieBreakWins}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
      <AddMatch t={t} pool={pool} send={send} />
    </div>
  )
}

export function PoolsView({ t, send, manualReview = false }: { t: Tournament; send: (a: AdminAction) => void; manualReview?: boolean }) {
  // Review starts once every regular pool match is approved; tie-breakers run per pool.
  const complete = poolMatchesComplete(t)
  const review = t.phase === 'pools' && complete
  // A pool's tie shows as soon as that pool is finished (its tie-breaker is fought before the next pool).
  const ties = t.phase === 'pools' ? unresolvedTies(t) : []
  const pendingPools = t.phase === 'pools' ? t.pools.filter((p) => tieBreakPending(t, p.id)) : []
  const canLock = review && poolsComplete(t) && ties.length === 0
  const [lockArmed, confirmLock] = useConfirm(4000)
  const poolMatches = Object.values(t.matches).filter((m) => m.kind === 'pool')
  const done = poolMatches.filter((m) => m.status === 'completed').length

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <label className="flex items-center gap-2 px-1 text-sm text-white/70" title="Applies to every category of the competition">
        <input type="checkbox" className="h-4 w-4" checked={!manualReview} onChange={(e) => send({ type: 'SET_POOL_REVIEW', manual: !e.target.checked })} />
        Start the eliminations automatically when a category's pools are done (untick to review and lock the pools by hand, e.g. to add a playoff first)
      </label>
      <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-neutral-900 px-5 py-4">
        <div className="flex-1">
          <h2 className="text-xl font-black">{review ? 'Pool Review' : 'Pools'}</h2>
          <p className="text-sm text-white/50">
            {t.phase !== 'pools'
              ? 'Pools are locked. Standings are final.'
              : complete
                ? `All pool matches are approved. ${t.bracketPlan?.kind === 'none' ? 'The pool ranking gives 1st, 2nd and 3rd place.' : `Top ${t.advancePerPool} of each pool qualify.`} Ranking: wins › ${t.mode === 'team' ? 'bouts won › ' : ''}playoff wins › ippons scored › ippons conceded › head-to-head.`
                : `${done} of ${poolMatches.length} pool ${t.mode === 'team' ? 'bouts' : 'matches'} approved.${manualReview ? '' : ' The eliminations start by themselves after the last one.'}`}
          </p>
        </div>
        {t.phase === 'pools' && (
          <button
            disabled={!canLock}
            onClick={() => confirmLock(() => send({ type: 'LOCK_POOLS', categoryId: t.id }))}
            className={`h-14 rounded-xl px-6 text-lg font-black disabled:opacity-30 ${
              lockArmed ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {lockArmed ? 'Click again to lock — this cannot be undone' : t.bracketPlan?.kind === 'none' ? 'Lock pool — final places' : 'Lock Pools & Generate Brackets'}
          </button>
        )}
      </div>

      {pendingPools.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          Tie-breaker in progress: <b className="text-white">{pendingPools.map((p) => p.name).join(', ')}</b>. Fight and approve it on the shiai-jo; the
          standings update automatically.
        </div>
      )}

      {ties.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <h3 className="font-bold text-amber-300">Absolute tie detected — a tie-breaker is needed before locking</h3>
          {ties.map((tie) => {
            const pool = t.pools.find((p) => p.id === tie.poolId)
            return (
              <div key={tie.poolId + tie.entrantIds.join()} className="flex items-center gap-4">
                <span className="flex-1">
                  <b>{pool?.name}:</b> {tie.entrantIds.map((id) => describeEntrant(t, id).name).join(' = ')} are level on every metric.
                </span>
                <button
                  onClick={() => send({ type: 'GENERATE_TIE_BREAKER', poolId: tie.poolId, entrantIds: tie.entrantIds })}
                  className="rounded-lg bg-amber-500 px-4 py-2 font-bold text-ink hover:bg-amber-400"
                >
                  Generate Tie-Breaker Match
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4 overflow-y-auto pb-2">
        {t.pools.map((p) => (
          <PoolTable key={p.id} t={t} pool={p} review={review || (t.phase === 'pools' && poolDone(t, p.id))} send={send} />
        ))}
      </div>
    </div>
  )
}
