// Local HTTP server (no internet needed):
//   /overlay?court=A          stream overlay page for OBS (Browser Source)
//   /api/view?court=A         current public view (JSON)
//   /api/events?court=A       Server-Sent Events: the public view on every change
//   /api/court/stream         court laptops: tournament state on every change (join code)
//   /api/court/dispatch       court laptops: send an action for their court (join code)
// Read-only for viewers; only the court endpoints change anything, and only with the code.

import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type { AdminAction, DispatchResult, SharingInfo } from '@shared/ipc'
import { toPublicView } from '@shared/public-view'
import type { AppState, Tournament } from '@shared/types'

export interface ServerDeps {
  getState(): AppState
  /** Apply an action sent by a court laptop (already validated). */
  dispatchFromCourt(input: unknown, courtId: string): DispatchResult
  joinCode(): string
  /** Built renderer files (production). */
  rendererDir: string
  /** Vite dev server URL (development): page requests are proxied there. */
  devUrl?: string | undefined
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
}

/** `A`, `B`, … or a court id. */
export function resolveCourt(t: Tournament | null, ref: string | null): string | undefined {
  if (!t || !ref) return t?.courts[0]?.id
  const byLetter = /^[A-Za-z]$/.test(ref) ? t.courts[ref.toUpperCase().charCodeAt(0) - 65] : undefined
  return (byLetter ?? t.courts.find((c) => c.id === ref) ?? t.courts[0])?.id
}

export const courtLetter = (t: Tournament | null, courtId: string | null): string => {
  const i = t && courtId ? t.courts.findIndex((c) => c.id === courtId) : 0
  return String.fromCharCode(65 + Math.max(0, i))
}

export function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((n): n is os.NetworkInterfaceInfo => Boolean(n && n.family === 'IPv4' && !n.internal))
    .map((n) => n.address)
}

interface Listener {
  res: http.ServerResponse
  kind: 'view' | 'court'
  court: string | null
  last: string
  address: string
}

const MAX_BODY = 64 * 1024

export class LocalServer {
  private server: http.Server | null = null
  private listeners = new Set<Listener>()
  private heartbeat: NodeJS.Timeout | null = null
  private status: { running: boolean; port: number; lan: boolean; error?: string } = { running: false, port: 0, lan: false }

  constructor(private readonly deps: ServerDeps) {}

  async start(port: number, lan: boolean): Promise<void> {
    await this.stop()
    const server = http.createServer((req, res) => this.handle(req, res))
    await new Promise<void>((resolve) => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        this.status = { running: false, port, lan, error: err.code === 'EADDRINUSE' ? `Port ${port} is already in use.` : err.message }
        resolve()
      })
      server.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
        this.status = { running: true, port, lan }
        resolve()
      })
    })
    if (this.status.running) {
      this.server = server
      this.heartbeat = setInterval(() => this.listeners.forEach((l) => l.res.write(': ping\n\n')), 15_000)
    }
  }

  async stop(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    this.listeners.forEach((l) => l.res.end())
    this.listeners.clear()
    const s = this.server
    this.server = null
    if (s) await new Promise<void>((resolve) => s.close(() => resolve()))
  }

  info(courtLetterFor: string): SharingInfo {
    const { running, port, lan, error } = this.status
    const hosts = lan ? lanAddresses() : ['localhost']
    const out: SharingInfo = { running, overlayUrls: running ? hosts.map((h) => `http://${h}:${port}/overlay?court=${courtLetterFor}`) : [] }
    if (error) out.error = error
    return out
  }

  /** Court laptops currently connected. */
  clients(): { courtName: string; address: string }[] {
    const t = this.deps.getState().tournament
    return [...this.listeners]
      .filter((l) => l.kind === 'court')
      .map((l) => ({ courtName: t?.courts.find((c) => c.id === l.court)?.name ?? '?', address: l.address }))
  }

  /** Push the new state to every overlay and court laptop. */
  notify(): void {
    const state = this.deps.getState()
    for (const l of this.listeners) this.push(l, state)
  }

  private push(l: Listener, state: AppState): void {
    const body =
      l.kind === 'view'
        ? JSON.stringify(toPublicView(state, resolveCourt(state.tournament, l.court)))
        : JSON.stringify({ state, serverNow: Date.now() })
    if (l.kind === 'view' && body === l.last) return
    l.last = body
    l.res.write(`data: ${body}\n\n`)
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://local')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      if (url.pathname === '/api/court/dispatch' && req.method === 'POST') return this.courtDispatch(req, res)
      if (req.method !== 'GET') return this.send(res, 405, 'Method not allowed')
      if (url.pathname === '/api/view') {
        const state = this.deps.getState()
        return this.json(res, toPublicView(state, resolveCourt(state.tournament, url.searchParams.get('court'))))
      }
      if (url.pathname === '/api/events') return this.subscribe(req, res, 'view', url.searchParams.get('court'))
      if (url.pathname === '/api/court/stream') {
        if (url.searchParams.get('code') !== this.deps.joinCode()) return this.send(res, 403, 'Wrong join code')
        return this.subscribe(req, res, 'court', url.searchParams.get('court'))
      }
      if (url.pathname === '/' || url.pathname === '/overlay') return this.page(req, res, '/overlay.html' + url.search)
      return this.page(req, res, url.pathname + url.search)
    } catch {
      this.send(res, 500, 'Server error')
    }
  }

  private subscribe(req: http.IncomingMessage, res: http.ServerResponse, kind: Listener['kind'], court: string | null): void {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    const l: Listener = { res, kind, court, last: '', address: req.socket.remoteAddress?.replace(/^::ffff:/, '') ?? '' }
    this.listeners.add(l)
    this.push(l, this.deps.getState())
    req.on('close', () => this.listeners.delete(l))
  }

  private courtDispatch(req: http.IncomingMessage, res: http.ServerResponse): void {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) req.destroy()
      else chunks.push(c)
    })
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { code?: unknown; courtId?: unknown; action?: unknown }
        if (body.code !== this.deps.joinCode()) return this.json(res, { ok: false, error: 'Wrong join code.' }, 403)
        if (typeof body.courtId !== 'string') return this.json(res, { ok: false, error: 'No court.' }, 400)
        this.json(res, this.deps.dispatchFromCourt(body.action, body.courtId))
      } catch {
        this.json(res, { ok: false, error: 'Bad request.' }, 400)
      }
    })
  }

  /** Overlay page and its assets: from the build, or proxied to Vite in development. */
  private page(req: http.IncomingMessage, res: http.ServerResponse, pathAndQuery: string): void {
    const { devUrl } = this.deps
    if (devUrl) {
      const target = new URL(pathAndQuery, devUrl)
      const upstream = http.get(target, { headers: { accept: req.headers.accept ?? '*/*' } }, (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers)
        up.pipe(res)
      })
      upstream.on('error', () => this.send(res, 502, 'Dev server not reachable'))
      return
    }
    const pathname = decodeURIComponent(pathAndQuery.split('?')[0]!)
    const allowed = pathname === '/overlay.html' || pathname.startsWith('/assets/')
    const file = path.normalize(path.join(this.deps.rendererDir, pathname))
    if (!allowed || !file.startsWith(path.normalize(this.deps.rendererDir))) return this.send(res, 404, 'Not found')
    fs.readFile(file, (err, data) => {
      if (err) return this.send(res, 404, 'Not found')
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
      res.end(data)
    })
  }

  private json(res: http.ServerResponse, body: unknown, status = 200): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  private send(res: http.ServerResponse, status: number, text: string): void {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(text)
  }
}
