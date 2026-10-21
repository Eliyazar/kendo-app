// What the laptop publishes for the online results page (phones, people at home).
// Public part: safe for anyone. Secret part: only for the Cloudflare worker
// (captain PIN hashes, open team orders), never served to viewers.
//
// Fairness: a team's order for an encounter that has not started is NOT public,
// so opponents cannot adapt. It appears once the encounter's first bout starts.

import { matchLabel, positionLabel, toPublicView, type PublicView } from './public-view'
import { encounterOpen, entrantOf, lineupOf, tallyEncounter } from './encounters'
import { markLetter } from './marks'
import { computeScore } from './match-engine'
import { computeStandings } from './standings'
import type { AppState, Id, Match, MatchDecision, MatchKind, MatchStatus, Side, Tournament, TournamentMode, TournamentPhase } from './types'

export const PUBLISHED_VERSION = 1

export interface PubPerson {
  id: Id
  name: string
  dojo: string
  country?: string
  teamId?: Id
  withdrawn?: boolean
}

export interface PubTeam {
  id: Id
  name: string
  dojo: string
  country?: string
  /** Player ids of every member, reserves included. */
  members: Id[]
  withdrawn?: boolean
}

export interface PubStandingRow {
  entrantId: Id
  rank: number
  played: number
  wins: number
  draws: number
  losses: number
  boutWins: number
  ipponsScored: number
  ipponsConceded: number
  tieBreakWins: number
  qualifies: boolean
  /** Absolute tie on a qualifying place, still to be broken. */
  tied: boolean
}

export interface PubPool {
  id: Id
  name: string
  standings: PubStandingRow[]
}

export interface PubSide {
  /** Player (individual) or team (team mode) the side belongs to. */
  entrantId: Id | null
  /** The fighter; null while hidden (open team order) or not chosen yet (representative bout). */
  playerId: Id | null
  name: string
  dojo: string
  country?: string
}

export interface PubMatch {
  id: Id
  courtId: Id
  /** Position in the overall fight order. */
  order: number
  kind: MatchKind
  /** e.g. "Pool A", "Semi-final", "Tie-breaker" */
  label: string
  /** Team bouts: "Senpo", "Daihyo-sen", … */
  positionLabel: string | null
  teamMatchId?: Id
  status: MatchStatus
  aka: PubSide
  shiro: PubSide
  /** Approved result; marks are letters, e.g. "MK", "H", "○○" for fusen-gachi. */
  result: { winner: Side | null; decision: MatchDecision; akaIppons: number; shiroIppons: number; akaMarks: string; shiroMarks: string } | null
}

export interface PubEncounter {
  id: Id
  courtId: Id
  kind: MatchKind
  label: string
  akaTeamId: Id
  shiroTeamId: Id
  status: 'scheduled' | 'in-progress' | 'completed'
  boutIds: Id[]
  akaWins: number
  shiroWins: number
  akaIppons: number
  shiroIppons: number
  winner: Side | null
  /** The order can still change (first bout not started). */
  lineupOpen: boolean
}

export interface PubBracketNode {
  id: Id
  round: number
  slot: number
  aka: Id | null
  shiro: Id | null
  winner: Id | null
  /** Match id (individual) or encounter id (team). */
  matchId: Id | null
  next: Id | null
}

export interface PubCourt {
  id: Id
  name: string
  /** Exactly what that court's TV shows (never the clock). */
  view: PublicView
}

export interface PublishedSnapshot {
  version: typeof PUBLISHED_VERSION
  publishedAt: number
  tournament: {
    id: Id
    name: string
    date: string
    mode: TournamentMode
    phase: TournamentPhase
    teamSize?: number
    advancePerPool: number
  }
  courts: PubCourt[]
  players: PubPerson[]
  teams: PubTeam[]
  pools: PubPool[]
  /** All matches (individual matches and team bouts), in fight order. */
  matches: PubMatch[]
  encounters: PubEncounter[]
  bracket: { rounds: number; nodes: PubBracketNode[] } | null
  /** 1st, 2nd and both semi-final losers (3rd), once known. */
  podium: { place: 1 | 2 | 3; entrantId: Id }[]
}

/** Private data for the worker: PIN check and each team's own open orders. */
export interface PublishedSecret {
  salt: string
  /** teamId -> sha256 hex of `${salt}:${teamId}:${pin}` */
  pinHashes: Record<Id, string>
  /** teamMatchId -> teamId -> current order (only encounters that have not started) */
  openLineups: Record<Id, Record<Id, (Id | null)[]>>
}

export interface PublishPayload {
  slug: string
  snapshot: PublishedSnapshot
  secret: PublishedSecret
}

/** A captain's order submission, as stored by the worker and pulled by the laptop. */
export interface LineupSubmission {
  id: string
  teamId: Id
  teamMatchId: Id
  lineup: (Id | null)[]
  at: number
}

/** Online page address for a tournament: short and stable. */
export const slugFor = (t: Tournament): string => t.id.replace(/^tour_/, '')

const marksOf = (m: Match, side: Side): string => computeScore(m.events)[side].marks.map((mk) => markLetter(mk) || '○').join('')

function pubSide(t: Tournament, m: Match, side: Side, hidden: boolean): PubSide {
  const entrantId = entrantOf(t, m, side)
  const team = m[side].teamId ? t.teams[m[side].teamId!] : undefined
  const player = !hidden && m[side].playerId ? t.players[m[side].playerId!] : undefined
  const country = player?.country ?? team?.country
  const out: PubSide = {
    entrantId,
    playerId: player?.id ?? null,
    name: player?.name ?? (team ? team.name : '—'),
    dojo: team?.name ?? player?.dojo ?? ''
  }
  if (country) out.country = country
  return out
}

/** Final standings: champion, runner-up, and both semi-final losers. */
export function podium(t: Tournament): { place: 1 | 2 | 3; entrantId: Id }[] {
  const b = t.bracket
  if (!b) return []
  const nodes = Object.values(b.nodes)
  const final = nodes.find((n) => !n.next)
  const out: { place: 1 | 2 | 3; entrantId: Id }[] = []
  const loser = (n: { akaEntrantId: Id | null; shiroEntrantId: Id | null; winnerEntrantId: Id | null }) =>
    n.winnerEntrantId ? (n.akaEntrantId === n.winnerEntrantId ? n.shiroEntrantId : n.akaEntrantId) : null
  if (final?.winnerEntrantId) {
    out.push({ place: 1, entrantId: final.winnerEntrantId })
    const second = loser(final)
    if (second) out.push({ place: 2, entrantId: second })
  }
  for (const semi of nodes.filter((n) => n.round === b.rounds - 2)) {
    const third = loser(semi)
    if (third) out.push({ place: 3, entrantId: third })
  }
  return out
}

export function toPublished(state: AppState, now: number): PublishedSnapshot | null {
  const t = state.tournament
  if (!t) return null
  const openEncounter = new Set(Object.values(t.teamMatches).filter((tm) => encounterOpen(t, tm)).map((tm) => tm.id))

  const matches: PubMatch[] = t.matchQueue.flatMap((id, order) => {
    const m = t.matches[id]
    if (!m) return []
    const hidden = Boolean(m.teamMatchId && openEncounter.has(m.teamMatchId))
    const pm: PubMatch = {
      id: m.id,
      courtId: m.courtId,
      order,
      kind: m.kind,
      label: matchLabel(t, m),
      positionLabel: positionLabel(t, m),
      status: m.status,
      aka: pubSide(t, m, 'aka', hidden),
      shiro: pubSide(t, m, 'shiro', hidden),
      result: m.result
        ? {
            winner: m.result.winner,
            decision: m.result.decision,
            akaIppons: m.result.akaIppons,
            shiroIppons: m.result.shiroIppons,
            akaMarks: m.result.decision === 'kiken' ? '' : marksOf(m, 'aka'),
            shiroMarks: m.result.decision === 'kiken' ? '' : marksOf(m, 'shiro')
          }
        : null
    }
    if (m.teamMatchId) pm.teamMatchId = m.teamMatchId
    return [pm]
  })

  const snapshot: PublishedSnapshot = {
    version: PUBLISHED_VERSION,
    publishedAt: now,
    tournament: { id: t.id, name: t.name, date: t.date, mode: t.mode, phase: t.phase, advancePerPool: t.advancePerPool },
    courts: t.courts.map((c) => ({ id: c.id, name: c.name, view: toPublicView(state, c.id) })),
    players: Object.values(t.players).map((p) => {
      const out: PubPerson = { id: p.id, name: p.name, dojo: p.dojo }
      if (p.country) out.country = p.country
      if (p.teamId) out.teamId = p.teamId
      if (p.withdrawn) out.withdrawn = true
      return out
    }),
    teams: Object.values(t.teams).map((team) => {
      const out: PubTeam = { id: team.id, name: team.name, dojo: team.dojo, members: team.members }
      if (team.country) out.country = team.country
      if (team.withdrawn) out.withdrawn = true
      return out
    }),
    pools: t.pools.map((pool) => ({
      id: pool.id,
      name: pool.name,
      standings: computeStandings(t, pool).map((r) => ({
        entrantId: r.entrantId,
        rank: r.rank,
        played: r.played,
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        boutWins: r.boutWins,
        ipponsScored: r.ipponsScored,
        ipponsConceded: r.ipponsConceded,
        tieBreakWins: r.tieBreakWins,
        qualifies: r.rank <= t.advancePerPool,
        tied: r.tiedWith.length > 0 && r.rank <= t.advancePerPool
      }))
    })),
    matches,
    encounters: Object.values(t.teamMatches).map((tm) => {
      const s = tallyEncounter(t, tm)
      const first = t.matches[tm.boutIds[0]!]
      return {
        id: tm.id,
        courtId: tm.courtId,
        kind: tm.kind,
        label: first ? matchLabel(t, first) : '',
        akaTeamId: tm.akaTeamId,
        shiroTeamId: tm.shiroTeamId,
        status: tm.status,
        boutIds: tm.boutIds,
        akaWins: s.akaWins,
        shiroWins: s.shiroWins,
        akaIppons: s.akaIppons,
        shiroIppons: s.shiroIppons,
        winner: tm.result?.winner ?? null,
        lineupOpen: openEncounter.has(tm.id)
      }
    }),
    bracket: t.bracket
      ? {
          rounds: t.bracket.rounds,
          nodes: Object.values(t.bracket.nodes).map((n) => ({
            id: n.id,
            round: n.round,
            slot: n.slot,
            aka: n.akaEntrantId,
            shiro: n.shiroEntrantId,
            winner: n.winnerEntrantId,
            matchId: n.matchId,
            next: n.next?.nodeId ?? null
          }))
        }
      : null,
    podium: podium(t)
  }
  if (t.teamSize) snapshot.tournament.teamSize = t.teamSize
  return snapshot
}

/** Secret part: PIN hashes are computed by the caller (async WebCrypto). */
export function openLineups(t: Tournament): PublishedSecret['openLineups'] {
  const out: PublishedSecret['openLineups'] = {}
  for (const tm of Object.values(t.teamMatches)) {
    if (!encounterOpen(t, tm)) continue
    out[tm.id] = { [tm.akaTeamId]: lineupOf(t, tm, 'aka'), [tm.shiroTeamId]: lineupOf(t, tm, 'shiro') }
  }
  return out
}

export async function pinHash(salt: string, teamId: Id, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${teamId}:${pin}`)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

