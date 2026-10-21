// PIN hashing (must match pinHash() in src/shared/published.ts) and constant-time comparison.

const hex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

export const pinHash = (salt: string, teamId: string, pin: string): Promise<string> => sha256Hex(`${salt}:${teamId}:${pin}`)

/** Compares two strings without leaking their length or the first difference through timing. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)])
  let diff = 0
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i)
  return diff === 0
}

export async function verifyPin(secret: { salt: string; pinHashes: Record<string, string> }, teamId: string, pin: string): Promise<boolean> {
  const expected = Object.hasOwn(secret.pinHashes, teamId) ? secret.pinHashes[teamId] : undefined
  if (!expected) return false
  return safeEqual(await pinHash(secret.salt, teamId, pin), expected)
}

/** "Bearer <key>" check against the configured key. */
export async function checkBearer(header: string | null, key: string | undefined): Promise<boolean> {
  if (!key || !header) return false
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  return m ? safeEqual(m[1]!, key) : false
}
