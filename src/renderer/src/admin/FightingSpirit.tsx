// Fighting Spirit award: one name per category, typed at any time; "Generate" writes
// <category>/fighting-spirit.pdf on the diploma design.

import { useEffect, useState } from 'react'
import type { AdminAction } from '@shared/ipc'
import type { Competition, Tournament } from '@shared/types'

function Row({ t, send, onMessage }: { t: Tournament; send: (a: AdminAction) => Promise<boolean>; onMessage: (text: string) => void }) {
  const saved = t.fightingSpirit ?? ''
  const [name, setName] = useState(saved)
  const [busy, setBusy] = useState(false)
  useEffect(() => setName(saved), [saved])
  // Names of this category, so the operator can pick instead of typing.
  const people = Object.values(t.players)
    .map((p) => p.name)
    .sort((a, b) => a.localeCompare(b))

  const store = async (): Promise<boolean> => (name.trim() === saved ? true : send({ type: 'SET_FIGHTING_SPIRIT', categoryId: t.id, name }))
  const generate = async () => {
    setBusy(true)
    const ok = await store()
    const r = ok ? await window.kendoAdmin.fightingSpirit(t.id) : null
    setBusy(false)
    if (!r) return
    if (r.ok) {
      onMessage(`Fighting Spirit diploma of ${t.name} saved.${r.note ? ` ${r.note}` : ''}`)
      void window.kendoAdmin.openFolder(r.folder)
    } else onMessage(r.error)
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-44 shrink-0 truncate text-sm font-semibold" title={t.name}>
        {t.name}
      </span>
      <input
        list={`spirit-${t.id}`}
        className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-hansoku"
        placeholder="Name"
        value={name}
        maxLength={100}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void store()}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <datalist id={`spirit-${t.id}`}>
        {people.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <button disabled={!name.trim() || busy} onClick={() => void generate()} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold hover:bg-emerald-500 disabled:opacity-30">
        {busy ? 'Saving…' : 'Generate'}
      </button>
    </div>
  )
}

export function FightingSpiritList({ comp, send }: { comp: Competition; send: (a: AdminAction) => Promise<boolean> }) {
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      {comp.categories.map((t) => (
        <Row key={t.id} t={t} send={send} onMessage={setMsg} />
      ))}
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </div>
  )
}
