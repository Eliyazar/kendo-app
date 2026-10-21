import type { PublishedSnapshot, TeamLoginResponse } from '../../src/contract'

export type SnapshotResult =
  | { kind: 'ok'; snapshot: PublishedSnapshot; etag: string | null }
  | { kind: 'same' }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }
  | { kind: 'aborted' }

const TIMEOUT_MS = 10_000

export async function fetchSnapshot(slug: string, etag: string | null, signal: AbortSignal): Promise<SnapshotResult> {
  const timeout = new AbortController()
  const timer = window.setTimeout(() => timeout.abort(), TIMEOUT_MS)
  const onAbort = () => timeout.abort()
  signal.addEventListener('abort', onAbort)
  try {
    const res = await fetch(`/api/t/${encodeURIComponent(slug)}`, {
      headers: etag ? { 'If-None-Match': etag } : {},
      cache: 'no-cache',
      signal: timeout.signal
    })
    if (res.status === 304) return { kind: 'same' }
    if (res.status === 404) return { kind: 'missing' }
    if (!res.ok) return { kind: 'error', message: `Server answered ${res.status}` }
    return { kind: 'ok', snapshot: (await res.json()) as PublishedSnapshot, etag: res.headers.get('ETag') }
  } catch (err) {
    if (signal.aborted) return { kind: 'aborted' }
    return { kind: 'error', message: err instanceof Error ? err.message : 'Network error' }
  } finally {
    window.clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return (await res.json()) as T
  } catch {
    return { ok: false, error: 'No connection. Check your mobile data and try again.' } as T
  }
}

export const teamLogin = (slug: string, teamId: string, pin: string): Promise<TeamLoginResponse> =>
  post<TeamLoginResponse>(`/api/t/${encodeURIComponent(slug)}/team`, { teamId, pin })

export const submitLineup = (slug: string, teamId: string, pin: string, teamMatchId: string, lineup: (string | null)[]): Promise<{ ok: boolean; error?: string }> =>
  post(`/api/t/${encodeURIComponent(slug)}/lineup`, { teamId, pin, teamMatchId, lineup })
