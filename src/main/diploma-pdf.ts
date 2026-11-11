// Diplomas on the organiser's own PDF design: name, place and category are written
// on the three empty lines, in the organiser's font (e.g. Lumios Typewriter).
//
// Files, in the app's data folder (Settings → Results & diplomas sets them):
//   diploma-template.pdf   the design (first page is used; any size or orientation)
//   diploma-font.ttf/.otf  the font; if missing, an installed "Lumios Typewriter" is used
//
// All diplomas of a category go into one PDF: the design is stored once and every
// page draws it, so the file stays small however many diplomas there are.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont } from 'pdf-lib'
import type { Diploma } from '@shared/report'

/**
 * Where the three lines are, as fractions of the page as it is seen (width, height from the top).
 * Measured on "Diploma_new.pdf": name line, place line, category line.
 */
const LAYOUT = {
  name: { cx: 0.5113, baseline: 0.385, width: 0.6, size: 30, min: 14 },
  place: { cx: 0.5036, baseline: 0.528, width: 0.29, size: 26, min: 14 },
  category: { cx: 0.5107, baseline: 0.656, width: 0.51, size: 24, min: 12 }
} as const

const PLACE_TEXT: Record<1 | 2 | 3, string> = { 1: '1ST PLACE', 2: '2ND PLACE', 3: '3RD PLACE' }
const INK = rgb(0.13, 0.13, 0.13)

export const TEMPLATE_FILE = 'diploma-template.pdf'
const FONT_FILES = ['diploma-font.ttf', 'diploma-font.otf']

/** The diploma font: the one given to the app, else an installed Lumios Typewriter. Returns its path. */
export async function findDiplomaFont(dataDir: string): Promise<string | null> {
  for (const f of FONT_FILES) {
    const p = path.join(dataDir, f)
    if (await exists(p)) return p
  }
  const dirs = [
    path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'Fonts'),
    path.join(process.env['WINDIR'] ?? 'C:\\Windows', 'Fonts'),
    path.join(os.homedir(), 'Library', 'Fonts'),
    '/Library/Fonts'
  ]
  for (const dir of dirs) {
    const files = await fs.readdir(dir).catch(() => [] as string[])
    const hit = files.find((f) => /^lumios.*typewriter.*\.(ttf|otf)$/i.test(f))
    if (hit) return path.join(dir, hit)
  }
  return null
}

const exists = (p: string): Promise<boolean> =>
  fs.access(p).then(
    () => true,
    () => false
  )

export const hasTemplate = (dataDir: string): Promise<boolean> => exists(path.join(dataDir, TEMPLATE_FILE))

/** Text as written on the name line: "Name (Team)" for team categories. */
export const diplomaName = (d: Diploma): string => (d.team ? `${d.name} (${d.team})` : d.name)

/** Largest size (down to `min`) at which the text fits the line. */
function fit(font: PDFFont, text: string, maxWidth: number, size: number, min: number): number {
  let s = size
  while (s > min && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.5
  return s
}

/** The standard Courier font cannot write every letter: replace the ones it lacks. */
function encodable(font: PDFFont, text: string): string {
  return [...text]
    .map((ch) => {
      try {
        font.encodeText(ch)
        return ch
      } catch {
        return ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '') || '?'
      }
    })
    .join('')
}

/** One PDF with a page per diploma, written on the template. */
export async function diplomasOnTemplate(dataDir: string, list: Diploma[], category: string): Promise<Uint8Array> {
  const template = await PDFDocument.load(await fs.readFile(path.join(dataDir, TEMPLATE_FILE)))
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const fontPath = await findDiplomaFont(dataDir)
  const font = fontPath ? await doc.embedFont(await fs.readFile(fontPath), { subset: true }) : await doc.embedFont(StandardFonts.Courier)
  const source = template.getPage(0)
  const [design] = await doc.embedPdf(template, [0])
  const { width: w, height: h } = source.getSize()
  const rotation = ((source.getRotation().angle % 360) + 360) % 360
  // Size of the page as it is seen (a landscape design may be a portrait page turned by 90°).
  const turned = rotation === 90 || rotation === 270
  const W = turned ? h : w
  const H = turned ? w : h

  for (const d of list) {
    const page = doc.addPage([W, H])
    // Draw the design the way a viewer shows it (undo the page's /Rotate).
    if (rotation === 90) page.drawPage(design!, { x: 0, y: H, rotate: degrees(-90) })
    else if (rotation === 180) page.drawPage(design!, { x: W, y: H, rotate: degrees(180) })
    else if (rotation === 270) page.drawPage(design!, { x: W, y: 0, rotate: degrees(90) })
    else page.drawPage(design!, { x: 0, y: 0 })

    const write = (raw: string, spot: (typeof LAYOUT)[keyof typeof LAYOUT]) => {
      const text = fontPath ? raw : encodable(font, raw)
      const size = fit(font, text, spot.width * W, spot.size, spot.min)
      const tw = font.widthOfTextAtSize(text, size)
      page.drawText(text, { x: spot.cx * W - tw / 2, y: H - spot.baseline * H, size, font, color: INK })
    }
    write(diplomaName(d), LAYOUT.name)
    write(PLACE_TEXT[d.place], LAYOUT.place)
    write(d.category ?? category, LAYOUT.category)
  }
  return doc.save()
}
