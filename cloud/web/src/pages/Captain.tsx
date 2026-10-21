import { useCallback, useEffect, useRef, useState } from 'react'
import type { PubPerson, PubTeam, PublishedSnapshot, TeamEncounterInfo } from '../../../src/contract'
import { submitLineup, teamLogin } from '../api'
import { Card, Chip, Empty, SectionTitle, SideDot } from '../components/ui'

interface Session {
  teamId: string
  /** Kept in memory only (never written to storage). */
  pin: string
  team: PubTeam
  players: PubPerson[]
  encounters: TeamEncounterInfo[]
}

const REFRESH_MS = 20_000
const fieldClass =
  'w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-base text-ink placeholder:text-muted focus:border-amber/60 focus:outline-none'

/** Position names of an encounter (Senpo, Chuken, …) taken from its published bouts. */
function positionsFor(snapshot: PublishedSnapshot, teamMatchId: string, size: number): string[] {
  const bouts = snapshot.matches.filter((m) => m.teamMatchId === teamMatchId).sort((a, b) => a.order - b.order)
  return Array.from({ length: size }, (_, i) => bouts[i]?.positionLabel ?? `Position ${i + 1}`)
}

function hasDuplicates(lineup: (string | null)[]): boolean {
  const ids = lineup.filter((x): x is string => x !== null)
  return new Set(ids).size !== ids.length
}

function StatusLine({ enc, dirty }: { enc: TeamEncounterInfo; dirty: boolean }) {
  if (dirty) return <Chip tone="amber">Not sent yet</Chip>
  if (enc.confirmed && !enc.submitted) return <Chip tone="ok">Confirmed by the table</Chip>
  if (enc.submitted) return <Chip tone="amber">Sent, waiting for the table</Chip>
  return <Chip>Order set by the table</Chip>
}

function EncounterEditor({
  enc,
  positions,
  players,
  draft,
  busy,
  notice,
  onChange,
  onSubmit
}: {
  enc: TeamEncounterInfo
  positions: string[]
  players: PubPerson[]
  draft: (string | null)[]
  busy: boolean
  notice: { ok: boolean; text: string } | undefined
  onChange: (index: number, value: string | null) => void
  onSubmit: () => void
}) {
  const dupes = hasDuplicates(draft)
  const dirty = JSON.stringify(draft) !== JSON.stringify(enc.lineup)
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            {enc.label}
            {enc.courtName ? ` · ${enc.courtName}` : ''}
          </p>
          <p className="display mt-1 flex items-center gap-2 text-2xl leading-tight">
            <SideDot side={enc.side} />
            vs {enc.opponentTeamName}
          </p>
        </div>
        <StatusLine enc={enc} dirty={dirty} />
      </div>

      <div className="mt-4 space-y-3">
        {positions.map((pos, i) => {
          const value = draft[i] ?? ''
          const clash = value !== '' && draft.filter((x) => x === value).length > 1
          return (
            <label key={i} className="grid grid-cols-[88px_1fr] items-center gap-3">
              <span className="display text-base text-muted">{pos}</span>
              <select
                value={value}
                onChange={(e) => onChange(i, e.target.value === '' ? null : e.target.value)}
                className={`${fieldClass} ${clash ? 'border-aka' : ''}`}
                aria-invalid={clash}
              >
                <option value="">— empty —</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )
        })}
      </div>

      {dupes && <p className="mt-3 text-sm text-aka">A fighter can only be placed once.</p>}
      {notice && <p className={`mt-3 text-sm ${notice.ok ? 'text-ok' : 'text-aka'}`}>{notice.text}</p>}

      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || dupes || (!dirty && enc.submitted)}
        className="mt-4 w-full rounded-xl bg-amber px-4 py-3 text-base font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Sending…' : 'Send order'}
      </button>
      <p className="mt-2 text-center text-xs text-muted">Your opponent cannot see the order. It is shown once the first bout starts.</p>
    </Card>
  )
}

export function CaptainPage({ slug, snapshot }: { slug: string; snapshot: PublishedSnapshot }) {
  const teams = [...snapshot.teams].filter((t) => !t.withdrawn).sort((a, b) => a.name.localeCompare(b.name))
  const [teamId, setTeamId] = useState('')
  const [pin, setPin] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [drafts, setDrafts] = useState<Record<string, (string | null)[]>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notices, setNotices] = useState<Record<string, { ok: boolean; text: string }>>({})
  const sessionRef = useRef<Session | null>(null)
  sessionRef.current = session
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts

  /** Applies a fresh server answer; drafts the captain is editing are kept. */
  const applyServer = useCallback((next: Session) => {
    setSession(next)
    setDrafts((prev) => {
      const out: Record<string, (string | null)[]> = {}
      for (const enc of next.encounters) {
        const old = sessionRef.current?.encounters.find((e) => e.teamMatchId === enc.teamMatchId)
        const prevDraft = prev[enc.teamMatchId]
        const wasDirty = prevDraft && old && JSON.stringify(prevDraft) !== JSON.stringify(old.lineup)
        out[enc.teamMatchId] = wasDirty && prevDraft ? prevDraft : enc.lineup
      }
      return out
    })
  }, [])

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!teamId) return setError('Choose your team.')
    if (!/^\d{6}$/.test(pin)) return setError('The PIN has 6 digits.')
    setLoading(true)
    setError('')
    const res = await teamLogin(slug, teamId, pin)
    setLoading(false)
    if (!res.ok) return setError(res.error)
    applyServer({ teamId, pin, team: res.team, players: res.players, encounters: res.encounters })
  }

  const refresh = useCallback(async () => {
    const s = sessionRef.current
    if (!s) return
    const res = await teamLogin(slug, s.teamId, s.pin)
    if (res.ok) applyServer({ ...s, team: res.team, players: res.players, encounters: res.encounters })
  }, [slug, applyServer])

  // Keep encounter status fresh (confirmed / no longer open) while the page is visible.
  useEffect(() => {
    if (!session) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [session, refresh])

  const logout = () => {
    setSession(null)
    setDrafts({})
    setNotices({})
    setPin('')
    setError('')
  }

  const send = async (enc: TeamEncounterInfo) => {
    const s = session
    const lineup = draftsRef.current[enc.teamMatchId]
    if (!s || !lineup) return
    setBusy(enc.teamMatchId)
    setNotices((n) => ({ ...n, [enc.teamMatchId]: { ok: true, text: '' } }))
    const res = await submitLineup(slug, s.teamId, s.pin, enc.teamMatchId, lineup)
    setBusy(null)
    if (res.ok) {
      setNotices((n) => ({ ...n, [enc.teamMatchId]: { ok: true, text: 'Sent — the table will confirm.' } }))
      // Mark as sent right away, then refresh from the server.
      setSession((cur) => (cur ? { ...cur, encounters: cur.encounters.map((x) => (x.teamMatchId === enc.teamMatchId ? { ...x, lineup, submitted: true, confirmed: false } : x)) } : cur))
      void refresh()
    } else {
      setNotices((n) => ({ ...n, [enc.teamMatchId]: { ok: false, text: res.error ?? 'Could not send the order.' } }))
    }
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-md">
        <SectionTitle>Team captain</SectionTitle>
        <p className="mb-5 text-sm leading-relaxed text-muted">
          Set your team's fighting order (oda) for your next encounter. Use the 6-digit PIN you received from the organisers. The order stays hidden from your opponent until the first bout starts.
        </p>
        <Card className="p-4">
          <form onSubmit={login} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Your team</span>
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={fieldClass}>
                <option value="">Choose a team…</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Team PIN</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                pattern="[0-9]{4}"
                placeholder="6 digits"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className={`${fieldClass} num tracking-[0.4em]`}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-aka">
                {error}
              </p>
            )}
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-amber px-4 py-3 text-base font-semibold text-bg disabled:opacity-50">
              {loading ? 'Checking…' : 'Show my encounters'}
            </button>
          </form>
        </Card>
      </div>
    )
  }

  const size = snapshot.tournament.teamSize ?? session.encounters[0]?.lineup.length ?? 0
  return (
    <div className="mx-auto max-w-xl">
      <SectionTitle
        right={
          <button type="button" onClick={logout} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink">
            Switch team
          </button>
        }
      >
        {session.team.name}
      </SectionTitle>
      {session.encounters.length === 0 ? (
        <Empty>No open encounters. Your next order can be set once the schedule shows your next team match, until its first bout starts.</Empty>
      ) : (
        <div className="space-y-4">
          {session.encounters.map((enc) => (
            <EncounterEditor
              key={enc.teamMatchId}
              enc={enc}
              positions={positionsFor(snapshot, enc.teamMatchId, size)}
              players={session.players}
              draft={drafts[enc.teamMatchId] ?? enc.lineup}
              busy={busy === enc.teamMatchId}
              notice={notices[enc.teamMatchId]?.text ? notices[enc.teamMatchId] : undefined}
              onChange={(i, value) => {
                setNotices((n) => ({ ...n, [enc.teamMatchId]: { ok: true, text: '' } }))
                setDrafts((d) => {
                  const cur = [...(d[enc.teamMatchId] ?? enc.lineup)]
                  cur[i] = value
                  return { ...d, [enc.teamMatchId]: cur }
                })
              }}
              onSubmit={() => void send(enc)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
