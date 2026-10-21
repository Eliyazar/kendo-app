import type { PubBracketNode, PublishedSnapshot } from '../../../src/contract'
import { Chip, Country, Empty, SideDot } from '../components/ui'
import { buildIndex, roundName, type Index } from '../lookup'

function EntrantLine({ side, id, node, idx, score }: { side: 'aka' | 'shiro'; id: string | null; node: PubBracketNode; idx: Index; score?: number | undefined }) {
  const e = idx.entrant(id)
  const decided = node.winner !== null
  const won = decided && node.winner === id
  return (
    <div className={`flex items-center gap-2 px-3 py-2 ${won ? 'bg-ok/10' : ''}`}>
      <SideDot side={side} />
      <div className="min-w-0 flex-1">
        <p className={`display truncate text-base leading-tight ${!id ? 'text-muted' : decided && !won ? 'text-muted' : 'text-ink'}`}>{id ? e.name : 'TBD'}</p>
        {id && e.sub && <p className="truncate text-[11px] text-muted">{e.sub}</p>}
      </div>
      <Country code={e.country} />
      {score !== undefined && <span className="num w-4 text-right text-sm font-semibold">{score}</span>}
      {won && (
        <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-ok" aria-label="Winner">
          <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  )
}

function NodeCard({ node, snapshot, idx }: { node: PubBracketNode; snapshot: PublishedSnapshot; idx: Index }) {
  const team = snapshot.tournament.mode === 'team'
  const enc = team && node.matchId ? snapshot.encounters.find((e) => e.id === node.matchId) : undefined
  const match = !team && node.matchId ? snapshot.matches.find((m) => m.id === node.matchId) : undefined
  const live = enc ? enc.status === 'in-progress' : match ? match.status === 'in-progress' || match.status === 'awaiting-confirmation' : false
  const akaScore = enc ? (enc.akaTeamId === node.aka ? enc.akaWins : enc.shiroWins) : undefined
  const shiroScore = enc ? (enc.akaTeamId === node.aka ? enc.shiroWins : enc.akaWins) : undefined
  const showScore = enc && enc.status !== 'scheduled'
  return (
    <div className={`w-[220px] overflow-hidden rounded-xl border bg-surface ${live ? 'border-ok/60' : 'border-line'}`}>
      <EntrantLine side="aka" id={node.aka} node={node} idx={idx} score={showScore ? akaScore : undefined} />
      <div className="h-px bg-line" />
      <EntrantLine side="shiro" id={node.shiro} node={node} idx={idx} score={showScore ? shiroScore : undefined} />
      {live && (
        <div className="border-t border-line px-3 py-1.5">
          <Chip tone="ok">
            <span className="pulse-dot inline-block size-1.5 rounded-full bg-ok" />
            Live
          </Chip>
        </div>
      )}
    </div>
  )
}

export function BracketPage({ snapshot }: { snapshot: PublishedSnapshot }) {
  const b = snapshot.bracket
  if (!b || !b.nodes.length) return <Empty>The bracket appears once the pools are finished.</Empty>
  const idx = buildIndex(snapshot)
  const rounds = Array.from({ length: b.rounds }, (_, r) => b.nodes.filter((n) => n.round === r).sort((x, y) => x.slot - y.slot))
  const champion = snapshot.podium.find((p) => p.place === 1)?.entrantId ?? b.nodes.find((n) => !n.next)?.winner ?? null
  const champ = champion ? idx.entrant(champion) : null

  return (
    <div className="scroll-x -mx-4 px-4 pb-4 md:mx-0 md:px-0">
      <div className="flex min-w-max gap-5">
        {rounds.map((nodes, r) => (
          <div key={r} className="flex flex-col">
            <h3 className="display mb-3 text-sm text-muted">{roundName(r, b.rounds)}</h3>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {nodes.map((n) => (
                <NodeCard key={n.id} node={n} snapshot={snapshot} idx={idx} />
              ))}
            </div>
          </div>
        ))}
        <div className="flex flex-col">
          <h3 className="display mb-3 text-sm text-amber">Champion</h3>
          <div className="flex flex-1 flex-col justify-center">
            <div className={`w-[220px] rounded-xl border px-4 py-5 text-center ${champ ? 'border-amber/50 bg-amber/10' : 'border-dashed border-line'}`}>
              {champ ? (
                <>
                  <p className="display text-2xl leading-none">{champ.name}</p>
                  <p className="mt-2 flex items-center justify-center gap-2 text-xs text-muted">
                    {champ.sub}
                    <Country code={champ.country} />
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">To be decided</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
