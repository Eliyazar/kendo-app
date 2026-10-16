// Authoritative state holder in the main process.
//
// The Admin window drives every change, but the state itself lives here so
// that (a) the clock keeps running even if a renderer reloads or is throttled,
// (b) every change is persisted before anyone sees it, and (c) the public
// window can never be handed data it must not show (the clock).

import type { DispatchResult } from '@shared/ipc'
import { RuleError } from '@shared/match-engine'
import { initialState, reduceApp, type AppAction } from '@shared/reducer'
import type { AppState } from '@shared/types'
import type { StateFile } from './persistence'

const TICK_MS = 100
const RUNNING_SAVE_MS = 1000

export type ChangeListener = (state: AppState) => void

export class Store {
  private state: AppState
  private lastSave = 0
  private timer: NodeJS.Timeout | null = null
  readonly recovered: boolean

  constructor(
    private readonly file: StateFile,
    private readonly onChange: ChangeListener
  ) {
    const loaded = file.load()
    this.state = loaded.state ?? initialState()
    this.recovered = loaded.recovered
  }

  getState(): AppState {
    return this.state
  }

  dispatch(action: AppAction, now = Date.now()): DispatchResult {
    try {
      const { state, changed } = reduceApp(this.state, action, now)
      if (changed) {
        this.commit(state, now)
        this.onChange(this.state)
      }
      return { ok: true }
    } catch (err) {
      if (err instanceof RuleError) return { ok: false, error: err.message }
      throw err
    }
  }

  /** Start the clock loop: detects time-up and auto-saves every second while running. */
  start(): void {
    this.timer ??= setInterval(() => this.tick(), TICK_MS)
  }

  /** Final save marked as a clean shutdown. */
  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.file.save(this.state, Date.now(), true)
  }

  private tick(): void {
    const now = Date.now()
    this.dispatch({ type: 'TICK' }, now)
    if (this.isClockRunning() && now - this.lastSave >= RUNNING_SAVE_MS) this.save(now)
  }

  private isClockRunning(): boolean {
    const t = this.state.tournament
    const m = t?.activeMatchId ? t.matches[t.activeMatchId] : undefined
    return m?.timer.runningSince != null
  }

  private commit(state: AppState, now: number): void {
    this.state = state
    this.save(now)
  }

  private save(now: number): void {
    this.file.save(this.state, now)
    this.lastSave = now
  }
}
