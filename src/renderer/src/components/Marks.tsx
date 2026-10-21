import type { ScoreMark } from '@shared/match-engine'
import { markLetter } from '@shared/marks'

const INK = '#0b0d12'
const AKA = '#e0303f'
const SHIRO = '#f2f2ee'

/**
 * Ippon mark: a disc in the side's colour with the technique letter
 * (fill), or a ring in a given colour (outline, used on coloured headers).
 * Fusen-gachi has no letter.
 */
export function MarkBadge({
  mark,
  size,
  side,
  variant = 'fill',
  tone
}: {
  mark: ScoreMark
  size: number
  side?: 'aka' | 'shiro'
  variant?: 'fill' | 'outline'
  /** Outline colour on coloured backgrounds. */
  tone?: 'light' | 'dark'
}) {
  const fill = variant === 'fill'
  const bg = fill ? (side === 'aka' ? AKA : SHIRO) : 'transparent'
  const fg = fill ? (side === 'aka' ? '#ffffff' : INK) : tone === 'dark' ? INK : '#ffffff'
  return (
    <div
      className="display flex animate-pop items-center justify-center rounded-full leading-none font-bold"
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        border: fill ? 'none' : `${Math.max(2, Math.round(size * 0.07))}px solid ${fg}`,
        fontSize: size * 0.62,
        boxShadow: fill ? '0 6px 24px rgb(0 0 0 / 0.35)' : 'none'
      }}
    >
      {markLetter(mark)}
    </div>
  )
}

/** Empty slot for an ippon not (yet) scored. */
export function MarkSlot({ size }: { size: number }) {
  return <div className="rounded-full" style={{ width: size, height: size, border: `${Math.max(2, Math.round(size * 0.035))}px solid rgb(255 255 255 / 0.09)` }} />
}

/** Amber warning triangle for one hansoku. */
export function HansokuIcon({ size, outline = INK }: { size: number; outline?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="animate-pop" aria-label="Hansoku">
      <polygon points="50,6 96,92 4,92" fill="#f6c445" stroke={outline} strokeWidth="6" strokeLinejoin="round" />
      <rect x="45" y="34" width="10" height="32" rx="3" fill={outline} />
      <circle cx="50" cy="78" r="6" fill={outline} />
    </svg>
  )
}

/** IOC country code chip, e.g. BUL. */
export function CountryChip({ code, size = 16 }: { code?: string | undefined; size?: number }) {
  if (!code) return null
  return (
    <span
      className="inline-flex shrink-0 items-center rounded font-semibold tracking-wider"
      style={{ fontSize: size, padding: `${size * 0.12}px ${size * 0.4}px`, background: 'rgb(255 255 255 / 0.1)', color: '#f4f5f7' }}
    >
      {code}
    </span>
  )
}
