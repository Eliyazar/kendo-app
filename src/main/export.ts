// Writes results to Documents/Kendo Tournament Manager/<date> <name>/:
// results.pdf, results.csv, diplomas/*.pdf and (team mode) captain-pins.pdf.
// A custom diploma background can be dropped into the app's data folder as
// diploma-template.png / .jpg; the default layout is used otherwise.

import fs from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { ExportResult } from '@shared/ipc'
import { diplomaHtml, diplomas, pinSlipsHtml, reportHtml, resultsCsv } from '@shared/report'
import type { AppState } from '@shared/types'

const safe = (s: string): string => s.replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').trim().slice(0, 60) || 'tournament'

async function htmlToPdf(win: BrowserWindow, html: string, landscape: boolean): Promise<Buffer> {
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  return win.webContents.printToPDF({ pageSize: 'A4', landscape, printBackground: true, preferCSSPageSize: true })
}

async function diplomaBackground(): Promise<string | undefined> {
  for (const [name, mime] of [
    ['diploma-template.png', 'image/png'],
    ['diploma-template.jpg', 'image/jpeg'],
    ['diploma-template.jpeg', 'image/jpeg']
  ] as const) {
    try {
      const data = await fs.readFile(path.join(app.getPath('userData'), name))
      return `data:${mime};base64,${data.toString('base64')}`
    } catch {
      /* not there */
    }
  }
  return undefined
}

export async function exportResults(state: AppState, onlineUrl: string | null = null): Promise<ExportResult> {
  const t = state.tournament
  if (!t) return { ok: false, error: 'No tournament loaded.' }
  // A rehearsal copy (KENDO_PROFILE_DIR) keeps its exports in its own data folder.
  const base = process.env['KENDO_PROFILE_DIR'] ? path.join(app.getPath('userData'), 'exports') : path.join(app.getPath('documents'), 'Kendo Tournament Manager')
  const folder = path.join(base, safe(`${t.date} ${t.name}`))
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  try {
    await fs.mkdir(path.join(folder, 'diplomas'), { recursive: true })
    let files = 0
    await fs.writeFile(path.join(folder, 'results.csv'), resultsCsv(t), 'utf8')
    await fs.writeFile(path.join(folder, 'results.pdf'), await htmlToPdf(win, reportHtml(t), false))
    files += 2
    if (t.mode === 'team') {
      await fs.writeFile(path.join(folder, 'captain-pins.pdf'), await htmlToPdf(win, pinSlipsHtml(t, onlineUrl), false))
      files++
    }
    const background = await diplomaBackground()
    for (const d of diplomas(t)) {
      const name = safe(`${d.place} - ${d.name}${d.team ? ` (${d.team})` : ''}`)
      await fs.writeFile(path.join(folder, 'diplomas', `${name}.pdf`), await htmlToPdf(win, diplomaHtml(d, background), true))
      files++
    }
    return { ok: true, folder, files }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    win.destroy()
  }
}
