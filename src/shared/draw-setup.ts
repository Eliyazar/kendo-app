// Turn detected draw sheets into a competition setup the operator can review.

import type { DrawCategory, DrawImport } from './draw-import'
import type { ImportedEntrant } from './import-parse'
import type { CompetitionSetup } from './ipc'
import type { Predrawn, TournamentSetup } from './setup'
import type { TeamSize } from './types'

export type CategoryDraft = Omit<TournamentSetup, 'date' | 'courts'> & {
  /** Courts it is fought on ("A", "B"…); empty = all. */
  courtLetters: string[]
  include: boolean
  /** "Female_individual.xlsx · Sheet1" */
  source: string
  warnings: string[]
}

const isChildren = (name: string): boolean => /child|kids|under\s*1[0-4]|u1[0-4]|деца/i.test(name)

function entrantsOf(c: DrawCategory): ImportedEntrant[] {
  if (c.mode === 'individual') {
    return c.entrants.map((e) => (e.country ? { name: e.name, dojo: '', country: e.country } : { name: e.name, dojo: '' }))
  }
  return c.entrants.flatMap((team) =>
    (team.members ?? []).map((m) => {
      const e: ImportedEntrant = { name: m.name, dojo: team.name, team: team.name }
      const country = m.country ?? team.country
      if (country) e.country = country
      return e
    })
  )
}

function predrawnOf(c: DrawCategory): Predrawn | undefined {
  if (!c.pools.length) return undefined
  const nameOf = new Map(c.entrants.map((e) => [e.key, e.name]))
  const name = (key: string): string => nameOf.get(key) ?? key
  return {
    pools: c.pools.map((p) => ({ name: p.name, entrants: p.entrantKeys.map(name), matches: p.matches.map(([a, b]) => [name(a), name(b)] as [string, string]) })),
    bracket: c.bracket
  }
}

export function draftsFromDraw(draw: DrawImport, seed = 1): CategoryDraft[] {
  return draw.categories.map((c, i) => {
    const minutes = isChildren(c.name) ? 2 : 3
    const draft: CategoryDraft = {
      name: c.name,
      mode: c.mode,
      poolSize: 3,
      advancePerPool: 2,
      poolMatchMinutes: minutes,
      bracketMatchMinutes: minutes,
      entrants: entrantsOf(c),
      drawSeed: seed + i,
      courtLetters: c.court ? [c.court] : [],
      include: true,
      source: `${c.source.file} · ${c.source.sheet}`,
      warnings: c.warnings
    }
    if (c.mode === 'team') draft.teamSize = Math.min(5, Math.max(3, c.teamSize ?? 5)) as TeamSize
    const predrawn = predrawnOf(c)
    if (predrawn) draft.predrawn = predrawn
    return draft
  })
}

/** Courts needed: the highest court letter used (at least 1). */
export function courtsNeeded(drafts: CategoryDraft[]): number {
  const letters = drafts.filter((d) => d.include).flatMap((d) => d.courtLetters)
  return Math.max(1, ...letters.map((l) => l.charCodeAt(0) - 64))
}

export function competitionFromDrafts(name: string, date: string, courts: number, drafts: CategoryDraft[]): CompetitionSetup {
  return {
    name,
    date,
    courts,
    categories: drafts.filter((d) => d.include).map(({ include: _i, source: _s, warnings: _w, ...setup }) => setup)
  }
}
