// The hall scoreboard, drawn on a fixed 1920×1080 canvas (see ScaledStage).
// Read-only and deliberately clock-free: it never shows the remaining time.
// Dark broadcast style: red and white mark the sides, not whole halves. Shiro left, Aka right.

import type { Person, PodiumView, PublicCompetitor, PublicEncounter, PublicMatch, PublicTeamScore, PublicView } from '@shared/public-view'
import { countryName } from '@shared/countries'
import { FitText } from './FitText'
import { Qr } from './Qr'
import { CountryChip, HansokuIcon, MarkBadge, MarkSlot } from './Marks'

function Half({ side, c }: { side: 'aka' | 'shiro'; c: PublicCompetitor }) {
  const aka = side === 'aka'
  const slots = Math.max(2, c.marks.length)
  return (
    <div className="relative flex flex-col px-16 pt-0 pb-12">
      <div className={`h-[14px] ${aka ? 'bg-aka' : 'bg-shiro'}`} />
      <div className={`mt-10 text-[34px] font-bold tracking-[0.4em] uppercase ${aka ? 'text-aka' : 'text-shiro'}`}>{aka ? 'Aka' : 'Shiro'}</div>
      <FitText text={c.name} max={150} min={78} className="display mt-2 leading-[0.95] font-bold text-white" />
      <div className="mt-4 flex min-w-0 items-center gap-5 text-[44px] text-muted">
        <CountryChip code={c.country} size={34} />
        {c.country && <span className="shrink-0 font-semibold text-white/85">{countryName(c.country) ?? c.country}</span>}
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
      <span className="display max-w-[600px] truncate text-right text-[54px] font-bold">{t.shiroTeam}</span>
      {pill(t.shiroWins, t.shiroIppons, false)}
      <span className="text-[40px] text-muted">:</span>
      {pill(t.akaWins, t.akaIppons, true)}
      <span className="display max-w-[600px] truncate text-[54px] font-bold">{t.akaTeam}</span>
    </div>
  )
}

const DECISION: Partial<Record<NonNullable<PublicMatch['decision']>, string>> = {
  hikiwake: 'Hikiwake',
  'fusen-gachi': 'Fusen-gachi',
  kiken: 'Kiken',
  encho: 'Encho'
}

/** One side of a bout row: name (hansoku under it) and the marks next to the centre column. */
function BoutSide({ c, side, won, lost, markSize, nameMax }: { c: PublicCompetitor; side: 'aka' | 'shiro'; won: boolean; lost: boolean; markSize: number; nameMax: number }) {
  const left = side === 'shiro'
  // Fixed width for two marks, so the name never jumps when a point is scored.
  const marks = (
    <div className={`flex shrink-0 items-center gap-3 ${left ? 'justify-end' : 'justify-start'}`} style={{ width: markSize * 2 + 12 }}>
      {Array.from({ length: Math.max(2, c.marks.length) }, (_, i) =>
        c.marks[i] ? <MarkBadge key={i} mark={c.marks[i]!} size={markSize} side={side} /> : <MarkSlot key={i} size={markSize} />
      )}
    </div>
  )
  const name = (
    <div className={`flex min-w-0 flex-1 flex-col gap-2 ${left ? 'items-start' : 'items-end text-right'} ${lost ? 'opacity-40' : ''}`}>
      <FitText text={c.name} max={nameMax} min={Math.round(nameMax * 0.55)} className={`display w-full leading-none font-bold ${won ? 'text-white' : 'text-white/90'}`} />
      {c.hansoku > 0 && (
        <div className="flex items-center gap-2">
          {Array.from({ length: c.hansoku }, (_, i) => (
            <HansokuIcon key={i} size={Math.round(markSize * 0.36)} />
          ))}
        </div>
      )}
    </div>
  )
  return <div className={`flex min-w-0 items-center gap-6 ${left ? '' : 'flex-row-reverse'}`}>{name}{marks}</div>
}

/**
 * Team encounter: Shiro's team on the left, Aka's on the right, one row per position with
 * every bout's result; the bout being fought is highlighted.
 */
function TeamBoard({ encounter, team }: { encounter: PublicEncounter; team: PublicTeamScore }) {
  const n = encounter.bouts.length
  const markSize = n <= 4 ? 120 : 92
  const nameMax = n <= 4 ? 84 : 64
  const pill = (wins: number, ippons: number, aka: boolean) => (
    <span className={`tabular flex items-baseline gap-3 rounded-xl px-7 py-1 ${aka ? 'bg-aka text-white' : 'bg-shiro text-ink'}`}>
      <span className="display text-[72px] leading-none font-bold">{wins}</span>
      <span className="text-[32px] opacity-70">({ippons})</span>
    </span>
  )
  return (
    <main className="flex min-h-0 flex-1 flex-col px-12 pt-5 pb-6">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-8 pb-4">
        <div className="flex min-w-0 items-center gap-5">
          <span className="h-12 w-4 shrink-0 rounded bg-shiro" />
          <FitText text={team.shiroTeam} max={76} min={40} className="display leading-none font-bold" />
        </div>
        <div className="flex items-center gap-5">
          {pill(team.shiroWins, team.shiroIppons, false)}
          <span className="text-[44px] text-muted">:</span>
          {pill(team.akaWins, team.akaIppons, true)}
        </div>
        <div className="flex min-w-0 flex-row-reverse items-center gap-5 text-right">
          <span className="h-12 w-4 shrink-0 rounded bg-aka" />
          <FitText text={team.akaTeam} max={76} min={40} className="display leading-none font-bold" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {encounter.bouts.map((b) => {
          const current = b.id === encounter.currentId
          const done = b.status === 'completed'
          const note = done ? (b.decision ? DECISION[b.decision] : undefined) : current ? 'Now' : undefined
          return (
            <div
              key={b.id}
              className={`grid min-h-0 flex-1 grid-cols-[1fr_230px_1fr] items-center gap-6 rounded-2xl px-8 ${current ? 'bg-white/[0.08] ring-4 ring-hansoku' : 'bg-surface'} ${!done && !current ? 'opacity-60' : ''}`}
            >
              <BoutSide c={b.shiro} side="shiro" won={done && b.winner === 'shiro'} lost={done && b.winner === 'aka'} markSize={markSize} nameMax={nameMax} />
              <div className="flex flex-col items-center justify-center text-center">
                <span className="text-[30px] font-bold tracking-[0.25em] text-muted uppercase">{b.positionLabel}</span>
                {note && <span className={`mt-1 text-[28px] font-bold ${current ? 'text-hansoku' : 'text-white/70'}`}>{note}</span>}
                {current && b.encho && <span className="mt-1 rounded-md bg-hansoku px-3 text-[26px] font-bold text-ink">Encho</span>}
              </div>
              <BoutSide c={b.aka} side="aka" won={done && b.winner === 'aka'} lost={done && b.winner === 'shiro'} markSize={markSize} nameMax={nameMax} />
            </div>
          )
        })}
      </div>
    </main>
  )
}

const who = (p: Person) => (
  <>
    <span className="font-semibold text-white">{p.name}</span>
    {p.country && <span className="ml-3 text-[30px] font-semibold tracking-wider text-muted">{p.country}</span>}
  </>
)

const MEDAL: Record<1 | 2 | 3, string> = { 1: '#e8b931', 2: '#c7ccd4', 3: '#c98a4b' }

/** Award ceremony: 2nd, 1st, 3rd (two 3rd places in kendo) as podium steps. */
function Podium({ podium }: { podium: PodiumView }) {
  const at = (place: 1 | 2 | 3) => podium.places.filter((p) => p.place === place)
  const step = (place: 1 | 2 | 3, height: number) => (
    <div className="flex w-[560px] flex-col items-center justify-end gap-4">
      {at(place).map((p) => (
        <div key={p.name} className="flex w-full flex-col items-center gap-2 text-center">
          <FitText text={p.name} max={place === 1 ? 84 : 64} min={36} className="display leading-none font-bold text-white" />
          <div className="flex items-center gap-3 text-[30px] text-muted">
            <CountryChip code={p.country} size={26} />
            {p.country && <span className="font-semibold text-white/85">{countryName(p.country) ?? p.country}</span>}
            {p.dojo && p.dojo !== p.name && <span className="truncate">{p.dojo}</span>}
          </div>
        </div>
      ))}
      <div className="display flex w-full items-start justify-center rounded-t-2xl pt-4 text-[120px] leading-none font-bold text-ink" style={{ height, background: MEDAL[place] }}>
        {place}
      </div>
    </div>
  )
  return (
    <main className="flex flex-1 flex-col items-center px-16 pt-10">
      <div className="text-[40px] font-bold tracking-[0.5em] text-hansoku uppercase">Results</div>
      <div className="display mt-2 text-[80px] leading-none font-bold">{podium.categoryName}</div>
      <div className="mt-auto flex items-end gap-10">
        {step(2, 220)}
        {step(1, 320)}
        {step(3, 150)}
      </div>
    </main>
  )
}

export function Scoreboard({ view }: { view: PublicView | null }) {
  if (view?.podium) {
    return (
      <div className="relative flex h-full w-full flex-col bg-ink text-white">
        <header className="flex h-[104px] items-center justify-between border-b border-line px-16">
          <div className="truncate text-[30px] font-semibold tracking-[0.2em] text-muted uppercase">{view.tournamentName}</div>
          {view.multiCourt && <span className="display text-[40px] font-semibold tracking-wider text-muted">{view.courtName}</span>}
        </header>
        <Podium podium={view.podium} />
      </div>
    )
  }
  return <Board view={view} />
}

function Board({ view }: { view: PublicView | null }) {
  const m = view?.match ?? null

  return (
    <div className="relative flex h-full w-full flex-col bg-ink text-white">
      <header className="grid h-[104px] grid-cols-[1fr_auto_1fr] items-center border-b border-line px-16">
        <div className="truncate text-[30px] font-semibold tracking-[0.2em] text-muted uppercase">
          {(view?.multiCategory && view.categoryName) || (view?.tournamentName ?? 'Kendo Tournament Manager')}
        </div>
        <div className="display text-[56px] font-bold tracking-wide">{m ? [m.label, m.positionLabel].filter(Boolean).join(' · ') : ''}</div>
        <div className="flex items-center justify-end gap-5">
          {m?.encho && <span className="display rounded-lg bg-hansoku px-6 py-0.5 text-[46px] font-bold text-ink">Encho</span>}
          {view?.multiCourt && <span className="display text-[40px] font-semibold tracking-wider text-muted">{view.courtName}</span>}
        </div>
      </header>

      {view?.encounter && view.team ? (
        <TeamBoard encounter={view.encounter} team={view.team} />
      ) : (
        view && <TeamBand view={view} />
      )}

      {view?.encounter && view.team ? null : m ? (
        <main className="relative grid flex-1 grid-cols-2">
          <Half side="shiro" c={m.shiro} />
          <Half side="aka" c={m.aka} />
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
            <div className="flex items-center gap-24 px-16">
              <div className="flex max-w-[1100px] flex-col gap-6">
                <div className="display text-[96px] leading-none font-bold">{view?.tournamentName ?? 'Kendo Tournament Manager'}</div>
                <div className="text-[44px] text-muted">{view?.multiCourt ? `${view.courtName} · ` : ''}Waiting for the next match</div>
              </div>
              {view?.onlineUrl && (
                <div className="flex shrink-0 flex-col items-center gap-5">
                  <Qr text={view.onlineUrl} size={380} className="rounded-2xl p-3" />
                  <div className="text-[34px] font-bold tracking-[0.2em] text-hansoku uppercase">Live results</div>
                  <div className="text-[28px] text-muted">Scan with your phone camera</div>
                </div>
              )}
            </div>
          )}
        </main>
      )}

      <footer className={`flex h-[104px] items-center gap-8 border-t border-line bg-surface px-16 text-[46px] ${view?.champion ? 'invisible' : ''}`}>
        <span className="shrink-0 text-[30px] font-bold tracking-[0.35em] text-hansoku uppercase">Next</span>
        <span className="flex min-w-0 items-center truncate">
          {view?.nextMatch ? (
            <>
              <span className="mr-4 inline-block h-6 w-6 shrink-0 rounded-full bg-shiro" />
              {who(view.nextMatch.shiro)}
              <span className="mx-8 text-muted">vs</span>
              <span className="mr-4 inline-block h-6 w-6 shrink-0 rounded-full bg-aka" />
              {who(view.nextMatch.aka)}
            </>
          ) : view?.nextNote ? (
            <span className="font-semibold text-white">{view.nextNote}</span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </span>
        {m && view?.onlineUrl && (
          <span className="ml-auto flex shrink-0 items-center gap-5">
            <span className="text-right text-[24px] leading-tight font-bold tracking-[0.2em] text-muted uppercase">
              Live
              <br />
              results
            </span>
            <Qr text={view.onlineUrl} size={88} className="rounded-md p-1" />
          </span>
        )}
      </footer>

    </div>
  )
}
