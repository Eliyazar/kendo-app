// IPC contract shared by main, preloads and renderers.
//
// Data flow:
//   Admin renderer --dispatch(action)--> Main (reduces, persists)
//   Main --AdminSnapshot--> Admin renderer
//   Main --PublicView-----> Public renderer   (redacted: no clock)

import type { AppState, Side, Technique } from './types'
import type { PublicView } from './public-view'
import type { ImportedEntrant } from './import-parse'
import type { TournamentSetup } from './setup'

export const IPC = {
  /** invoke, admin -> main: apply an AdminAction. */
  adminDispatch: 'admin:dispatch',
  /** invoke, admin -> main: fetch the current AdminSnapshot. */
  adminGetState: 'admin:get-state',
  /** invoke, admin -> main: pick and parse a participant file. */
  adminImport: 'admin:import',
  /** send, main -> admin: new AdminSnapshot. */
  adminState: 'admin:state',
  /** invoke, public -> main: fetch the current PublicView. */
  publicGetView: 'public:get-view',
  /** send, main -> public: new PublicView. */
  publicView: 'public:view'
} as const

/** Everything the operator can do. Only the Admin window may dispatch. */
export type AdminAction =
  | { type: 'TIMER_START' }
  | { type: 'TIMER_PAUSE' }
  | { type: 'TIMER_RESET' }
  | { type: 'TIMER_ADJUST'; deltaMs: number }
  | { type: 'ADD_IPPON'; side: Side; technique: Technique }
  | { type: 'ADD_HANSOKU'; side: Side }
  | { type: 'FUSEN_GACHI'; side: Side }
  | { type: 'UNDO' }
  | { type: 'START_ENCHO' }
  | { type: 'APPROVE_MATCH' }
  | { type: 'LOAD_MATCH'; matchId: string }
  | { type: 'SET_REPRESENTATIVE'; side: Side; playerId: string }
  | { type: 'CREATE_TOURNAMENT'; setup: TournamentSetup }
  | { type: 'RESET_TOURNAMENT' }
  | { type: 'GENERATE_TIE_BREAKER'; poolId: string; entrantIds: string[] }
  | { type: 'LOCK_POOLS' }
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
  'DEV_LOAD_DEMO'
]

export type DispatchResult = { ok: true } | { ok: false; error: string }

/** Full state for the Admin window, plus the main-process clock for timer interpolation. */
export interface AdminSnapshot {
  state: AppState
  /** Main-process Date.now() at the time the snapshot was taken. */
  serverNow: number
  /** True when this session was restored after an unclean shutdown. */
  recovered: boolean
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
  onState(listener: (snapshot: AdminSnapshot) => void): Unsubscribe
}

/** Exposed on `window.kendoPublic` by the public preload. Read-only. */
export interface PublicBridge {
  getView(): Promise<PublicView>
  onView(listener: (view: PublicView) => void): Unsubscribe
}
