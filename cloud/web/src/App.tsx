import { useEffect, useState, type ReactNode } from 'react'
import type { PublishedSnapshot } from '../../src/contract'
import { Empty, Spinner } from './components/ui'
import { STALE_AFTER_MS, useNow, useSnapshot } from './hooks'
import { BracketPage } from './pages/Bracket'
import { CaptainPage } from './pages/Captain'
import { Landing } from './pages/Landing'
import { LivePage } from './pages/Live'
import { PoolsPage } from './pages/Pools'
import { ResultsPage } from './pages/Results'
import { SchedulePage } from './pages/Schedule'

type TabId = 'live' | 'schedule' | 'pools' | 'bracket' | 'results' | 'captain'

const ICONS: Record<TabId, ReactNode> = {
  live: <path d="M4 12a8 8 0 0 1 16 0M7.5 12a4.5 4.5 0 0 1 9 0M12 12h.01" />,
  schedule: <path d="M4 6h16M4 12h16M4 18h10" />,
  pools: <path d="M4 5h16v4H4zM4 11h16v4H4zM4 17h16v2H4z" />,
  bracket: <path d="M3 5h5v5H3zM3 14h5v5H3zM16 9.5h5v5h-5zM8 7.5h4v9H8M12 12h4" />,
  results: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />,
  captain: <path d="M12 3 4 6v5c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6zM9 12l2 2 4-4" />
}

const LABELS: Record<TabId, string> = { live: 'Live', schedule: 'Schedule', pools: 'Pools', bracket: 'Bracket', results: 'Results', captain: 'Captain' }

const isTab = (v: string): v is TabId => v in LABELS

function readTab(): TabId {
  const h = window.location.hash.replace(/^#\/?/, '')
  return isTab(h) ? h : 'live'
}

function useTab(): [TabId, (t: TabId) => void] {
  const [tab, setTab] = useState<TabId>(readTab)
  useEffect(() => {
    const on = () => setTab(readTab())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return [
    tab,
    (t) => {
      window.location.hash = t
      setTab(t)
      window.scrollTo({ top: 0 })
    }
  ]
}

function ago(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`
}

function StatusPill({ lastOkAt, failing }: { lastOkAt: number | null; failing: boolean }) {
  const now = useNow()
  if (lastOkAt === null) return failing ? <span className="rounded-full bg-amber/15 px-2.5 py-1 text-xs font-semibold text-amber">Offline</span> : null
  const age = now - lastOkAt
  const stale = failing || age > STALE_AFTER_MS
  return (
    <span
      role="status"
      className={`num inline-flex items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${stale ? 'bg-amber/15 text-amber' : 'bg-ok/15 text-ok'}`}
    >
      <span className={`inline-block size-1.5 rounded-full ${stale ? 'bg-amber' : 'pulse-dot bg-ok'}`} />
      {stale ? `Offline · last update ${ago(age)}` : `Live · updated ${ago(age)}`}
    </span>
  )
}

function Tournament({ slug }: { slug: string }) {
  const live = useSnapshot(slug)
  const [tab, setTab] = useTab()
  const snap: PublishedSnapshot | null = live.snapshot
  const teamMode = snap?.tournament.mode === 'team'
  const tabs: TabId[] = teamMode ? ['live', 'schedule', 'pools', 'bracket', 'results', 'captain'] : ['live', 'schedule', 'pools', 'bracket', 'results']
  const current: TabId = tabs.includes(tab) ? tab : 'live'

  useEffect(() => {
    document.title = snap ? `${snap.tournament.name} · Live results` : 'Kendo Live Results'
  }, [snap?.tournament.name])

  let body: ReactNode
  if (!live.loaded) body = <Spinner label="Loading results…" />
  else if (!snap) {
    body = live.notFound ? (
      <Empty>
        <p className="display text-xl text-ink">Tournament not found</p>
        <p className="mt-2">There are no results for the code "{slug}" yet. Check the code, or wait: this page keeps looking every few seconds.</p>
        <a href="/" className="mt-4 inline-block font-semibold text-amber">
          Enter another code
        </a>
      </Empty>
    ) : (
      <Empty>Cannot reach the results server. Retrying…</Empty>
    )
  } else {
    body = {
      live: <LivePage courts={snap.courts} />,
      schedule: <SchedulePage snapshot={snap} />,
      pools: <PoolsPage snapshot={snap} />,
      bracket: <BracketPage snapshot={snap} />,
      results: <ResultsPage snapshot={snap} />,
      captain: <CaptainPage slug={slug} snapshot={snap} />
    }[current]
  }

  return (
    <div className="min-h-dvh [--header-h:3.5rem]">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <div className="min-w-0">
            <h1 className="display truncate text-xl leading-none">{snap?.tournament.name ?? 'Kendo Live'}</h1>
            {snap && <p className="mt-0.5 text-[11px] text-muted">{snap.tournament.date}</p>}
          </div>
          <StatusPill lastOkAt={live.lastOkAt} failing={live.failing} />
        </div>
        <nav className="mx-auto hidden max-w-5xl gap-1 px-4 md:flex" aria-label="Sections">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-current={current === t ? 'page' : undefined}
              className={`display border-b-2 px-4 py-2.5 text-base ${current === t ? 'border-amber text-ink' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {LABELS[t]}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-28 pt-4 md:pb-12">{body}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Sections">
        <ul className="flex">
          {tabs.map((t) => (
            <li key={t} className="flex-1">
              <button
                type="button"
                onClick={() => setTab(t)}
                aria-current={current === t ? 'page' : undefined}
                className={`flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${current === t ? 'text-amber' : 'text-muted'}`}
              >
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {ICONS[t]}
                </svg>
                {LABELS[t]}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

export function App() {
  const m = /^\/t\/([a-z0-9]+)\/?$/i.exec(window.location.pathname)
  if (m) return <Tournament slug={m[1]!.toLowerCase()} />
  return <Landing />
}
