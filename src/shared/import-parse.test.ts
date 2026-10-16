import { readFileSync } from 'node:fs'
import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { rowsToEntrants } from './import-parse'
import { validateSetup } from './setup'

const sample = (name: string) =>
  rowsToEntrants(Papa.parse<string[]>(readFileSync(`samples/${name}`, 'utf8'), { skipEmptyLines: true }).data)

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
