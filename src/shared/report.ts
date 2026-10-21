// Printable documents, as HTML: results report, diplomas, captain PIN slips, CSV.
// The main process renders the HTML to PDF.

import { countryName } from './countries'
import { tallyEncounter } from './encounters'
import { podium } from './published'
import { describeCompetitor, describeEntrant, matchLabel, positionLabel, roundName } from './public-view'
import { computeScore } from './match-engine'
import { markLetter } from './marks'
import { computeStandings } from './standings'
import type { Id, Match, Tournament } from './types'

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const PLACE = { 1: '1st place', 2: '2nd place', 3: '3rd place' } as const
const DECISION: Record<string, string> = { ippon: '', time: '', encho: 'Encho', 'fusen-gachi': 'Fusen-gachi', kiken: 'Kiken', hikiwake: 'Hikiwake' }

const marks = (m: Match, side: 'aka' | 'shiro'): string =>
  computeScore(m.events)[side].marks.map((mk) => markLetter(mk) || '○').join('')

// ---------------------------------------------------------------------------
// Diplomas
// ---------------------------------------------------------------------------

export interface Diploma {
  place: 1 | 2 | 3
  name: string
  /** IOC code */
  country: string
  dojo: string
  /** Team mode: the team name. */
  team?: string
  tournament: string
  date: string
}

/** One diploma per medallist; in team mode one per team member. */
export function diplomas(t: Tournament): Diploma[] {
  const out: Diploma[] = []
  for (const { place, entrantId } of podium(t)) {
    const team = t.mode === 'team' ? t.teams[entrantId] : undefined
    const people = team ? team.members.map((id) => t.players[id]!).filter(Boolean) : [t.players[entrantId]!].filter(Boolean)
    for (const p of people) {
      const d: Diploma = { place, name: p.name, country: p.country ?? team?.country ?? '', dojo: p.dojo, tournament: t.name, date: t.date }
      if (team) d.team = team.name
      out.push(d)
    }
  }
  return out
}

const longDate = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Default diploma layout (A4 landscape). `background` is an optional data: URL for a custom template image. */
export function diplomaHtml(d: Diploma, background?: string): string {
  const country = d.country ? `${esc(d.country)}${countryName(d.country) ? ` · ${esc(countryName(d.country)!)}` : ''}` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4 landscape; margin: 0 }
html, body { margin: 0; width: 297mm; height: 210mm }
body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; ${background ? `background: url(${background}) center / cover no-repeat;` : 'background: #fffdf8;'} }
.frame { position: absolute; inset: 12mm; ${background ? '' : 'border: 1.2mm solid #9e1626; outline: 0.4mm solid #9e1626; outline-offset: -3.5mm;'} display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center }
.title { font-size: 46pt; letter-spacing: 0.35em; color: #9e1626; margin: 0 }
.sub { font-size: 14pt; letter-spacing: 0.2em; text-transform: uppercase; color: #555; margin-top: 4mm }
.place { font-size: 34pt; margin-top: 14mm; font-weight: bold }
.name { font-size: 40pt; margin-top: 8mm; font-weight: bold }
.meta { font-size: 16pt; margin-top: 4mm; color: #333 }
.event { font-size: 18pt; margin-top: 14mm }
.date { font-size: 13pt; color: #555; margin-top: 2mm }
.sign { position: absolute; bottom: 14mm; display: flex; gap: 60mm; font-size: 11pt; color: #555 }
.sign div { border-top: 0.3mm solid #555; width: 60mm; padding-top: 2mm }
</style></head><body><div class="frame">
<h1 class="title">DIPLOMA</h1>
<div class="sub">Kendo</div>
<div class="place">${PLACE[d.place]}</div>
<div class="name">${esc(d.name)}</div>
<div class="meta">${[d.team ? esc(d.team) : '', d.dojo && d.dojo !== d.team ? esc(d.dojo) : '', country].filter(Boolean).join(' · ')}</div>
<div class="event">${esc(d.tournament)}</div>
<div class="date">${esc(longDate(d.date))}</div>
<div class="sign"><div>Tournament director</div><div>Chief referee</div></div>
</div></body></html>`
}

// ---------------------------------------------------------------------------
// Results report
// ---------------------------------------------------------------------------

function poolTables(t: Tournament): string {
  const team = t.mode === 'team'
  return t.pools
    .map((pool) => {
      const rows = computeStandings(t, pool)
        .map((r) => {
          const who = describeEntrant(t, r.entrantId)
          const out = (team ? t.teams[r.entrantId]?.withdrawn : t.players[r.entrantId]?.withdrawn) ? ' (withdrawn)' : ''
          return `<tr class="${r.rank <= t.advancePerPool ? 'q' : ''}"><td>${r.rank}</td><td>${esc(who.name)}${out}<small>${esc([who.dojo !== who.name ? who.dojo : '', who.country].filter(Boolean).join(' · '))}</small></td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td>${team ? `<td>${r.boutWins}</td>` : ''}<td>${r.ipponsScored}</td><td>${r.ipponsConceded}</td></tr>`
        })
        .join('')
      return `<div class="pool"><h3>${esc(pool.name)}</h3><table><tr><th>#</th><th>${team ? 'Team' : 'Player'}</th><th>W</th><th>D</th><th>L</th>${team ? '<th>Bouts</th>' : ''}<th>IS</th><th>IC</th></tr>${rows}</table></div>`
    })
    .join('')
}

function matchRow(t: Tournament, m: Match): string {
  const a = describeCompetitor(t, m.aka)
  const s = describeCompetitor(t, m.shiro)
  const r = m.result
  const label = [matchLabel(t, m), positionLabel(t, m)].filter(Boolean).join(' · ')
  const score = r ? `${marks(m, 'aka') || '–'} &nbsp;${r.akaIppons} : ${r.shiroIppons}&nbsp; ${marks(m, 'shiro') || '–'}` : ''
  const note = r ? DECISION[r.decision] ?? '' : 'not fought'
  const win = (side: 'aka' | 'shiro') => (r?.winner === side ? ' class="w"' : '')
  return `<tr><td>${esc(label)}</td><td${win('aka')}>${esc(a.name)}</td><td class="c">${score}</td><td${win('shiro')}>${esc(s.name)}</td><td>${esc(note)}${r?.editedAt ? ' (corrected)' : ''}</td></tr>`
}

function bracketList(t: Tournament): string {
  if (!t.bracket) return ''
  const b = t.bracket
  let html = ''
  for (let r = 0; r < b.rounds; r++) {
    const nodes = Object.values(b.nodes)
      .filter((n) => n.round === r && (n.akaEntrantId || n.shiroEntrantId))
      .sort((x, y) => x.slot - y.slot)
    const items = nodes
      .map((n) => {
        const aka = n.akaEntrantId ? describeEntrant(t, n.akaEntrantId).name : 'bye'
        const shiro = n.shiroEntrantId ? describeEntrant(t, n.shiroEntrantId).name : 'bye'
        const w = n.winnerEntrantId ? describeEntrant(t, n.winnerEntrantId).name : ''
        let score = ''
        const tm = n.matchId ? t.teamMatches[n.matchId] : undefined
        if (tm) {
          const s = tallyEncounter(t, tm)
          score = ` (${s.akaWins}–${s.shiroWins}, ${s.akaIppons}–${s.shiroIppons})`
        } else if (n.matchId && t.matches[n.matchId]?.result) {
          const res = t.matches[n.matchId]!.result!
          score = ` (${res.akaIppons}–${res.shiroIppons}${res.decision === 'encho' ? ', Encho' : ''})`
        }
        return `<li>${esc(aka)} vs ${esc(shiro)}${score}${w ? ` → <b>${esc(w)}</b>` : ''}</li>`
      })
      .join('')
    html += `<h3>${roundName(r, b.rounds)}</h3><ul>${items}</ul>`
  }
  return html
}

export function reportHtml(t: Tournament): string {
  const final = podium(t)
    .map(({ place, entrantId }) => {
      const who = describeEntrant(t, entrantId)
      return `<tr><td class="p">${PLACE[place]}</td><td><b>${esc(who.name)}</b></td><td>${esc(who.dojo !== who.name ? who.dojo : '')}</td><td>${esc(who.country ?? '')}</td></tr>`
    })
    .join('')
  const matches = t.matchQueue.map((id) => t.matches[id]).filter((m): m is Match => Boolean(m))
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 14mm }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; color: #111 }
h1 { font-size: 20pt; margin: 0 } h2 { font-size: 13pt; border-bottom: 1px solid #999; padding-bottom: 1mm; margin-top: 8mm } h3 { font-size: 11pt; margin: 4mm 0 1mm }
.sub { color: #555 } table { border-collapse: collapse; width: 100% } th, td { text-align: left; padding: 1mm 1.5mm; border-bottom: 0.2mm solid #ddd; vertical-align: top }
th { font-size: 8pt; text-transform: uppercase; color: #555 } td small { display: block; color: #666 } .q td { background: #eef7ee }
.pools { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm } .pool { break-inside: avoid } .c { text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums }
.w { font-weight: bold } .p { font-weight: bold; width: 25mm } ul { margin: 0; padding-left: 5mm }
</style></head><body>
<h1>${esc(t.name)}</h1><div class="sub">${esc(longDate(t.date))} · ${t.mode === 'team' ? `Team tournament (${t.teamSize})` : 'Individual tournament'}</div>
${final ? `<h2>Final standings</h2><table>${final}</table>` : ''}
<h2>Pools</h2><div class="pools">${poolTables(t)}</div>
${t.bracket ? `<h2>Elimination</h2>${bracketList(t)}` : ''}
<h2>All matches</h2><table><tr><th>Match</th><th>Aka</th><th class="c">Result</th><th>Shiro</th><th></th></tr>${matches.map((m) => matchRow(t, m)).join('')}</table>
</body></html>`
}

// ---------------------------------------------------------------------------
// Captain PIN slips and CSV
// ---------------------------------------------------------------------------

export function pinSlipsHtml(t: Tournament, onlineUrl: string | null): string {
  const slips = Object.values(t.teams)
    .map(
      (team) => `<div class="slip"><div class="t">${esc(team.name)}</div><div>Captain PIN</div><div class="pin">${esc(team.pin)}</div>
<div class="h">${onlineUrl ? `Set your team order before each match at<br><b>${esc(onlineUrl)}</b> → Captain` : 'Give your team order to the table before each match.'}</div></div>`
    )
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 10mm } body { font-family: 'Segoe UI', Arial, sans-serif }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm }
.slip { border: 0.4mm dashed #888; padding: 6mm; break-inside: avoid; text-align: center }
.t { font-size: 15pt; font-weight: bold } .pin { font-size: 30pt; letter-spacing: 0.3em; font-weight: bold; margin: 2mm 0 } .h { font-size: 9pt; color: #444; word-break: break-all }
</style></head><body><h2>${esc(t.name)} · Captain PINs</h2><div class="grid">${slips}</div></body></html>`
}

const csvCell = (v: string | number): string => {
  const s = String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function resultsCsv(t: Tournament): string {
  const header = ['Order', 'Court', 'Stage', 'Position', 'Aka', 'Aka dojo/team', 'Aka country', 'Aka marks', 'Aka ippons', 'Shiro ippons', 'Shiro marks', 'Shiro', 'Shiro dojo/team', 'Shiro country', 'Winner', 'Decision']
  const courtName = (id: Id) => t.courts.find((c) => c.id === id)?.name ?? ''
  const rows = t.matchQueue.flatMap((id, i) => {
    const m = t.matches[id]
    if (!m) return []
    const a = describeCompetitor(t, m.aka)
    const s = describeCompetitor(t, m.shiro)
    const r = m.result
    return [
      [
        i + 1,
        courtName(m.courtId),
        matchLabel(t, m),
        positionLabel(t, m) ?? '',
        a.name,
        a.dojo,
        a.country ?? '',
        r ? marks(m, 'aka') : '',
        r?.akaIppons ?? '',
        r?.shiroIppons ?? '',
        r ? marks(m, 'shiro') : '',
        s.name,
        s.dojo,
        s.country ?? '',
        r ? (r.winner === 'aka' ? a.name : r.winner === 'shiro' ? s.name : 'Draw') : '',
        r?.decision ?? m.status
      ]
    ]
  })
  // BOM so Excel opens UTF-8 (Cyrillic names) correctly.
  return '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
