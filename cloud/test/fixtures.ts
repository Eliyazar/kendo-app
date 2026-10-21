import type { PublishPayload, PublishedSecret, PublishedSnapshot } from '../src/contract'

/** A small team tournament: teams A and B (team size 3, one reserve each), one open encounter. */
export function teamSnapshot(): PublishedSnapshot {
  const view = { tournamentName: 'Test Cup', courtName: 'Court A', multiCourt: false, match: null, team: null, nextMatch: null, champion: null }
  const person = (id: string, name: string, teamId: string) => ({ id, name, dojo: teamId === 'tA' ? 'Alpha' : 'Beta', teamId })
  const side = (teamId: string, name: string) => ({ entrantId: teamId, playerId: null, name, dojo: name })
  return {
    version: 1,
    publishedAt: 1_700_000_000_000,
    tournament: { id: 'tour_x', name: 'Test Cup', date: '2026-10-20', mode: 'team', phase: 'pools', teamSize: 3, advancePerPool: 1 },
    courts: [{ id: 'c1', name: 'Court A', view }],
    players: [
      person('a1', 'Aoki', 'tA'),
      person('a2', 'Abe', 'tA'),
      person('a3', 'Ando', 'tA'),
      person('a4', 'Arai', 'tA'),
      person('b1', 'Baba', 'tB'),
      person('b2', 'Bando', 'tB'),
      person('b3', 'Bessho', 'tB')
    ],
    teams: [
      { id: 'tA', name: 'Alpha', dojo: 'Alpha', members: ['a1', 'a2', 'a3', 'a4'] },
      { id: 'tB', name: 'Beta', dojo: 'Beta', members: ['b1', 'b2', 'b3'] }
    ],
    pools: [],
    matches: [0, 1, 2].map((i) => ({
      id: `m${i}`,
      courtId: 'c1',
      order: 10 + i,
      kind: 'pool' as const,
      label: 'Pool A',
      positionLabel: ['Senpo', 'Chuken', 'Taisho'][i]!,
      teamMatchId: 'tm1',
      status: 'scheduled' as const,
      aka: side('tA', 'Alpha'),
      shiro: side('tB', 'Beta'),
      result: null
    })),
    encounters: [
      {
        id: 'tm1',
        courtId: 'c1',
        kind: 'pool',
        label: 'Pool A',
        akaTeamId: 'tA',
        shiroTeamId: 'tB',
        status: 'scheduled',
        boutIds: ['m0', 'm1', 'm2'],
        akaWins: 0,
        shiroWins: 0,
        akaIppons: 0,
        shiroIppons: 0,
        winner: null,
        lineupOpen: true
      },
      {
        id: 'tm0',
        courtId: 'c1',
        kind: 'pool',
        label: 'Pool A',
        akaTeamId: 'tB',
        shiroTeamId: 'tA',
        status: 'in-progress',
        boutIds: [],
        akaWins: 0,
        shiroWins: 0,
        akaIppons: 0,
        shiroIppons: 0,
        winner: null,
        lineupOpen: false
      }
    ],
    bracket: null,
    podium: []
  }
}

export function teamSecret(): PublishedSecret {
  return { salt: 'salt', pinHashes: {}, openLineups: { tm1: { tA: ['a1', null, null], tB: [null, null, null] } } }
}

export function teamPayload(): PublishPayload {
  return { slug: 'testcup1', snapshot: teamSnapshot(), secret: { ...teamSecret(), pinHashes: { tA: 'a'.repeat(64), tB: 'b'.repeat(64) } } }
}
