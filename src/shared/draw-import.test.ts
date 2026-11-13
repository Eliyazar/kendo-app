import { describe, expect, it } from 'vitest'
import {
  displayName,
  entrantKey,
  parseDate,
  parseDrawSheets,
  poolHeader,
  splitCountry,
  type DrawCategory,
  type SheetCells
} from './draw-import'

// Synthetic fixtures only (fake names), mimicking the layouts of the hand-made Excel draw sheets.

/** Build a sheet from {"B8": "text"} style addresses. */
function sheet(cells: Record<string, string>, name = 'Sheet1', file = 'draw.xlsx'): SheetCells {
  const grid: string[][] = []
  for (const [addr, text] of Object.entries(cells)) {
    const m = /^([A-Z]+)(\d+)$/.exec(addr)!
    const col = [...m[1]!].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
    const row = Number(m[2]) - 1
    while (grid.length <= row) grid.push([])
    const r = grid[row]!
    while (r.length <= col) r.push('')
    r[col] = text
  }
  return { file, sheet: name, cells: grid }
}

const EVENT = '                         3-rd International Kendo Tournament Test Cup and seminar'
const DATE = '                  07-09 November 2025'

const names = (c: DrawCategory): string[] => c.entrants.map((e) => e.name)
const byKey = (c: DrawCategory, key: string) => c.entrants.find((e) => e.key === key)

describe('helpers', () => {
  it('splits country suffixes', () => {
    expect(splitCountry('ANNA TESTOVA (BUL)')).toEqual({ name: 'ANNA TESTOVA', country: 'BUL' })
    expect(splitCountry('Ivan Test(ROM)')).toEqual({ name: 'Ivan Test', country: 'ROU' })
    expect(splitCountry('Ivan Test (MAC)').country).toBe('MKD')
    expect(splitCountry('Ivan Test (SER)').country).toBe('SRB')
    expect(splitCountry('Ivan Test (MOL)').country).toBe('MDA')
    expect(splitCountry('Ivan Test')).toEqual({ name: 'Ivan Test' })
    expect(splitCountry('Ivan Test (QQQ)')).toEqual({ name: 'Ivan Test (QQQ)', unknownSuffix: 'QQQ' })
  })

  it('builds display names and keys', () => {
    expect(displayName('  VALENTIN   TESTOV (BUL) ')).toBe('Valentin Testov')
    expect(displayName('ИВАН ПЕТРОВ')).toBe('Иван Петров')
    expect(displayName('POPESCU Ana Test')).toBe('POPESCU Ana Test')
    expect(displayName('Jean-Luc O’NEIL'.toUpperCase())).toBe('Jean-Luc O’Neil')
    expect(entrantKey(' Uroš  JOVIČIĆ (SER)')).toBe('uros jovicic')
    expect(entrantKey('MATEI TEST(MAC)')).toBe(entrantKey('Matei Test (MAC)'))
  })

  it('reads pool headers and dates', () => {
    expect(poolHeader('      Pool A')).toBe('Pool A')
    expect(poolHeader('POOL А')).toBe('Pool A') // Cyrillic A
    expect(poolHeader('POOL В')).toBe('Pool B') // Cyrillic V
    expect(poolHeader('Pool')).toBeNull()
    expect(parseDate('  07-09 November 2025')).toBe('2025-11-07')
    expect(parseDate('7 Nov 2025')).toBe('2025-11-07')
    expect(parseDate('hello')).toBeUndefined()
  })
})

describe('individual draw sheet, two pools', () => {
  const s = sheet({
    B3: EVENT,
    C4: DATE,
    B6: '   ',
    C6: '                       Senior female individual',
    D7: '       Shiai-jo A',
    B8: '                Pool A',
    E8: '                Pool B',
    B10: 'Anna Alpha', C10: 'Berta Beta',
    B11: 'Anna Alpha', C11: 'Cecil Gamma',
    B12: 'Berta Beta', C12: 'Cecil Gamma',
    E10: 'Dora Delta', F10: 'Emma Eps',
    E11: 'Dora Delta', F11: 'Fiona Zeta',
    E12: 'Gina Eta', F12: 'Fiona Zeta',
    E13: 'Gina Eta', F13: 'Dora Delta',
    E14: 'Fiona Zeta', F14: 'Emma Eps',
    E15: 'Gina Eta', F15: 'Emma Eps',
    C18: 'A1', E18: 'B1',
    C20: 'B2', E20: 'A2'
  })
  const r = parseDrawSheets([s])

  it('reads event and date', () => {
    expect(r.eventName).toBe('3-rd International Kendo Tournament Test Cup and seminar')
    expect(r.date).toBe('2025-11-07')
    expect(r.warnings).toEqual([])
  })

  it('reads category, court, pools and fight order', () => {
    expect(r.categories).toHaveLength(1)
    const c = r.categories[0]!
    expect(c.name).toBe('Senior female individual')
    expect(c.mode).toBe('individual')
    expect(c.court).toBe('A')
    expect(c.source).toEqual({ file: 'draw.xlsx', sheet: 'Sheet1' })
    expect(c.pools.map((p) => p.name)).toEqual(['Pool A', 'Pool B'])
    expect(c.pools[0]!.entrantKeys).toEqual(['anna alpha', 'berta beta', 'cecil gamma'])
    expect(c.pools[0]!.matches).toEqual([
      ['anna alpha', 'berta beta'],
      ['anna alpha', 'cecil gamma'],
      ['berta beta', 'cecil gamma']
    ])
    expect(c.pools[1]!.entrantKeys).toEqual(['dora delta', 'emma eps', 'fiona zeta', 'gina eta'])
    expect(c.pools[1]!.matches[3]).toEqual(['gina eta', 'dora delta'])
    expect(c.pools[1]!.matches).toHaveLength(6)
    expect(names(c)).toHaveLength(7)
    // Two columns, each read top to bottom: A1–B2 (left half), B1–A2 (right half).
    expect(c.bracket).toEqual([['A1', 'B2'], ['B1', 'A2']])
    expect(c.warnings).toEqual([])
  })
})

describe('four pools and a four-pairing bracket', () => {
  const s = sheet({
    B3: EVENT,
    C6: 'Veterans individual',
    D7: 'Shiai-jo B',
    B8: 'Pool A', E8: 'Pool B',
    B10: 'A One', C10: 'A Two', B11: 'A One', C11: 'A Three', B12: 'A Two', C12: 'A Three',
    E10: 'B One', F10: 'B Two', E11: 'B One', F11: 'B Three', E12: 'B Two', F12: 'B Three',
    B14: 'Pool C', E14: 'Pool D',
    B16: 'C One', C16: 'C Two', B17: 'C One', C17: 'C Three', B18: 'C Two', C18: 'C Three',
    E16: 'D One', F16: 'D Two', E17: 'D One', F17: 'D Three', E18: 'D Two', F18: 'D Three',
    B25: 'A1', F25: 'B1',
    B27: 'C2', F27: 'D2',
    B29: 'D1', F29: 'C1',
    B31: 'B2', F31: 'A2'
  })
  const c = parseDrawSheets([s]).categories[0]!

  it('assigns later pool blocks to the same category', () => {
    expect(c.name).toBe('Veterans individual')
    expect(c.court).toBe('B')
    expect(c.pools.map((p) => p.name)).toEqual(['Pool A', 'Pool B', 'Pool C', 'Pool D'])
    expect(c.pools[3]!.matches[0]).toEqual(['d one', 'd two'])
    expect(c.entrants).toHaveLength(12)
  })

  it('reads the bracket column by column: a winner meets a second of another pool', () => {
    expect(c.bracket).toEqual([['A1', 'C2'], ['D1', 'B2'], ['B1', 'D2'], ['C1', 'A2']])
    expect(c.warnings).toEqual([])
  })
})

describe('single pool without header', () => {
  const s = sheet({
    B3: EVENT,
    C4: DATE,
    C6: ' Children individual (under 12 years old)',
    C7: ' Shiai-jo A',
    C10: 'Tomas One', D10: 'Tomas Two',
    C11: 'Tomas One', D11: 'Tomas Three',
    C12: 'Tomas Four', D12: 'Tomas Three',
    C13: 'Tomas Four', D13: 'Tomas One',
    C14: 'Tomas Three', D14: 'Tomas Two',
    C15: 'Tomas Four', D15: 'Tomas Two'
  })
  const c = parseDrawSheets([s]).categories[0]!

  it('makes one Pool A', () => {
    expect(c.name).toBe('Children individual (under 12 years old)')
    expect(c.court).toBe('A')
    expect(c.pools).toHaveLength(1)
    expect(c.pools[0]!.name).toBe('Pool A')
    expect(c.pools[0]!.matches).toHaveLength(6)
    expect(c.pools[0]!.matches[0]).toEqual(['tomas one', 'tomas two'])
    expect(names(c)).toEqual(['Tomas One', 'Tomas Two', 'Tomas Three', 'Tomas Four'])
    expect(c.bracket).toEqual([])
    expect(c.warnings).toEqual([])
  })
})

describe('team composition sheet', () => {
  const s = sheet({
    B3: EVENT,
    D4: DATE,
    D6: ' Senior Teams', E6: ' Senior Teams', F6: ' Senior Teams',
    B7: ' ', D7: ' ',
    B8: 'Alpha 1', D8: 'Alpha 2', F8: 'Beta',
    B9: 'Ann Aa', D9: 'Bob Bb', F9: 'Cy Cc',
    B10: 'Ann Ab', D10: 'Bob Bc', F10: 'Cy Cd',
    B11: 'Ann Ac', D11: 'Bob Bd', F11: 'Cy Ce',
    B12: 'Ann Ad', D12: 'Bob Be', F12: 'Cy Cf',
    B13: 'Ann Ae', D13: 'Bob Bf', F13: 'Cy Cg',
    B15: 'Gamma',
    B16: 'Dee D1', B17: 'Dee D2', B18: 'Dee D3', B19: 'Dee D4', B20: 'Dee D5', B21: 'Dee D6 (SER)',
    D30: ' Junior Teams', E30: ' Junior Teams', F30: ' Junior Teams',
    B32: 'Mini 1', D32: 'MINI 2',
    B33: 'Kim K1', D33: 'KIM K4',
    B34: 'Kim K2', D34: 'KIM K5',
    B35: 'Kim K3', D35: 'KIM K6'
  })
  const r = parseDrawSheets([s])

  it('makes one team category per section', () => {
    expect(r.categories.map((c) => c.name)).toEqual(['Senior Teams', 'Junior Teams'])
    expect(r.categories.every((c) => c.mode === 'team' && c.pools.length === 0 && c.bracket.length === 0)).toBe(true)
  })

  it('reads teams in order with members, reserves and team size', () => {
    const senior = r.categories[0]!
    expect(names(senior)).toEqual(['Alpha 1', 'Alpha 2', 'Beta', 'Gamma'])
    expect(senior.entrants[0]!.members!.map((m) => m.name)).toEqual(['Ann Aa', 'Ann Ab', 'Ann Ac', 'Ann Ad', 'Ann Ae'])
    const gamma = byKey(senior, 'gamma')!
    expect(gamma.members).toHaveLength(6)
    expect(gamma.members![5]).toEqual({ name: 'Dee D6', country: 'SRB' })
    expect(senior.teamSize).toBe(5)
    expect(senior.warnings).toEqual([])
  })

  it('handles junior teams; team names keep their written casing', () => {
    const junior = r.categories[1]!
    expect(names(junior)).toEqual(['Mini 1', 'MINI 2'])
    expect(junior.entrants[1]!.members!.map((m) => m.name)).toEqual(['Kim K4', 'Kim K5', 'Kim K6'])
    expect(junior.teamSize).toBe(3)
  })
})

describe('working sheet with merged duplicate cells', () => {
  /** Put the same text in both columns, as merged cells do. */
  const dup = (col: string, next: string, row: number, text: string): Record<string, string> => ({
    [`${col}${row}`]: text,
    [`${next}${row}`]: text
  })
  const cells: Record<string, string> = {}
  const add = (o: Record<string, string>): void => void Object.assign(cells, o)

  // Category 1: Indiv Children Under 12 (B-C), pool A
  add(dup('B', 'C', 2, 'Indiv Children Under 12 '))
  add(dup('B', 'C', 3, 'NAMES'))
  ;['TIM TESTOV (BUL)', 'KATE KOSTOVA (BUL)', 'MIA MILOVA (BUL)'].forEach((n, i) => add(dup('B', 'C', 4 + i, n)))
  add(dup('B', 'C', 8, 'POOL A'))
  cells.B10 = 'TIM TESTOV (BUL)'; cells.C10 = 'Mia Milova (BUL)'
  cells.B11 = 'KATE KOSTOVA (BUL)'; cells.C11 = 'TIM TESTOV (BUL)'
  cells.B12 = 'Mia Milova(BUL)'; cells.C12 = 'KATE KOSTOVA (BUL)'

  // Category 2: Junior 1 spanning pools A (F-G) and B (I-J), Cyrillic letters in headers
  for (const [a, b] of [['F', 'G'], ['I', 'J']] as const) add(dup(a, b, 2, 'Indiv Junior 1 \n(12-14 yrs)'))
  for (const [a, b] of [['F', 'G'], ['I', 'J']] as const) add(dup(a, b, 3, 'NAMES'))
  add(dup('F', 'G', 4, 'LARA LUND (ROM)'))
  add(dup('F', 'G', 5, 'MAX MARIN(MAC)'))
  add(dup('F', 'G', 6, 'NINA NOVAK (SER)'))
  add(dup('I', 'J', 4, 'OLEG OLSEN (BUL)'))
  add(dup('I', 'J', 5, 'PAUL PAGE (BUL)'))
  add(dup('I', 'J', 6, 'RITA ROSE (BUL)'))
  add(dup('F', 'G', 8, 'POOL А'))
  add(dup('I', 'J', 8, 'POOL В'))
  cells.F10 = 'LARA LUND (ROM)'; cells.G10 = 'MAX MARIN (MAC)'
  cells.F11 = 'NINA NOVAK (SER)'; cells.G11 = 'LARA LUND (ROM)'
  cells.F12 = 'MAX MARIN (MAC)'; cells.G12 = 'NINA NOVAK (SER)'
  cells.I10 = 'OLEG OLSEN (BUL)'; cells.J10 = 'Paul Page (BUL)'
  cells.I11 = 'RITA ROSE (BUL)'; cells.J11 = 'OLEG OLSEN (BUL)'
  cells.I12 = 'PAUL PAGE (BUL)'; cells.J12 = 'RITA ROSE (BUL)'

  // Junior teams: compositions under no title, then team pool "POOL A" merged over three columns
  add(dup('F', 'G', 17, 'RED DRAGONS'))
  add(dup('I', 'J', 17, 'BLUE WHALES'))
  add(dup('L', 'M', 17, 'GREEN FROGS'))
  ;[['F', 'G'], ['I', 'J'], ['L', 'M']].forEach(([a, b], k) => {
    for (let i = 0; i < 3; i++) add(dup(a!, b!, 18 + i, `PLAYER ${'RBG'[k]}${i + 1}`))
  })
  cells.G23 = 'POOL A'; cells.H23 = 'POOL A'; cells.I23 = 'POOL A'
  cells.G25 = 'RED DRAGONS'; cells.H25 = 'BLUE WHALES'; cells.I25 = 'BLUE WHALES'
  cells.G26 = 'GREEN FROGS'; cells.H26 = 'RED DRAGONS'; cells.I26 = 'RED DRAGONS'
  cells.G27 = 'BLUE WHALES'; cells.H27 = 'GREEN FROGS'; cells.I27 = 'GREEN FROGS'
  cells.G28 = 'MIXED BAG '; cells.H28 = 'RED DRAGONS'; cells.I28 = 'RED DRAGONS'

  const r = parseDrawSheets([sheet(cells, 'деца')])
  const [kids, junior, teams] = r.categories

  it('finds three categories', () => {
    expect(r.categories.map((c) => c.name)).toEqual(['Indiv Children Under 12', 'Indiv Junior 1 (12-14 yrs)', 'Teams'])
  })

  it('never turns merged duplicates into matches', () => {
    expect(kids!.pools).toHaveLength(1)
    expect(kids!.pools[0]!.matches).toEqual([
      ['tim testov', 'mia milova'],
      ['kate kostova', 'tim testov'],
      ['mia milova', 'kate kostova']
    ])
    expect(kids!.warnings).toEqual([])
  })

  it('normalises names, countries and keys', () => {
    expect(names(kids!)).toEqual(['Tim Testov', 'Kate Kostova', 'Mia Milova'])
    expect(kids!.entrants.every((e) => e.country === 'BUL')).toBe(true)
    expect(byKey(junior!, 'lara lund')!.country).toBe('ROU')
    expect(byKey(junior!, 'max marin')!.country).toBe('MKD')
    expect(byKey(junior!, 'nina novak')!.country).toBe('SRB')
    expect(byKey(junior!, 'paul page')!.name).toBe('Paul Page')
  })

  it('maps Cyrillic pool letters and keeps both pools in the junior category', () => {
    expect(junior!.pools.map((p) => p.name)).toEqual(['Pool A', 'Pool B'])
    expect(junior!.pools[1]!.matches[0]).toEqual(['oleg olsen', 'paul page'])
    expect(junior!.entrants).toHaveLength(6)
  })

  it('builds a team category from compositions and team pools', () => {
    expect(teams!.mode).toBe('team')
    expect(names(teams!)).toEqual(['RED DRAGONS', 'BLUE WHALES', 'GREEN FROGS', 'Mixed Bag'])
    expect(teams!.entrants[0]!.members!.map((m) => m.name)).toEqual(['Player R1', 'Player R2', 'Player R3'])
    expect(teams!.teamSize).toBe(3)
    expect(teams!.pools[0]!.matches).toEqual([
      ['red dragons', 'blue whales'],
      ['green frogs', 'red dragons'],
      ['blue whales', 'green frogs'],
      ['mixed bag', 'red dragons']
    ])
    expect(teams!.warnings).toContain('Team "Mixed Bag" has no members')
  })
})

describe('warnings', () => {
  it('flags incomplete round robin, double entries, bad bracket refs and odd ref count', () => {
    const s = sheet({
      C6: 'Senior male individual',
      B8: 'Pool A', E8: 'Pool B',
      B10: 'Ann A', C10: 'Bob B',
      B11: 'Ann A', C11: 'Cid C', // Bob and Cid never meet
      E10: 'Dan D', F10: 'Eve E',
      E11: 'Dan D', F11: 'Ann A', // Ann is in two pools
      E12: 'Eve E', F12: 'Ann A',
      C18: 'A1', E18: 'B4',
      C20: 'C1', E20: 'A9',
      C22: 'B1'
    })
    const c = parseDrawSheets([s]).categories[0]!
    const w = c.warnings.join('\n')
    expect(w).toMatch(/Pool A: incomplete round robin.*Bob B.*Cid C/)
    expect(w).toMatch(/"Ann A" appears in 2 pools/)
    expect(w).toMatch(/B4: Pool B has only 3 entrants/)
    expect(w).toMatch(/C1: pool C does not exist/)
    expect(w).toMatch(/A9: Pool A has only 3 entrants/)
    expect(w).toMatch(/Odd number of bracket refs/)
    expect(c.bracket).toEqual([['A1', 'B4'], ['C1', 'A9']])
  })

  it('warns about unknown country suffixes and keeps them in the name', () => {
    const s = sheet({
      C6: 'Senior male individual',
      B8: 'Pool A',
      B10: 'Ann A (QQQ)', C10: 'Bob B (BUL)'
    })
    const c = parseDrawSheets([s]).categories[0]!
    expect(c.entrants[0]!.name).toBe('Ann A (QQQ)')
    expect(c.warnings.some((x) => x.includes('Unknown country "QQQ"'))).toBe(true)
    expect(c.entrants[1]!.country).toBe('BUL')
  })
})

describe('merging spellings and several sheets', () => {
  it('matches the same person across spellings and prefers mixed case', () => {
    const s = sheet({
      C6: 'Senior male individual',
      B8: 'Pool A',
      B10: 'VIKTOR VOSS', C10: 'Ann Ash (BUL)',
      B11: 'Viktor Voss (ROM)', C11: 'ANN ASH',
      B12: ' viktor   voss', C12: 'Ann  Ash'
    })
    const c = parseDrawSheets([s]).categories[0]!
    expect(c.entrants).toHaveLength(2)
    const v = byKey(c, 'viktor voss')!
    expect(v.name).toBe('Viktor Voss')
    expect(v.country).toBe('ROU')
    expect(byKey(c, 'ann ash')!.name).toBe('Ann Ash')
    expect(byKey(c, 'ann ash')!.country).toBe('BUL')
  })

  it('combines sheets in input order and takes event/date from the first sheet that has them', () => {
    const a = sheet({ C6: 'Senior male individual', B8: 'Pool A', B10: 'A1x', C10: 'B2x' }, 'S1', 'a.xlsx')
    const b = sheet({ B3: EVENT, C4: DATE, C6: 'Senior female individual', B8: 'Pool A', B10: 'Q Qq', C10: 'R Rr' }, 'S2', 'b.xlsx')
    const r = parseDrawSheets([a, b])
    expect(r.categories.map((c) => c.name)).toEqual(['Senior male individual', 'Senior female individual'])
    expect(r.categories.map((c) => c.source.file)).toEqual(['a.xlsx', 'b.xlsx'])
    expect(r.eventName).toContain('Tournament')
    expect(r.date).toBe('2025-11-07')
  })

  it('returns nothing for an empty sheet', () => {
    expect(parseDrawSheets([{ file: 'x.xlsx', sheet: 'Sheet2', cells: [] }])).toEqual({ categories: [], warnings: [] })
  })
})
