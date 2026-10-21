// Generates a realistic sample PublishPayload (see src/shared/published.ts) and POSTs it to a running worker.
//
//   node scripts/sample-publish.mjs [individual|team] [--url http://localhost:8787] [--key test-key] [--slug demo0001] [--print]
//
// --print writes the JSON to stdout instead of posting it (handy for curl).
// Team variant: two teams, captain PINs "123456" (Alpha) and "567890" (Beta), one open encounter.
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const variant = args.find((a) => a === 'individual' || a === 'team') ?? 'individual'
const url = flag('url', 'http://localhost:8787')
const key = flag('key', 'test-key')
const slug = flag('slug', variant === 'team' ? 'demoteam01' : 'demoind001')
const print = args.includes('--print')

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex')
const now = Date.now()

const person = (name, dojo, country) => ({ name, dojo, ...(country ? { country } : {}) })
const emptyView = (courtName) => ({ tournamentName: 'Sample Open 2026', courtName, multiCourt: true, match: null, team: null, nextMatch: null, champion: null })

function pubSide(entrantId, playerId, name, dojo, country) {
  return { entrantId, playerId, name, dojo, ...(country ? { country } : {}) }
}

function individual() {
  const players = [
    { id: 'p1', name: 'Tanaka Ren', dojo: 'Seibukan', country: 'JPN' },
    { id: 'p2', name: 'Ivanov Petar', dojo: 'Sofia Kendo', country: 'BUL' },
    { id: 'p3', name: 'Muller Jonas', dojo: 'Berlin Dojo', country: 'GER' },
    { id: 'p4', name: 'Rossi Luca', dojo: 'Roma Kendo', country: 'ITA' },
    { id: 'p5', name: 'Kim Minjun', dojo: 'Haedong', country: 'KOR' },
    { id: 'p6', name: 'Dupont Louis', dojo: 'Paris Kendo', country: 'FRA' }
  ]
  const P = Object.fromEntries(players.map((p) => [p.id, p]))
  const side = (id) => pubSide(id, id, P[id].name, P[id].dojo, P[id].country)
  const mk = (id, order, courtId, label, status, a, b, result) => ({
    id, courtId, order, kind: 'pool', label, positionLabel: null, status, aka: side(a), shiro: side(b), result: result ?? null
  })
  const matches = [
    mk('m1', 0, 'c1', 'Pool A', 'completed', 'p1', 'p2', { winner: 'aka', decision: 'ippon', akaIppons: 2, shiroIppons: 0, akaMarks: 'MK', shiroMarks: '' }),
    mk('m2', 1, 'c2', 'Pool B', 'completed', 'p4', 'p5', { winner: null, decision: 'hikiwake', akaIppons: 0, shiroIppons: 0, akaMarks: '', shiroMarks: '' }),
    mk('m3', 2, 'c1', 'Pool A', 'in-progress', 'p1', 'p3'),
    mk('m4', 3, 'c2', 'Pool B', 'scheduled', 'p4', 'p6'),
    mk('m5', 4, 'c1', 'Pool A', 'scheduled', 'p2', 'p3'),
    mk('m6', 5, 'c2', 'Pool B', 'scheduled', 'p5', 'p6')
  ]
  const live = {
    id: 'm3',
    status: 'in-progress',
    aka: { ...person(P.p1.name, P.p1.dojo, 'JPN'), marks: [{ kind: 'technique', technique: 'D' }], ippons: 1, hansoku: 0 },
    shiro: { ...person(P.p3.name, P.p3.dojo, 'GER'), marks: [], ippons: 0, hansoku: 1 },
    encho: false,
    timeUp: false,
    winner: null,
    positionLabel: null,
    label: 'Pool A'
  }
  const row = (entrantId, rank, w, d, l, is, ic, qualifies) => ({
    entrantId, rank, played: w + d + l, wins: w, draws: d, losses: l, boutWins: 0, ipponsScored: is, ipponsConceded: ic, tieBreakWins: 0, qualifies, tied: false
  })
  return {
    slug,
    snapshot: {
      version: 1,
      publishedAt: now,
      tournament: { id: `tour_${slug}`, name: 'Sample Open 2026', date: '2026-10-24', mode: 'individual', phase: 'pools', advancePerPool: 1 },
      courts: [
        { id: 'c1', name: 'Shiai-jo A', view: { ...emptyView('Shiai-jo A'), match: live, nextMatch: { aka: person(P.p2.name, P.p2.dojo, 'BUL'), shiro: person(P.p3.name, P.p3.dojo, 'GER') } } },
        { id: 'c2', name: 'Shiai-jo B', view: { ...emptyView('Shiai-jo B'), nextMatch: { aka: person(P.p4.name, P.p4.dojo, 'ITA'), shiro: person(P.p6.name, P.p6.dojo, 'FRA') } } }
      ],
      players,
      teams: [],
      pools: [
        { id: 'poolA', name: 'Pool A', standings: [row('p1', 1, 1, 0, 0, 2, 0, true), row('p3', 2, 0, 0, 0, 0, 0, false), row('p2', 3, 0, 0, 1, 0, 2, false)] },
        { id: 'poolB', name: 'Pool B', standings: [row('p4', 1, 0, 1, 0, 0, 0, true), row('p5', 2, 0, 1, 0, 0, 0, false), row('p6', 3, 0, 0, 0, 0, 0, false)] }
      ],
      matches,
      encounters: [],
      bracket: null,
      podium: []
    },
    secret: { salt: 'unused', pinHashes: {}, openLineups: {} }
  }
}

function team() {
  const salt = 'sample-salt-42'
  const members = {
    tA: [['a1', 'Sato Kenji'], ['a2', 'Suzuki Ryo'], ['a3', 'Takeda Yuki'], ['a4', 'Abe Shun']],
    tB: [['b1', 'Costa Marco'], ['b2', 'Silva Diego'], ['b3', 'Lopez Mateo']]
  }
  const teams = [
    { id: 'tA', name: 'Alpha Kendo Club', dojo: 'Alpha Kendo Club', country: 'JPN', members: members.tA.map((m) => m[0]) },
    { id: 'tB', name: 'Beta Dojo', dojo: 'Beta Dojo', country: 'BRA', members: members.tB.map((m) => m[0]) }
  ]
  const players = [
    ...members.tA.map(([id, name]) => ({ id, name, dojo: 'Alpha Kendo Club', country: 'JPN', teamId: 'tA' })),
    ...members.tB.map(([id, name]) => ({ id, name, dojo: 'Beta Dojo', country: 'BRA', teamId: 'tB' }))
  ]
  const positions = ['Senpo', 'Chuken', 'Taisho']
  const matches = positions.map((pos, i) => ({
    id: `bout${i}`,
    courtId: 'c1',
    order: i,
    kind: 'pool',
    label: 'Pool A',
    positionLabel: pos,
    teamMatchId: 'tm1',
    status: 'scheduled',
    aka: pubSide('tA', null, 'Alpha Kendo Club', 'Alpha Kendo Club', 'JPN'),
    shiro: pubSide('tB', null, 'Beta Dojo', 'Beta Dojo', 'BRA'),
    result: null
  }))
  const row = (entrantId, rank) => ({
    entrantId, rank, played: 0, wins: 0, draws: 0, losses: 0, boutWins: 0, ipponsScored: 0, ipponsConceded: 0, tieBreakWins: 0, qualifies: rank === 1, tied: false
  })
  return {
    slug,
    snapshot: {
      version: 1,
      publishedAt: now,
      tournament: { id: `tour_${slug}`, name: 'Sample Team Cup', date: '2026-10-24', mode: 'team', phase: 'pools', teamSize: 3, advancePerPool: 1 },
      courts: [
        {
          id: 'c1',
          name: 'Shiai-jo A',
          view: {
            ...emptyView('Shiai-jo A'),
            multiCourt: false,
            nextMatch: { aka: { name: '—', dojo: 'Alpha Kendo Club', country: 'JPN' }, shiro: { name: '—', dojo: 'Beta Dojo', country: 'BRA' } }
          }
        }
      ],
      players,
      teams,
      pools: [{ id: 'poolA', name: 'Pool A', standings: [row('tA', 1), row('tB', 2)] }],
      matches,
      encounters: [
        {
          id: 'tm1', courtId: 'c1', kind: 'pool', label: 'Pool A', akaTeamId: 'tA', shiroTeamId: 'tB', status: 'scheduled',
          boutIds: matches.map((m) => m.id), akaWins: 0, shiroWins: 0, akaIppons: 0, shiroIppons: 0, winner: null, lineupOpen: true
        }
      ],
      bracket: null,
      podium: []
    },
    secret: {
      salt,
      pinHashes: { tA: sha256(`${salt}:tA:123456`), tB: sha256(`${salt}:tB:567890`) },
      openLineups: { tm1: { tA: ['a1', 'a2', 'a3'], tB: [null, null, null] } }
    }
  }
}

const payload = variant === 'team' ? team() : individual()

if (print) {
  process.stdout.write(JSON.stringify(payload))
} else {
  const res = await fetch(`${url}/api/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  console.log(`${variant} -> ${url}/api/publish : ${res.status} ${await res.text()}`)
  console.log(`Open: ${url}/t/${slug}`)
  if (!res.ok) process.exit(1)
}
