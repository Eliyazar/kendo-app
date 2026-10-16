// Small demo tournament used during development to exercise the IPC loop
// before the setup / import screens exist.

import type { Match, MatchConfig, MatchKind, Player, Tournament } from './types'

const POOL_CONFIG: MatchConfig = { durationMs: 3 * 60_000, ipponsToWin: 2, enchoOnDraw: false }
const BRACKET_CONFIG: MatchConfig = { durationMs: 3 * 60_000, ipponsToWin: 2, enchoOnDraw: true }

export function newMatch(id: string, kind: MatchKind, akaId: string | null, shiroId: string | null, config: MatchConfig): Match {
  return {
    id,
    kind,
    aka: { playerId: akaId },
    shiro: { playerId: shiroId },
    config,
    status: 'scheduled',
    timer: { mode: 'countdown', durationMs: config.durationMs, elapsedMs: 0, runningSince: null },
    encho: false,
    events: []
  }
}

export function createDemoTournament(now: number): Tournament {
  const players: Player[] = [
    { id: 'p1', name: 'Takeshi Yamada', dojo: 'Kenshinkan' },
    { id: 'p2', name: 'Anna Novak', dojo: 'Mumeishi' },
    { id: 'p3', name: 'Lukas Berger', dojo: 'Kendo Wien' },
    { id: 'p4', name: 'Sofia Rossi', dojo: 'Shinbukan' }
  ]
  const matches: Match[] = [
    { ...newMatch('m1', 'pool', 'p1', 'p2', POOL_CONFIG), poolId: 'A' },
    { ...newMatch('m2', 'pool', 'p3', 'p4', POOL_CONFIG), poolId: 'A' },
    newMatch('m3', 'bracket', 'p1', 'p3', BRACKET_CONFIG)
  ]
  return {
    id: 'demo',
    name: 'Demo Taikai',
    date: new Date(now).toISOString().slice(0, 10),
    mode: 'individual',
    phase: 'pools',
    poolMatchConfig: POOL_CONFIG,
    bracketMatchConfig: BRACKET_CONFIG,
    advancePerPool: 2,
    players: Object.fromEntries(players.map((p) => [p.id, p])),
    teams: {},
    pools: [{ id: 'A', name: 'Pool A', entrantIds: players.map((p) => p.id) }],
    matches: Object.fromEntries(matches.map((m) => [m.id, m])),
    teamMatches: {},
    bracket: null,
    matchQueue: matches.map((m) => m.id),
    activeMatchId: 'm1',
    createdAt: now,
    updatedAt: now
  }
}
