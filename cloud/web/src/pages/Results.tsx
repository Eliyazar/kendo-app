import type { PubCategory, PubMatch, PublishedSnapshot } from '../../../src/contract'
import { Country, Empty, MarkString, SectionTitle, SideDot } from '../components/ui'
import { DECISION_LABEL, buildIndex, type Index } from '../lookup'

const PLACE_STYLE: Record<number, { label: string; ring: string; text: string }> = {
  1: { label: '1st', ring: 'border-amber/60 bg-amber/10', text: 'text-amber' },
  2: { label: '2nd', ring: 'border-line bg-surface', text: 'text-ink' },
  3: { label: '3rd', ring: 'border-line bg-surface', text: 'text-muted' }
}

function PodiumCard({ place, entrantId, idx }: { place: 1 | 2 | 3; entrantId: string; idx: Index }) {
  const e = idx.entrant(entrantId)
  const st = PLACE_STYLE[place]!
  return (
    <div className={`rounded-xl border px-4 py-4 ${st.ring} ${place === 1 ? 'sm:col-span-3' : ''}`}>
      <p className={`display ${place === 1 ? 'text-3xl' : 'text-2xl'} leading-none ${st.text}`}>{st.label}</p>
      <p className={`display mt-3 leading-none ${place === 1 ? 'text-4xl' : 'text-2xl'}`}>{e.name}</p>
      <p className="mt-2 flex items-center gap-2 text-sm text-muted">
        <span className="truncate">{e.sub}</span>
        <Country code={e.country} />
      </p>
    </div>
  )
}

function ResultRow({ m }: { m: PubMatch }) {
  const r = m.result!
  const label = [m.label, m.positionLabel].filter(Boolean).join(' · ')
  const decision = DECISION_LABEL[r.decision]
  const line = (side: 'aka' | 'shiro') => {
    const s = side === 'aka' ? m.aka : m.shiro
    const marks = side === 'aka' ? r.akaMarks : r.shiroMarks
    return (
      <div className="flex items-center gap-2">
        <SideDot side={side} />
        <span className={`display min-w-0 flex-1 truncate text-lg leading-tight ${r.winner === side ? 'text-ink' : 'text-muted'}`}>{s.name}</span>
        <Country code={s.country} />
        <MarkString value={marks} />
      </div>
    )
  }
  return (
    <li className="space-y-1.5 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
        {decision && r.decision !== 'hikiwake' ? ` · ${decision}` : ''}
        {!r.winner ? ' · Draw' : ''}
      </p>
      {line('aka')}
      {line('shiro')}
    </li>
  )
}

/** Compact podium list of every category. */
function Overview({ snapshot, onPick }: { snapshot: PublishedSnapshot; onPick: (id: string) => void }) {
  return (
    <>
      <SectionTitle>All categories</SectionTitle>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {snapshot.categories.map((c) => {
          const idx = buildIndex(snapshot, c)
          const podium = [...c.podium].sort((a, b) => a.place - b.place)
          return (
            <li key={c.id} className="px-4 py-3">
              <button type="button" onClick={() => onPick(c.id)} className="display text-lg leading-tight hover:text-amber">
                {c.name}
              </button>
              {podium.length ? (
                <ol className="mt-1.5 space-y-0.5 text-sm">
                  {podium.map((p, i) => (
                    <li key={`${p.place}-${p.entrantId}-${i}`} className="flex gap-2">
                      <span className={`num w-8 shrink-0 font-semibold ${PLACE_STYLE[p.place]!.text}`}>{PLACE_STYLE[p.place]!.label}</span>
                      <span className="truncate">{idx.entrant(p.entrantId).name}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-1 text-xs text-muted">Not decided yet.</p>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

export function ResultsPage({ snapshot, category, onPick }: { snapshot: PublishedSnapshot; category: PubCategory; onPick: (id: string) => void }) {
  const idx = buildIndex(snapshot, category)
  const podium = [...category.podium].sort((a, b) => a.place - b.place)
  const done = category.matches.filter((m) => m.status === 'completed' && m.result).sort((a, b) => b.order - a.order)

  return (
    <div>
      <SectionTitle>Podium</SectionTitle>
      {podium.length ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {podium.map((p, i) => (
            <PodiumCard key={`${p.place}-${p.entrantId}-${i}`} place={p.place} entrantId={p.entrantId} idx={idx} />
          ))}
        </div>
      ) : (
        <Empty>The podium appears when the final is decided.</Empty>
      )}

      <SectionTitle right={<span className="num text-xs text-muted">{done.length} matches</span>}>All results</SectionTitle>
      {done.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {done.map((m) => (
            <ResultRow key={m.id} m={m} />
          ))}
        </ul>
      ) : (
        <Empty>No completed matches yet.</Empty>
      )}

      {snapshot.categories.length > 1 && <Overview snapshot={snapshot} onPick={onPick} />}
    </div>
  )
}
