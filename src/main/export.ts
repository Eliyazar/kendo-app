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
import { diplomasOnTemplate, hasTemplate } from './diploma-pdf'
import { diplomaHtml, diplomas, groupSheetsHtml, pinSlipsHtml, posterHtml, reportHtml, resultsCsv } from '@shared/report'
import type { AppState, Id } from '@shared/types'

const safe = (s: string): string => s.replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').trim().slice(0, 60).replace(/[\s.]+$/, '') || 'competition' // Windows: no trailing space or dot

/** Files that were open (e.g. in a PDF viewer) and were saved under another name instead. */
let renamed: string[] = []

/**
 * Write a file; if Windows keeps it locked because it is open in another program,
 * save it next to it as "name (14-35).pdf" instead of failing the whole export.
 */
async function save(file: string, data: string | Uint8Array, encoding?: BufferEncoding): Promise<void> {
  try {
    await fs.writeFile(file, data, encoding)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'EBUSY' && code !== 'EPERM' && code !== 'EACCES') throw err
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const ext = path.extname(file)
    const other = `${file.slice(0, -ext.length)} (${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())})${ext}`
    await fs.writeFile(other, data, encoding)
    renamed.push(`${path.basename(file)} was open, saved as ${path.basename(other)}`)
  }
}

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

/** diploma-test.pdf: three sample diplomas (individual, team, long names) to check the design and font. */
export async function exportDiplomaTest(): Promise<ExportResult> {
  const dataDir = app.getPath('userData')
  if (!(await hasTemplate(dataDir))) return { ok: false, error: 'Choose the diploma design (PDF) first.' }
  try {
    const folder = documentsBase()
    await fs.mkdir(folder, { recursive: true })
    const sample = (place: 1 | 2 | 3, name: string, category: string, team?: string) => ({ place, name, country: 'BUL', dojo: '', tournament: 'Test', category, date: '2026-01-01', ...(team ? { team } : {}) })
    const bytes = await diplomasOnTemplate(dataDir, [
      sample(1, 'Desislava Kasnakova', 'Senior female individual'),
      sample(2, 'Ivan Petrov', 'Senior Teams', 'Ruse Cup'),
      sample(3, 'Andrey Atanaskovski-Krastevski', 'Children individual (under 12 years old)', 'North Macedonia')
    ], 'Test')
    await save(path.join(folder, 'diploma-test.pdf'), bytes)
    return { ok: true, folder, files: 1 }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Export every category, or only `categoryId`. */
/** Documents/Kendo Tournament Manager (a rehearsal copy, KENDO_PROFILE_DIR, keeps its files in its own data folder). */
export function documentsBase(): string {
  return process.env['KENDO_PROFILE_DIR'] ? path.join(app.getPath('userData'), 'exports') : path.join(app.getPath('documents'), 'Kendo Tournament Manager')
}

export function competitionFolder(state: AppState): string {
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
    await save(path.join(folder, 'live-results-poster.pdf'), await htmlToPdf(win, posterHtml(comp.name, comp.date, onlineUrl, qr), false))
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
    await save(path.join(folder, 'group-sheets.pdf'), await htmlToPdf(win, groupSheetsHtml(comp), false))
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
  renamed = []
  const categories = comp.categories.filter((c) => !categoryId || c.id === categoryId)
  const single = comp.categories.length === 1
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  try {
    let files = 0
    const background = await diplomaBackground()
    const designed = await hasTemplate(app.getPath('userData'))
    for (const t of categories) {
      const dir = single ? folder : path.join(folder, safe(t.name))
      await fs.mkdir(designed ? dir : path.join(dir, 'diplomas'), { recursive: true })
      await save(path.join(dir, 'results.csv'), resultsCsv(t), 'utf8')
      await save(path.join(dir, 'results.pdf'), await htmlToPdf(win, reportHtml(t, comp.name), false))
      files += 2
      const list = diplomas(t, comp.name)
      if (designed && list.length) {
        // The organiser's design: all diplomas of the category in one PDF, ready to print.
        await save(path.join(dir, 'diplomas.pdf'), await diplomasOnTemplate(app.getPath('userData'), list, t.name))
        files++
      } else {
        for (const d of list) {
          const name = safe(`${d.place} - ${d.name}${d.team ? ` (${d.team})` : ''}`)
          await save(path.join(dir, 'diplomas', `${name}.pdf`), await htmlToPdf(win, diplomaHtml(d, background), true))
          files++
        }
      }
    }
    const teamCategories = categories.filter((t) => t.mode === 'team')
    if (teamCategories.length) {
      await fs.mkdir(folder, { recursive: true })
      await save(path.join(folder, 'captain-pins.pdf'), await htmlToPdf(win, pinSlipsHtml(teamCategories, comp.name, onlineUrl), false))
      files++
    }
    return renamed.length ? { ok: true, folder, files, note: `${renamed.join('; ')}. Close it to have the usual name next time.` } : { ok: true, folder, files }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    win.destroy()
  }
}
