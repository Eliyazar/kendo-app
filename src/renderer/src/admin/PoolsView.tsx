// Pool standings and the Pool Review step before the bracket is generated.

import type { AdminAction } from '@shared/ipc'
import { describeEntrant } from '@shared/public-view'
import { computeStandings, poolsComplete, unresolvedTies } from '@shared/standings'
import type { Pool, Tournament } from '@shared/types'
import { useConfirm } from './useAdmin'

function poolProgress(t: Tournament, pool: Pool): [number, number] {
  const ms = Object.values(t.matches).filter((m) => (m.kind === 'pool' || m.kind === 'tie-breaker') && m.poolId === pool.id)
  return [ms.filter((m) => m.status === 'completed').length, ms.length]
}

function PoolTable({ t, pool, review }: { t: Tournament; pool: Pool; review: boolean }) {
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
    </div>
  )
}

export function PoolsView({ t, send }: { t: Tournament; send: (a: AdminAction) => void }) {
  const complete = poolsComplete(t)
  const review = t.phase === 'pools' && complete
  const ties = review ? unresolvedTies(t) : []
  const [lockArmed, confirmLock] = useConfirm(4000)
  const poolMatches = Object.values(t.matches).filter((m) => m.kind === 'pool')
  const done = poolMatches.filter((m) => m.status === 'completed').length

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-neutral-900 px-5 py-4">
        <div className="flex-1">
          <h2 className="text-xl font-black">{review ? 'Pool Review' : 'Pools'}</h2>
          <p className="text-sm text-white/50">
            {t.phase !== 'pools'
              ? 'Pools are locked. Standings are final.'
              : complete
                ? `All pool matches are approved. Top ${t.advancePerPool} of each pool qualify. Ranking: wins › ${t.mode === 'team' ? 'bouts won › ' : ''}ippons scored › ippons conceded › head-to-head.`
                : `${done} of ${poolMatches.length} pool ${t.mode === 'team' ? 'bouts' : 'matches'} approved.`}
          </p>
        </div>
        {t.phase === 'pools' && (
          <button
            disabled={!review || ties.length > 0}
            onClick={() => confirmLock(() => send({ type: 'LOCK_POOLS' }))}
            className={`h-14 rounded-xl px-6 text-lg font-black disabled:opacity-30 ${
              lockArmed ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {lockArmed ? 'Click again to lock — this cannot be undone' : 'Lock Pools & Generate Brackets'}
          </button>
        )}
      </div>

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
          <PoolTable key={p.id} t={t} pool={p} review={review} />
        ))}
      </div>
    </div>
  )
}
