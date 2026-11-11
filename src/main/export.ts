// Writes results to Documents/Kendo Tournament Manager/<date> <competition>/:
//   <category>/results.pdf, results.csv, diplomas/*.pdf   (one folder per category)
//   captain-pins.pdf                                      (team categories)
// A custom diploma background can be dropped into the app's data folder as
// diploma-template.png / .jpg; the default layout is used otherwise.

import fs from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { ExportResult } from '@shared/ipc'
import QRCode from 'qrcode'
import { diplomaHtml, diplomas, groupSheetsHtml, pinSlipsHtml, posterHtml, reportHtml, resultsCsv } from '@shared/report'
import type { AppState, Id } from '@shared/types'

const safe = (s: string): string => s.replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').trim().slice(0, 60).replace(/[\s.]+$/, '') || 'competition' // Windows: no trailing space or dot

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

/** Export every category, or only `categoryId`. */
/** Documents/Kendo Tournament Manager (a rehearsal copy, KENDO_PROFILE_DIR, keeps its files in its own data folder). */
export function documentsBase(): string {
  return process.env['KENDO_PROFILE_DIR'] ? path.join(app.getPath('userData'), 'exports') : path.join(app.getPath('documents'), 'Kendo Tournament Manager')
}

function competitionFolder(state: AppState): string {
  return path.join(documentsBase(), safe(`${state.competition!.date} ${state.competition!.name}`))
}

/** live-results-poster.pdf in the competition folder. */
export async function exportPoster(state: AppState, onlineUrl: string | null): Promise<ExportResult> {
  const comp = state.competition
  if (!comp) return { ok: false, error: 'No competition loaded.' }
  if (!onlineUrl) return { ok: false, error: 'Turn on "Publish results online" first.' }
  const folder = competitionFolder(state)
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  try {
    await fs.mkdir(folder, { recursive: true })
    const qr = await QRCode.toString(onlineUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
    await fs.writeFile(path.join(folder, 'live-results-poster.pdf'), await htmlToPdf(win, posterHtml(comp.name, comp.date, onlineUrl, qr), false))
    return { ok: true, folder, files: 1 }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    win.destroy()
  }
}

/** group-sheets.pdf in the competition folder: every pool with entrants and fight order. */
export async function exportGroupSheets(state: AppState): Promise<ExportResult> {
  const comp = state.competition
  if (!comp) return { ok: false, error: 'No competition loaded.' }
  const folder = competitionFolder(state)
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  try {
    await fs.mkdir(folder, { recursive: true })
    await fs.writeFile(path.join(folder, 'group-sheets.pdf'), await htmlToPdf(win, groupSheetsHtml(comp), false))
    return { ok: true, folder, files: 1 }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    win.destroy()
  }
}

export async function exportResults(state: AppState, onlineUrl: string | null = null, categoryId?: Id): Promise<ExportResult> {
  const comp = state.competition
  if (!comp) return { ok: false, error: 'No competition loaded.' }
  const folder = competitionFolder(state)
  const categories = comp.categories.filter((c) => !categoryId || c.id === categoryId)
  const single = comp.categories.length === 1
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  try {
    let files = 0
    const background = await diplomaBackground()
    for (const t of categories) {
      const dir = single ? folder : path.join(folder, safe(t.name))
      await fs.mkdir(path.join(dir, 'diplomas'), { recursive: true })
      await fs.writeFile(path.join(dir, 'results.csv'), resultsCsv(t), 'utf8')
      await fs.writeFile(path.join(dir, 'results.pdf'), await htmlToPdf(win, reportHtml(t, comp.name), false))
      files += 2
      for (const d of diplomas(t, comp.name)) {
        const name = safe(`${d.place} - ${d.name}${d.team ? ` (${d.team})` : ''}`)
        await fs.writeFile(path.join(dir, 'diplomas', `${name}.pdf`), await htmlToPdf(win, diplomaHtml(d, background), true))
        files++
      }
    }
    const teamCategories = categories.filter((t) => t.mode === 'team')
    if (teamCategories.length) {
      await fs.mkdir(folder, { recursive: true })
      await fs.writeFile(path.join(folder, 'captain-pins.pdf'), await htmlToPdf(win, pinSlipsHtml(teamCategories, comp.name, onlineUrl), false))
      files++
    }
    return { ok: true, folder, files }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    win.destroy()
  }
}
