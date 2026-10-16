// Reads a participant list (.csv / .xlsx) chosen by the operator.

import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { dialog, type BrowserWindow } from 'electron'
import ExcelJS from 'exceljs'
import Papa from 'papaparse'
import type { ImportResult } from '@shared/ipc'
import { rowsToEntrants } from '@shared/import-parse'



const MAX_BYTES = 10 * 1024 * 1024

async function readRows(file: string): Promise<string[][]> {
  const ext = extname(file).toLowerCase()
  if (ext === '.csv' || ext === '.txt') {
    const text = (await readFile(file, 'utf8')).replace(/^﻿/, '')
    // Auto-detects comma / semicolon / tab (European Excel exports use ';').
    return Papa.parse<string[]>(text, { skipEmptyLines: true }).data
  }
  if (ext === '.xlsx') {
    const wb = new ExcelJS.Workbook()
    // exceljs types predate Node's generic Buffer; the runtime accepts it as is.
    await wb.xlsx.load((await readFile(file)) as unknown as Parameters<typeof wb.xlsx.load>[0])
    const sheet = wb.worksheets[0]
    if (!sheet) return []
    const rows: string[][] = []
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = []
      for (let c = 1; c <= row.cellCount; c++) cells.push(row.getCell(c).text)
      rows.push(cells)
    })
    return rows
  }
  throw new Error('Unsupported file type. Use .csv or .xlsx (old .xls files: re-save as .xlsx).')
}

export async function importParticipants(parent: BrowserWindow | null): Promise<ImportResult | null> {
  const options = {
    title: 'Import participants',
    properties: ['openFile' as const],
    filters: [{ name: 'Participant list', extensions: ['csv', 'xlsx', 'txt'] }]
  }
  const pick = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  const file = pick.filePaths[0]
  if (pick.canceled || !file) return null
  try {
    const { size } = await stat(file)
    if (size > MAX_BYTES) return { ok: false, error: 'File is larger than 10 MB.' }
    return { ok: true, fileName: basename(file), ...rowsToEntrants(await readRows(file)) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
