// Quick fix of a fighter's name, country and club from the shiai-jo screen, also during a match.

import { useState } from 'react'
import { countryName, toIocCode } from '@shared/countries'
import type { AdminAction } from '@shared/ipc'
import type { Player } from '@shared/types'

const field = 'w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-lg text-white outline-none focus:border-amber-500'

export function EditPersonDialog({ player, send, onClose }: { player: Player; send: (a: AdminAction) => Promise<boolean>; onClose: () => void }) {
  const [name, setName] = useState(player.name)
  const [country, setCountry] = useState(player.country ?? '')
  const [dojo, setDojo] = useState(player.dojo)
  const code = country.trim() ? toIocCode(country) : null
  const badCountry = country.trim() !== '' && !code

  const save = async () => {
    const patch = { name, dojo, country, ...(player.grade ? { grade: player.grade } : {}) }
    if (await send({ type: 'EDIT_PLAYER', playerId: player.id, patch })) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onMouseDown={onClose}>
      <form
        className="w-[440px] rounded-2xl border border-white/10 bg-neutral-900 p-6"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim() && !badCountry) void save()
        }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2 className="mb-4 text-xl font-black">Edit fighter</h2>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-bold tracking-widest text-white/50 uppercase">Name</span>
          <input autoFocus className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-bold tracking-widest text-white/50 uppercase">Country</span>
          <input className={`${field} ${badCountry ? 'border-red-500' : ''}`} value={country} placeholder="e.g. BUL, Bulgaria, България" onChange={(e) => setCountry(e.target.value)} />
          <span className={`mt-1 block text-sm ${badCountry ? 'text-red-400' : 'text-white/50'}`}>
            {badCountry ? 'Unknown country' : code ? `${code} · ${countryName(code) ?? ''}` : 'Shown on the TV next to the name'}
          </span>
        </label>
        <label className="mb-5 block">
          <span className="mb-1 block text-xs font-bold tracking-widest text-white/50 uppercase">Club / dojo</span>
          <input className={field} value={dojo} onChange={(e) => setDojo(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl bg-neutral-800 px-5 py-2.5 font-semibold hover:bg-neutral-700">
            Cancel
          </button>
          <button type="submit" disabled={!name.trim() || badCountry} className="rounded-xl bg-emerald-600 px-5 py-2.5 font-bold hover:bg-emerald-500 disabled:opacity-30">
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
