// IPC contract shared by main, preloads and renderers.
//
// Data flow:
//   Admin renderer --dispatch(action)--> Main (reduces, persists)
//   Main --AdminSnapshot--> Admin renderer
//   Main --PublicView-----> Public renderer   (redacted: no clock)

import type { AppState, Side, Technique } from './types'
import type { PublicView } from './public-view'
import type { ImportedEntrant } from './import-parse'
import type { EntrantInput, PersonInput, ScoreEntry } from './editing'
import type { TournamentSetup } from './setup'

export const IPC = {
  /** invoke, admin -> main: apply an AdminAction. */
  adminDispatch: 'admin:dispatch',
  /** invoke, admin -> main: fetch the current AdminSnapshot. */
  adminGetState: 'admin:get-state',
  /** invoke, admin -> main: pick and parse a participant file. */
  adminImport: 'admin:import',
  /** invoke, admin -> main: change this laptop's settings. */
  adminSetSettings: 'admin:set-settings',
  /** invoke, admin -> main: write results, PDFs and diplomas to a folder. */
  adminExport: 'admin:export',
  /** invoke, admin -> main: open a folder in the file manager. */
  adminOpenFolder: 'admin:open-folder',
  /** send, main -> admin: new AdminSnapshot. */
  adminState: 'admin:state',
  /** invoke, public -> main: fetch the current PublicView. */
  publicGetView: 'public:get-view',
  /** send, main -> public: new PublicView. */
  publicView: 'public:view'
} as const

/** Court-level actions may name a court; without one they act on the first court. */
type OnCourt = { courtId?: string }

/** Everything the operator can do. Only Admin windows (local or court laptops) may dispatch. */
export type AdminAction =
  | ({ type: 'TIMER_START' } & OnCourt)
  | ({ type: 'TIMER_PAUSE' } & OnCourt)
  | ({ type: 'TIMER_RESET' } & OnCourt)
  | ({ type: 'TIMER_ADJUST'; deltaMs: number } & OnCourt)
  | ({ type: 'ADD_IPPON'; side: Side; technique: Technique } & OnCourt)
  | ({ type: 'ADD_HANSOKU'; side: Side } & OnCourt)
  | ({ type: 'FUSEN_GACHI'; side: Side } & OnCourt)
  | ({ type: 'UNDO' } & OnCourt)
  | ({ type: 'START_ENCHO' } & OnCourt)
  | ({ type: 'APPROVE_MATCH' } & OnCourt)
  | ({ type: 'LOAD_MATCH'; matchId: string } & OnCourt)
  | ({ type: 'SET_REPRESENTATIVE'; side: Side; playerId: string } & OnCourt)
  | { type: 'CREATE_TOURNAMENT'; setup: TournamentSetup }
  | { type: 'RESET_TOURNAMENT' }
  | { type: 'GENERATE_TIE_BREAKER'; poolId: string; entrantIds: string[] }
  | { type: 'LOCK_POOLS' }
  | { type: 'ADD_ENTRANT'; entrant: EntrantInput }
  | { type: 'WITHDRAW_ENTRANT'; entrantId: string }
  | { type: 'EDIT_PLAYER'; playerId: string; patch: PersonInput }
  | { type: 'EDIT_TEAM'; teamId: string; patch: { name: string; dojo?: string; country?: string } }
  | { type: 'ADD_TEAM_MEMBER'; teamId: string; member: PersonInput }
  | { type: 'REMOVE_TEAM_MEMBER'; teamId: string; playerId: string }
  | { type: 'SET_TEAM_ORDER'; teamId: string; order: (string | null)[] }
  | { type: 'SET_LINEUP'; teamMatchId: string; teamId: string; lineup: (string | null)[] }
  | { type: 'EDIT_RESULT'; matchId: string; entries: ScoreEntry[] }
  | { type: 'MOVE_MATCH'; matchId: string; courtId: string }
  | { type: 'DEV_LOAD_DEMO' }

export type AdminActionType = AdminAction['type']

export const ADMIN_ACTION_TYPES: readonly AdminActionType[] = [
  'TIMER_START',
  'TIMER_PAUSE',
  'TIMER_RESET',
  'TIMER_ADJUST',
  'ADD_IPPON',
  'ADD_HANSOKU',
  'FUSEN_GACHI',
  'UNDO',
  'START_ENCHO',
  'APPROVE_MATCH',
  'LOAD_MATCH',
  'SET_REPRESENTATIVE',
  'CREATE_TOURNAMENT',
  'RESET_TOURNAMENT',
  'GENERATE_TIE_BREAKER',
  'LOCK_POOLS',
  'ADD_ENTRANT',
  'WITHDRAW_ENTRANT',
  'EDIT_PLAYER',
  'EDIT_TEAM',
  'ADD_TEAM_MEMBER',
  'REMOVE_TEAM_MEMBER',
  'SET_TEAM_ORDER',
  'SET_LINEUP',
  'EDIT_RESULT',
  'MOVE_MATCH',
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
}

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
  setSettings(patch: unknown): Promise<DispatchResult>
  exportResults(): Promise<ExportResult>
  openFolder(path: string): Promise<void>
  onState(listener: (snapshot: AdminSnapshot) => void): Unsubscribe
}

/** Exposed on `window.kendoPublic` by the public preload. Read-only. */
export interface PublicBridge {
  getView(): Promise<PublicView>
  onView(listener: (view: PublicView) => void): Unsubscribe
}
