// The competition level: categories sharing courts.
// Each court shows one category at a time. A match that has started is never
// interrupted; otherwise a court takes the first category (in competition
// order) that has a match for it, unless the operator picked one by hand.

import { fillCourts, nextScheduledOn } from './courts'
import type { Competition, CourtSlot, Id, Match, Tournament } from './types'

export function categoryById(comp: Competition, id: Id): Tournament | undefined {
  return comp.categories.find((c) => c.id === id)
}

/** The category that owns an id (match, team match, player, team or pool). Ids are unique across categories. */
export function categoryOwning(comp: Competition, id: Id): Tournament | undefined {
  return comp.categories.find(
    (c) => c.matches[id] || c.teamMatches[id] || c.players[id] || c.teams[id] || c.pools.some((p) => p.id === id)
  )
}

export function withCategory(comp: Competition, t: Tournament): Competition {
  return { ...comp, categories: comp.categories.map((c) => (c.id === t.id ? t : c)) }
}

/** The category on a court and its loaded match there. */
export function onCourt(comp: Competition, courtId: Id): { category: Tournament; match: Match | undefined } | undefined {
  const slot = comp.courts.find((c) => c.id === courtId)
  const category = slot?.categoryId ? categoryById(comp, slot.categoryId) : undefined
  if (!category) return undefined
  const id = category.courts.find((c) => c.id === courtId)?.activeMatchId
  return { category, match: id ? category.matches[id] : undefined }
}

const started = (m: Match): boolean =>
  m.status === 'in-progress' || m.status === 'awaiting-confirmation' || m.events.length > 0 || m.timer.elapsedMs > 0 || m.timer.runningSince !== null

/** The category has an unfinished match for this court (loaded or waiting). */
function hasWorkOn(t: Tournament, courtId: Id): boolean {
  const loaded = t.courts.find((c) => c.id === courtId)?.activeMatchId
  return Boolean((loaded && t.matches[loaded]?.status !== 'completed') || nextScheduledOn(t, courtId))
}

/** Re-decide which category each court shows. Call after every change. */
export function arrangeCourts(comp: Competition): Competition {
  const categories = comp.categories.map((c) => fillCourts(c))
  const next: Competition = { ...comp, categories }
  const courts: CourtSlot[] = comp.courts.map((slot) => {
    const current = slot.categoryId ? categoryById(next, slot.categoryId) : undefined
    const loadedId = current?.courts.find((c) => c.id === slot.id)?.activeMatchId
    const loaded = loadedId ? current!.matches[loadedId] : undefined
    const busy = loaded && loaded.status !== 'completed'
    if (busy && (started(loaded) || slot.pinnedMatchId === loaded.id)) return slot
    const first = categories.find((c) => hasWorkOn(c, slot.id))
    const { pinnedMatchId: _p, ...rest } = slot
    return { ...rest, categoryId: first?.id ?? null }
  })
  return { ...next, courts }
}

/** Next match on a court after the current one: this category first, then the next category with work there. */
export function nextOnCourt(comp: Competition, courtId: Id): { category: Tournament; match: Match } | null {
  const slot = comp.courts.find((c) => c.id === courtId)
  const order = [...comp.categories].sort((a, b) => (a.id === slot?.categoryId ? -1 : b.id === slot?.categoryId ? 1 : 0))
  for (const category of order) {
    const match = nextScheduledOn(category, courtId)
    if (match) return { category, match }
  }
  return null
}
