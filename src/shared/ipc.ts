// IPC contract shared by main, preloads and renderers.
//
// Data flow:
//   Admin renderer --dispatch(action)--> Main (reduces, persists)
//   Main --AdminSnapshot--> Admin renderer
//   Main --PublicView-----> Public renderer   (redacted: no clock)

import type { AppState, Side, Technique } from './types'
import type { PublicView } from './public-view'
import type { ImportedEntrant } from './import-parse'
import type { DrawImport } from './draw-import'
import type { EntrantInput, PersonInput, ScoreEntry } from './editing'
import type { TournamentSetup } from './setup'

export const IPC = {
  /** invoke, admin -> main: apply an AdminAction. */
  adminDispatch: 'admin:dispatch',
  /** invoke, admin -> main: fetch the current AdminSnapshot. */
  adminGetState: 'admin:get-state',
  /** invoke, admin -> main: pick and parse a participant file. */
  adminImport: 'admin:import',
  /** invoke, admin -> main: pick draw sheets and detect categories, pools and fight order. */
  adminImportDraw: 'admin:import-draw',
  /** invoke, admin -> main: change this laptop's settings. */
  adminSetSettings: 'admin:set-settings',
  /** invoke, admin -> main: write results, PDFs and diplomas to a folder. */
  adminExport: 'admin:export',
  /** invoke, admin -> main: choose the diploma design (PDF) or font and copy it into the app's data folder. */
  adminDiplomaFile: 'admin:diploma-file',
  /** invoke, admin -> main: write diploma-test.pdf with sample names. */
  adminDiplomaTest: 'admin:diploma-test',
  /** invoke, admin -> main: save group-sheets.pdf. */
  adminExportSheets: 'admin:export-sheets',
  /** invoke, admin -> main: write a backup now. */
  adminBackupNow: 'admin:backup-now',
  /** invoke, admin -> main: pick a backup file and load it (host). */
  adminRestoreBackup: 'admin:restore-backup',
  /** invoke, admin -> main: a court laptop becomes the host with its copy of the competition. */
  adminTakeOverHost: 'admin:take-over-host',
  /** invoke, admin -> main: save the A4 live-results poster. */
  adminExportPoster: 'admin:export-poster',
  /** invoke, admin -> main: open a folder in the file manager. */
  adminOpenFolder: 'admin:open-folder',
  /** send, main -> admin: new AdminSnapshot. */
  adminState: 'admin:state',
  /** invoke, public -> main: fetch the current PublicView. */
  publicGetView: 'public:get-view',
  /** send, main -> public: new PublicView. */
  publicView: 'public:view'
} as const

/** A whole competition: several categories sharing the courts. */
export interface CompetitionSetup {
  name: string
  date: string
  courts: number
  /** Each category as a tournament setup; `courtLetters` ("A", "B"…) = where it is fought, default all courts. */
  categories: (Omit<TournamentSetup, 'date' | 'courts'> & { courtLetters?: string[] })[]
}

/** Court-level actions may name a court; without one they act on the first court. */
type OnCourt = { courtId?: string }

/** Everything the operator can do. Only Admin windows (local or court laptops) may dispatch. */
export type AdminAction =
  | ({ type: 'TIMER_START' } & OnCourt)
  | ({ type: 'TIMER_PAUSE' } & OnCourt)
  | ({ type: 'TIMER_RESET' } & OnCourt)
  | ({ type: 'TIMER_ADJUST'; deltaMs: number } & OnCourt)
  | ({ type: 'TIMER_SET_DURATION'; durationMs: number } & OnCourt)
  | ({ type: 'ADD_IPPON'; side: Side; technique: Technique } & OnCourt)
  | ({ type: 'ADD_HANSOKU'; side: Side } & OnCourt)
  | ({ type: 'FUSEN_GACHI'; side: Side } & OnCourt)
  | ({ type: 'UNDO' } & OnCourt)
  | ({ type: 'START_ENCHO' } & OnCourt)
  | ({ type: 'APPROVE_MATCH' } & OnCourt)
  | ({ type: 'LOAD_MATCH'; matchId: string } & OnCourt)
  | ({ type: 'SET_REPRESENTATIVE'; side: Side; playerId: string } & OnCourt)
  /** A fighter is not there yet: the loaded match moves behind the next two on this court. */
  | ({ type: 'POSTPONE_MATCH' } & OnCourt)
  /** The fighter on `side` cannot continue (injury): the opponent wins by kiken. */
  | ({ type: 'KIKEN'; side: Side } & OnCourt)
  /** Swap Aka and Shiro before the start (a team encounter as a whole). */
  | ({ type: 'SWAP_SIDES' } & OnCourt)
  /** This court takes over every remaining match of a pool from another court. */
  | ({ type: 'TAKE_POOL'; poolId: string } & OnCourt)
  /** Show a category's podium on this court's TV (null hides it). */
  | ({ type: 'SHOW_PODIUM'; categoryId: string | null } & OnCourt)
  | { type: 'CREATE_TOURNAMENT'; setup: TournamentSetup }
  | { type: 'CREATE_COMPETITION'; setup: CompetitionSetup }
  | { type: 'RESET_TOURNAMENT' }
  /** true: the table locks the pools by hand (Pool Review); false: eliminations start by themselves. */
  | { type: 'SET_POOL_REVIEW'; manual: boolean }
  /** Same draw from the start: every result is cleared (the current state is archived first). */
  | { type: 'RESTART_COMPETITION' }
  /** Move a category earlier or later in the order the courts fight them. */
  | { type: 'MOVE_CATEGORY'; categoryId: string; direction: 'up' | 'down' }
  | { type: 'GENERATE_TIE_BREAKER'; poolId: string; entrantIds: string[] }
  | { type: 'LOCK_POOLS'; categoryId?: string }
  | { type: 'ADD_ENTRANT'; entrant: EntrantInput; categoryId?: string }
  | { type: 'WITHDRAW_ENTRANT'; entrantId: string }
  | { type: 'REMOVE_ENTRANT'; entrantId: string }
  | { type: 'EDIT_PLAYER'; playerId: string; patch: PersonInput }
  | { type: 'EDIT_TEAM'; teamId: string; patch: { name: string; dojo?: string; country?: string } }
  | { type: 'ADD_TEAM_MEMBER'; teamId: string; member: PersonInput }
  | { type: 'REMOVE_TEAM_MEMBER'; teamId: string; playerId: string }
  | { type: 'SET_TEAM_ORDER'; teamId: string; order: (string | null)[] }
  | { type: 'SET_LINEUP'; teamMatchId: string; teamId: string; lineup: (string | null)[] }
  | { type: 'EDIT_RESULT'; matchId: string; entries: ScoreEntry[] }
  | { type: 'MOVE_MATCH'; matchId: string; courtId: string }
  /** The table adds a match (playoff) between two members of a pool. */
  | { type: 'ADD_PLAYOFF'; poolId: string; entrantIds: string[]; encho?: boolean }
  /** Delete an added match (tie-breaker / playoff) that has not started. */
  | { type: 'REMOVE_MATCH'; matchId: string }
  /** Move a waiting match one place earlier or later on its court. */
  | { type: 'MOVE_IN_QUEUE'; matchId: string; direction: 'up' | 'down' }
  | { type: 'DEV_LOAD_DEMO' }

export type AdminActionType = AdminAction['type']

export const ADMIN_ACTION_TYPES: readonly AdminActionType[] = [
  'TIMER_START',
  'TIMER_PAUSE',
  'TIMER_RESET',
  'TIMER_ADJUST',
  'TIMER_SET_DURATION',
  'ADD_IPPON',
  'ADD_HANSOKU',
  'FUSEN_GACHI',
  'UNDO',
  'START_ENCHO',
  'APPROVE_MATCH',
  'LOAD_MATCH',
  'SET_REPRESENTATIVE',
  'POSTPONE_MATCH',
  'KIKEN',
  'SWAP_SIDES',
  'TAKE_POOL',
  'SHOW_PODIUM',
  'CREATE_TOURNAMENT',
  'CREATE_COMPETITION',
  'RESET_TOURNAMENT',
  'SET_POOL_REVIEW',
  'RESTART_COMPETITION',
  'MOVE_CATEGORY',
  'GENERATE_TIE_BREAKER',
  'LOCK_POOLS',
  'ADD_ENTRANT',
  'WITHDRAW_ENTRANT',
  'REMOVE_ENTRANT',
  'EDIT_PLAYER',
  'EDIT_TEAM',
  'ADD_TEAM_MEMBER',
  'REMOVE_TEAM_MEMBER',
  'SET_TEAM_ORDER',
  'SET_LINEUP',
  'EDIT_RESULT',
  'MOVE_MATCH',
  'ADD_PLAYOFF',
  'REMOVE_MATCH',
  'MOVE_IN_QUEUE',
  'DEV_LOAD_DEMO'
]

export type DispatchResult = { ok: true } | { ok: false; error: string }

/** Settings of this laptop (not part of the tournament). */
export interface AppSettings {
  /** Share the stream overlay with other computers on the network (OBS on a streaming PC). */
  lanSharing: boolean
  port: number
  /** Court this laptop operates and shows on its TV; null = first court. */
  courtId: string | null
  online: { enabled: boolean; url: string; key: string }
  /** Several courts: this laptop hosts the tournament, or joins a host as one court. */
  court: { role: 'host' | 'client'; hostAddress: string; joinCode: string }
  /** Second folder for the automatic backups (e.g. a USB stick); empty = only the default folder. */
  backupDir: string
}

export interface SharingInfo {
  running: boolean
  /** Overlay addresses, e.g. http://192.168.1.20:7777/overlay?court=A */
  overlayUrls: string[]
  error?: string
}

export interface OnlineStatus {
  state: 'off' | 'pending' | 'ok' | 'error'
  lastPublishedAt: number | null
  /** Page for spectators, e.g. https://kendo-live.example.workers.dev/t/ab12cd34 */
  publicUrl: string | null
  error?: string
}

export interface Notice {
  id: string
  at: number
  text: string
  tone: 'info' | 'warn'
  /** Offer an "Open folder" button. */
  folder?: string
}

export interface CourtLink {
  /** Host: code court laptops type to join. */
  joinCode: string
  /** Host: addresses court laptops connect to. */
  hostAddresses: string[]
  /** Host: connected court laptops. */
  clients: { courtName: string; address: string }[]
  /** Client: connection to the host. */
  connected: boolean
  error?: string
}

export type ExportResult = { ok: true; folder: string; files: number } | { ok: false; error: string }

/** Full state for the Admin window, plus the main-process clock for timer interpolation. */
export interface AdminSnapshot {
  state: AppState
  /** Court this laptop operates. */
  courtId: string | null
  settings: AppSettings
  sharing: SharingInfo
  online: OnlineStatus
  courtLink: CourtLink
  notices: Notice[]
  /** Main-process Date.now() at the time the snapshot was taken. */
  serverNow: number
  /** True when this session was restored after an unclean shutdown. */
  recovered: boolean
  /** Development build: enables the demo loader. */
  devMode: boolean
  /** Same projection the public screen shows, for the live preview. */
  publicView: PublicView
  /** Diplomas: the organiser's PDF design is set, and the font file used (null = none found). */
  diploma: { template: boolean; font: string | null }
  /** Where results, diplomas, poster and group sheets are saved for this competition. */
  resultsFolder: string
  /** Automatic backups (host). */
  backup: { folder: string; lastAt: number | null; error: string | null }
}

export type DrawImportResult = ({ ok: true; files: string[] } & DrawImport) | { ok: false; error: string }

export type ImportResult =
  | { ok: true; fileName: string; entrants: ImportedEntrant[]; warnings: string[] }
  | { ok: false; error: string }

export type Unsubscribe = () => void

/** Exposed on `window.kendoAdmin` by the admin preload. */
export interface AdminBridge {
  dispatch(action: AdminAction): Promise<DispatchResult>
  getState(): Promise<AdminSnapshot>
  /** Opens a file picker; resolves null if the operator cancels. */
  importParticipants(): Promise<ImportResult | null>
  /** Several .xlsx draw sheets; resolves null if the operator cancels. */
  importDraw(): Promise<DrawImportResult | null>
  setSettings(patch: unknown): Promise<DispatchResult>
  exportResults(): Promise<ExportResult>
  exportPoster(): Promise<ExportResult>
  chooseDiplomaFile(kind: 'template' | 'font'): Promise<DispatchResult | null>
  diplomaTest(): Promise<ExportResult>
  exportGroupSheets(): Promise<ExportResult>
  backupNow(): Promise<ExportResult>
  restoreBackup(): Promise<DispatchResult | null>
  takeOverHost(): Promise<DispatchResult>
  openFolder(path: string): Promise<void>
  onState(listener: (snapshot: AdminSnapshot) => void): Unsubscribe
}

/** Exposed on `window.kendoPublic` by the public preload. Read-only. */
export interface PublicBridge {
  getView(): Promise<PublicView>
  onView(listener: (view: PublicView) => void): Unsubscribe
}
