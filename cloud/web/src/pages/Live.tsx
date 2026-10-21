import type { PubCourt, PublicCompetitor, PublicView } from '../../../src/contract'
import { Card, Chip, Country, Empty, HansokuTriangles, MarkList, SideDot } from '../components/ui'

function FighterRow({ side, c, won }: { side: 'aka' | 'shiro'; c: PublicCompetitor; won: boolean }) {
  return (
    <div className="flex items-stretch gap-3">
      <span className={`w-1 shrink-0 rounded-full ${side === 'aka' ? 'bg-aka' : 'bg-shiro'}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-center gap-2">
          <SideDot side={side} />
          <span className="display truncate text-[26px] leading-none sm:text-3xl">{c.name}</span>
          {won && <Chip tone="ok">Winner</Chip>}
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-sm text-muted">
          <span className="truncate">{c.dojo}</span>
          <Country code={c.country} />
        </div>
      </div>
      <div className="flex min-h-9 shrink-0 flex-col items-end justify-center gap-1.5">
        <MarkList marks={c.marks} size="lg" />
        <HansokuTriangles count={c.hansoku} />
      </div>
    </div>
  )
}

function CourtCard({ court }: { court: PubCourt }) {
  const v: PublicView = court.view
  const m = v.match
  const label = m ? [m.label, m.positionLabel].filter(Boolean).join(' · ') : ''
  const status = !m ? null : m.status === 'in-progress' ? 'live' : m.status === 'scheduled' ? 'next' : m.status === 'awaiting-confirmation' ? 'pending' : 'done'

  return (
    <Card className="overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="display truncate text-xl leading-tight">{court.name}</h2>
          {label && <p className="truncate text-xs text-muted">{label}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {m?.encho && <Chip tone="amber">Encho</Chip>}
          {m?.timeUp && <Chip tone="amber">Time up</Chip>}
          {status === 'live' && (
            <Chip tone="ok">
              <span className="pulse-dot inline-block size-1.5 rounded-full bg-ok" />
              Live
            </Chip>
          )}
          {status === 'pending' && <Chip>Result pending</Chip>}
          {status === 'done' && <Chip>Finished</Chip>}
        </div>
      </header>

      <div className="space-y-4 px-4 py-4">
        {v.champion ? (
          <div className="py-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber">Champion</p>
            <p className="display mt-2 text-4xl leading-none">{v.champion.name}</p>
            <p className="mt-2 flex items-center justify-center gap-2 text-sm text-muted">
              {v.champion.dojo}
              <Country code={v.champion.country} />
            </p>
          </div>
        ) : m ? (
          <>
            <FighterRow side="aka" c={m.aka} won={m.winner === 'aka'} />
            <FighterRow side="shiro" c={m.shiro} won={m.winner === 'shiro'} />
            {v.team && (
              <div className="num flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
                <span className="truncate text-muted">{v.team.akaTeam}</span>
                <span className="display mx-3 shrink-0 text-xl tracking-wider">
                  {v.team.akaWins} <span className="text-muted">–</span> {v.team.shiroWins}
                </span>
                <span className="truncate text-right text-muted">{v.team.shiroTeam}</span>
              </div>
            )}
            {v.team && (
              <p className="num -mt-2 text-center text-[11px] text-muted">
                Ippons {v.team.akaIppons} – {v.team.shiroIppons}
              </p>
            )}
          </>
        ) : (
          <p className="py-4 text-center text-sm text-muted">No match in progress</p>
        )}

        {v.nextMatch && (
          <p className="truncate border-t border-line pt-3 text-sm text-muted">
            <span className="mr-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Next</span>
            <span className="text-ink">{v.nextMatch.aka.name}</span> <span className="px-1">vs</span> <span className="text-ink">{v.nextMatch.shiro.name}</span>
          </p>
        )}
      </div>
    </Card>
  )
}

export function LivePage({ courts }: { courts: PubCourt[] }) {
  if (!courts.length) return <Empty>No courts yet. Results appear here as soon as the tournament starts.</Empty>
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {courts.map((c) => (
        <CourtCard key={c.id} court={c} />
      ))}
    </div>
  )
}
