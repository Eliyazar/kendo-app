// What happens after a bout is decided (approved, kiken, or corrected):
// team encounters are re-tallied and bracket winners move on.

import { advance, replaceWinner } from './bracket'
import { entrantOf, refreshEncounter } from './encounters'
import type { Match, Tournament } from './types'

export function afterMatchCompleted(t: Tournament, m: Match): Tournament {
  if (m.teamMatchId) {
    const r = refreshEncounter(t, m.teamMatchId, m.id)
    t = r.t
    const tm = t.teamMatches[m.teamMatchId]
    if (tm?.bracketNodeId) {
      const node = t.bracket?.nodes[tm.bracketNodeId]
      const winner = r.decided && tm.result?.winner ? (tm.result.winner === 'aka' ? tm.akaTeamId : tm.shiroTeamId) : null
      if (node && !node.winnerEntrantId && winner) t = advance(t, node.id, winner)
      else if (node && node.winnerEntrantId !== winner) t = replaceWinner(t, node.id, winner)
    }
    return t
  }
  if (m.bracketNodeId && m.result) {
    const winner = m.result.winner ? entrantOf(t, m, m.result.winner) : null
    const node = t.bracket?.nodes[m.bracketNodeId]
    if (node && !node.winnerEntrantId && winner) t = advance(t, node.id, winner)
    else if (node && node.winnerEntrantId !== winner) t = replaceWinner(t, node.id, winner)
  }
  return t
}
