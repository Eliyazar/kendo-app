// Pure logic around team orders (oda): which encounters are open for a team, validation of a
// submitted order, and merging pending submissions into a freshly published secret.
import type { LineupSubmission, PubCategory, PublishedSecret, PublishedSnapshot, TeamEncounterInfo } from './contract'

export interface OpenEncounter {
  teamMatchId: string
  side: 'aka' | 'shiro'
  opponentTeamId: string
  lineup: (string | null)[]
  /** Position in the fight order (first bout), used for sorting. */
  order: number
}

/** The category a team plays in (ids are unique across categories). */
export function categoryOfTeam(snapshot: PublishedSnapshot, teamId: string): PubCategory | undefined {
  return snapshot.categories.find((c) => c.teams.some((t) => t.id === teamId))
}

/** Encounters in which `teamId` appears and whose order can still change, in fight order. */
export function openEncountersFor(snapshot: PublishedSnapshot, openLineups: PublishedSecret['openLineups'], teamId: string): OpenEncounter[] {
  const cat = categoryOfTeam(snapshot, teamId)
  if (!cat) return []
  const firstOrder = new Map<string, number>()
  for (const m of cat.matches) {
    if (m.teamMatchId && !firstOrder.has(m.teamMatchId)) firstOrder.set(m.teamMatchId, m.order)
  }
  const out: OpenEncounter[] = []
  for (const enc of cat.encounters) {
    if (enc.lineupOpen === false || enc.status !== 'scheduled') continue
    const perTeam = Object.hasOwn(openLineups, enc.id) ? openLineups[enc.id] : undefined
    if (!perTeam || !Object.hasOwn(perTeam, teamId)) continue
    const side = enc.akaTeamId === teamId ? 'aka' : enc.shiroTeamId === teamId ? 'shiro' : null
    if (!side) continue
    out.push({
      teamMatchId: enc.id,
      side,
      opponentTeamId: side === 'aka' ? enc.shiroTeamId : enc.akaTeamId,
      lineup: perTeam[teamId]!,
      order: firstOrder.get(enc.id) ?? Number.MAX_SAFE_INTEGER
    })
  }
  return out.sort((a, b) => a.order - b.order)
}

export type LineupCheck = { ok: true; side: 'aka' | 'shiro' } | { ok: false; error: string }

/** Checks a captain's order: open encounter of that team, right length, members only, no duplicates. */
export function validateLineup(
  snapshot: PublishedSnapshot,
  openLineups: PublishedSecret['openLineups'],
  teamId: string,
  teamMatchId: string,
  lineup: (string | null)[]
): LineupCheck {
  const cat = categoryOfTeam(snapshot, teamId)
  const team = cat?.teams.find((t) => t.id === teamId)
  if (!cat || !team) return { ok: false, error: 'Unknown team' }
  const open = openEncountersFor(snapshot, openLineups, teamId).find((e) => e.teamMatchId === teamMatchId)
  if (!open) return { ok: false, error: 'This encounter is no longer open for changes' }
  const size = cat.teamSize
  if (!size || lineup.length !== size) return { ok: false, error: `The order needs exactly ${size ?? '?'} positions` }
  const members = new Set(team.members)
  const seen = new Set<string>()
  for (const id of lineup) {
    if (id === null) continue
    if (!members.has(id)) return { ok: false, error: 'Only members of your team can be placed in the order' }
    if (seen.has(id)) return { ok: false, error: 'A fighter can only be placed once' }
    seen.add(id)
  }
  return { ok: true, side: open.side }
}

/**
 * The laptop may publish before it has pulled a captain's submission. Pending submissions are laid over
 * the published open lineups so the captain does not see their order jump back.
 */
export function overlayPending(
  snapshot: PublishedSnapshot,
  secret: PublishedSecret,
  pending: LineupSubmission[]
): PublishedSecret['openLineups'] {
  const merged: PublishedSecret['openLineups'] = {}
  for (const [tm, perTeam] of Object.entries(secret.openLineups)) merged[tm] = { ...perTeam }
  for (const sub of [...pending].sort((a, b) => a.at - b.at)) {
    if (!openEncountersFor(snapshot, merged, sub.teamId).some((e) => e.teamMatchId === sub.teamMatchId)) continue
    if (sub.lineup.length !== categoryOfTeam(snapshot, sub.teamId)?.teamSize) continue
    merged[sub.teamMatchId]![sub.teamId] = sub.lineup
  }
  return merged
}

/** Response data for the captain page. */
export function buildEncounterInfos(
  snapshot: PublishedSnapshot,
  openLineups: PublishedSecret['openLineups'],
  teamId: string,
  pending: LineupSubmission[],
  confirmedKeys: ReadonlySet<string>
): TeamEncounterInfo[] {
  const cat = categoryOfTeam(snapshot, teamId)
  const teamName = (id: string): string => cat?.teams.find((t) => t.id === id)?.name ?? '—'
  return openEncountersFor(snapshot, openLineups, teamId).map((e) => {
    const enc = cat?.encounters.find((x) => x.id === e.teamMatchId)
    const court = snapshot.courts.find((c) => c.id === enc?.courtId)
    return {
      teamMatchId: e.teamMatchId,
      label: enc?.label ?? '',
      categoryName: cat?.name ?? '',
      courtName: court?.name ?? '',
      opponentTeamName: teamName(e.opponentTeamId),
      side: e.side,
      lineup: e.lineup,
      submitted: pending.some((s) => s.teamId === teamId && s.teamMatchId === e.teamMatchId),
      confirmed: confirmedKeys.has(`${e.teamMatchId}:${teamId}`)
    }
  })
}
