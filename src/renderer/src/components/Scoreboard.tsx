// The hall scoreboard, drawn on a fixed 1920×1080 canvas (see ScaledStage).
// Read-only and deliberately clock-free: it never shows the remaining time.
// Dark broadcast style: red and white mark the sides, not whole halves.

import { useEffect, useState } from 'react'
import type { Person, PublicCompetitor, PublicMatch, PublicView } from '@shared/public-view'
import { CountryChip, HansokuIcon, MarkBadge, MarkSlot } from './Marks'

const TIME_UP_FLASH_MS = 4000

/** Shrink long names so they always fit on one line of a 960px half. */
const nameSize = (name: string): number => Math.min(150, Math.floor(860 / (Math.max(name.length, 1) * 0.47)))

function Half({ side, c }: { side: 'aka' | 'shiro'; c: PublicCompetitor }) {
  const aka = side === 'aka'
  const slots = Math.max(2, c.marks.length)
  return (
    <div className="relative flex flex-col px-16 pt-0 pb-12">
      <div className={`h-[14px] ${aka ? 'bg-aka' : 'bg-shiro'}`} />
      <div className={`mt-10 text-[34px] font-bold tracking-[0.4em] uppercase ${aka ? 'text-aka' : 'text-shiro'}`}>{aka ? 'Aka' : 'Shiro'}</div>
      <div className="display mt-2 w-full truncate leading-[0.95] font-bold text-white" style={{ fontSize: nameSize(c.name) }}>
        {c.name}
      </div>
      <div className="mt-4 flex items-center gap-5 text-[44px] text-muted">
        <CountryChip code={c.country} size={34} />
        <span className="truncate">{c.dojo}</span>
      </div>

      <div className="flex flex-1 items-center gap-10">
        {Array.from({ length: slots }, (_, i) => {
          const mark = c.marks[i]
          return mark ? <MarkBadge key={i} mark={mark} size={220} side={side} /> : <MarkSlot key={i} size={220} />
        })}
      </div>

      <div className="flex h-[96px] items-center gap-5">
        {c.hansoku > 0 && (
          <>
            {Array.from({ length: c.hansoku }, (_, i) => (
              <HansokuIcon key={i} size={88} />
            ))}
            <span className="ml-3 text-[30px] font-semibold tracking-[0.3em] text-hansoku uppercase">Hansoku</span>
          </>
        )}
      </div>
    </div>
  )
}

function TeamBand({ view }: { view: PublicView }) {
  const t = view.team
  if (!t) return null
  const pill = (wins: number, ippons: number, aka: boolean) => (
    <span className={`tabular flex items-baseline gap-3 rounded-xl px-7 py-1 ${aka ? 'bg-aka text-white' : 'bg-shiro text-ink'}`}>
      <span className="display text-[64px] leading-none font-bold">{wins}</span>
      <span className="text-[30px] opacity-70">({ippons})</span>
    </span>
  )
  return (
    <div className="flex h-[108px] items-center justify-center gap-10 border-b border-line bg-surface">
      <span className="display max-w-[600px] truncate text-right text-[54px] font-bold">{t.akaTeam}</span>
      {pill(t.akaWins, t.akaIppons, true)}
      <span className="text-[40px] text-muted">:</span>
      {pill(t.shiroWins, t.shiroIppons, false)}
      <span className="display max-w-[600px] truncate text-[54px] font-bold">{t.shiroTeam}</span>
    </div>
  )
}

function useTimeUpFlash(match: PublicMatch | null): boolean {
  const [flash, setFlash] = useState(false)
  const key = match?.timeUp ? match.id : null
  useEffect(() => {
    if (!key) {
      setFlash(false)
      return
    }
    setFlash(true)
    const id = setTimeout(() => setFlash(false), TIME_UP_FLASH_MS)
    return () => clearTimeout(id)
  }, [key])
  return flash
}

const who = (p: Person) => (
  <>
    <span className="font-semibold text-white">{p.name}</span>
    {p.country && <span className="ml-3 text-[30px] font-semibold tracking-wider text-muted">{p.country}</span>}
  </>
)

export function Scoreboard({ view }: { view: PublicView | null }) {
  const m = view?.match ?? null
  const flash = useTimeUpFlash(m)

  return (
    <div className="relative flex h-full w-full flex-col bg-ink text-white">
      <header className="grid h-[104px] grid-cols-[1fr_auto_1fr] items-center border-b border-line px-16">
        <div className="truncate text-[30px] font-semibold tracking-[0.2em] text-muted uppercase">
          {view?.tournamentName ?? 'Kendo Tournament Manager'}
        </div>
        <div className="display text-[56px] font-bold tracking-wide">{m ? [m.label, m.positionLabel].filter(Boolean).join(' · ') : ''}</div>
        <div className="flex items-center justify-end gap-5">
          {m?.encho && <span className="display rounded-lg bg-hansoku px-6 py-0.5 text-[46px] font-bold text-ink">Encho</span>}
          {m?.timeUp && !flash && <span className="display animate-pulse rounded-lg bg-hansoku px-6 py-0.5 text-[46px] font-bold text-ink">Time up</span>}
          {view?.multiCourt && <span className="display text-[40px] font-semibold tracking-wider text-muted">{view.courtName}</span>}
        </div>
      </header>

      {view && <TeamBand view={view} />}

      {m ? (
        <main className="relative grid flex-1 grid-cols-2">
          <Half side="aka" c={m.aka} />
          <Half side="shiro" c={m.shiro} />
          <div className="absolute top-[14px] bottom-12 left-1/2 w-px bg-line" />
        </main>
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center gap-6">
          {view?.champion ? (
            <div className="flex animate-rise flex-col items-center gap-6">
              <div className="text-[44px] font-bold tracking-[0.5em] text-hansoku uppercase">Champion</div>
              <div className="display text-center text-[170px] leading-none font-bold">{view.champion.name}</div>
              <div className="flex items-center gap-5 text-[52px] text-muted">
                <CountryChip code={view.champion.country} size={40} />
                {view.champion.dojo}
              </div>
            </div>
          ) : (
            <>
              <div className="display text-[110px] font-bold">{view?.tournamentName ?? 'Kendo Tournament Manager'}</div>
              <div className="text-[44px] text-muted">{view?.multiCourt ? `${view.courtName} · ` : ''}Waiting for the next match</div>
            </>
          )}
        </main>
      )}

      <footer className={`flex h-[104px] items-center gap-8 border-t border-line bg-surface px-16 text-[46px] ${view?.champion ? 'invisible' : ''}`}>
        <span className="shrink-0 text-[30px] font-bold tracking-[0.35em] text-hansoku uppercase">Next</span>
        <span className="flex min-w-0 items-center truncate">
          {view?.nextMatch ? (
            <>
              <span className="mr-4 inline-block h-6 w-6 shrink-0 rounded-full bg-aka" />
              {who(view.nextMatch.aka)}
              <span className="mx-8 text-muted">vs</span>
              <span className="mr-4 inline-block h-6 w-6 shrink-0 rounded-full bg-shiro" />
              {who(view.nextMatch.shiro)}
            </>
          ) : (
            <span className="text-muted">—</span>
          )}
        </span>
      </footer>

      {flash && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="display animate-flash rounded-[40px] bg-hansoku px-28 py-6 text-[300px] leading-none font-bold text-ink">Time up</div>
        </div>
      )}
    </div>
  )
}
