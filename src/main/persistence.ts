// Crash-safe JSON persistence.
//
// Every save writes a temp file, fsyncs it and atomically renames it over
// the live file, so a power cut leaves either the old or the new state on
// disk, never a half-written file. The previous version is kept as `.bak`.

import fs from 'node:fs'
import path from 'node:path'
import { pauseTimer } from '@shared/match-engine'
import { SCHEMA_VERSION, type AppState } from '@shared/types'

interface Envelope {
  schemaVersion: number
  savedAt: number
  /** Written as true only on a normal quit; false means we crashed / lost power. */
  cleanShutdown: boolean
  state: AppState
}

export interface LoadResult {
  state: AppState | null
  /** The previous session did not shut down cleanly and had a tournament loaded. */
  recovered: boolean
}

/**
 * A running clock cannot be persisted as "running": after a crash the match
 * must resume exactly where it was, not minus the downtime. So the active
 * timer is frozen (paused at the current elapsed time) in the saved copy.
 */
function freezeTimers(state: AppState, now: number): AppState {
  const t = state.tournament
  const m = t?.activeMatchId ? t.matches[t.activeMatchId] : undefined
  if (!t || !m || m.timer.runningSince === null) return state
  return {
    ...state,
    tournament: { ...t, matches: { ...t.matches, [m.id]: { ...m, timer: pauseTimer(m.timer, now) } } }
  }
}

export class StateFile {
  private readonly file: string
  private readonly tmp: string
  private readonly bak: string

  constructor(dir: string, name = 'kendo-state.json') {
    fs.mkdirSync(dir, { recursive: true })
    this.file = path.join(dir, name)
    this.tmp = `${this.file}.tmp`
    this.bak = `${this.file}.bak`
  }

  get path(): string {
    return this.file
  }

  load(): LoadResult {
    for (const candidate of [this.file, this.bak]) {
      const env = this.read(candidate)
      if (env) {
        return { state: env.state, recovered: !env.cleanShutdown && env.state.tournament !== null }
      }
    }
    return { state: null, recovered: false }
  }

  save(state: AppState, now: number, cleanShutdown = false): void {
    const env: Envelope = { schemaVersion: SCHEMA_VERSION, savedAt: now, cleanShutdown, state: freezeTimers(state, now) }
    const fd = fs.openSync(this.tmp, 'w')
    try {
      fs.writeSync(fd, JSON.stringify(env))
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.bak)
    fs.renameSync(this.tmp, this.file)
  }

  private read(file: string): Envelope | null {
    try {
      const env = JSON.parse(fs.readFileSync(file, 'utf8')) as Envelope
      if (env.schemaVersion !== SCHEMA_VERSION || !env.state) return null
      return env
    } catch {
      return null
    }
  }
}
