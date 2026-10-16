// PLACEHOLDER public scoreboard: proves the read-only subscription works.
// The real high-contrast scoreboard is built in the next phase.

import { useEffect, useState } from 'react'
import type { PublicView } from '@shared/public-view'
import { playBuzzer } from './buzzer'

function usePublicView(): PublicView | null {
  const [view, setView] = useState<PublicView | null>(null)
  useEffect(() => {
    const offView = window.kendoPublic.onView(setView)
    const offBuzzer = window.kendoPublic.onBuzzer(playBuzzer)
    void window.kendoPublic.getView().then(setView)
    return () => {
      offView()
      offBuzzer()
    }
  }, [])
  return view
}

export function PublicApp() {
  const view = usePublicView()
  const m = view?.match

  return (
    <div className="flex h-full flex-col">
      <div className="grid flex-1 grid-cols-2">
        {m ? (
          (['aka', 'shiro'] as const).map((side) => (
            <div
              key={side}
              className={`flex flex-col items-center justify-center gap-4 ${side === 'aka' ? 'bg-aka text-white' : 'bg-shiro text-black'}`}
            >
              <div className="text-6xl font-black">{m[side].name}</div>
              <div className="text-3xl opacity-80">{m[side].dojo}</div>
              <div className="font-mono text-9xl font-black">
                {m[side].marks.map((mk) => (mk.kind === 'technique' ? mk.technique : mk.kind === 'hansoku' ? 'H' : 'F')).join(' ') || '·'}
              </div>
              <div className="text-5xl text-hansoku">{'▲'.repeat(m[side].hansoku)}</div>
            </div>
          ))
        ) : (
          <div className="col-span-2 flex items-center justify-center text-5xl opacity-60">
            {view?.tournamentName ?? 'Kendo Tournament Manager'}
          </div>
        )}
      </div>
      {m?.timeUp && (
        <div className="pointer-events-none fixed inset-0 flex animate-pulse items-center justify-center text-[12rem] font-black text-hansoku">
          TIME UP
        </div>
      )}
      <footer className="bg-neutral-900 px-8 py-4 text-3xl">
        {view?.nextMatch
          ? `Next Match: ${view.nextMatch.aka.name} (${view.nextMatch.aka.dojo}) vs. ${view.nextMatch.shiro.name} (${view.nextMatch.shiro.dojo})`
          : 'Next Match: —'}
      </footer>
    </div>
  )
}
