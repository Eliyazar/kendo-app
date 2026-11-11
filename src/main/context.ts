// Everything the main process runs, in one place. A laptop is either the
// host (owns the competition, saves it, runs the clocks) or a court laptop
// (mirrors the host and operates one court).

import { randomBytes } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import { IPC, type AdminAction, type AdminSnapshot, type DispatchResult, type Notice } from '@shared/ipc'
import { toPublicView, type PublicView } from '@shared/public-view'
import type { AppState } from '@shared/types'
import { CourtClient } from './court-client'
import { exportResults } from './export'
import type { StateFile } from './persistence'
import { Publisher } from './publisher'
import { courtLetter, lanAddresses, LocalServer } from './server'
import type { SettingsFile } from './settings'
import { Store } from './store'

/** Actions that act on "this court's" match; the laptop's court is filled in. */
const COURT_ACTIONS: ReadonlySet<AdminAction['type']> = new Set([
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
  'SET_REPRESENTATIVE'
])

/** What a court laptop may do on the host. */
const ALLOWED_FROM_COURT: ReadonlySet<AdminAction['type']> = new Set([...COURT_ACTIONS, 'SET_LINEUP', 'EDIT_RESULT', 'EDIT_PLAYER'])

const MAX_NOTICES = 8

export interface Windows {
  admin(): BrowserWindow | null
  public(): BrowserWindow | null
}

export class AppContext {
  readonly store: Store
  readonly client: CourtClient
  readonly server: LocalServer
  readonly publisher: Publisher
  private notices: Notice[] = []
  /** Phase of each category at the last change, to notice when one finishes. */
  private lastPhases = new Map<string, string>()

  constructor(
    private readonly file: StateFile,
    readonly settings: SettingsFile,
    private readonly windows: Windows,
    readonly devMode: boolean,
    paths: { rendererDir: string; devUrl?: string | undefined },
    private readonly parse: (input: unknown, allowDev: boolean) => AdminAction | null
  ) {
    const s = settings.get()
    if (s.court.role === 'host' && !s.court.joinCode) {
      settings.set({ ...s, court: { ...s.court, joinCode: randomBytes(3).toString('hex').toUpperCase() } })
    }
    this.store = new Store(this.file, () => this.changed())
    this.client = new CourtClient({
      config: () => ({ ...this.settings.get().court, courtId: this.settings.get().courtId }),
      onChange: () => this.broadcast()
    })
    this.server = new LocalServer({
      getState: () => this.getState(),
      dispatchFromCourt: (input, courtId) => this.dispatchFromCourt(input, courtId),
      joinCode: () => this.settings.get().court.joinCode,
      onlineUrl: () => this.publisher.getStatus().publicUrl,
      rendererDir: paths.rendererDir,
      devUrl: paths.devUrl
    })
    this.publisher = new Publisher({
      getState: () => this.store.getState(),
      config: () => this.settings.get().online,
      dispatch: (a) => this.store.dispatch(a),
      notice: (text, tone) => this.notice(text, tone),
      onStatus: () => this.broadcast()
    })
  }

  get isClient(): boolean {
    return this.settings.get().court.role === 'client'
  }

  async start(): Promise<void> {
    if (this.isClient) this.client.start()
    else {
      this.store.start()
      this.publisher.start()
    }
    await this.restartServer()
  }

  async restartServer(): Promise<void> {
    const s = this.settings.get()
    // A court laptop needs no server of its own unless it shares its overlay.
    await this.server.start(s.port, s.lanSharing)
    this.broadcast()
  }

  /** Role / host changes: switch between hosting and joining. */
  applyRole(): void {
    if (this.isClient) {
      this.publisher.stop()
      this.client.start()
    } else {
      this.client.stop()
      this.store.start()
      this.publisher.start()
    }
    this.broadcast()
  }

  stop(): void {
    this.store.stop()
    this.client.stop()
    this.publisher.stop()
    void this.server.stop()
  }

  getState(): AppState {
    return this.isClient ? this.client.getState() : this.store.getState()
  }

  /** This laptop's court: the configured one if it exists, else the first. */
  courtId(): string | null {
    const comp = this.getState().competition
    const wanted = this.settings.get().courtId
    return comp?.courts.find((c) => c.id === wanted)?.id ?? comp?.courts[0]?.id ?? null
  }

  async dispatch(action: AdminAction): Promise<DispatchResult> {
    const courtId = this.courtId()
    const scoped = COURT_ACTIONS.has(action.type) && courtId && !('courtId' in action && action.courtId) ? ({ ...action, courtId } as AdminAction) : action
    return this.isClient ? this.client.dispatch(scoped) : this.store.dispatch(scoped)
  }

  private dispatchFromCourt(input: unknown, courtId: string): DispatchResult {
    if (this.isClient) return { ok: false, error: 'This laptop is not the host.' }
    const action = this.parse(input, false)
    if (!action || !ALLOWED_FROM_COURT.has(action.type)) return { ok: false, error: 'Not allowed from a court laptop.' }
    if (!this.store.getState().competition?.courts.some((c) => c.id === courtId)) return { ok: false, error: 'Unknown court.' }
    return this.store.dispatch(COURT_ACTIONS.has(action.type) ? ({ ...action, courtId } as AdminAction) : action)
  }

  notice(text: string, tone: Notice['tone'] = 'info', folder?: string): void {
    const n: Notice = { id: randomBytes(4).toString('hex'), at: Date.now(), text, tone }
    if (folder) n.folder = folder
    this.notices = [n, ...this.notices].slice(0, MAX_NOTICES)
    this.broadcast()
  }

  /** When a category's final is approved, its results and diplomas are saved automatically. */
  private autoExport(): void {
    const categories = this.store.getState().competition?.categories ?? []
    for (const c of categories) {
      const before = this.lastPhases.get(c.id)
      this.lastPhases.set(c.id, c.phase)
      if (c.phase !== 'finished' || before === undefined || before === 'finished') continue
      void exportResults(this.store.getState(), this.publisher.getStatus().publicUrl, c.id).then((r) =>
        r.ok
          ? this.notice(`${c.name} finished — results and diplomas saved (${r.files} files).`, 'info', r.folder)
          : this.notice(`Saving results of ${c.name} failed: ${r.error}`, 'warn')
      )
    }
  }

  publicView(): PublicView {
    const onlineUrl = this.isClient ? this.client.onlineUrl : this.publisher.getStatus().publicUrl
    return { ...toPublicView(this.getState(), this.courtId() ?? undefined), onlineUrl }
  }

  snapshot(): AdminSnapshot {
    const state = this.getState()
    const s = this.settings.get()
    const courtId = this.courtId()
    return {
      state,
      courtId,
      settings: s,
      sharing: this.server.info(courtLetter(state.competition, courtId)),
      online: this.isClient ? { state: 'off', lastPublishedAt: null, publicUrl: null } : this.publisher.getStatus(),
      courtLink: {
        joinCode: s.court.joinCode,
        hostAddresses: s.lanSharing ? lanAddresses().map((a) => (s.port === 7777 ? a : `${a}:${s.port}`)) : [],
        clients: this.server.clients(),
        connected: this.client.connected,
        ...(this.client.error && this.isClient ? { error: this.client.error } : {})
      },
      notices: this.notices,
      serverNow: Date.now() + (this.isClient ? this.client.clockOffset() : 0),
      recovered: !this.isClient && this.store.recovered,
      devMode: this.devMode,
      publicView: this.publicView()
    }
  }

  /** Host state changed: windows, overlays, court laptops, online page. */
  private changed(): void {
    this.autoExport()
    this.broadcast()
    this.server.notify()
    this.publisher.schedule()
  }

  broadcast(): void {
    const admin = this.windows.admin()
    const pub = this.windows.public()
    const snap = this.snapshot()
    if (admin && !admin.isDestroyed()) admin.webContents.send(IPC.adminState, snap)
    if (pub && !pub.isDestroyed()) pub.webContents.send(IPC.publicView, snap.publicView)
  }
}
