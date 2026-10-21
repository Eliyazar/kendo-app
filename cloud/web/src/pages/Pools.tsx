import type { PublishedSnapshot } from '../../../src/contract'
import { Country, Chip, Empty, SectionTitle } from '../components/ui'
import { buildIndex } from '../lookup'

export function PoolsPage({ snapshot }: { snapshot: PublishedSnapshot }) {
  if (!snapshot.pools.length) return <Empty>Pools appear once the draw is made.</Empty>
  const idx = buildIndex(snapshot)
  const team = snapshot.tournament.mode === 'team'

  return (
    <div>
      {snapshot.pools.map((pool) => {
        const showTb = pool.standings.some((r) => r.tieBreakWins > 0)
        return (
          <div key={pool.id}>
            <SectionTitle right={<span className="text-xs text-muted">Top {snapshot.tournament.advancePerPool} advance</span>}>{pool.name}</SectionTitle>
            <div className="scroll-x rounded-xl border border-line bg-surface">
              <table className="num w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase tracking-wider text-muted">
                    <th className="w-10 py-2.5 pl-4 text-left font-semibold">#</th>
                    <th className="py-2.5 text-left font-semibold">{team ? 'Team' : 'Fighter'}</th>
                    <th className="px-2 py-2.5 text-center font-semibold">W</th>
                    <th className="px-2 py-2.5 text-center font-semibold">D</th>
                    <th className="px-2 py-2.5 text-center font-semibold">L</th>
                    {team && <th className="px-2 py-2.5 text-center font-semibold">Bouts</th>}
                    <th className="px-2 py-2.5 text-center font-semibold">IS</th>
                    <th className="px-2 py-2.5 text-center font-semibold">IC</th>
                    {showTb && <th className="px-2 py-2.5 text-center font-semibold">TB</th>}
                  </tr>
                </thead>
                <tbody>
                  {pool.standings.map((r) => {
                    const e = idx.entrant(r.entrantId)
                    return (
                      <tr key={r.entrantId} className={`border-b border-line last:border-0 ${r.qualifies ? 'bg-amber/[0.07]' : ''}`}>
                        <td className={`py-3 pl-4 font-semibold ${r.qualifies ? 'border-l-[3px] border-l-amber text-amber' : 'border-l-[3px] border-l-transparent text-muted'}`}>{r.rank}</td>
                        <td className="max-w-0 py-3 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="display truncate text-lg leading-tight">{e.name}</span>
                            <Country code={e.country} />
                            {r.tied && <Chip tone="amber">Tie</Chip>}
                          </div>
                          {e.sub && <p className="truncate text-xs text-muted">{e.sub}</p>}
                        </td>
                        <td className="px-2 text-center">{r.wins}</td>
                        <td className="px-2 text-center">{r.draws}</td>
                        <td className="px-2 text-center">{r.losses}</td>
                        {team && <td className="px-2 text-center">{r.boutWins}</td>}
                        <td className="px-2 text-center">{r.ipponsScored}</td>
                        <td className="px-2 text-center">{r.ipponsConceded}</td>
                        {showTb && <td className="px-2 text-center">{r.tieBreakWins}</td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
      <p className="mt-4 text-xs leading-relaxed text-muted">
        W won, D drawn, L lost{team ? ', Bouts = individual bouts won' : ''}, IS ippons scored, IC ippons conceded
        {snapshot.pools.some((p) => p.standings.some((r) => r.tieBreakWins > 0)) ? ', TB tie-breaker wins' : ''}. Highlighted rows advance; a Tie flag means a place is still being decided.
      </p>
    </div>
  )
}
