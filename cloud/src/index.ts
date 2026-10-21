// Kendo live results: API worker. Static files (the React app) are served by Workers Static Assets;
// only /api/* reaches this code (see run_worker_first in wrangler.jsonc).
import { errorJson, etagMatches, json, readJsonBody } from './http'
import { checkBearer } from './pin'
import type { Env } from './room'
import { MAX_BODY_BYTES, MAX_SMALL_BODY_BYTES, isSlug, validateAckBody, validateLineupBody, validatePublishPayload, validateTeamLogin } from './validate'

export { TournamentRoom } from './room'
export type { Env } from './room'

const MEMORY_CACHE_MS = 2000
const MEMORY_CACHE_MAX = 200
type Cached = { at: number; value: { json: string; etag: string } | null }
const memoryCache = new Map<string, Cached>()

const roomFor = (env: Env, slug: string) => env.TOURNAMENT.get(env.TOURNAMENT.idFromName(slug))

/** Client address as seen by Cloudflare (used only for PIN rate limiting). */
const clientIp = (request: Request): string => (request.headers.get('CF-Connecting-IP') ?? '').trim().slice(0, 64) || 'unknown'

async function requireKey(request: Request, env: Env): Promise<Response | null> {
  if (!env.PUBLISH_KEY) return errorJson(503, 'PUBLISH_KEY is not configured on the server')
  if (!(await checkBearer(request.headers.get('Authorization'), env.PUBLISH_KEY))) {
    return errorJson(401, 'Unauthorized', {})
  }
  return null
}

async function getSnapshot(request: Request, env: Env, slug: string): Promise<Response> {
  const now = Date.now()
  let entry = memoryCache.get(slug)
  if (!entry || now - entry.at > MEMORY_CACHE_MS) {
    entry = { at: now, value: await roomFor(env, slug).getSnapshot() }
    if (memoryCache.size >= MEMORY_CACHE_MAX) memoryCache.clear()
    memoryCache.set(slug, entry)
  }
  if (!entry.value) return json({ error: 'Tournament not found' }, 404)
  const headers = { ETag: entry.value.etag, 'Cache-Control': 'no-cache' }
  if (etagMatches(request.headers.get('If-None-Match'), entry.value.etag)) return new Response(null, { status: 304, headers })
  return new Response(entry.value.json, { headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } })
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, '')
  const method = request.method
  const notAllowed = () => errorJson(405, 'Method not allowed')

  if (path === '/api/health') return method === 'GET' || method === 'HEAD' ? json({ ok: true }) : notAllowed()

  if (path === '/api/publish') {
    if (method !== 'POST') return notAllowed()
    const denied = await requireKey(request, env)
    if (denied) return denied
    const body = await readJsonBody(request, MAX_BODY_BYTES)
    if (!body.ok) return errorJson(body.status, body.error)
    const checked = validatePublishPayload(body.value)
    if (!checked.ok) return errorJson(400, checked.error)
    await roomFor(env, checked.value.slug).publish(checked.value)
    memoryCache.delete(checked.value.slug)
    return json({ ok: true })
  }

  const admin = /^\/api\/admin\/([^/]+)\/(inbox|ack)$/.exec(path)
  if (admin) {
    const slug = admin[1]!
    if (!isSlug(slug)) return errorJson(404, 'Not found')
    const denied = await requireKey(request, env)
    if (denied) return denied
    if (admin[2] === 'inbox') {
      if (method !== 'GET') return notAllowed()
      return json({ submissions: await roomFor(env, slug).inbox() })
    }
    if (method !== 'POST') return notAllowed()
    const body = await readJsonBody(request, MAX_SMALL_BODY_BYTES * 8)
    if (!body.ok) return errorJson(body.status, body.error)
    const checked = validateAckBody(body.value)
    if (!checked.ok) return errorJson(400, checked.error)
    const removed = await roomFor(env, slug).ack(checked.value.ids)
    return json({ ok: true, removed })
  }

  const pub = /^\/api\/t\/([^/]+)(?:\/(team|lineup))?$/.exec(path)
  if (pub) {
    const slug = pub[1]!
    if (!isSlug(slug)) return errorJson(404, 'Not found')
    if (!pub[2]) return method === 'GET' || method === 'HEAD' ? getSnapshot(request, env, slug) : notAllowed()
    if (method !== 'POST') return notAllowed()
    const body = await readJsonBody(request, MAX_SMALL_BODY_BYTES)
    if (!body.ok) return errorJson(body.status, body.error)

    if (pub[2] === 'team') {
      const checked = validateTeamLogin(body.value)
      if (!checked.ok) return errorJson(400, checked.error)
      const reply = await roomFor(env, slug).teamLogin(checked.value.teamId, checked.value.pin, clientIp(request))
      return reply.ok ? json(reply) : errorJson(reply.status, reply.error, reply.retryAfterSec ? { retryAfterSec: reply.retryAfterSec } : {})
    }
    const checked = validateLineupBody(body.value)
    if (!checked.ok) return errorJson(400, checked.error)
    const { teamId, pin, teamMatchId, lineup } = checked.value
    const reply = await roomFor(env, slug).submitLineup(teamId, pin, clientIp(request), teamMatchId, lineup)
    if (reply.ok) memoryCache.delete(slug)
    return reply.ok ? json({ ok: true }) : errorJson(reply.status, reply.error, reply.retryAfterSec ? { retryAfterSec: reply.retryAfterSec } : {})
  }

  return errorJson(404, 'Not found')
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') return env.ASSETS.fetch(request)
    try {
      return await handleApi(request, env, url)
    } catch (err) {
      console.error('API error', err)
      return errorJson(500, 'Internal error')
    }
  }
} satisfies ExportedHandler<Env>
