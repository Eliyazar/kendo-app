// Automatic backups: a copy of the competition every 2 minutes (when something changed),
// in Documents/Kendo Tournament Manager/backups and, if set, a second folder (USB stick).
// The newest 40 per folder are kept. A backup can be restored on any laptop.

import fs from 'node:fs/promises'
import path from 'node:path'
import { SCHEMA_VERSION, type AppState } from '@shared/types'
import { freezeTimers } from './persistence'

const EVERY_MS = 2 * 60_000
const KEEP = 40
const PREFIX = 'kendo-backup-'

const stamp = (now: number): string => {
  const d = new Date(now)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

export class Backups {
  private timer: NodeJS.Timeout | null = null
  private lastRevision = -1
  lastAt: number | null = null
  lastError: string | null = null

  constructor(
    private readonly deps: {
      getState(): AppState
      /** Folders to write to (the default one first). */
      folders(): string[]
      /** Only the host makes backups. */
      enabled(): boolean
    }
  ) {}

  start(): void {
    this.timer ??= setInterval(() => void this.run(false), EVERY_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Write a backup now (forced) or only when the competition changed since the last one. */
  async run(force: boolean): Promise<{ ok: true; folder: string } | { ok: false; error: string }> {
    const state = this.deps.getState()
    if (!this.deps.enabled() || !state.competition) return { ok: false, error: 'No competition to back up.' }
    if (!force && state.revision === this.lastRevision) return { ok: true, folder: this.deps.folders()[0]! }
    const now = Date.now()
    const body = JSON.stringify({ schemaVersion: SCHEMA_VERSION, savedAt: now, backup: true, state: freezeTimers(state, now) })
    const errors: string[] = []
    for (const dir of this.deps.folders()) {
      try {
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(path.join(dir, `${PREFIX}${stamp(now)}.json`), body, 'utf8')
        const old = (await fs.readdir(dir)).filter((f) => f.startsWith(PREFIX) && f.endsWith('.json')).sort()
        for (const f of old.slice(0, Math.max(0, old.length - KEEP))) await fs.unlink(path.join(dir, f)).catch(() => undefined)
      } catch (err) {
        errors.push(`${dir}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    this.lastRevision = state.revision
    this.lastAt = now
    this.lastError = errors.length ? errors.join(' · ') : null
    return errors.length === this.deps.folders().length ? { ok: false, error: this.lastError! } : { ok: true, folder: this.deps.folders()[0]! }
  }
}

/** Read a backup (or a kendo-state.json) and return its state, or why it cannot be used. */
export async function readBackup(file: string): Promise<AppState | string> {
  try {
    const raw = JSON.parse(await fs.readFile(file, 'utf8')) as { schemaVersion?: unknown; state?: AppState }
    if (raw.schemaVersion !== SCHEMA_VERSION) return 'This backup is from another version of the app.'
    if (!raw.state?.competition || !Array.isArray(raw.state.competition.categories)) return 'This file has no competition in it.'
    return raw.state
  } catch {
    return 'This is not a Kendo Tournament Manager backup.'
  }
}
