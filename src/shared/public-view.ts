// Projection of AppState for the public scoreboard.
// Deliberately contains NO clock information (anti-stalling rule):
// the public screen only learns that time is up, never how much is left.

import { tallyEncounter } from './encounters'
import { computeScore, pendingResult, type ScoreMark } from './match-engine'
import { TEAM_POSITIONS, type AppState, type Competitor, type Match, type MatchStatus, type Side, type Tournament } from './types'

export interface PublicCompetitor {
  name: string
  dojo: string
  marks: ScoreMark[]
  ippons: number
  hansoku: number
}

export interface PublicTeamScore {
  akaTeam: string
  shiroTeam: string
  akaWins: number
  shiroWins: number
  akaIppons: number
  shiroIppons: number
}

export interface PublicMatch {
  id: string
  status: MatchStatus
  aka: PublicCompetitor
  shiro: PublicCompetitor
  encho: boolean
  timeUp: boolean
  /** Known once the match is over (awaiting confirmation or completed). */
  winner: Side | null
  /** Team bouts: position name, e.g. "Senpo". */
  positionLabel: string | null
  /** Where this match sits in the tournament, e.g. "Pool A", "Semi-final", "Tie-breaker". */
  label: string
}

export interface PublicMatchup {
  aka: { name: string; dojo: string }
  shiro: { name: string; dojo: string }
}

export interface PublicView {
  tournamentName: string | null
  match: PublicMatch | null
  team: PublicTeamScore | null
  nextMatch: PublicMatchup | null
}

export function describeCompetitor(t: Tournament, c: Competitor): { name: string; dojo: string } {
  const player = c.playerId ? t.players[c.playerId] : undefined
  if (player) return { name: player.name, dojo: player.dojo }
  const team = c.teamId ? t.teams[c.teamId] : undefined
  return { name: '—', dojo: team?.name ?? '' }
}

export function nextScheduledMatch(t: Tournament): Match | null {
  for (const id of t.matchQueue) {
    const m = t.matches[id]
    if (m && m.status === 'scheduled' && id !== t.activeMatchId) return m
  }
  return null
}

function teamScore(t: Tournament, m: Match): PublicTeamScore | null {
  const tm = m.teamMatchId ? t.teamMatches[m.teamMatchId] : undefined
  if (!tm) return null
  const s = tallyEncounter(t, tm)
  return {
    akaTeam: t.teams[tm.akaTeamId]?.name ?? '',
    shiroTeam: t.teams[tm.shiroTeamId]?.name ?? '',
    akaWins: s.akaWins,
    shiroWins: s.shiroWins,
    akaIppons: s.akaIppons,
    shiroIppons: s.shiroIppons
  }
}

function positionLabel(t: Tournament, m: Match): string | null {
  if (m.representative) return m.kind === 'tie-breaker' ? 'Representatives' : 'Daihyo-sen'
  return t.teamSize && m.position !== undefined ? (TEAM_POSITIONS[t.teamSize][m.position] ?? null) : null
}

const ROUND_NAMES = ['Final', 'Semi-final', 'Quarter-final']

export function matchLabel(t: Tournament, m: Match): string {
  if (m.kind === 'tie-breaker') return 'Tie-breaker'
  if (m.kind === 'pool') return t.pools.find((p) => p.id === m.poolId)?.name ?? 'Pool'
  const node = m.bracketNodeId && t.bracket ? t.bracket.nodes[m.bracketNodeId] : undefined
  if (!node || !t.bracket) return 'Elimination'
  const fromFinal = t.bracket.rounds - 1 - node.round
  return ROUND_NAMES[fromFinal] ?? `Round of ${2 ** (fromFinal + 1)}`
}

export function toPublicView(state: AppState): PublicView {
  const t = state.tournament
  if (!t) return { tournamentName: null, match: null, team: null, nextMatch: null }

  const m = t.activeMatchId ? t.matches[t.activeMatchId] : undefined
  const next = nextScheduledMatch(t)
  const nextMatch = next ? { aka: describeCompetitor(t, next.aka), shiro: describeCompetitor(t, next.shiro) } : null
  if (!m) return { tournamentName: t.name, match: null, team: null, nextMatch }

  const score = computeScore(m.events)
  const over = m.status === 'awaiting-confirmation' || m.status === 'completed'
  return {
    tournamentName: t.name,
    match: {
      id: m.id,
      status: m.status,
      aka: { ...describeCompetitor(t, m.aka), ...score.aka },
      shiro: { ...describeCompetitor(t, m.shiro), ...score.shiro },
      encho: m.encho,
      timeUp: m.endReason === 'time-up',
      winner: over ? pendingResult(m).winner : null,
      positionLabel: positionLabel(t, m),
      label: matchLabel(t, m)
    },
    team: teamScore(t, m),
    nextMatch
  }
}
