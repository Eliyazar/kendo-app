// Small HTTP helpers (web-standard APIs only).

const BASE_HEADERS = { 'X-Content-Type-Options': 'nosniff' }

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...BASE_HEADERS, ...extra }
  })
}

export const errorJson = (status: number, error: string, extra: Record<string, unknown> = {}): Response => json({ ok: false, error, ...extra }, status)

export type BodyResult = { ok: true; text: string } | { ok: false; status: number; error: string }

/** Reads a request body as text, refusing anything larger than `max` bytes (also while streaming). */
export async function readBodyText(req: Request, max: number): Promise<BodyResult> {
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > max) return { ok: false, status: 413, error: 'Body too large' }
  if (!req.body) return { ok: true, text: '' }
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => undefined)
      return { ok: false, status: 413, error: 'Body too large' }
    }
    chunks.push(value)
  }
  const all = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    all.set(c, offset)
    offset += c.byteLength
  }
  return { ok: true, text: new TextDecoder().decode(all) }
}

export async function readJsonBody(req: Request, max: number): Promise<{ ok: true; value: unknown } | { ok: false; status: number; error: string }> {
  const body = await readBodyText(req, max)
  if (!body.ok) return body
  try {
    return { ok: true, value: JSON.parse(body.text) as unknown }
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON' }
  }
}

/** True when an If-None-Match header lists the given ETag (weak validators and lists handled). */
export function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false
  return header.split(',').some((part) => {
    const v = part.trim().replace(/^W\//, '')
    return v === '*' || v === etag
  })
}
