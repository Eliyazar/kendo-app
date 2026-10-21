// Elimination bracket, one column per round.

import { tallyEncounter } from '@shared/encounters'
import { champion, describeEntrant, roundName } from '@shared/public-view'
import type { BracketNode, Side, Tournament } from '@shared/types'

function nodeScore(t: Tournament, node: BracketNode): { aka: string; shiro: string; live: boolean } | null {
  if (!node.matchId) return null
  const tm = t.teamMatches[node.matchId]
  if (tm) {
    const s = tallyEncounter(t, tm)
    return { aka: `${s.akaWins} (${s.akaIppons})`, shiro: `${s.shiroWins} (${s.shiroIppons})`, live: tm.status === 'in-progress' }
  }
  const m = t.matches[node.matchId]
  if (!m) return null
  // "E" marks the side that won in Encho.
  const mark = (side: Side): string => (m.result?.decision === 'encho' && m.result.winner === side ? ' E' : '')
  return {
    aka: m.result ? `${m.result.akaIppons}${mark('aka')}` : '',
    shiro: m.result ? `${m.result.shiroIppons}${mark('shiro')}` : '',
    live: m.status === 'in-progress' || m.status === 'awaiting-confirmation' || t.courts.some((c) => c.activeMatchId === m.id)
  }
}

function NodeCard({ t, node }: { t: Tournament; node: BracketNode }) {
  const score = nodeScore(t, node)
  const bye = node.round === 0 && (!node.akaEntrantId || !node.shiroEntrantId)
  const row = (side: Side) => {
    const id = side === 'aka' ? node.akaEntrantId : node.shiroEntrantId
    const who = describeEntrant(t, id)
    const won = node.winnerEntrantId !== null && node.winnerEntrantId === id
    const lost = node.winnerEntrantId !== null && !won
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 ${lost ? 'opacity-40' : ''}`}>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${side === 'aka' ? 'bg-aka' : 'bg-shiro'}`} />
        <span className={`min-w-0 flex-1 truncate text-sm ${won ? 'font-black text-amber-300' : 'font-semibold'}`}>
          {id ? who.name : bye ? <span className="text-white/30 italic">bye</span> : <span className="text-white/30">—</span>}
        </span>
        <span className="tabular text-xs text-white/60">{score?.[side]}</span>
      </div>
    )
  }
  return (
    <div
      className={`w-60 overflow-hidden rounded-xl border bg-neutral-900 ${score?.live ? 'border-emerald-500' : 'border-white/10'}`}
    >
      {row('aka')}
      <div className="border-t border-white/5" />
      {row('shiro')}
    </div>
  )
}

export function BracketView({ t }: { t: Tournament }) {
  const b = t.bracket
  if (!b) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-white/15 text-white/50">
        The bracket is generated when the pools are locked.
      </div>
    )
  }
  const nodes = Object.values(b.nodes)
  const champ = champion(t)

  return (
    <div className="flex min-h-0 flex-1 gap-6 overflow-auto rounded-2xl border border-white/10 bg-neutral-950 p-5">
      {Array.from({ length: b.rounds }, (_, r) => (
        <div key={r} className="flex shrink-0 flex-col">
          <h3 className="mb-3 text-center text-xs font-bold tracking-widest text-white/50 uppercase">{roundName(r, b.rounds)}</h3>
          <div className="flex flex-1 flex-col justify-around gap-3">
            {nodes
              .filter((n) => n.round === r)
              .sort((a, c) => a.slot - c.slot)
              .map((n) => (
                <NodeCard key={n.id} t={t} node={n} />
              ))}
          </div>
        </div>
      ))}
      <div className="flex shrink-0 flex-col justify-center">
        <h3 className="mb-3 text-center text-xs font-bold tracking-widest text-white/50 uppercase">Champion</h3>
        <div className={`w-60 rounded-xl border-2 p-4 text-center ${champ ? 'border-amber-400 bg-amber-500/10' : 'border-dashed border-white/15'}`}>
          {champ ? (
            <>
              <div className="text-2xl">🏆</div>
              <div className="text-lg font-black">{champ.name}</div>
              <div className="text-sm text-white/50">{champ.dojo}</div>
            </>
          ) : (
            <span className="text-white/30">—</span>
          )}
        </div>
      </div>
    </div>
  )
}
