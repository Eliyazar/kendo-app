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

/** Same person across categories (players are separate records per category): compare names. */
export const personKey = (name: string): string =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Everyone who fights in this match; for a team bout, everyone in the whole encounter. */
export function peopleIn(t: Tournament, m: Match): Set<string> {
  const out = new Set<string>()
  const add = (playerId: Id | null | undefined) => {
    const p = playerId ? t.players[playerId] : undefined
    if (p) out.add(personKey(p.name))
  }
  const tm = m.teamMatchId ? t.teamMatches[m.teamMatchId] : undefined
  if (tm) {
    for (const id of tm.boutIds) {
      const b = t.matches[id]
      add(b?.aka.playerId)
      add(b?.shiro.playerId)
    }
    if (!out.size) for (const teamId of [tm.akaTeamId, tm.shiroTeamId]) t.teams[teamId]?.members.forEach(add)
  } else {
    add(m.aka.playerId)
    add(m.shiro.playerId)
  }
  return out
}

/** A match the court is committed to: it has started, or it belongs to a team encounter that has. */
function committed(t: Tournament, m: Match): boolean {
  if (started(m)) return true
  const tm = m.teamMatchId ? t.teamMatches[m.teamMatchId] : undefined
  return Boolean(tm?.boutIds.some((id) => {
    const b = t.matches[id]
    return b && (b.status === 'completed' || started(b))
  }))
}

interface Shown {
  category: Tournament
  match: Match
}

/** Matches this court could show next, in order: categories in competition order, fight order within each. */
function candidates(categories: Tournament[], courtId: Id): Shown[] {
  const out: Shown[] = []
  for (const category of categories) {
    const loadedElsewhere = new Set(category.courts.filter((c) => c.id !== courtId).map((c) => c.activeMatchId))
    for (const id of category.matchQueue) {
      const m = category.matches[id]
      if (m && m.courtId === courtId && m.status === 'scheduled' && !loadedElsewhere.has(id)) out.push({ category, match: m })
    }
  }
  return out
}

const overlaps = (a: Set<string>, b: Set<string>): boolean => [...a].some((k) => b.has(k))

/**
 * Re-decide what every court shows. Call after every change.
 * 1. A started match (or a started team encounter) and a match the operator loaded by hand stay.
 * 2. Every other court takes the first match, in category order, whose fighters are not on another court.
 */
export function arrangeCourts(comp: Competition): Competition {
  let categories = comp.categories.map((c) => fillCourts(c))
  const byId = (id: Id | null) => categories.find((c) => c.id === id)
  const shownOn = (slot: CourtSlot): Shown | undefined => {
    const category = byId(slot.categoryId)
    const id = category?.courts.find((c) => c.id === slot.id)?.activeMatchId
    const match = id ? category!.matches[id] : undefined
    return match && match.status !== 'completed' ? { category: category!, match } : undefined
  }

  const chosen = new Map<Id, Shown>()
  const people = new Map<Id, Set<string>>()
  const busyElsewhere = (courtId: Id): Set<string> => {
    const all = new Set<string>()
    for (const [id, set] of people) if (id !== courtId) set.forEach((k) => all.add(k))
    return all
  }
  const choose = (courtId: Id, s: Shown) => {
    chosen.set(courtId, s)
    people.set(courtId, peopleIn(s.category, s.match))
  }

  for (const slot of comp.courts) {
    const s = shownOn(slot)
    if (s && (committed(s.category, s.match) || slot.pinnedMatchId === s.match.id)) choose(slot.id, s)
  }
  for (const slot of comp.courts) {
    if (chosen.has(slot.id)) continue
    const busy = busyElsewhere(slot.id)
    const pick = candidates(categories, slot.id).find((c) => !overlaps(peopleIn(c.category, c.match), busy))
    if (pick) choose(slot.id, pick)
  }

  // Store the choice: each category keeps a loaded match only on the courts that show it.
  categories = categories.map((category) => ({
    ...category,
    courts: category.courts.map((court) => {
      const s = chosen.get(court.id)
      if (s?.category.id === category.id) return { ...court, activeMatchId: s.match.id }
      const loaded = court.activeMatchId ? category.matches[court.activeMatchId] : undefined
      return loaded && committed(category, loaded) && loaded.status !== 'completed' ? court : { ...court, activeMatchId: null }
    })
  }))
  const courts: CourtSlot[] = comp.courts.map((slot) => {
    const s = chosen.get(slot.id)
    const { pinnedMatchId, ...rest } = slot
    if (!s) return { ...rest, categoryId: null }
    return pinnedMatchId === s.match.id ? { ...rest, categoryId: s.category.id, pinnedMatchId } : { ...rest, categoryId: s.category.id }
  })
  return { ...comp, categories, courts }
}

/** Why a court with matches left shows none: who it is waiting for, and where they fight. */
export function waitingOn(comp: Competition, courtId: Id): { name: string; courtName: string } | null {
  if (onCourt(comp, courtId)?.match) return null
  const first = candidates(comp.categories, courtId)[0]
  if (!first) return null
  const mine = peopleIn(first.category, first.match)
  for (const slot of comp.courts) {
    if (slot.id === courtId) continue
    const s = onCourt(comp, slot.id)
    if (!s?.match) continue
    const theirs = peopleIn(s.category, s.match)
    const key = [...mine].find((k) => theirs.has(k))
    if (key) {
      const p = Object.values(first.category.players).find((x) => personKey(x.name) === key)
      return { name: p?.name ?? key, courtName: slot.name }
    }
  }
  return null
}

/** The person (by name) is in a started match on another court. */
export function fightingElsewhere(comp: Competition, courtId: Id, t: Tournament, m: Match): string | null {
  const mine = peopleIn(t, m)
  for (const slot of comp.courts) {
    if (slot.id === courtId) continue
    const s = onCourt(comp, slot.id)
    if (!s?.match || !committed(s.category, s.match)) continue
    if (overlaps(mine, peopleIn(s.category, s.match))) return slot.name
  }
  return null
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
