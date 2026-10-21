// Stream overlay for OBS (Browser Source, 1920×1080, transparent):
// a compact lower-third with what the hall scoreboard shows. Served by the
// app's local server and updated live over Server-Sent Events.

import { useEffect, useState } from 'react'
import type { PublicCompetitor, PublicView } from '@shared/public-view'
import { CountryChip, HansokuIcon, MarkBadge, MarkSlot } from '../components/Marks'
import { ScaledStage } from '../components/ScaledStage'

function useLiveView(): PublicView | null {
  const [view, setView] = useState<PublicView | null>(null)
  useEffect(() => {
    const court = new URLSearchParams(location.search).get('court') ?? 'A'
    const source = new EventSource(`/api/events?court=${encodeURIComponent(court)}`)
    source.onmessage = (e) => setView(JSON.parse(e.data) as PublicView)
    return () => source.close()
  }, [])
  return view
}

function Side({ side, c }: { side: 'aka' | 'shiro'; c: PublicCompetitor }) {
  const aka = side === 'aka'
  const marks = (
    <div className={`flex items-center gap-3 ${aka ? '' : 'flex-row-reverse'}`}>
      {Array.from({ length: Math.max(2, c.marks.length) }, (_, i) =>
        c.marks[i] ? <MarkBadge key={i} mark={c.marks[i]!} size={66} side={side} /> : <MarkSlot key={i} size={66} />
      )}
      {Array.from({ length: c.hansoku }, (_, i) => (
        <HansokuIcon key={`h${i}`} size={34} />
      ))}
    </div>
  )
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-6 ${aka ? 'pr-6' : 'flex-row-reverse pl-6'}`}>
      <div className={`h-full w-[12px] shrink-0 ${aka ? 'rounded-l-[18px] bg-aka' : 'rounded-r-[18px] bg-shiro'}`} />
      <div className={`min-w-0 flex-1 ${aka ? '' : 'text-right'}`}>
        <div className="display truncate text-[56px] leading-none font-bold text-white">{c.name}</div>
        <div className={`mt-2 flex items-center gap-3 text-[24px] text-muted ${aka ? '' : 'flex-row-reverse'}`}>
          <CountryChip code={c.country} size={20} />
          <span className="truncate">{c.dojo}</span>
        </div>
      </div>
      {marks}
    </div>
  )
}

export function OverlayApp() {
  const view = useLiveView()
  const m = view?.match ?? null
  const t = view?.team ?? null

  return (
    <ScaledStage className="h-full w-full">
      <div className="relative h-full w-full">
        {m && (
          <div key={m.id} className="absolute bottom-[56px] left-1/2 w-[1640px] -translate-x-1/2 animate-rise">
            <div className="mb-2 flex items-center gap-3 px-2">
              <span className="display rounded-md bg-ink/90 px-4 py-1 text-[26px] font-bold tracking-wider text-white">
                {[m.label, m.positionLabel].filter(Boolean).join(' · ')}
              </span>
              {m.encho && <span className="display rounded-md bg-hansoku px-4 py-1 text-[26px] font-bold text-ink">Encho</span>}
              {m.timeUp && <span className="display animate-pulse rounded-md bg-hansoku px-4 py-1 text-[26px] font-bold text-ink">Time up</span>}
              {view?.multiCourt && <span className="ml-auto rounded-md bg-ink/90 px-4 py-1 text-[22px] font-semibold tracking-wider text-muted">{view.courtName}</span>}
            </div>
            <div className="flex h-[128px] items-stretch rounded-[18px] border border-line bg-ink/92 shadow-2xl">
              <Side side="aka" c={m.aka} />
              <div className="flex w-[190px] shrink-0 flex-col items-center justify-center border-x border-line">
                {t ? (
                  <>
                    <div className="display tabular text-[54px] leading-none font-bold">
                      <span className="text-aka">{t.akaWins}</span>
                      <span className="mx-2 text-muted">:</span>
                      <span>{t.shiroWins}</span>
                    </div>
                    <div className="tabular text-[20px] text-muted">
                      ({t.akaIppons} : {t.shiroIppons})
                    </div>
                  </>
                ) : (
                  <span className="display text-[34px] font-bold tracking-widest text-muted">VS</span>
                )}
              </div>
              <Side side="shiro" c={m.shiro} />
            </div>
          </div>
        )}
      </div>
    </ScaledStage>
  )
}
