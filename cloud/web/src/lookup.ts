// Pure helpers over a published snapshot.
import type { PubMatch, PubSide, PublishedSnapshot } from '../../src/contract'

export interface Entrant {
  id: string
  name: string
  sub: string
  country?: string
}

export interface Index {
  entrant: (id: string | null) => Entrant
  teamName: (id: string) => string
  courtName: (id: string) => string
}

/** Pool / bracket entrants are teams in team mode, players otherwise. */
export function buildIndex(s: PublishedSnapshot): Index {
  const players = new Map(s.players.map((p) => [p.id, p]))
  const teams = new Map(s.teams.map((t) => [t.id, t]))
  const courts = new Map(s.courts.map((c) => [c.id, c.name]))
  return {
    entrant(id) {
      if (!id) return { id: '', name: '—', sub: '' }
      const team = teams.get(id)
      if (team) return { id, name: team.name, sub: team.dojo, ...(team.country ? { country: team.country } : {}) }
      const p = players.get(id)
      if (p) return { id, name: p.name, sub: p.dojo, ...(p.country ? { country: p.country } : {}) }
      return { id, name: '—', sub: '' }
    },
    teamName: (id) => teams.get(id)?.name ?? '—',
    courtName: (id) => courts.get(id) ?? ''
  }
}

const ROUND_NAMES = ['Final', 'Semi-final', 'Quarter-final']

export function roundName(round: number, rounds: number): string {
  const fromFinal = rounds - 1 - round
  return ROUND_NAMES[fromFinal] ?? `Round of ${2 ** (fromFinal + 1)}`
}

export type Phase = 'upcoming' | 'live' | 'done'

export const phaseOf = (m: Pick<PubMatch, 'status'>): Phase =>
  m.status === 'completed' ? 'done' : m.status === 'scheduled' ? 'upcoming' : 'live'

/** Matches per court, in fight order, courts in snapshot order. */
export function matchesByCourt(s: PublishedSnapshot): { courtId: string; courtName: string; matches: PubMatch[] }[] {
  return s.courts.map((c) => ({
    courtId: c.id,
    courtName: c.name,
    matches: s.matches.filter((m) => m.courtId === c.id).sort((a, b) => a.order - b.order)
  }))
}

export const sideText = (s: PubSide): string => `${s.name} ${s.dojo} ${s.country ?? ''}`.toLowerCase()

/** Does a match fit a free-text search? Every word must appear in names, dojo/team, country or label. */
export function matchFits(m: PubMatch, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = `${sideText(m.aka)} ${sideText(m.shiro)} ${m.label} ${m.positionLabel ?? ''}`.toLowerCase()
  return words.every((w) => hay.includes(w))
}

/** Split text into [before, hit, after] pieces for highlighting search words. */
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length || !text) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const marks = new Array<boolean>(text.length).fill(false)
  for (const w of words) {
    let from = 0
    for (;;) {
      const i = lower.indexOf(w, from)
      if (i < 0) break
      for (let k = i; k < i + w.length; k++) marks[k] = true
      from = i + w.length
    }
  }
  const out: { text: string; hit: boolean }[] = []
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1]
    if (last && last.hit === marks[i]) last.text += text[i]
    else out.push({ text: text[i]!, hit: marks[i]! })
  }
  return out
}

export const DECISION_LABEL: Record<string, string> = {
  ippon: '',
  time: 'Time',
  encho: 'Encho',
  'fusen-gachi': 'Fusen-gachi',
  kiken: 'Withdrawn',
  hikiwake: 'Draw'
}
