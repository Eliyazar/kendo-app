/** Short random id with a readable prefix, e.g. `m_3f9a1c2e`. */
export const uid = (prefix: string): string => `${prefix}_${globalThis.crypto.randomUUID().slice(0, 8)}`

/** Small seeded PRNG (mulberry32) so a draw can be reproduced from its seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/** Random 4-digit captain PIN. */
export const newPin = (): string => String(globalThis.crypto.getRandomValues(new Uint32Array(1))[0]! % 10_000).padStart(4, '0')
