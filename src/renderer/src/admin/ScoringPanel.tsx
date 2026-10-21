// Point / penalty controls for one side (Aka or Shiro).

import type { AdminAction } from '@shared/ipc'
import type { PublicCompetitor } from '@shared/public-view'
import type { Side, Technique } from '@shared/types'
import { HansokuIcon, MarkBadge } from '../components/Marks'
import { useConfirm } from './useAdmin'

const TECHNIQUES: { t: Technique; name: string }[] = [
  { t: 'M', name: 'Men' },
  { t: 'K', name: 'Kote' },
  { t: 'D', name: 'Do' },
  { t: 'T', name: 'Tsuki' }
]

interface Props {
  side: Side
  competitor: PublicCompetitor
  /** Point and penalty buttons are enabled. */
  scoring: boolean
  /** Fusen-gachi is still possible (match not started). */
  canFusen: boolean
  send: (a: AdminAction) => void
}

export function ScoringPanel({ side, competitor: c, scoring, canFusen, send }: Props) {
  const aka = side === 'aka'
  const [fusenArmed, confirmFusen] = useConfirm()

  return (
    <section
      className={`flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 bg-neutral-900 ${
        aka ? 'border-aka' : 'border-shiro'
      }`}
    >
      <div className={`flex items-center gap-4 px-5 py-3 ${aka ? 'bg-aka text-white' : 'bg-shiro text-ink'}`}>
        <span className="text-sm font-black tracking-[0.25em] uppercase">{aka ? 'Aka' : 'Shiro'}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-2xl leading-tight font-black">{c.name}</div>
          <div className="truncate text-sm font-semibold opacity-70">{c.dojo}</div>
        </div>
        <div className="flex items-center gap-2">
          {c.marks.map((m, i) => (
            <MarkBadge key={i} mark={m} size={44} variant="outline" tone={aka ? 'light' : 'dark'} />
          ))}
          <span className="tabular ml-2 text-4xl font-black">{c.ippons}</span>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-4 gap-3 p-4">
        {TECHNIQUES.map(({ t, name }) => (
          <button
            key={t}
            disabled={!scoring}
            onClick={() => send({ type: 'ADD_IPPON', side, technique: t })}
            className={`flex min-h-24 flex-col items-center justify-center rounded-xl text-5xl font-black transition active:scale-95 disabled:opacity-25 ${
              aka ? 'bg-aka-deep hover:bg-aka' : 'bg-neutral-200 text-ink hover:bg-white'
            }`}
          >
            {t}
            <span className="mt-1 text-xs font-semibold tracking-widest uppercase opacity-70">{name}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-3 px-4 pb-4">
        <button
          disabled={!scoring}
          onClick={() => send({ type: 'ADD_HANSOKU', side })}
          className="flex h-16 items-center justify-center gap-3 rounded-xl bg-hansoku text-2xl font-black text-ink transition hover:bg-yellow-300 active:scale-95 disabled:opacity-25"
        >
          <HansokuIcon size={34} />H · Hansoku
          <span className="tabular rounded-md bg-ink/15 px-2">{c.hansoku}</span>
        </button>
        <button
          disabled={!canFusen}
          onClick={() => confirmFusen(() => send({ type: 'FUSEN_GACHI', side }))}
          className={`h-16 rounded-xl text-base font-bold transition disabled:opacity-25 ${
            fusenArmed ? 'bg-red-600 hover:bg-red-500' : 'bg-neutral-700 hover:bg-neutral-600'
          }`}
          title={`Opponent absent: award ${aka ? 'Aka' : 'Shiro'} a default win (2 ippons)`}
        >
          {fusenArmed ? 'Confirm fusen-gachi?' : 'Fusen-gachi'}
        </button>
      </div>
    </section>
  )
}
