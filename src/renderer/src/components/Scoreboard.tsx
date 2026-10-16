// The public scoreboard, drawn on a fixed 1920×1080 canvas (see ScaledStage).
// Read-only and deliberately clock-free: it never shows the remaining time.

import { useEffect, useState } from 'react'
import type { PublicCompetitor, PublicMatch, PublicView } from '@shared/public-view'
import { HansokuIcon, MarkBadge } from './Marks'

const TIME_UP_FLASH_MS = 4000

/** Shrink long names so they always fit on one line of a 960px half. */
const nameSize = (name: string): number => Math.min(124, Math.floor(820 / (Math.max(name.length, 1) * 0.56)))

function Half({ side, c }: { side: 'aka' | 'shiro'; c: PublicCompetitor }) {
  const aka = side === 'aka'
  const tone = aka ? 'light' : 'dark'
  const slots = Math.max(2, c.marks.length)
  return (
    <div className={`relative flex flex-col items-center px-14 pt-14 pb-10 ${aka ? 'bg-aka text-white' : 'bg-shiro text-ink'}`}>
      <div className="mb-2 text-[38px] font-bold tracking-[0.3em] uppercase opacity-60">{aka ? 'Aka' : 'Shiro'}</div>
      <div className="w-full truncate text-center leading-tight font-black" style={{ fontSize: nameSize(c.name) }}>
        {c.name}
      </div>
      <div className="mt-2 w-full truncate text-center text-[52px] font-semibold opacity-75">{c.dojo}</div>

      <div className="flex flex-1 items-center justify-center gap-12">
        {Array.from({ length: slots }, (_, i) => {
          const mark = c.marks[i]
          return mark ? (
            <MarkBadge key={i} mark={mark} size={240} tone={tone} />
          ) : (
            <div
              key={i}
              className="rounded-full border-[10px] border-dashed opacity-15"
              style={{ width: 240, height: 240, borderColor: aka ? '#fff' : '#0b0b0c' }}
            />
          )
        })}
      </div>

      <div className="flex h-[120px] items-center gap-6">
        {Array.from({ length: c.hansoku }, (_, i) => (
          <HansokuIcon key={i} size={112} outline={aka ? '#5a0612' : '#0b0b0c'} />
        ))}
      </div>
    </div>
  )
}

function TeamBand({ view }: { view: PublicView }) {
  const t = view.team
  if (!t) return null
  return (
    <div className="flex h-[100px] items-center justify-center gap-10 bg-neutral-900 text-[46px] font-bold">
      <span className="max-w-[560px] truncate text-right text-red-400">{t.akaTeam}</span>
      <span className="tabular rounded-lg bg-aka px-6 text-white">
        {t.akaWins} <span className="text-[34px] opacity-70">({t.akaIppons})</span>
      </span>
      <span className="opacity-40">—</span>
      <span className="tabular rounded-lg bg-shiro px-6 text-ink">
        {t.shiroWins} <span className="text-[34px] opacity-70">({t.shiroIppons})</span>
      </span>
      <span className="max-w-[560px] truncate">{t.shiroTeam}</span>
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

export function Scoreboard({ view }: { view: PublicView | null }) {
  const m = view?.match ?? null
  const flash = useTimeUpFlash(m)

  return (
    <div className="relative flex h-full w-full flex-col bg-ink text-white">
      <header className="grid h-[110px] grid-cols-[1fr_auto_1fr] items-center bg-neutral-950 px-12">
        <div className="truncate text-[36px] font-semibold tracking-wide uppercase opacity-60">
          {view?.tournamentName ?? 'Kendo Tournament Manager'}
        </div>
        <div className="text-[52px] font-black tracking-wide">
          {m ? [m.label, m.positionLabel].filter(Boolean).join(' · ') : ''}
        </div>
        <div className="flex justify-end gap-5">
          {m?.encho && <span className="rounded-xl bg-amber-500 px-6 py-1 text-[44px] font-black text-ink">ENCHO</span>}
          {m?.timeUp && !flash && (
            <span className="animate-pulse rounded-xl bg-hansoku px-6 py-1 text-[44px] font-black text-ink">TIME UP</span>
          )}
        </div>
      </header>

      {view && <TeamBand view={view} />}

      {m ? (
        <main className="grid flex-1 grid-cols-2">
          <Half side="aka" c={m.aka} />
          <Half side="shiro" c={m.shiro} />
        </main>
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center gap-6">
          {view?.champion ? (
            <>
              <div className="text-[52px] font-bold tracking-[0.3em] text-amber-300 uppercase">Champion</div>
              <div className="text-center text-[140px] leading-none font-black">{view.champion.name}</div>
              <div className="text-[56px] opacity-60">{view.champion.dojo}</div>
            </>
          ) : (
            <>
              <div className="text-[96px] font-black">{view?.tournamentName ?? 'Kendo Tournament Manager'}</div>
              <div className="text-[48px] opacity-50">Waiting for the next match</div>
            </>
          )}
        </main>
      )}

      <footer className={`flex h-[110px] items-center gap-8 bg-neutral-950 px-12 text-[46px] ${view?.champion ? 'invisible' : ''}`}>
        <span className="shrink-0 rounded-lg bg-white/10 px-5 py-1 text-[34px] font-bold tracking-widest uppercase">Next match</span>
        <span className="truncate font-semibold">
          {view?.nextMatch ? (
            <>
              {view.nextMatch.aka.name} <span className="opacity-60">({view.nextMatch.aka.dojo})</span>
              <span className="mx-5 opacity-40">vs.</span>
              {view.nextMatch.shiro.name} <span className="opacity-60">({view.nextMatch.shiro.dojo})</span>
            </>
          ) : (
            <span className="opacity-50">—</span>
          )}
        </span>
      </footer>

      {flash && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/75">
          <div className="animate-flash rounded-[48px] bg-hansoku px-24 py-8 text-[300px] leading-none font-black text-ink">
            TIME UP
          </div>
        </div>
      )}
    </div>
  )
}
