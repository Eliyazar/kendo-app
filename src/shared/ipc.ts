// IPC contract shared by main, preloads and renderers.
//
// Data flow:
//   Admin renderer --dispatch(action)--> Main (reduces, persists)
//   Main --AdminSnapshot--> Admin renderer
//   Main --PublicView-----> Public renderer   (redacted: no clock)
//   Main --buzzer---------> Public renderer   (TV speakers)

import type { AppState, Side, Technique } from './types'
import type { PublicView } from './public-view'

export const IPC = {
  /** invoke, admin -> main: apply an AdminAction. */
  adminDispatch: 'admin:dispatch',
  /** invoke, admin -> main: fetch the current AdminSnapshot. */
  adminGetState: 'admin:get-state',
  /** send, main -> admin: new AdminSnapshot. */
  adminState: 'admin:state',
  /** invoke, public -> main: fetch the current PublicView. */
  publicGetView: 'public:get-view',
  /** send, main -> public: new PublicView. */
  publicView: 'public:view',
  /** send, main -> public: play the time-up buzzer. */
  publicBuzzer: 'public:buzzer'
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

export type Unsubscribe = () => void

/** Exposed on `window.kendoAdmin` by the admin preload. */
export interface AdminBridge {
  dispatch(action: AdminAction): Promise<DispatchResult>
  getState(): Promise<AdminSnapshot>
  onState(listener: (snapshot: AdminSnapshot) => void): Unsubscribe
}

/** Exposed on `window.kendoPublic` by the public preload. Read-only. */
export interface PublicBridge {
  getView(): Promise<PublicView>
  onView(listener: (view: PublicView) => void): Unsubscribe
  onBuzzer(listener: () => void): Unsubscribe
}
