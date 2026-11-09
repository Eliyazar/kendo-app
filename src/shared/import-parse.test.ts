import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { rowsToEntrants } from './import-parse'
import { validateSetup } from './setup'

const sample = (name: string) =>
  rowsToEntrants(Papa.parse<string[]>(readFileSync(`samples/${name}`, 'utf8'), { skipEmptyLines: true }).data)

/** Same reading as src/main/import.ts: first sheet, cell text. */
async function xlsxRows(file: string): Promise<string[][]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const rows: string[][] = []
  wb.worksheets[0]!.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = []
    for (let c = 1; c <= row.cellCount; c++) cells.push(row.getCell(c).text)
    rows.push(cells)
  })
  return rows
}

describe('Excel test files', () => {
  it('individual file: 18 people, every country recognised, valid with the suggested settings', async () => {
    const r = rowsToEntrants(await xlsxRows('samples/test-individual.xlsx'))
    expect(r.warnings).toEqual([])
    expect(r.entrants).toHaveLength(18)
    expect(new Set(r.entrants.map((e) => e.country))).toEqual(new Set(['BUL', 'SRB', 'GRE', 'ROU', 'MKD', 'TUR']))
    expect(r.entrants.filter((e) => e.seed).map((e) => e.seed)).toEqual([1, 3, 2, 4])
    const setup = { name: 'Test', date: '2026-11-21', mode: 'individual', poolSize: 3, advancePerPool: 2, poolMatchMinutes: 3, bracketMatchMinutes: 4, courts: 2, entrants: r.entrants }
    expect(typeof validateSetup(setup)).toBe('object')
  })

  it('team file: 8 teams with reserves and one short team, valid for teams of 5', async () => {
    const r = rowsToEntrants(await xlsxRows('samples/test-teams.xlsx'))
    expect(r.warnings).toEqual([])
    const sizes = new Map<string, number>()
    for (const e of r.entrants) sizes.set(e.team!, (sizes.get(e.team!) ?? 0) + 1)
    expect(sizes.size).toBe(8)
    expect(sizes.get('Sofia Kendo Club A')).toBe(7)
    expect(sizes.get('Athens Kendo')).toBe(4)
    const setup = { name: 'Test', date: '2026-11-22', mode: 'team', teamSize: 5, poolSize: 4, advancePerPool: 2, poolMatchMinutes: 3, bracketMatchMinutes: 4, courts: 2, entrants: r.entrants }
    expect(typeof validateSetup(setup)).toBe('object')
  })
})

describe('sample files', () => {
  it('individual sample is a valid tournament', () => {
    const r = sample('participants-individual.csv')
    expect(r.warnings).toEqual([])
    expect(r.entrants[0]).toEqual({ name: 'Takeshi Yamada', dojo: 'Kenshinkan', grade: '4 Dan', seed: 1 })
    const setup = { name: 'X', date: '2026-10-17', mode: 'individual', poolSize: 3, advancePerPool: 2, poolMatchMinutes: 3, bracketMatchMinutes: 3, entrants: r.entrants }
    expect(typeof validateSetup(setup)).toBe('object')
  })

  it('team sample is a valid 3-person team tournament', () => {
    const r = sample('participants-team.csv')
    expect(r.entrants.every((e) => e.team)).toBe(true)
    const setup = { name: 'X', date: '2026-10-17', mode: 'team', teamSize: 3, poolSize: 2, advancePerPool: 1, poolMatchMinutes: 3, bracketMatchMinutes: 3, entrants: r.entrants }
    expect(typeof validateSetup(setup)).toBe('object')
  })
})

describe('rowsToEntrants', () => {
  it('maps header aliases and splits first/last names', () => {
    const r = rowsToEntrants([
      ['Vorname', 'Nachname', 'Verein', 'Grade'],
      ['Anna', 'Novak', 'Mumeishi', '2 Dan'],
      ['  Lukas ', 'Berger', 'Kendo   Wien', '']
    ])
    expect(r.entrants).toEqual([
      { name: 'Anna Novak', dojo: 'Mumeishi', grade: '2 Dan' },
      { name: 'Lukas Berger', dojo: 'Kendo Wien' }
    ])
    expect(r.warnings).toEqual([])
  })

  it('falls back to Name, Dojo, Team without a header', () => {
    const r = rowsToEntrants([
      ['Takeshi Yamada', 'Kenshinkan', 'Kenshinkan A'],
      ['Sofia Rossi', 'Shinbukan', '']
    ])
    expect(r.entrants[0]).toEqual({ name: 'Takeshi Yamada', dojo: 'Kenshinkan', team: 'Kenshinkan A' })
    expect(r.entrants).toHaveLength(2)
    expect(r.warnings[0]).toMatch(/No header/)
  })

  it('skips blank names and duplicates with warnings', () => {
    const r = rowsToEntrants([
      ['Name', 'Club', 'Seed'],
      ['A', 'X', '1'],
      ['', 'X', ''],
      ['a', 'x', ''],
      [],
      ['B', 'Y', 'abc']
    ])
    expect(r.entrants).toEqual([
      { name: 'A', dojo: 'X', seed: 1 },
      { name: 'B', dojo: 'Y' }
    ])
    expect(r.warnings).toHaveLength(2)
  })
})

describe('full rehearsal with the Excel test files', () => {
  const run = async (file: string, extra: Record<string, unknown>) => {
    const { initialState, reduceApp } = await import('./reducer')
    const { podium } = await import('./published')
    const entrants = rowsToEntrants(await xlsxRows(file)).entrants
    let clock = 1_000_000
    let s = reduceApp(initialState(), { type: 'CREATE_TOURNAMENT', setup: { name: 'Rehearsal', date: '2026-11-21', advancePerPool: 2, poolMatchMinutes: 3, bracketMatchMinutes: 4, courts: 2, entrants, drawSeed: 5, ...extra } as never }, clock).state
    const act = (a: Parameters<typeof reduceApp>[1]) => (s = reduceApp(s, a, (clock += 1000)).state)
    const playCourts = () => {
      for (let guard = 0; guard < 500; guard++) {
        const t = s.tournament!
        const court = t.courts.find((c) => c.activeMatchId)
        if (!court) return
        const courtId = court.id
        const m = t.matches[court.activeMatchId!]!
        if (m.representative && !m.aka.playerId) {
          act({ type: 'SET_REPRESENTATIVE', side: 'aka', playerId: t.teams[m.aka.teamId!]!.members[0]!, courtId })
          act({ type: 'SET_REPRESENTATIVE', side: 'shiro', playerId: t.teams[m.shiro.teamId!]!.members[0]!, courtId })
        }
        const cur = s.tournament!.matches[m.id]!
        if (!cur.aka.playerId || !cur.shiro.playerId) act({ type: 'FUSEN_GACHI', side: cur.aka.playerId ? 'aka' : 'shiro', courtId })
        else {
          // Tie-breakers follow a fixed ranking (lower id wins), so they settle instead of repeating a circle.
          const ids = [cur.aka.teamId ?? cur.aka.playerId!, cur.shiro.teamId ?? cur.shiro.playerId!]
          const side = cur.kind === 'tie-breaker' && ids[1]! < ids[0]! ? 'shiro' : 'aka'
          act({ type: 'ADD_IPPON', side, technique: 'M', courtId })
          if (s.tournament!.matches[m.id]!.status !== 'awaiting-confirmation') act({ type: 'ADD_IPPON', side, technique: 'K', courtId })
        }
        act({ type: 'APPROVE_MATCH', courtId })
      }
    }
    playCourts()
    // Break any ties with tie-breakers (first entrant wins), then lock.
    const { unresolvedTies } = await import('./standings')
    for (let i = 0; i < 5 && unresolvedTies(s.tournament!).length; i++) {
      for (const tie of unresolvedTies(s.tournament!)) act({ type: 'GENERATE_TIE_BREAKER', poolId: tie.poolId, entrantIds: tie.entrantIds })
      playCourts()
    }
    act({ type: 'LOCK_POOLS' })
    playCourts()
    return { t: s.tournament!, podium: podium(s.tournament!) }
  }

  it('individual: pools on 2 courts, bracket with byes, 1st/2nd/3rd/3rd', async () => {
    const { t, podium } = await run('samples/test-individual.xlsx', { mode: 'individual', poolSize: 3 })
    expect(t.pools).toHaveLength(6)
    expect(new Set(Object.values(t.matches).map((m) => m.courtId)).size).toBe(2)
    expect(t.phase).toBe('finished')
    expect(podium.map((p) => p.place)).toEqual([1, 2, 3, 3])
  })

  it('teams of 5: reserves, fusen-gachi for the short team, 1st/2nd/3rd/3rd', async () => {
    const { t, podium } = await run('samples/test-teams.xlsx', { mode: 'team', teamSize: 5, poolSize: 4 })
    const athens = Object.values(t.teams).find((x) => x.name === 'Athens Kendo')!
    expect(athens.order[4]).toBeNull()
    expect(Object.values(t.matches).some((m) => m.result?.decision === 'fusen-gachi')).toBe(true)
    expect(t.phase).toBe('finished')
    expect(podium.map((p) => p.place)).toEqual([1, 2, 3, 3])
  })
})
