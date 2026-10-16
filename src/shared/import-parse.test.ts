import { describe, expect, it } from 'vitest'
import { rowsToEntrants } from './import-parse'

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
