// Court laptop mode: mirror the host laptop's tournament over the local network
// and send this court's actions to it. The host runs the clocks and saves everything.

import type { AdminAction, DispatchResult } from '@shared/ipc'
import { initialState } from '@shared/reducer'
import type { AppState } from '@shared/types'

export interface CourtClientDeps {
  config(): { hostAddress: string; joinCode: string; courtId: string | null }
  onChange(): void
}

/** "192.168.1.20" or "192.168.1.20:7777" -> base URL. */
export function hostUrl(address: string): string {
  const a = address.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  return `http://${a.includes(':') ? a : `${a}:7777`}`
}

export class CourtClient {
  private state: AppState = initialState()
  private offset = 0
  private abort: AbortController | null = null
  private retry: NodeJS.Timeout | null = null
  connected = false
  error: string | undefined

  constructor(private readonly deps: CourtClientDeps) {}

  getState(): AppState {
    return this.state
  }

  /** Host clock minus local clock, for timer display. */
  clockOffset(): number {
    return this.offset
  }

  start(): void {
    this.stop()
    void this.connect(0)
  }

  stop(): void {
    this.abort?.abort()
    this.abort = null
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    this.connected = false
  }

  async dispatch(action: AdminAction): Promise<DispatchResult> {
    const { hostAddress, joinCode, courtId } = this.deps.config()
    const target = courtId ?? this.state.tournament?.courts[0]?.id
    if (!target) return { ok: false, error: 'Not connected to the host yet.' }
    try {
      const res = await fetch(`${hostUrl(hostAddress)}/api/court/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: joinCode, courtId: target, action }),
        signal: AbortSignal.timeout(5000)
      })
      return (await res.json()) as DispatchResult
    } catch {
      return { ok: false, error: 'The host laptop is not reachable. Check the network.' }
    }
  }

  private async connect(attempt: number): Promise<void> {
    const { hostAddress, joinCode, courtId } = this.deps.config()
    if (!hostAddress || !joinCode) {
      this.error = 'Enter the host address and join code.'
      this.deps.onChange()
      return
    }
    this.abort = new AbortController()
    try {
      const url = `${hostUrl(hostAddress)}/api/court/stream?code=${encodeURIComponent(joinCode)}&court=${encodeURIComponent(courtId ?? '')}`
      const res = await fetch(url, { signal: this.abort.signal })
      if (res.status === 403) throw new Error('Wrong join code.')
      if (!res.ok || !res.body) throw new Error(`Host answered ${res.status}.`)
      this.connected = true
      this.error = undefined
      this.deps.onChange()
      attempt = 0
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += value
        let cut: number
        while ((cut = buffer.indexOf('\n\n')) >= 0) {
          const event = buffer.slice(0, cut)
          buffer = buffer.slice(cut + 2)
          const data = event
            .split('\n')
            .filter((l) => l.startsWith('data: '))
            .map((l) => l.slice(6))
            .join('\n')
          if (!data) continue
          const msg = JSON.parse(data) as { state: AppState; serverNow: number }
          this.state = msg.state
          this.offset = msg.serverNow - Date.now()
          this.deps.onChange()
        }
      }
      throw new Error('Connection to the host closed.')
    } catch (err) {
      if (this.abort?.signal.aborted) return
      this.connected = false
      this.error = err instanceof Error ? err.message : String(err)
      this.deps.onChange()
      const wait = Math.min(10_000, 1000 * 2 ** attempt)
      this.retry = setTimeout(() => void this.connect(attempt + 1), wait)
    }
  }
}
