// Per-laptop settings (not part of the tournament): sharing, court, online publishing.

import fs from 'node:fs'
import path from 'node:path'
import type { AppSettings } from '@shared/ipc'

export const DEFAULT_SETTINGS: AppSettings = {
  lanSharing: false,
  port: 7777,
  courtId: null,
  online: { enabled: false, url: '', key: '' },
  court: { role: 'host', hostAddress: '', joinCode: '' }
}

export class SettingsFile {
  private readonly file: string
  private value: AppSettings

  constructor(dir: string) {
    this.file = path.join(dir, 'settings.json')
    this.value = DEFAULT_SETTINGS
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<AppSettings>
      this.value = {
        ...DEFAULT_SETTINGS,
        ...raw,
        online: { ...DEFAULT_SETTINGS.online, ...raw.online },
        court: { ...DEFAULT_SETTINGS.court, ...raw.court }
      }
    } catch {
      /* first run: defaults */
    }
  }

  get(): AppSettings {
    return this.value
  }

  set(next: AppSettings): void {
    this.value = next
    fs.writeFileSync(this.file, JSON.stringify(next, null, 2))
  }
}

/** Accept only known fields with sane values from the renderer. */
export function mergeSettings(current: AppSettings, patch: unknown): AppSettings | string {
  if (typeof patch !== 'object' || patch === null) return 'Invalid settings.'
  const p = patch as Record<string, unknown>
  const next: AppSettings = { ...current, online: { ...current.online }, court: { ...current.court } }
  if ('lanSharing' in p) next.lanSharing = p['lanSharing'] === true
  if ('port' in p) {
    const port = p['port']
    if (!Number.isInteger(port) || (port as number) < 1024 || (port as number) > 65535) return 'Port must be 1024–65535.'
    next.port = port as number
  }
  if ('courtId' in p) next.courtId = typeof p['courtId'] === 'string' ? p['courtId'] : null
  if (typeof p['online'] === 'object' && p['online'] !== null) {
    const o = p['online'] as Record<string, unknown>
    if ('enabled' in o) next.online.enabled = o['enabled'] === true
    if (typeof o['url'] === 'string') {
      const url = o['url'].trim().replace(/\/+$/, '')
      if (url && !/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
        return 'The online URL must start with https://'
      }
      next.online.url = url
    }
    if (typeof o['key'] === 'string') next.online.key = o['key'].trim().slice(0, 200)
  }
  if (typeof p['court'] === 'object' && p['court'] !== null) {
    const c = p['court'] as Record<string, unknown>
    if (c['role'] === 'host' || c['role'] === 'client') next.court.role = c['role']
    if (typeof c['hostAddress'] === 'string') next.court.hostAddress = c['hostAddress'].trim().slice(0, 100)
    if (typeof c['joinCode'] === 'string') next.court.joinCode = c['joinCode'].trim().slice(0, 20)
  }
  return next
}
