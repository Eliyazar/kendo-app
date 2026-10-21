// Main-process side of the IPC bridge.
// Only the Admin window may change state; the Public window is read-only.

import { ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { ADMIN_ACTION_TYPES, IPC, type AdminAction, type AdminSnapshot, type DispatchResult, type ExportResult, type ImportResult } from '@shared/ipc'
import type { PublicView } from '@shared/public-view'
import type { AppContext } from './context'
import { exportResults } from './export'
import { importParticipants } from './import'
import { mergeSettings } from './settings'

export interface WindowRefs {
  admin(): BrowserWindow | null
  public(): BrowserWindow | null
}

const SIDES = ['aka', 'shiro']
const TECHNIQUES = ['M', 'K', 'D', 'T']

const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 100
const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const optCourt = (a: Record<string, unknown>): boolean => a['courtId'] === undefined || str(a['courtId'])

/** Required string fields per action; deeper checks happen in the reducer. */
const STRING_FIELDS: Partial<Record<AdminAction['type'], string[]>> = {
  LOAD_MATCH: ['matchId'],
  WITHDRAW_ENTRANT: ['entrantId'],
  EDIT_PLAYER: ['playerId'],
  EDIT_TEAM: ['teamId'],
  ADD_TEAM_MEMBER: ['teamId'],
  REMOVE_TEAM_MEMBER: ['teamId', 'playerId'],
  SET_TEAM_ORDER: ['teamId'],
  SET_LINEUP: ['teamMatchId', 'teamId'],
  EDIT_RESULT: ['matchId'],
  MOVE_MATCH: ['matchId', 'courtId'],
  GENERATE_TIE_BREAKER: ['poolId']
}

const OBJECT_FIELDS: Partial<Record<AdminAction['type'], string[]>> = {
  ADD_ENTRANT: ['entrant'],
  EDIT_PLAYER: ['patch'],
  EDIT_TEAM: ['patch'],
  ADD_TEAM_MEMBER: ['member'],
  CREATE_TOURNAMENT: ['setup']
}

const ARRAY_FIELDS: Partial<Record<AdminAction['type'], [string, number][]>> = {
  SET_TEAM_ORDER: [['order', 5]],
  SET_LINEUP: [['lineup', 5]],
  EDIT_RESULT: [['entries', 12]],
  GENERATE_TIE_BREAKER: [['entrantIds', 16]]
}

/** Renderer (or court laptop) input is untrusted: check shape before it reaches the reducer. */
export function parseAdminAction(input: unknown, allowDev: boolean): AdminAction | null {
  if (!obj(input)) return null
  const a = input
  const type = a['type'] as AdminAction['type']
  if (!ADMIN_ACTION_TYPES.includes(type) || !optCourt(a)) return null
  if (type === 'DEV_LOAD_DEMO' && !allowDev) return null
  if (type === 'ADD_IPPON' && !(SIDES.includes(a['side'] as string) && TECHNIQUES.includes(a['technique'] as string))) return null
  if ((type === 'ADD_HANSOKU' || type === 'FUSEN_GACHI' || type === 'SET_REPRESENTATIVE') && !SIDES.includes(a['side'] as string)) return null
  if (type === 'SET_REPRESENTATIVE' && !str(a['playerId'])) return null
  if (type === 'TIMER_ADJUST' && !(Number.isFinite(a['deltaMs']) && Math.abs(a['deltaMs'] as number) <= 60_000)) return null
  if ((STRING_FIELDS[type] ?? []).some((f) => !str(a[f]))) return null
  if ((OBJECT_FIELDS[type] ?? []).some((f) => !obj(a[f]))) return null
  if ((ARRAY_FIELDS[type] ?? []).some(([f, max]) => !Array.isArray(a[f]) || (a[f] as unknown[]).length > max)) return null
  if (type === 'ADD_ENTRANT') {
    const members = (a['entrant'] as Record<string, unknown>)['members']
    if (members !== undefined && (!Array.isArray(members) || members.length > 7 || !members.every(obj))) return null
  }
  return a as AdminAction
}

export function registerIpc(ctx: AppContext, windows: WindowRefs): void {
  const fromAdmin = (e: IpcMainInvokeEvent): boolean => e.sender === windows.admin()?.webContents
  const fromPublic = (e: IpcMainInvokeEvent): boolean => e.sender === windows.public()?.webContents

  ipcMain.handle(IPC.adminDispatch, async (e, input: unknown): Promise<DispatchResult> => {
    if (!fromAdmin(e)) return { ok: false, error: 'Not allowed.' }
    const action = parseAdminAction(input, ctx.devMode)
    if (!action) return { ok: false, error: 'Invalid action.' }
    return ctx.dispatch(action)
  })

  ipcMain.handle(IPC.adminGetState, (e): AdminSnapshot | null => (fromAdmin(e) ? ctx.snapshot() : null))

  ipcMain.handle(IPC.adminImport, (e): Promise<ImportResult | null> | null => (fromAdmin(e) ? importParticipants(windows.admin()) : null))

  ipcMain.handle(IPC.adminSetSettings, async (e, patch: unknown): Promise<DispatchResult> => {
    if (!fromAdmin(e)) return { ok: false, error: 'Not allowed.' }
    const before = ctx.settings.get()
    const next = mergeSettings(before, patch)
    if (typeof next === 'string') return { ok: false, error: next }
    if (next.court.role === 'host' && !next.court.joinCode) next.court.joinCode = before.court.joinCode
    ctx.settings.set(next)
    if (next.lanSharing !== before.lanSharing || next.port !== before.port) await ctx.restartServer()
    if (next.court.role !== before.court.role || next.court.hostAddress !== before.court.hostAddress || next.court.joinCode !== before.court.joinCode) {
      ctx.applyRole()
    }
    if (next.online.enabled && (!before.online.enabled || next.online.url !== before.online.url || next.online.key !== before.online.key)) {
      ctx.publisher.schedule()
    }
    ctx.broadcast()
    return { ok: true }
  })

  ipcMain.handle(IPC.adminExport, (e): Promise<ExportResult> | ExportResult =>
    fromAdmin(e) ? exportResults(ctx.getState(), ctx.publisher.getStatus().publicUrl) : { ok: false, error: 'Not allowed.' }
  )

  ipcMain.handle(IPC.adminOpenFolder, async (e, folder: unknown): Promise<void> => {
    if (fromAdmin(e) && typeof folder === 'string') await shell.openPath(folder)
  })

  ipcMain.handle(IPC.publicGetView, (e): PublicView | null => (fromPublic(e) || fromAdmin(e) ? ctx.publicView() : null))
}
