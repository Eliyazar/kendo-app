import type { ScoreMark } from '@shared/match-engine'

/** Letter shown for a scoring mark. Fusen-gachi is drawn as an empty circle. */
export const markLetter = (m: ScoreMark): string =>
  m.kind === 'technique' ? m.technique : m.kind === 'hansoku' ? 'H' : ''

/** Ippon mark in the traditional circled-letter style. */
export function MarkBadge({ mark, size, tone }: { mark: ScoreMark; size: number; tone: 'light' | 'dark' }) {
  const color = tone === 'light' ? '#ffffff' : '#0b0b0c'
  return (
    <div
      className="flex animate-pop items-center justify-center rounded-full font-black leading-none"
      style={{
        width: size,
        height: size,
        border: `${Math.round(size * 0.07)}px solid ${color}`,
        color,
        fontSize: size * 0.58
      }}
    >
      {markLetter(mark)}
    </div>
  )
}

/** Yellow warning triangle for one hansoku. */
export function HansokuIcon({ size, outline = '#0b0b0c' }: { size: number; outline?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="animate-pop" aria-label="Hansoku">
      <polygon points="50,6 96,92 4,92" fill="#facc15" stroke={outline} strokeWidth="6" strokeLinejoin="round" />
      <rect x="45" y="34" width="10" height="32" rx="3" fill={outline} />
      <circle cx="50" cy="78" r="6" fill={outline} />
    </svg>
  )
}
