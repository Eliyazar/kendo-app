// Reads files chosen by the operator:
//   participant lists (.csv / .xlsx, one table) and
//   draw sheets (.xlsx with categories, pools, fight order and bracket, several files at once).

import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron'
import ExcelJS from 'exceljs'
import Papa from 'papaparse'
import { parseDrawSheets, type SheetCells } from '@shared/draw-import'
import type { DrawImportResult, ImportResult } from '@shared/ipc'
import { rowsToEntrants } from '@shared/import-parse'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_FILES = 30

/** exceljs throws on some merged cells; treat those as empty. */
function cellText(cell: ExcelJS.Cell): string {
  try {
    return cell.text ?? ''
  } catch {
    return ''
  }
}

async function loadWorkbook(file: string): Promise<ExcelJS.Workbook> {
  const { size } = await stat(file)
  if (size > MAX_BYTES) throw new Error(`${basename(file)} is larger than 10 MB.`)
  const wb = new ExcelJS.Workbook()
  // exceljs types predate Node's generic Buffer; the runtime accepts it as is.
  await wb.xlsx.load((await readFile(file)) as unknown as Parameters<typeof wb.xlsx.load>[0])
  return wb
}

/** All cells of a sheet as text, 0-based [row][col]. */
function sheetCells(ws: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = []
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    const cells: string[] = []
    for (let c = 1; c <= row.cellCount; c++) cells.push(cellText(row.getCell(c)))
    rows[r - 1] = cells
  })
  return Array.from({ length: rows.length }, (_, i) => rows[i] ?? [])
}

async function readRows(file: string): Promise<string[][]> {
  const ext = extname(file).toLowerCase()
  if (ext === '.csv' || ext === '.txt') {
    const text = (await readFile(file, 'utf8')).replace(/^﻿/, '')
    // Auto-detects comma / semicolon / tab (European Excel exports use ';').
    return Papa.parse<string[]>(text, { skipEmptyLines: true }).data
  }
  if (ext === '.xlsx') {
    const sheet = (await loadWorkbook(file)).worksheets[0]
    return sheet ? sheetCells(sheet).filter((r) => r.some((c) => c !== '')) : []
  }
  throw new Error('Unsupported file type. Use .csv or .xlsx (old .xls files: re-save as .xlsx).')
}

async function pick(parent: BrowserWindow | null, options: OpenDialogOptions): Promise<string[]> {
  const res = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  return res.canceled ? [] : res.filePaths
}

export async function importParticipants(parent: BrowserWindow | null): Promise<ImportResult | null> {
  const [file] = await pick(parent, {
    title: 'Import participants',
    properties: ['openFile'],
    filters: [{ name: 'Participant list', extensions: ['csv', 'xlsx', 'txt'] }]
  })
  if (!file) return null
  try {
    if ((await stat(file)).size > MAX_BYTES) return { ok: false, error: 'File is larger than 10 MB.' }
    return { ok: true, fileName: basename(file), ...rowsToEntrants(await readRows(file)) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Draw sheets: every sheet of every chosen file. */
export async function importDraw(parent: BrowserWindow | null): Promise<DrawImportResult | null> {
  const files = await pick(parent, {
    title: 'Import draw files (categories, pools, fight order)',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Excel draw sheets', extensions: ['xlsx'] }]
  })
  if (!files.length) return null
  if (files.length > MAX_FILES) return { ok: false, error: `Choose at most ${MAX_FILES} files.` }
  try {
    const sheets: SheetCells[] = []
    for (const file of files) {
      const wb = await loadWorkbook(file)
      for (const ws of wb.worksheets) sheets.push({ file: basename(file), sheet: ws.name, cells: sheetCells(ws) })
    }
    return { ok: true, files: files.map((f) => basename(f)), ...parseDrawSheets(sheets) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
