// Single place that pulls the data contract from the desktop app (type-only: nothing from src/ ends up in the bundle).
import type { PubPerson, PubTeam } from '../../src/shared/published'

export type {
  LineupSubmission,
  PubBracketNode,
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

// ---- API shapes shared by the worker and the web app ----

export interface TeamEncounterInfo {
  teamMatchId: string
  label: string
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
