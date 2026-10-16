// Main-process side of the IPC bridge.
// Only the Admin window may change state; the Public window is read-only.

import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { ADMIN_ACTION_TYPES, IPC, type AdminAction, type AdminSnapshot, type DispatchResult } from '@shared/ipc'
import { toPublicView, type PublicView } from '@shared/public-view'
import type { Store } from './store'

export interface WindowRefs {
  admin(): BrowserWindow | null
  public(): BrowserWindow | null
}

const SIDES = ['aka', 'shiro']
const TECHNIQUES = ['M', 'K', 'D', 'T']

/** Renderer input is untrusted: check shape before it reaches the reducer. */
export function parseAdminAction(input: unknown, allowDev: boolean): AdminAction | null {
  if (typeof input !== 'object' || input === null) return null
  const a = input as Record<string, unknown>
  if (!ADMIN_ACTION_TYPES.includes(a['type'] as AdminAction['type'])) return null
  switch (a['type']) {
    case 'ADD_IPPON':
      return SIDES.includes(a['side'] as string) && TECHNIQUES.includes(a['technique'] as string)
        ? (a as AdminAction)
        : null
    case 'ADD_HANSOKU':
    case 'FUSEN_GACHI':
      return SIDES.includes(a['side'] as string) ? (a as AdminAction) : null
    case 'TIMER_ADJUST':
      return Number.isFinite(a['deltaMs']) && Math.abs(a['deltaMs'] as number) <= 60_000 ? (a as AdminAction) : null
    case 'LOAD_MATCH':
      return typeof a['matchId'] === 'string' ? (a as AdminAction) : null
    case 'DEV_LOAD_DEMO':
      return allowDev ? (a as AdminAction) : null
    default:
      return { type: a['type'] } as AdminAction
  }
}

export function snapshot(store: Store): AdminSnapshot {
  const state = store.getState()
  return { state, serverNow: Date.now(), recovered: store.recovered, publicView: toPublicView(state) }
}

export function registerIpc(store: Store, windows: WindowRefs, allowDev: boolean): void {
  const fromAdmin = (e: IpcMainInvokeEvent): boolean => e.sender === windows.admin()?.webContents
  const fromPublic = (e: IpcMainInvokeEvent): boolean => e.sender === windows.public()?.webContents

  ipcMain.handle(IPC.adminDispatch, (e, input: unknown): DispatchResult => {
    if (!fromAdmin(e)) return { ok: false, error: 'Not allowed.' }
    const action = parseAdminAction(input, allowDev)
    if (!action) return { ok: false, error: 'Invalid action.' }
    return store.dispatch(action)
  })

  ipcMain.handle(IPC.adminGetState, (e): AdminSnapshot | null => (fromAdmin(e) ? snapshot(store) : null))

  ipcMain.handle(IPC.publicGetView, (e): PublicView | null =>
    fromPublic(e) || fromAdmin(e) ? toPublicView(store.getState()) : null
  )
}

/** Push the new state to both windows. */
export function broadcast(store: Store, windows: WindowRefs): void {
  const admin = windows.admin()
  const pub = windows.public()
  const snap = snapshot(store)
  if (admin && !admin.isDestroyed()) admin.webContents.send(IPC.adminState, snap)
  if (pub && !pub.isDestroyed()) pub.webContents.send(IPC.publicView, snap.publicView)
}
