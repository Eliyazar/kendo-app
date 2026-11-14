// Stream overlay for OBS (Browser Source, 1920×1080, transparent):
// a compact lower-third with what the hall scoreboard shows. Served by the
// app's local server and updated live over Server-Sent Events.

import { useEffect, useState } from 'react'
import type { PublicCompetitor, PublicView } from '@shared/public-view'
import { CountryChip, HansokuIcon, MarkBadge, MarkSlot } from '../components/Marks'
import { ScaledStage } from '../components/ScaledStage'
import { countryName } from '@shared/countries'
import { FitText } from '../components/FitText'

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

/** Shiro on the left, Aka on the right (as the court is seen from the table). */
function Side({ side, c }: { side: 'aka' | 'shiro'; c: PublicCompetitor }) {
  const left = side === 'shiro'
  const marks = (
    <div className={`flex items-center gap-3 ${left ? '' : 'flex-row-reverse'}`}>
      {Array.from({ length: Math.max(2, c.marks.length) }, (_, i) =>
        c.marks[i] ? <MarkBadge key={i} mark={c.marks[i]!} size={66} side={side} /> : <MarkSlot key={i} size={66} />
      )}
      {Array.from({ length: c.hansoku }, (_, i) => (
        <HansokuIcon key={`h${i}`} size={34} />
      ))}
    </div>
  )
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-6 ${left ? 'pr-6' : 'flex-row-reverse pl-6'}`}>
      <div className={`h-full w-[12px] shrink-0 ${left ? 'rounded-l-[18px]' : 'rounded-r-[18px]'} ${side === 'aka' ? 'bg-aka' : 'bg-shiro'}`} />
      <div className={`min-w-0 flex-1 ${left ? '' : 'text-right'}`}>
        <FitText text={c.name} max={56} min={34} className="display leading-none font-bold text-white" />
        <div className={`mt-2 flex items-center gap-3 text-[24px] text-muted ${left ? '' : 'flex-row-reverse'}`}>
          <CountryChip code={c.country} size={20} />
          {c.country && <span className="shrink-0 font-semibold text-white/85">{countryName(c.country) ?? c.country}</span>}
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
                {[view?.multiCategory ? view.categoryName : null, m.label, m.positionLabel].filter(Boolean).join(' · ')}
              </span>
              {m.encho && <span className="display rounded-md bg-hansoku px-4 py-1 text-[26px] font-bold text-ink">Encho</span>}
              {m.timeUp && <span className="display animate-pulse rounded-md bg-hansoku px-4 py-1 text-[26px] font-bold text-ink">Time up</span>}
              {view?.multiCourt && <span className="ml-auto rounded-md bg-ink/90 px-4 py-1 text-[22px] font-semibold tracking-wider text-muted">{view.courtName}</span>}
            </div>
            <div className="flex h-[128px] items-stretch rounded-[18px] border border-line bg-ink/92 shadow-2xl">
              <Side side="shiro" c={m.shiro} />
              <div className="flex w-[190px] shrink-0 flex-col items-center justify-center border-x border-line">
                {t ? (
                  <>
                    <div className="display tabular text-[54px] leading-none font-bold">
                      <span>{t.shiroWins}</span>
                      <span className="mx-2 text-muted">:</span>
                      <span className="text-aka">{t.akaWins}</span>
                    </div>
                    <div className="tabular text-[20px] text-muted">
                      ({t.shiroIppons} : {t.akaIppons})
                    </div>
                  </>
                ) : (
                  <span className="display text-[34px] font-bold tracking-widest text-muted">VS</span>
                )}
              </div>
              <Side side="aka" c={m.aka} />
            </div>
          </div>
        )}
      </div>
    </ScaledStage>
  )
}
