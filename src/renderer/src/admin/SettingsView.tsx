// Stream overlay, courts (host / court laptop), online results and export.

import { useEffect, useState, type ReactNode } from 'react'
import QRCode from 'qrcode'
import type { AdminSnapshot, AppSettings } from '@shared/ipc'

type Save = (patch: unknown) => Promise<boolean>

const box = 'w-full rounded-lg border border-line bg-surface-2 px-3 py-2 outline-none focus:border-hansoku'

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {hint && <p className="mt-1 mb-3 text-sm text-muted">{hint}</p>}
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!on)} className="flex items-center gap-3 text-left">
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-ok' : 'bg-neutral-700'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
      <span className="font-semibold">{label}</span>
    </button>
  )
}

function Copyable({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm">
      <span className="flex-1 truncate select-text">{text}</span>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className="rounded-md bg-neutral-700 px-2 py-1 font-sans text-xs font-semibold hover:bg-neutral-600"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function Qr({ text }: { text: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    void QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#0b0d12', light: '#ffffff' } }).then(setSvg)
  }, [text])
  return <div className="h-40 w-40 overflow-hidden rounded-xl bg-white" dangerouslySetInnerHTML={{ __html: svg }} />
}

/** Text field that saves on blur. */
function SettingInput({ value, onSave, placeholder, type = 'text' }: { value: string; onSave: (v: string) => void; placeholder?: string; type?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <input className={box} type={type} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />
}

export function SettingsView({ snap, save }: { snap: AdminSnapshot; save: Save }) {
  const s: AppSettings = snap.settings
  const t = snap.state.tournament
  const client = s.court.role === 'client'
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)

  const doExport = async () => {
    setExporting(true)
    const r = await window.kendoAdmin.exportResults()
    setExporting(false)
    if (r.ok) {
      setExportMsg(`Saved ${r.files} files.`)
      void window.kendoAdmin.openFolder(r.folder)
    } else setExportMsg(r.error)
  }

  return (
    <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(460px,1fr))] gap-4 overflow-y-auto pb-4">
      <Card title="Stream overlay (OBS)" hint="A lower-third score bar for the live stream. In OBS add a Browser Source with this address, size 1920×1080.">
        <Toggle on={s.lanSharing} onChange={(lanSharing) => void save({ lanSharing })} label="Share on the local network (streaming PC, court laptops)" />
        {snap.sharing.error && <p className="text-sm text-red-400">{snap.sharing.error}</p>}
        {snap.sharing.overlayUrls.map((u) => (
          <Copyable key={u} text={u} />
        ))}
        {!s.lanSharing && <p className="text-sm text-muted">Turn sharing on so the streaming PC can reach the overlay. Windows may ask once to allow the app through the firewall: allow it for private networks.</p>}
        {t && t.courts.length > 1 && <p className="text-sm text-muted">Other courts: change the last letter, e.g. ?court=B.</p>}
        <label className="flex items-center gap-3 text-sm">
          <span className="text-muted">Port</span>
          <input
            type="number"
            className="w-28 rounded-lg border border-line bg-surface-2 px-3 py-2 outline-none focus:border-hansoku"
            defaultValue={s.port}
            onBlur={(e) => Number(e.target.value) !== s.port && void save({ port: Number(e.target.value) })}
          />
        </label>
      </Card>

      <Card
        title="Courts"
        hint="One laptop hosts the tournament. With several courts, every other court's laptop joins it over the local network and operates its own court and TV."
      >
        <div className="grid grid-cols-2 gap-2">
          {(['host', 'client'] as const).map((role) => (
            <button
              key={role}
              onClick={() => void save({ court: { role } })}
              className={`rounded-lg py-2 font-bold ${s.court.role === role ? 'bg-hansoku text-ink' : 'bg-surface-2 hover:bg-neutral-700'}`}
            >
              {role === 'host' ? 'This laptop is the host' : 'Join a host as a court'}
            </button>
          ))}
        </div>
        {client ? (
          <>
            <SettingInput value={s.court.hostAddress} placeholder="Host address, e.g. 192.168.1.20" onSave={(hostAddress) => void save({ court: { hostAddress } })} />
            <SettingInput value={s.court.joinCode} placeholder="Join code (shown on the host)" onSave={(joinCode) => void save({ court: { joinCode: joinCode.toUpperCase() } })} />
            <p className={`text-sm font-semibold ${snap.courtLink.connected ? 'text-ok' : 'text-red-400'}`}>
              {snap.courtLink.connected ? 'Connected to the host.' : (snap.courtLink.error ?? 'Not connected.')}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted">Join code</span>
              <span className="rounded-md bg-surface-2 px-3 py-1 font-mono text-lg font-bold tracking-widest">{snap.courtLink.joinCode}</span>
            </div>
            {s.lanSharing ? (
              <div className="text-sm text-muted">
                Court laptops connect to: <b className="text-white">{snap.courtLink.hostAddresses.join(', ') || 'no network found'}</b>
              </div>
            ) : (
              <p className="text-sm text-muted">Turn on local network sharing (above) so court laptops can join.</p>
            )}
            {snap.courtLink.clients.map((c) => (
              <div key={c.address + c.courtName} className="text-sm">
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-ok" />
                {c.courtName} · {c.address}
              </div>
            ))}
          </>
        )}
        {t && t.courts.length > 1 && (
          <label className="flex items-center gap-3 text-sm">
            <span className="text-muted">This laptop operates</span>
            <select className={`${box} w-48`} value={snap.courtId ?? ''} onChange={(e) => void save({ courtId: e.target.value })}>
              {t.courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </Card>

      {!client && (
        <Card
          title="Online results"
          hint="Everyone follows live results, pools and brackets on their phone over mobile data; captains set their team order with their team PIN. Needs internet on this laptop only."
        >
          <Toggle on={s.online.enabled} onChange={(enabled) => void save({ online: { enabled } })} label="Publish results online" />
          <SettingInput value={s.online.url} placeholder="Results site, e.g. https://kendo-live.yourname.workers.dev" onSave={(url) => void save({ online: { url } })} />
          <SettingInput value={s.online.key} type="password" placeholder="Publish key" onSave={(key) => void save({ online: { key } })} />
          {s.online.enabled && (
            <p className={`text-sm font-semibold ${snap.online.state === 'ok' ? 'text-ok' : snap.online.state === 'error' ? 'text-red-400' : 'text-muted'}`}>
              {snap.online.state === 'ok'
                ? `Online · last update ${new Date(snap.online.lastPublishedAt!).toLocaleTimeString()}`
                : snap.online.state === 'error'
                  ? `Not published: ${snap.online.error} The tournament is not affected; it retries automatically.`
                  : 'Waiting for the first update…'}
            </p>
          )}
          {snap.online.publicUrl && (
            <div className="flex items-center gap-4">
              <Qr text={snap.online.publicUrl} />
              <div className="flex-1">
                <p className="mb-2 text-sm text-muted">Spectators scan this or open:</p>
                <Copyable text={snap.online.publicUrl} />
              </div>
            </div>
          )}
        </Card>
      )}

      <Card
        title="Results & diplomas"
        hint="Saves results.pdf, results.csv, diplomas for 1st, 2nd and both 3rd places (and captain PIN slips in team mode) to Documents › Kendo Tournament Manager. Happens automatically when the final is approved."
      >
        <button disabled={!t || exporting} onClick={doExport} className="rounded-xl bg-emerald-600 px-5 py-3 font-bold hover:bg-emerald-500 disabled:opacity-30">
          {exporting ? 'Saving…' : 'Export results now'}
        </button>
        {exportMsg && <p className="text-sm text-muted">{exportMsg}</p>}
        <p className="text-xs text-muted">
          Custom diploma: put your design as <code>diploma-template.png</code> (A4 landscape) into the app data folder; names, place and country are printed on it.
        </p>
      </Card>
    </div>
  )
}
