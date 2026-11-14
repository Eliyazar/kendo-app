// Single place that pulls the data contract from the desktop app (type-only: nothing from src/ ends up in the bundle).
import type { PubPerson, PubTeam } from '../../src/shared/published'

export type {
  LineupSubmission,
  PubBracketNode,
  PubCategory,
  PubCourt,
  PubEncounter,
  PubMatch,
  PubPerson,
  PubPool,
  PubSide,
  PubStandingRow,
  PubTeam,
  PublishPayload,
  PublishedSecret,
  PublishedSnapshot
} from '../../src/shared/published'
export type { Person, PublicCompetitor, PublicMatch, PublicMatchup, PublicTeamScore, PublicView } from '../../src/shared/public-view'
export type { ScoreMark } from '../../src/shared/match-engine'

// ---- Typed names in a captain's order (same rule as NEW_NAME_PREFIX in src/shared/published.ts) ----

/** "+Name": a player the team list does not have yet; the laptop adds them. */
export const NEW_NAME_PREFIX = '+'
export const isNewName = (v: string | null | undefined): v is string => typeof v === 'string' && v.startsWith(NEW_NAME_PREFIX)
export const newNameKey = (v: string): string =>
  v
    .slice(NEW_NAME_PREFIX.length)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

// ---- API shapes shared by the worker and the web app ----

export interface TeamEncounterInfo {
  teamMatchId: string
  label: string
  categoryName: string
  courtName: string
  opponentTeamName: string
  side: 'aka' | 'shiro'
  /** The team's current order (player ids / null), length = team size. */
  lineup: (string | null)[]
  /** A submission from the captain is waiting to be picked up by the table. */
  submitted: boolean
  /** The table has applied a submission from the captain for this encounter. */
  confirmed: boolean
}

export type TeamLoginResponse =
  | { ok: true; team: PubTeam; players: PubPerson[]; encounters: TeamEncounterInfo[] }
  | { ok: false; error: string; retryAfterSec?: number }
