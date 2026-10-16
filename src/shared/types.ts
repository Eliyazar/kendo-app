// Core data schema for Kendo Tournament Manager.
// Everything here is plain JSON-serialisable data: it is persisted to disk
// verbatim and sent across IPC, so no classes, Dates, Maps or functions.

export type Id = string
/** Milliseconds since the Unix epoch. */
export type Timestamp = number

/** Aka = red, Shiro = white. */
export type Side = 'aka' | 'shiro'

/** Men, Kote, Do, Tsuki. */
export type Technique = 'M' | 'K' | 'D' | 'T'

export type TournamentMode = 'individual' | 'team'

export type TournamentPhase = 'setup' | 'pools' | 'pool-review' | 'bracket' | 'finished'

export type TeamSize = 3 | 4 | 5

/** Position names per team size, in bout order. */
export const TEAM_POSITIONS: Record<TeamSize, readonly string[]> = {
  3: ['Senpo', 'Chuken', 'Taisho'],
  4: ['Senpo', 'Jiho', 'Chuken', 'Taisho'],
  5: ['Senpo', 'Jiho', 'Chuken', 'Fukusho', 'Taisho']
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

export interface Player {
  id: Id
  name: string
  dojo: string
  /** Set when the player belongs to a team (team mode). */
  teamId?: Id
  /** Optional seeding / grade information from the import file. */
  seed?: number
  grade?: string
}

export interface Team {
  id: Id
  name: string
  dojo: string
  size: TeamSize
  /** Player ids in position order. `null` = position left empty (missing player). */
  roster: (Id | null)[]
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

export type TimerMode = 'countdown' | 'stopwatch'

/**
 * The timer is stored as "elapsed time so far" plus "running since".
 * Current elapsed = elapsedMs + (now - runningSince) while running.
 * This makes it trivially serialisable and lets any process reconstruct
 * the exact time without trusting a tick counter.
 */
export interface TimerState {
  mode: TimerMode
  /** Regulation time for countdown mode. Ignored in stopwatch mode. */
  durationMs: number
  /** Elapsed time accumulated up to the last pause (or up to runningSince). */
  elapsedMs: number
  /** Epoch ms when the timer was last started, `null` when paused. */
  runningSince: Timestamp | null
}

// ---------------------------------------------------------------------------
// Match events (the undo log)
// ---------------------------------------------------------------------------

interface PointEventBase {
  id: Id
  /** Wall-clock time the event was recorded. */
  at: Timestamp
  /** Match-clock elapsed time when the event was recorded. */
  matchTimeMs: number
}

/** A valid strike (yuko-datotsu) awarded to `side`. */
export interface IpponEvent extends PointEventBase {
  kind: 'ippon'
  side: Side
  technique: Technique
}

/** A penalty given to `side`. Every 2nd hansoku awards the opponent an ippon. */
export interface HansokuEvent extends PointEventBase {
  kind: 'hansoku'
  side: Side
}

/** Manual timer correction; positive = more time remaining on the clock. */
export interface TimeAdjustEvent extends PointEventBase {
  kind: 'time-adjust'
  deltaMs: number
}

/** Default win (opponent absent). Awards `side` two ippons. */
export interface FusenGachiEvent extends PointEventBase {
  kind: 'fusen-gachi'
  side: Side
}

/**
 * Every undoable action in a match. The match score is always *derived*
 * from this list, so undo is simply "drop the last event".
 */
export type PointEvent = IpponEvent | HansokuEvent | TimeAdjustEvent | FusenGachiEvent

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

export type MatchKind = 'pool' | 'bracket' | 'tie-breaker'

export type MatchStatus =
  | 'scheduled'
  | 'in-progress'
  /** Match is over on the floor; waiting for the operator to approve (post-match gogi). */
  | 'awaiting-confirmation'
  | 'completed'

export type MatchEndReason = 'ippon' | 'time-up' | 'encho-ippon' | 'fusen-gachi'

export type MatchDecision = 'ippon' | 'time' | 'encho' | 'fusen-gachi' | 'hikiwake'

export interface MatchConfig {
  durationMs: number
  /** Ippons required to win outright (Nihon Shobu = 2). */
  ipponsToWin: number
  /** Draws go to Encho instead of being recorded as Hikiwake (bracket matches). */
  enchoOnDraw: boolean
}

/** Either a player (individual) or a team position slot (team bout). */
export interface Competitor {
  playerId: Id | null
  /** For team bouts: the team this competitor fights for. */
  teamId?: Id
}

export interface MatchResult {
  winner: Side | null
  decision: MatchDecision
  akaIppons: number
  shiroIppons: number
  akaHansoku: number
  shiroHansoku: number
  approvedAt: Timestamp
}

export interface Match {
  id: Id
  kind: MatchKind
  aka: Competitor
  shiro: Competitor
  config: MatchConfig
  status: MatchStatus
  timer: TimerState
  /** True once Encho (overtime) has been started for this match. */
  encho: boolean
  events: PointEvent[]
  endReason?: MatchEndReason
  result?: MatchResult

  // Placement in the tournament structure.
  poolId?: Id
  bracketNodeId?: Id
  /** Team bouts: parent team match and position index within it. */
  teamMatchId?: Id
  position?: number
}

/** A team encounter made of one bout per position. */
export interface TeamMatch {
  id: Id
  kind: MatchKind
  akaTeamId: Id
  shiroTeamId: Id
  /** Bout match ids in position order. */
  boutIds: Id[]
  status: 'scheduled' | 'in-progress' | 'completed'
  poolId?: Id
  bracketNodeId?: Id
  result?: TeamMatchResult
}

export interface TeamMatchResult {
  winner: Side | null
  akaWins: number
  shiroWins: number
  akaIppons: number
  shiroIppons: number
  /** Representative bout (daihyo-sen) used to break a tie, if any. */
  daihyoMatchId?: Id
}

// ---------------------------------------------------------------------------
// Tournament structure
// ---------------------------------------------------------------------------

export interface Pool {
  id: Id
  name: string
  /** Player ids (individual) or team ids (team mode). */
  entrantIds: Id[]
}

export interface BracketNode {
  id: Id
  /** 0 = first round; the final is the last round. */
  round: number
  /** Position within the round, top to bottom. */
  slot: number
  akaEntrantId: Id | null
  shiroEntrantId: Id | null
  /** Match id (individual) or team match id (team mode). */
  matchId: Id | null
  winnerEntrantId: Id | null
  /** Node the winner advances to, and which side they take there. */
  next: { nodeId: Id; side: Side } | null
}

export interface Bracket {
  nodes: Record<Id, BracketNode>
  rounds: number
}

export interface PoolStanding {
  entrantId: Id
  wins: number
  draws: number
  losses: number
  ipponsScored: number
  ipponsConceded: number
  rank: number
  /** Flagged when tied with another entrant on every tie-break metric. */
  absoluteTieWith: Id[]
}

export interface Tournament {
  id: Id
  name: string
  date: string
  mode: TournamentMode
  teamSize?: TeamSize
  phase: TournamentPhase

  /** Default match settings applied to newly generated matches. */
  poolMatchConfig: MatchConfig
  bracketMatchConfig: MatchConfig
  /** Number of entrants that advance from each pool to the bracket. */
  advancePerPool: number

  players: Record<Id, Player>
  teams: Record<Id, Team>
  pools: Pool[]
  matches: Record<Id, Match>
  teamMatches: Record<Id, TeamMatch>
  bracket: Bracket | null

  /** Fight order on the shiai-jo. Match ids (individual bouts, incl. team bouts). */
  matchQueue: Id[]
  /** The match currently loaded on the scoreboard. */
  activeMatchId: Id | null

  createdAt: Timestamp
  updatedAt: Timestamp
}

// ---------------------------------------------------------------------------
// Persisted application state
// ---------------------------------------------------------------------------

export const SCHEMA_VERSION = 1

export interface AppState {
  schemaVersion: number
  tournament: Tournament | null
  /** Bumped on every state change; lets renderers ignore stale pushes. */
  revision: number
}
