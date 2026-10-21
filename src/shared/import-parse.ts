// Turns the rows of an imported CSV / Excel sheet into participant entries.
// Pure function: file reading happens in the main process (src/main/import.ts).

import { toIocCode } from './countries'

export interface ImportedEntrant {
  name: string
  dojo: string
  /** IOC country code, e.g. "BUL". */
  country?: string
  /** Checked in on the day (setup screen). */
  present?: boolean
  /** Team name (team tournaments). Players with the same team name form one team, in file order. */
  team?: string
  grade?: string
  seed?: number
}

export interface ParseResult {
  entrants: ImportedEntrant[]
  warnings: string[]
}

type Column = 'name' | 'first' | 'last' | 'dojo' | 'country' | 'team' | 'grade' | 'seed'

const ALIASES: Record<Column, string[]> = {
  name: ['name', 'player', 'full name', 'fullname', 'competitor', 'participant', 'kendoka', 'nom'],
  first: ['first name', 'firstname', 'given name', 'forename', 'vorname', 'prénom', 'prenom'],
  last: ['last name', 'lastname', 'surname', 'family name', 'nachname', 'nom de famille'],
  dojo: ['dojo', 'club', 'dojo/club', 'club/dojo', 'verein', 'organisation', 'organization', 'association'],
  country: ['country', 'nation', 'nationality', 'country code', 'noc', 'ioc', 'land', 'pays', 'държава', 'staat'],
  team: ['team', 'team name', 'mannschaft', 'équipe', 'equipe'],
  grade: ['grade', 'rank', 'dan', 'kyu', 'dan/kyu'],
  seed: ['seed', 'seeding', 'seeded']
}

const MAX_LEN = 80

const clean = (v: unknown): string =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LEN)

const norm = (v: string): string => v.toLowerCase().replace(/[_.:]/g, ' ').replace(/\s+/g, ' ').trim()

function detectHeader(row: string[]): Partial<Record<Column, number>> | null {
  const map: Partial<Record<Column, number>> = {}
  row.forEach((cell, i) => {
    const n = norm(cell)
    for (const col of Object.keys(ALIASES) as Column[]) {
      if (map[col] === undefined && ALIASES[col].includes(n)) map[col] = i
    }
  })
  const hasName = map.name !== undefined || map.first !== undefined || map.last !== undefined
  return hasName ? map : null
}

export function rowsToEntrants(input: readonly (readonly unknown[])[]): ParseResult {
  const warnings: string[] = []
  const rows = input.map((r) => r.map(clean)).filter((r) => r.some((c) => c !== ''))
  if (rows.length === 0) return { entrants: [], warnings: ['The file is empty.'] }

  let cols = detectHeader(rows[0]!)
  let start = 1
  if (!cols) {
    // No recognisable header: assume Name, Dojo, Team.
    cols = { name: 0, dojo: 1, team: 2 }
    start = 0
    warnings.push('No header row found; reading columns as Name, Dojo, Team.')
  }

  const at = (row: string[], col: Column): string => (cols[col] === undefined ? '' : (row[cols[col]!] ?? ''))
  const seen = new Set<string>()
  const entrants: ImportedEntrant[] = []

  rows.slice(start).forEach((row, i) => {
    const line = i + start + 1
    const name = at(row, 'name') || [at(row, 'first'), at(row, 'last')].filter(Boolean).join(' ')
    if (!name) {
      warnings.push(`Row ${line}: no name, skipped.`)
      return
    }
    const dojo = at(row, 'dojo')
    const key = `${name.toLowerCase()}|${dojo.toLowerCase()}`
    if (seen.has(key)) {
      warnings.push(`Row ${line}: duplicate of ${name}${dojo ? ` (${dojo})` : ''}, skipped.`)
      return
    }
    seen.add(key)
    const entrant: ImportedEntrant = { name, dojo }
    const country = at(row, 'country')
    if (country) {
      const code = toIocCode(country)
      if (code) entrant.country = code
      else warnings.push(`Row ${line}: unknown country "${country}" for ${name}; left empty.`)
    }
    const team = at(row, 'team')
    const grade = at(row, 'grade')
    const seed = Number.parseInt(at(row, 'seed'), 10)
    if (team) entrant.team = team
    if (grade) entrant.grade = grade
    if (Number.isFinite(seed) && seed > 0) entrant.seed = seed
    entrants.push(entrant)
  })

  return { entrants, warnings }
}
