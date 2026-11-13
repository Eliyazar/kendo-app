// Elimination pairings typed slot by slot, as drawn on the bracket sheet.

import { useEffect, useState } from 'react'
import { bracketText, parseBracketText } from '@shared/setup'

const small = 'rounded-md border border-white/10 bg-neutral-800 px-2 py-1 text-sm'

/** Elimination written slot by slot as on the bracket sheet; empty = the app draws it. */
export function BracketField({ value, letters, onChange }: { value: [string, string][]; letters: string[]; onChange: (v: [string, string][]) => void }) {
  const [text, setText] = useState(bracketText(value))
  useEffect(() => setText(bracketText(value)), [value])
  const [error, setError] = useState<string | null>(null)
  const commit = () => {
    const r = parseBracketText(text, letters)
    if (typeof r === 'string') return setError(r)
    setError(null)
    onChange(r)
    setText(bracketText(r))
  }
  return (
    <div className="mt-3 text-sm">
      <label className="flex items-center gap-2">
        <span className="shrink-0 text-white/50">Elimination</span>
        <input
          className={`${small} min-w-0 flex-1 font-mono ${error ? 'border-red-500' : ''}`}
          value={text}
          placeholder="empty = drawn by the app (pool winners apart)"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
      </label>
      <p className={`mt-1 text-xs ${error ? 'text-red-400' : 'text-white/40'}`}>
        {error ??
          'Top to bottom as on the bracket sheet: "A1–B2" is a first-round match, a lone "C1" waits for the next round. E.g. "A1, B2–D2, C1, J2" = A1 meets the winner of B2–D2, C1 meets J2.'}
      </p>
    </div>
  )
}
