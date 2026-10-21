// Participants after the draw: edit, withdraw, late entries, teams and their order.

import { useState, type ReactNode } from 'react'
import { encounterOpen, lineupOf } from '@shared/encounters'
import type { AdminAction } from '@shared/ipc'
import { matchLabel } from '@shared/public-view'
import { MAX_RESERVES, TEAM_POSITIONS, type Id, type Player, type Team, type TeamSize, type Tournament } from '@shared/types'
import { useConfirm } from './useAdmin'

type Send = (a: AdminAction) => Promise<boolean>

const input = 'w-full rounded-md bg-transparent px-2 py-1 outline-none hover:bg-white/5 focus:bg-surface-2'

/** Text that saves when it loses focus or on Enter. */
function Field({ value, onSave, placeholder, className = '' }: { value: string; onSave: (v: string) => void; placeholder?: string; className?: string }) {
  const [v, setV] = useState(value)
  const [last, setLast] = useState(value)
  if (value !== last) {
    setLast(value)
    setV(value)
  }
  const commit = () => v.trim() !== value && onSave(v.trim())
  return (
    <input
      className={`${input} ${className}`}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function WithdrawButton({ onConfirm }: { onConfirm: () => void }) {
  const [armed, confirm] = useConfirm(4000)
  return (
    <button
      onClick={() => confirm(onConfirm)}
      className={`rounded-md px-2 py-1 text-xs font-semibold ${armed ? 'bg-red-600 text-white' : 'text-muted hover:bg-neutral-800 hover:text-white'}`}
    >
      {armed ? 'Confirm withdraw' : 'Withdraw'}
    </button>
  )
}

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-3 border-b border-line px-5 py-3">
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="flex-1" />
        {right}
      </div>
      {children}
    </section>
  )
}

function AddForm({ t, send, team }: { t: Tournament; send: Send; team: boolean }) {
  const [name, setName] = useState('')
  const [dojo, setDojo] = useState('')
  const [country, setCountry] = useState('')
  const [members, setMembers] = useState('')
  const [poolId, setPoolId] = useState('')
  if (t.phase !== 'pools') return <p className="px-5 py-3 text-sm text-muted">Late entries are only possible during the pool phase.</p>
  const submit = async () => {
    const entrant = {
      name,
      dojo,
      country,
      ...(poolId ? { poolId } : {}),
      ...(team ? { members: members.split('\n').map((m) => m.trim()).filter(Boolean).map((m) => ({ name: m })) } : {})
    }
    if (await send({ type: 'ADD_ENTRANT', entrant })) {
      setName('')
      setDojo('')
      setCountry('')
      setMembers('')
    }
  }
  const box = 'rounded-lg border border-line bg-surface-2 px-3 py-2 outline-none focus:border-hansoku'
  return (
    <div className="flex flex-wrap items-start gap-2 px-5 py-4">
      <input className={`${box} w-56`} placeholder={team ? 'Team name' : 'Name'} value={name} onChange={(e) => setName(e.target.value)} />
      <input className={`${box} w-44`} placeholder="Dojo / club" value={dojo} onChange={(e) => setDojo(e.target.value)} />
      <input className={`${box} w-36`} placeholder="Country (BUL…)" value={country} onChange={(e) => setCountry(e.target.value)} />
      {team && (
        <textarea
          className={`${box} h-20 w-64`}
          placeholder={`Players, one per line, in order (${t.teamSize} + up to ${MAX_RESERVES} reserves)`}
          value={members}
          onChange={(e) => setMembers(e.target.value)}
        />
      )}
      <select className={box} value={poolId} onChange={(e) => setPoolId(e.target.value)}>
        <option value="">Smallest pool</option>
        {t.pools.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button disabled={!name.trim()} onClick={submit} className="rounded-lg bg-emerald-600 px-4 py-2 font-bold hover:bg-emerald-500 disabled:opacity-30">
        Add {team ? 'team' : 'participant'}
      </button>
    </div>
  )
}

function IndividualList({ t, send }: { t: Tournament; send: Send }) {
  const poolOf = (id: Id) => t.pools.find((p) => p.entrantIds.includes(id))?.name ?? '—'
  const players = Object.values(t.players).sort((a, b) => poolOf(a.id).localeCompare(poolOf(b.id)) || a.name.localeCompare(b.name))
  const edit = (p: Player, patch: Partial<Player>) =>
    void send({ type: 'EDIT_PLAYER', playerId: p.id, patch: { name: p.name, dojo: p.dojo, country: p.country ?? '', grade: p.grade ?? '', ...patch } })
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs tracking-widest text-muted uppercase">
        <tr>
          <th className="px-5 py-2">Name</th>
          <th className="px-2 py-2">Dojo / club</th>
          <th className="w-28 px-2 py-2">Country</th>
          <th className="w-24 px-2 py-2">Grade</th>
          <th className="w-24 px-2 py-2">Pool</th>
          <th className="w-40" />
        </tr>
      </thead>
      <tbody>
        {players.map((p) => (
          <tr key={p.id} className={`border-t border-line ${p.withdrawn ? 'opacity-50' : ''}`}>
            <td className="px-3 py-1">
              <Field value={p.name} onSave={(name) => edit(p, { name })} />
            </td>
            <td className="px-1">
              <Field value={p.dojo} onSave={(dojo) => edit(p, { dojo })} />
            </td>
            <td className="px-1">
              <Field value={p.country ?? ''} placeholder="—" onSave={(country) => edit(p, { country })} className="uppercase" />
            </td>
            <td className="px-1">
              <Field value={p.grade ?? ''} placeholder="—" onSave={(grade) => edit(p, { grade })} />
            </td>
            <td className="px-2 text-muted">{poolOf(p.id)}</td>
            <td className="pr-4 text-right">
              {p.withdrawn ? (
                <span className="text-xs font-semibold text-muted uppercase">Withdrawn</span>
              ) : (
                t.phase !== 'finished' && <WithdrawButton onConfirm={() => void send({ type: 'WITHDRAW_ENTRANT', entrantId: p.id })} />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function OrderSelects({ team, t, value, onChange, disabled }: { team: Team; t: Tournament; value: (Id | null)[]; onChange: (v: (Id | null)[]) => void; disabled?: boolean }) {
  const labels = TEAM_POSITIONS[team.size as TeamSize]
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${team.size}, minmax(0, 1fr))` }}>
      {value.map((id, pos) => (
        <label key={pos} className="block">
          <span className="mb-0.5 block text-[10px] font-bold tracking-widest text-muted uppercase">{labels[pos]}</span>
          <select
            disabled={disabled}
            className="w-full rounded-md border border-line bg-surface-2 px-2 py-1.5 text-sm disabled:opacity-50"
            value={id ?? ''}
            onChange={(e) => onChange(value.map((x, i) => (i === pos ? e.target.value || null : x)))}
          >
            <option value="">— empty —</option>
            {team.members.map((m) => (
              <option key={m} value={m}>
                {t.players[m]?.name}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  )
}

function TeamCard({ t, team, send }: { t: Tournament; team: Team; send: Send }) {
  const [newMember, setNewMember] = useState('')
  const poolName = t.pools.find((p) => p.entrantIds.includes(team.id))?.name ?? '—'
  const editTeam = (patch: { name?: string; dojo?: string; country?: string }) =>
    void send({ type: 'EDIT_TEAM', teamId: team.id, patch: { name: team.name, dojo: team.dojo, country: team.country ?? '', ...patch } })
  const upcoming = t.matchQueue
    .map((id) => t.matches[id])
    .filter((m) => m?.teamMatchId && m.position === 0)
    .map((m) => t.teamMatches[m!.teamMatchId!]!)
    .filter((tm) => (tm.akaTeamId === team.id || tm.shiroTeamId === team.id) && encounterOpen(t, tm))
    .slice(0, 2)
  const reserves = team.members.filter((id) => !team.order.includes(id))

  return (
    <div className={`rounded-2xl border border-line bg-surface-2 p-4 ${team.withdrawn ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2">
        <Field value={team.name} onSave={(name) => editTeam({ name })} className="display text-2xl font-bold" />
        <span className="shrink-0 rounded-md bg-surface px-2 py-1 text-xs text-muted">{poolName}</span>
        <span className="shrink-0 rounded-md bg-surface px-2 py-1 font-mono text-xs" title="Captain PIN for the online team order">
          PIN {team.pin}
        </span>
      </div>
      <div className="mt-1 flex gap-2 text-sm">
        <Field value={team.dojo} placeholder="Dojo / club" onSave={(dojo) => editTeam({ dojo })} />
        <Field value={team.country ?? ''} placeholder="Country" onSave={(country) => editTeam({ country })} className="w-28 uppercase" />
      </div>

      <h4 className="mt-3 mb-1 text-xs font-bold tracking-widest text-muted uppercase">Default order</h4>
      <OrderSelects team={team} t={t} value={team.order} onChange={(order) => void send({ type: 'SET_TEAM_ORDER', teamId: team.id, order })} />

      <h4 className="mt-3 mb-1 text-xs font-bold tracking-widest text-muted uppercase">
        Members {reserves.length > 0 && <span className="normal-case">· reserves: {reserves.map((id) => t.players[id]?.name).join(', ')}</span>}
      </h4>
      <ul className="text-sm">
        {team.members.map((id) => {
          const p = t.players[id]
          if (!p) return null
          return (
            <li key={id} className="flex items-center gap-1">
              <Field value={p.name} onSave={(name) => void send({ type: 'EDIT_PLAYER', playerId: id, patch: { name, dojo: p.dojo, country: p.country ?? '', grade: p.grade ?? '' } })} />
              <button
                onClick={() => void send({ type: 'REMOVE_TEAM_MEMBER', teamId: team.id, playerId: id })}
                className="rounded px-2 text-muted hover:bg-red-600 hover:text-white"
                aria-label={`Remove ${p.name}`}
              >
                ✕
              </button>
            </li>
          )
        })}
      </ul>
      {team.members.length < team.size + MAX_RESERVES && (
        <div className="mt-1 flex gap-2">
          <input
            className="flex-1 rounded-md border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-hansoku"
            placeholder="Add player"
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && newMember.trim() && (await send({ type: 'ADD_TEAM_MEMBER', teamId: team.id, member: { name: newMember } }))) setNewMember('')
            }}
          />
        </div>
      )}

      {upcoming.map((tm) => {
        const side = tm.akaTeamId === team.id ? 'aka' : 'shiro'
        const opp = t.teams[side === 'aka' ? tm.shiroTeamId : tm.akaTeamId]
        return (
          <div key={tm.id} className="mt-3 rounded-xl border border-line p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-muted">
              <span>
                Order for <b className="text-white">{matchLabel(t, t.matches[tm.boutIds[0]!]!)}</b> vs {opp?.name}
              </span>
              <span>{tm.lineupSet?.[side] ? 'set for this match' : 'uses default order'}</span>
            </div>
            <OrderSelects
              team={team}
              t={t}
              value={lineupOf(t, tm, side)}
              onChange={(lineup) => void send({ type: 'SET_LINEUP', teamMatchId: tm.id, teamId: team.id, lineup })}
            />
          </div>
        )
      })}

      <div className="mt-3 text-right">
        {team.withdrawn ? (
          <span className="text-xs font-semibold text-muted uppercase">Withdrawn</span>
        ) : (
          t.phase !== 'finished' && <WithdrawButton onConfirm={() => void send({ type: 'WITHDRAW_ENTRANT', entrantId: team.id })} />
        )}
      </div>
    </div>
  )
}

export function ParticipantsView({ t, send }: { t: Tournament; send: Send }) {
  const team = t.mode === 'team'
  const count = team ? Object.keys(t.teams).length : Object.keys(t.players).length
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4">
      <Section title={`${team ? 'Teams' : 'Participants'} (${count})`}>
        {team ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-4 p-4">
            {Object.values(t.teams).map((tm) => (
              <TeamCard key={tm.id} t={t} team={tm} send={send} />
            ))}
          </div>
        ) : (
          <IndividualList t={t} send={send} />
        )}
      </Section>
      <Section title={team ? 'Late team entry' : 'Late entry'}>
        <AddForm t={t} send={send} team={team} />
      </Section>
    </div>
  )
}
