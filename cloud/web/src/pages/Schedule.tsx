import { useState } from 'react'
import type { PubMatch, PubSide, PublishedSnapshot } from '../../../src/contract'
import { Chip, Country, Empty, Highlight, MarkString, SectionTitle, SideDot } from '../components/ui'
import { usePersistedString } from '../hooks'
import { DECISION_LABEL, matchFits, matchesByCourt, phaseOf, type Phase } from '../lookup'

type Filter = 'all' | 'active' | 'done'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Upcoming & live' },
  { id: 'done', label: 'Done' }
]

function Fighter({ side, s, query, won }: { side: 'aka' | 'shiro'; s: PubSide; query: string; won: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <SideDot side={side} />
      <div className="min-w-0">
        <p className={`display truncate text-lg leading-tight ${won ? 'text-ink' : ''}`}>
          <Highlight text={s.name} query={query} />
        </p>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted">
          <span className="truncate">
            <Highlight text={s.dojo} query={query} />
          </span>
          <Country code={s.country} />
        </p>
      </div>
    </div>
  )
}

function StatusChip({ phase, m }: { phase: Phase; m: PubMatch }) {
  if (phase === 'live') {
    return (
      <Chip tone="ok">
        <span className="pulse-dot inline-block size-1.5 rounded-full bg-ok" />
        {m.status === 'awaiting-confirmation' ? 'Finishing' : 'Live'}
      </Chip>
    )
  }
  if (phase === 'done') return <Chip>Done</Chip>
  return <Chip tone="amber">Upcoming</Chip>
}

function MatchRow({ m, query }: { m: PubMatch; query: string }) {
  const phase = phaseOf(m)
  const r = m.result
  const label = [m.label, m.positionLabel].filter(Boolean).join(' · ')
  const decision = r ? DECISION_LABEL[r.decision] : ''
  return (
    <li className={`px-4 py-3 ${phase === 'live' ? 'bg-ok/5' : ''}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="num truncate text-[11px] font-semibold uppercase tracking-wider text-muted">
          #{m.order + 1} · <Highlight text={label} query={query} />
        </span>
        <StatusChip phase={phase} m={m} />
      </div>
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2">
        <Fighter side="aka" s={m.aka} query={query} won={r?.winner === 'aka'} />
        <div className="flex justify-end">{r && <MarkString value={r.akaMarks} />}</div>
        <Fighter side="shiro" s={m.shiro} query={query} won={r?.winner === 'shiro'} />
        <div className="flex justify-end">{r && <MarkString value={r.shiroMarks} />}</div>
      </div>
      {r && (
        <p className="num mt-2 text-xs text-muted">
          {r.winner ? (
            <>
              Winner: <span className="text-ink">{r.winner === 'aka' ? m.aka.name : m.shiro.name}</span>
            </>
          ) : (
            'Draw'
          )}
          {' · '}
          {r.akaIppons}–{r.shiroIppons}
          {decision && r.decision !== 'hikiwake' ? ` · ${decision}` : ''}
        </p>
      )}
    </li>
  )
}

export function SchedulePage({ snapshot }: { snapshot: PublishedSnapshot }) {
  const [query, setQuery] = usePersistedString('kendo-live-search')
  const [filter, setFilter] = useState<Filter>('all')
  const groups = matchesByCourt(snapshot).map((g) => ({
    ...g,
    matches: g.matches.filter((m) => matchFits(m, query) && (filter === 'all' || (filter === 'done') === (phaseOf(m) === 'done')))
  }))
  const total = groups.reduce((n, g) => n + g.matches.length, 0)

  return (
    <div>
      <div className="sticky top-[var(--header-h)] z-10 -mx-4 mb-4 border-b border-line bg-bg/95 px-4 pb-3 pt-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:pt-0">
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a fighter / team"
            aria-label="Find a fighter or team"
            autoComplete="off"
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-muted focus:border-amber/60 focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-muted hover:text-ink">
              Clear
            </button>
          )}
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${filter === f.id ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <Empty>{snapshot.matches.length ? 'No matches fit your search.' : 'The schedule appears once the draw is made.'}</Empty>
      ) : (
        groups
          .filter((g) => g.matches.length > 0)
          .map((g) => (
            <div key={g.courtId}>
              <SectionTitle right={<span className="num text-xs text-muted">{g.matches.length} matches</span>}>{g.courtName}</SectionTitle>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {g.matches.map((m) => (
                  <MatchRow key={m.id} m={m} query={query} />
                ))}
              </ul>
            </div>
          ))
      )}
    </div>
  )
}
