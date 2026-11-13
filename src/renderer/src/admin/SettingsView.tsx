// Stream overlay, courts (host / court laptop), online results and export.

import { useEffect, useState, type ReactNode } from 'react'
import type { AdminSnapshot, AppSettings } from '@shared/ipc'
import { Qr } from '../components/Qr'
import { useConfirm } from './useAdmin'

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


/** Text field that saves on blur. */
function SettingInput({ value, onSave, placeholder, type = 'text' }: { value: string; onSave: (v: string) => void; placeholder?: string; type?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <input className={box} type={type} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />
}

export function SettingsView({ snap, save }: { snap: AdminSnapshot; save: Save }) {
  const s: AppSettings = snap.settings
  const t = snap.state.competition
  const client = s.court.role === 'client'
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [posterError, setPosterError] = useState<string | null>(null)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const [takeOverError, setTakeOverError] = useState<string | null>(null)
  const [takeOverArmed, confirmTakeOver] = useConfirm(5000)
  const [restoreArmed, confirmRestore] = useConfirm(5000)

  const doExport = async () => {
    setExporting(true)
    const r = await window.kendoAdmin.exportResults()
    setExporting(false)
    if (r.ok) {
      setExportMsg(`Saved ${r.files} files.${r.note ? ` ${r.note}` : ''}`)
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
            {snap.state.competition && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm">
                <p className="mb-2 text-muted">
                  <b className="text-white">Host laptop broken?</b> This laptop has a full copy of the competition. Taking over makes it the host; the other court laptops then join this one.
                </p>
                <button
                  onClick={() =>
                    confirmTakeOver(async () => {
                      const r = await window.kendoAdmin.takeOverHost()
                      if (!r.ok) setTakeOverError(r.error)
                    })
                  }
                  className={`rounded-lg px-4 py-2 font-bold ${takeOverArmed ? 'bg-red-600' : 'bg-surface-2 hover:bg-neutral-700'}`}
                >
                  {takeOverArmed ? 'Click again: take over as host' : 'Take over as host'}
                </button>
                {takeOverError && <p className="mt-1 text-red-400">{takeOverError}</p>}
              </div>
            )}
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
              <Qr text={snap.online.publicUrl} size={160} className="rounded-xl" />
              <div className="flex-1">
                <p className="mb-2 text-sm text-muted">Spectators scan this or open:</p>
                <Copyable text={snap.online.publicUrl} />
                <p className="mt-2 text-xs text-muted">The TV shows this QR code too: large between matches, small in the corner during a match.</p>
                <button
                  onClick={async () => {
                    const r = await window.kendoAdmin.exportPoster()
                    if (r.ok) void window.kendoAdmin.openFolder(r.folder)
                    else setPosterError(r.error)
                  }}
                  className="mt-3 rounded-lg bg-surface-2 px-4 py-2 text-sm font-bold hover:bg-neutral-700"
                >
                  Poster with QR code (PDF)…
                </button>
                {posterError && <p className="mt-1 text-sm text-red-400">{posterError}</p>}
              </div>
            </div>
          )}
        </Card>
      )}

      {!client && (
        <Card title="Backups" hint="A copy of the competition is saved every 2 minutes while it changes (the newest 40 are kept). Restore one on this or any other laptop.">
          <p className="text-sm text-muted">
            Folder: <span className="text-white">{snap.backup.folder}</span>
            {snap.backup.lastAt && <> · last backup {new Date(snap.backup.lastAt).toLocaleTimeString()}</>}
          </p>
          {snap.backup.error && <p className="text-sm text-red-400">{snap.backup.error}</p>}
          <SettingInput value={s.backupDir} placeholder="Second backup folder, e.g. E:\Kendo backups (USB stick)" onSave={(backupDir) => void save({ backupDir })} />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={async () => {
                const r = await window.kendoAdmin.backupNow()
                setBackupMsg(r.ok ? 'Backup saved.' : r.error)
              }}
              className="rounded-lg bg-surface-2 px-4 py-2 text-sm font-bold hover:bg-neutral-700"
            >
              Back up now
            </button>
            <button
              onClick={() =>
                confirmRestore(async () => {
                  const r = await window.kendoAdmin.restoreBackup()
                  if (r) setBackupMsg(r.ok ? 'Backup restored. Clocks are paused.' : r.error)
                })
              }
              className={`rounded-lg px-4 py-2 text-sm font-bold ${restoreArmed ? 'bg-red-600' : 'bg-surface-2 hover:bg-neutral-700'}`}
              title="Replaces the current competition (it is archived first)"
            >
              {restoreArmed ? 'Click again: choose a backup to load' : 'Restore from backup…'}
            </button>
          </div>
          {backupMsg && <p className="text-sm text-muted">{backupMsg}</p>}
        </Card>
      )}

      <Card
        title="Results & diplomas"
        hint="Saves results.pdf, results.csv, diplomas for 1st, 2nd and both 3rd places (and captain PIN slips in team mode) to Documents › Kendo Tournament Manager. Happens automatically when the final is approved."
      >
        <button disabled={!t || exporting} onClick={doExport} className="rounded-xl bg-emerald-600 px-5 py-3 font-bold hover:bg-emerald-500 disabled:opacity-30">
          {exporting ? 'Saving…' : 'Export results now'}
        </button>
        <button
          disabled={!t}
          onClick={async () => {
            const r = await window.kendoAdmin.exportGroupSheets()
            if (r.ok) void window.kendoAdmin.openFolder(r.folder)
            else setExportMsg(r.error)
          }}
          className="rounded-xl bg-surface-2 px-5 py-3 font-bold hover:bg-neutral-700 disabled:opacity-30"
          title="Every group with its fighters and fight order, for the wall and the referees' table"
        >
          Group sheets to print (PDF)…
        </button>
        {exportMsg && <p className="text-sm text-muted">{exportMsg}</p>}
        <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate text-muted" title={snap.resultsFolder}>
            Saved in: <span className="text-white">{snap.resultsFolder}</span>
          </span>
          <button onClick={() => void window.kendoAdmin.openFolder(snap.resultsFolder)} className="shrink-0 rounded-lg bg-neutral-700 px-3 py-1.5 font-bold hover:bg-neutral-600">
            Open folder
          </button>
        </div>
        <div className="mt-2 rounded-xl border border-line p-3">
          <h4 className="text-sm font-bold">Diploma design</h4>
          <p className="mt-1 text-sm text-muted">
            {snap.diploma.template ? (
              <>
                <span className="text-ok">✓ Your PDF design</span> — name (with the team in brackets), place and category are written on its three lines. One <code>diplomas.pdf</code> per category.
              </>
            ) : (
              'Standard design. Choose your PDF to use it instead.'
            )}
          </p>
          <p className="mt-1 text-sm text-muted">
            Font:{' '}
            {snap.diploma.font ? <span className="text-ok">✓ {snap.diploma.font}</span> : <span className="text-amber-300">not found — Courier is used. Choose the font file (e.g. Lumios Typewriter).</span>}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={async () => {
                const r = await window.kendoAdmin.chooseDiplomaFile('template')
                if (r && !r.ok) setExportMsg(r.error)
              }}
              className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-bold hover:bg-neutral-700"
            >
              Choose design (PDF)…
            </button>
            <button
              onClick={async () => {
                const r = await window.kendoAdmin.chooseDiplomaFile('font')
                if (r && !r.ok) setExportMsg(r.error)
              }}
              className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-bold hover:bg-neutral-700"
            >
              Choose font (TTF/OTF)…
            </button>
            <button
              disabled={!snap.diploma.template}
              onClick={async () => {
                const r = await window.kendoAdmin.diplomaTest()
                if (r.ok) void window.kendoAdmin.openFolder(r.folder)
                else setExportMsg(r.error)
              }}
              className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-bold hover:bg-neutral-700 disabled:opacity-30"
              title="diploma-test.pdf with three sample names, to check the design before the tournament"
            >
              Test diploma (PDF)…
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
