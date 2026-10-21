import { useState } from 'react'

/** Accepts a bare code or a pasted link and returns the tournament code, if any. */
export function extractSlug(input: string): string | null {
  const text = input.trim().toLowerCase()
  const fromUrl = /\/t\/([a-z0-9]+)/.exec(text)
  const slug = fromUrl ? fromUrl[1]! : text
  return /^[a-z0-9]{6,32}$/.test(slug) ? slug : null
}

export function Landing() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const go = (e: React.FormEvent) => {
    e.preventDefault()
    const slug = extractSlug(code)
    if (!slug) return setError('Enter the tournament code (6 or more letters and digits).')
    window.location.assign(`/t/${slug}`)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface">
          <span className="block size-5 rounded-full border-[3px] border-aka" />
        </span>
        <p className="display text-lg text-muted">Kendo Live</p>
      </div>
      <h1 className="display text-5xl leading-[0.95]">
        Live results
        <br />
        <span className="text-amber">from the dojo floor</span>
      </h1>
      <p className="mt-5 text-base leading-relaxed text-muted">
        Follow every court, the schedule, pools, bracket and final results on your phone. Team captains can also send their fighting order. Enter the tournament code from the poster or the organisers.
      </p>
      <form onSubmit={go} className="mt-8 rounded-xl border border-line bg-surface p-4">
        <label htmlFor="code" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
          Tournament code
        </label>
        <input
          id="code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            setError('')
          }}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. 4f9a2c7b1d"
          className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-base text-ink placeholder:text-muted focus:border-amber/60 focus:outline-none"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-aka">
            {error}
          </p>
        )}
        <button type="submit" className="mt-4 w-full rounded-xl bg-amber px-4 py-3 text-base font-semibold text-bg">
          Open results
        </button>
      </form>
    </main>
  )
}
