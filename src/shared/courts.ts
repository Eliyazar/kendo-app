// Courts (shiai-jo): each runs its own matches from the shared fight order.

import type { Court, Id, Match, Tournament } from './types'

export const courtName = (i: number): string => `Shiai-jo ${String.fromCharCode(65 + i)}`

export function makeCourts(count: number, makeId: (i: number) => Id): Court[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => ({ id: makeId(i), name: courtName(i), activeMatchId: null }))
}

/** The court an action targets: the given one, or the first court. */
export function courtOf(t: Tournament, courtId?: Id): Court {
  const court = courtId ? t.courts.find((c) => c.id === courtId) : t.courts[0]
  if (!court) throw new Error('Unknown court.')
  return court
}

export function activeMatchOn(t: Tournament, courtId?: Id): Match | undefined {
  const id = courtOf(t, courtId).activeMatchId
  return id ? t.matches[id] : undefined
}

const isLoadedSomewhere = (t: Tournament, matchId: Id): boolean => t.courts.some((c) => c.activeMatchId === matchId)

/** First scheduled match of this court in the fight order that is not already on a scoreboard. */
export function nextScheduledOn(t: Tournament, courtId: Id): Match | null {
  for (const id of t.matchQueue) {
    const m = t.matches[id]
    if (m && m.courtId === courtId && m.status === 'scheduled' && !isLoadedSomewhere(t, id)) return m
  }
  return null
}

export function withCourt(t: Tournament, court: Court): Tournament {
  return { ...t, courts: t.courts.map((c) => (c.id === court.id ? court : c)) }
}

/** Load the next match on every court whose board is empty or shows a finished match. */
export function fillCourts(t: Tournament): Tournament {
  for (const court of t.courts) {
    const current = court.activeMatchId ? t.matches[court.activeMatchId] : undefined
    if (current && current.status !== 'completed') continue
    t = withCourt(t, { ...court, activeMatchId: null })
    t = withCourt(t, { ...court, activeMatchId: nextScheduledOn(t, court.id)?.id ?? null })
  }
  return t
}

/** Court for the n-th pool / bracket slot: spread round-robin over the courts. */
export const courtFor = (t: Tournament, index: number): Id => t.courts[index % t.courts.length]!.id
