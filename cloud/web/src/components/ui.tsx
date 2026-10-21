import type { ReactNode } from 'react'
import type { ScoreMark } from '../../../src/contract'
import { highlightParts } from '../lookup'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface ${className}`}>{children}</section>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">{children}</div>
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-baseline justify-between gap-3 first:mt-0">
      <h2 className="display text-xl text-ink">{children}</h2>
      {right}
    </div>
  )
}

type Tone = 'neutral' | 'amber' | 'ok' | 'aka'
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  amber: 'bg-amber/15 text-amber',
  ok: 'bg-ok/15 text-ok',
  aka: 'bg-aka/15 text-aka'
}

export function Chip({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${TONES[tone]} ${className}`}>
      {children}
    </span>
  )
}

export function SideDot({ side, className = '' }: { side: 'aka' | 'shiro'; className?: string }) {
  return <span aria-label={side === 'aka' ? 'Aka (red)' : 'Shiro (white)'} className={`inline-block size-2.5 shrink-0 rounded-full ${side === 'aka' ? 'bg-aka' : 'bg-shiro'} ${className}`} />
}

export function Country({ code }: { code?: string | undefined }) {
  if (!code) return null
  return <span className="rounded bg-surface-2 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-muted">{code.slice(0, 3)}</span>
}

/** A scored point: circled letter; fusen-gachi (no letter) is an empty circle. */
export function MarkCircle({ letter, size = 'md' }: { letter: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'size-9 text-xl' : size === 'sm' ? 'size-5 text-[11px]' : 'size-7 text-base'
  return (
    <span
      aria-label={letter ? `Point ${letter}` : 'Point (fusen-gachi)'}
      className={`display inline-flex shrink-0 items-center justify-center rounded-full border-2 border-ink leading-none tracking-normal text-ink ${dims}`}
    >
      {letter}
    </span>
  )
}

export const markLetter = (m: ScoreMark): string => (m.kind === 'technique' ? m.technique : m.kind === 'hansoku' ? 'H' : '')

export function MarkList({ marks, size }: { marks: ScoreMark[]; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {marks.map((m, i) => (
        <MarkCircle key={i} letter={markLetter(m)} {...(size ? { size } : {})} />
      ))}
    </span>
  )
}

/** Result marks as published for finished matches, e.g. "MK", "H", "○○" (fusen-gachi). */
export function MarkString({ value, size = 'sm' }: { value: string; size?: 'sm' | 'md' }) {
  return (
    <span className="inline-flex items-center gap-1">
      {[...value].map((ch, i) => (
        <MarkCircle key={i} letter={ch === '○' ? '' : ch} size={size} />
      ))}
    </span>
  )
}

export function HansokuTriangles({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${count} hansoku`}>
      {Array.from({ length: count }, (_, i) => (
        <svg key={i} viewBox="0 0 12 12" className="size-3.5 text-amber" aria-hidden="true">
          <path d="M6 1.2 11.2 10.6H0.8Z" fill="currentColor" />
        </svg>
      ))}
    </span>
  )
}

/** Text with the words of the search query highlighted. */
export function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  return (
    <>
      {highlightParts(text, query).map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-sm bg-amber/25 px-px text-amber">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-sm text-muted" role="status">
      <span className="size-6 animate-spin rounded-full border-2 border-line border-t-amber" />
      {label}
    </div>
  )
}
