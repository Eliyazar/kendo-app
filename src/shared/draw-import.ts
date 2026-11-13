// Parses hand-made Excel "draw sheets" (Ruse Cup format) into categories with pre-drawn pools,
// fight order, bracket pairings and team compositions.
// Pure function: reading the workbook happens in the main process, which hands us plain text cells.

import { toIocCode } from './countries'

/** One sheet as plain text cells, 0-based [row][col]; '' for empty. The main process builds this from exceljs. */
export interface SheetCells {
  file: string
  sheet: string
  cells: string[][]
}

export interface DrawPerson {
  name: string
  country?: string
}

export interface DrawEntrant {
  /** Stable matching key: lowercase, diacritics removed, country suffix removed, single spaces. */
  key: string
  /** Display name: trimmed, single spaces, country suffix removed; ALL-CAPS names converted to Title Case. */
  name: string
  country?: string
  /** Team categories only: members in listed order (first = default order, extra = reserves). */
  members?: DrawPerson[]
}

export interface DrawPool {
  /** "Pool A" (Cyrillic look-alike letters normalised to Latin). */
  name: string
  /** Entrant keys in first-appearance order. */
  entrantKeys: string[]
  /** [aka key, shiro key] in the order written in the sheet (left column = aka). */
  matches: [string, string][]
}

export interface DrawCategory {
  name: string
  mode: 'individual' | 'team'
  /** Court letter from a "Shiai-jo A" cell that belongs to this category, if any. */
  court?: string
  entrants: DrawEntrant[]
  /** Pre-drawn pools; [] when the sheet only lists participants/teams. */
  pools: DrawPool[]
  /** Bracket first round as pool-place refs, e.g. [["A1","B1"],["B2","A2"]]; [] when none listed. */
  bracket: [string, string][]
  /** Suggested team size for team categories: the most common member count (3..5). */
  teamSize?: number
  source: { file: string; sheet: string }
  warnings: string[]
}

export interface DrawImport {
  eventName?: string
  /** ISO date (YYYY-MM-DD) of the first day. */
  date?: string
  categories: DrawCategory[]
  warnings: string[]
}

// ---------------------------------------------------------------------------------------------
// Text helpers

const clean = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim()

const LOOKALIKES: Record<string, string> = {
  А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X',
  а: 'a', с: 'c', е: 'e', о: 'o', р: 'p', х: 'x'
}

/** Replace Cyrillic letters that look like Latin ones (for pool headers and bracket refs). */
export const latinize = (s: string): string => s.replace(/[АВСЕНКМОРТХасеорх]/g, (ch) => LOOKALIKES[ch] ?? ch)

const LEGACY_COUNTRY: Record<string, string> = { ROM: 'ROU', MAC: 'MKD', SER: 'SRB', MOL: 'MDA', CRO: 'CRO', SLO: 'SLO' }

export interface SplitName {
  name: string
  country?: string
  /** Suffix in brackets that is not a known country (kept in `name`). */
  unknownSuffix?: string
}

/** Split a trailing "(BUL)" style country suffix off a name. */
export function splitCountry(raw: string): SplitName {
  const s = clean(raw)
  const m = /^(.*?)\s*\(\s*([A-Za-z]{2,4})\s*\)$/.exec(s)
  const base = m?.[1]?.trim()
  const suffix = m?.[2]
  if (!base || !suffix) return { name: s }
  const code = LEGACY_COUNTRY[suffix.toUpperCase()] ?? toIocCode(suffix)
  if (code) return { name: base, country: code }
  return { name: s, unknownSuffix: suffix }
}

const isAllCaps = (s: string): boolean => /\p{L}/u.test(s) && s === s.toUpperCase() && s !== s.toLowerCase()

const titleCase = (s: string): string =>
  s.toLowerCase().replace(/(^|[\s\-'’.(/])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())

/** Display name: trimmed, single spaces, country suffix removed, ALL CAPS -> Title Case. */
export function displayName(raw: string): string {
  const { name } = splitCountry(raw)
  return isAllCaps(name) ? titleCase(name) : name
}

/** Matching key: lowercase, no diacritics, no country suffix, single spaces. */
export function entrantKey(raw: string): string {
  return splitCountry(raw)
    .name.normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** "Pool A" for header cells like "  POOL А" (Cyrillic А), else null. */
export function poolHeader(text: string): string | null {
  const m = /^pool\s*([A-Z0-9]{1,2})\.?$/i.exec(latinize(clean(text)))
  return m?.[1] ? `Pool ${m[1].toUpperCase()}` : null
}

/** "A1" style bracket reference (pool letter + place), else null. */
export function bracketRef(text: string): string | null {
  const m = /^([A-Z])(\d{1,2})$/.exec(latinize(clean(text)).toUpperCase())
  return m ? `${m[1]}${m[2]}` : null
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** ISO date of the first day in texts like "07-09 November 2025" or "07.11.2025". */
export function parseDate(text: string): string | undefined {
  const s = clean(text)
  const iso = (y: string, m: number, d: string): string => `${y}-${String(m).padStart(2, '0')}-${d.padStart(2, '0')}`
  const a = /(\d{1,2})\s*(?:[-–—]\s*\d{1,2})?\s+([A-Za-z]{3,})\.?,?\s+(\d{4})/.exec(s)
  if (a?.[1] && a[2] && a[3]) {
    const mi = MONTHS.indexOf(a[2].toLowerCase().slice(0, 3))
    if (mi >= 0) return iso(a[3], mi + 1, a[1])
  }
  const b = /(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s)
  if (b?.[1] && b[2] && b[3]) return iso(b[3], Number(b[2]), b[1])
  return undefined
}

const TITLE_RE = new RegExp(
  '(?<![\\p{L}])(?:individual|indiv|teams?|children|kids?|juniors?|seniors?|veterans?|female|women|male|men|деца|юноши|девойки|мъже|жени|ветерани|отбор\\p{L}*)(?![\\p{L}])',
  'iu'
)
const TEAM_TITLE_RE = /(?<![\p{L}])(?:teams?|отбор\p{L}*)(?![\p{L}])/iu
const COURT_RE = /(?:shiai[\s-]*jo|court)\s*([A-Z0-9])\b/i
const NAMES_RE = /^(?:names?|имена)$/i

const isTitleLike = (s: string): boolean => s.length <= 80 && TITLE_RE.test(s)

// ---------------------------------------------------------------------------------------------
// Grid

interface Grid {
  rows: number
  cols: number
  /** Effective text; a cell equal to its left neighbour (merged duplicate) is blanked. */
  t: string[][]
  /** For the first cell of a merged run: last column of the run. */
  end: number[][]
}

function buildGrid(cells: string[][]): Grid {
  const rows = cells.length
  const cols = cells.reduce((m, r) => Math.max(m, r.length), 0)
  const t: string[][] = []
  const end: number[][] = []
  for (let r = 0; r < rows; r++) {
    const tr: string[] = []
    const er: number[] = []
    const start: number[] = []
    for (let c = 0; c < cols; c++) {
      const raw = clean(cells[r]?.[c])
      const prev = c > 0 ? clean(cells[r]?.[c - 1]) : ''
      er[c] = c
      if (raw && raw === prev) {
        tr[c] = ''
        const s = start[c - 1] ?? c - 1
        start[c] = s
        er[s] = c
      } else {
        tr[c] = raw
        start[c] = c
      }
    }
    t.push(tr)
    end.push(er)
  }
  return { rows, cols, t, end }
}

// ---------------------------------------------------------------------------------------------
// Entrant registry (one per category)

interface Rec {
  key: string
  name: string
  /** Name as first written; team names keep it (acronyms like "CRK 1" stay as they are). */
  written: string
  mixed: boolean
  country?: string
  members?: DrawPerson[]
}

interface Registry {
  recs: Map<string, Rec>
  add(raw: string): string
  setMembers(key: string, members: DrawPerson[]): void
}

function makeRegistry(warn: (msg: string) => void): Registry {
  const recs = new Map<string, Rec>()
  const seenUnknown = new Set<string>()
  const add = (raw: string): string => {
    const sp = splitCountry(raw)
    if (sp.unknownSuffix && !seenUnknown.has(sp.name)) {
      seenUnknown.add(sp.name)
      warn(`Unknown country "${sp.unknownSuffix}" kept in name "${sp.name}"`)
    }
    const key = entrantKey(raw)
    const mixed = !isAllCaps(sp.name)
    const name = mixed ? sp.name : titleCase(sp.name)
    const rec = recs.get(key)
    if (!rec) {
      recs.set(key, { key, name, written: sp.name, mixed, ...(sp.country ? { country: sp.country } : {}) })
    } else {
      if (!rec.mixed && mixed) {
        rec.name = name
        rec.mixed = true
      }
      if (!rec.country && sp.country) rec.country = sp.country
    }
    return key
  }
  const setMembers = (key: string, members: DrawPerson[]): void => {
    const rec = recs.get(key)
    if (rec && !rec.members) {
      rec.members = members
      if (!rec.mixed) rec.name = rec.written
    }
  }
  return { recs, add, setMembers }
}

function parsePerson(raw: string, warn: (msg: string) => void): DrawPerson {
  const sp = splitCountry(raw)
  if (sp.unknownSuffix) warn(`Unknown country "${sp.unknownSuffix}" kept in name "${sp.name}"`)
  const name = isAllCaps(sp.name) ? titleCase(sp.name) : sp.name
  return sp.country ? { name, country: sp.country } : { name }
}

// ---------------------------------------------------------------------------------------------
// Sheet parsing

interface Title {
  row: number
  c0: number
  c1: number
  text: string
  team: boolean
}

interface PoolRaw {
  name: string
  row: number
  col: number
  pairs: [string, string][]
  warnings: string[]
  title: Title | null
  syn: boolean
}

interface Block {
  row: number
  col: number
  team: string
  members: string[]
}

interface Ref {
  row: number
  col: number
  ref: string
}

interface Acc {
  title: Title | null
  syn: boolean
  pools: PoolRaw[]
  names: string[]
  blocks: Block[]
  refs: Ref[]
  court?: string
}

/** Title for a cell: nearest title above whose column span covers it, else the nearest title row above. */
function findTitle(titles: Title[], row: number, col: number): Title | null {
  const above = titles.filter((t) => t.row < row)
  if (!above.length) return null
  const direct = above.filter((t) => col >= t.c0 && col <= t.c1)
  if (direct.length) return direct.reduce((a, b) => (b.row > a.row ? b : a))
  const maxRow = Math.max(...above.map((t) => t.row))
  const dist = (t: Title): number => (col < t.c0 ? t.c0 - col : col - t.c1)
  return above.filter((t) => t.row === maxRow).reduce((a, b) => (dist(b) < dist(a) ? b : a))
}

interface SheetResult {
  eventName?: string
  date?: string
  categories: DrawCategory[]
  warnings: string[]
}

function parseSheet(sheet: SheetCells): SheetResult {
  const g = buildGrid(sheet.cells)
  const warnings: string[] = []
  const used = new Set<string>()
  const mark = (r: number, c: number): void => void used.add(`${r},${c}`)
  const isUsed = (r: number, c: number): boolean => used.has(`${r},${c}`)
  const at = (r: number, c: number): string => g.t[r]?.[c] ?? ''
  const free = (r: number, c: number): string => (isUsed(r, c) ? '' : at(r, c))

  // 1. event name, date, courts
  let eventName: string | undefined
  let date: string | undefined
  const courts: { row: number; col: number; letter: string }[] = []
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const s = at(r, c)
      if (!s) continue
      const court = COURT_RE.exec(latinize(s))
      if (court?.[1] && s.length <= 30) {
        courts.push({ row: r, col: c, letter: court[1].toUpperCase() })
        mark(r, c)
      } else if (!eventName && (/tournament|турнир/i.test(s) || (/\bcup\b/i.test(s) && s.length > 20))) {
        eventName = s
        mark(r, c)
      } else if (!date && s.length <= 40 && parseDate(s)) {
        date = parseDate(s)
        mark(r, c)
      }
    }
  }

  // 2. pool headers and their match rows
  const pools: PoolRaw[] = []
  const isHeaderCell = (r: number, c: number): boolean => poolHeader(at(r, c)) !== null
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const name = poolHeader(at(r, c))
      if (!name) continue
      mark(r, c)
      const pool: PoolRaw = { name, row: r, col: c, pairs: [], warnings: [], title: null, syn: false }
      let started = false
      let blanks = 0
      for (let i = r + 1; i < g.rows; i++) {
        const a = at(i, c)
        const b = at(i, c + 1)
        if (isHeaderCell(i, c) || isHeaderCell(i, c + 1) || bracketRef(a) || bracketRef(b)) break
        if (!a && !b) {
          if (started || ++blanks > 3) break
          continue
        }
        started = true
        mark(i, c)
        mark(i, c + 1)
        if (a && b) pool.pairs.push([a, b])
        else pool.warnings.push(`${name}: row ${i + 1} has only one name ("${a || b}"), ignored`)
      }
      pools.push(pool)
    }
  }

  // 3. NAMES lists (participants listed above the pools)
  const nameLists: { row: number; col: number; names: string[] }[] = []
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      if (isUsed(r, c) || !NAMES_RE.test(at(r, c))) continue
      mark(r, c)
      const names: string[] = []
      for (let i = r + 1; i < g.rows && free(i, c); i++) {
        names.push(at(i, c))
        mark(i, c)
      }
      nameLists.push({ row: r, col: c, names })
    }
  }

  // 4. titles (same text in the same row = one title spanning those columns)
  const titles: Title[] = []
  for (let r = 0; r < g.rows; r++) {
    const byText = new Map<string, Title>()
    for (let c = 0; c < g.cols; c++) {
      const s = free(r, c)
      if (!s || !isTitleLike(s)) continue
      mark(r, c)
      const last = g.end[r]?.[c] ?? c
      const t = byText.get(s)
      if (t) t.c1 = Math.max(t.c1, last)
      else byText.set(s, { row: r, c0: c, c1: last, text: s, team: TEAM_TITLE_RE.test(s) })
    }
    titles.push(...byText.values())
  }
  for (const p of pools) p.title = findTitle(titles, p.row, p.col)

  // 5. match pairs without any pool header (single pool "Pool A")
  const titlesWithPools = new Set(pools.map((p) => p.title))
  const sortedRows = [...new Set(titles.map((t) => t.row))].sort((a, b) => a - b)
  for (const t of titles) {
    if (t.team || titlesWithPools.has(t)) continue
    const nextRow = sortedRows.find((x) => x > t.row) ?? g.rows
    const runs = new Map<number, PoolRaw>()
    for (let r = t.row + 1; r < nextRow; r++) {
      for (let c = 0; c < g.cols - 1; c++) {
        const a = free(r, c)
        const b = free(r, c + 1)
        if (!a || !b || bracketRef(a) || bracketRef(b) || findTitle(titles, r, c) !== t) continue
        let run = runs.get(c)
        if (!run || r - (run.row + run.pairs.length) > 0) {
          run = { name: '', row: r, col: c, pairs: [], warnings: [], title: t, syn: false }
          runs.set(c, run)
          pools.push(run)
        }
        run.pairs.push([a, b])
        mark(r, c)
        mark(r, c + 1)
        c++
      }
    }
    const implicit = pools.filter((p) => p.title === t && !p.name)
    implicit.forEach((p, i) => (p.name = `Pool ${String.fromCharCode(65 + i)}`))
  }

  // 6. bracket refs
  const refs: Ref[] = []
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const ref = bracketRef(free(r, c))
      if (ref) {
        refs.push({ row: r, col: c, ref })
        mark(r, c)
      }
    }
  }

  // 7. team composition blocks: a name cell with >= 2 cells directly below it
  const blocks: Block[] = []
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const s = free(r, c)
      if (!s || (r > 0 && at(r - 1, c))) continue
      const members: string[] = []
      for (let i = r + 1; i < g.rows && free(i, c); i++) members.push(at(i, c))
      if (members.length < 2) continue
      mark(r, c)
      members.forEach((_m, k) => mark(r + 1 + k, c))
      blocks.push({ row: r, col: c, team: s, members })
    }
  }

  // 8. which pools are team pools; accumulate per category
  const blockKeys = new Set(blocks.map((b) => entrantKey(b.team)))
  const accs = new Map<Title | 'syn', Acc>()
  const accFor = (t: Title | null, syn = false): Acc => {
    const k = syn || !t ? 'syn' : t
    let a = accs.get(k)
    if (!a) {
      a = { title: syn ? null : t, syn, pools: [], names: [], blocks: [], refs: [] }
      accs.set(k, a)
    }
    return a
  }
  for (const p of pools) {
    const keys = new Set(p.pairs.flat().map(entrantKey))
    const hits = [...keys].filter((k) => blockKeys.has(k)).length
    const teamPool = keys.size > 0 && hits * 2 >= keys.size
    p.syn = teamPool && !p.title?.team
    if (!p.title && !p.syn) {
      warnings.push(`${sheet.sheet}: ${p.name} at row ${p.row + 1} has no category title, ignored`)
      continue
    }
    accFor(p.title, p.syn).pools.push(p)
  }
  for (const b of blocks) {
    const t = findTitle(titles, b.row, b.col)
    if (t?.team) accFor(t).blocks.push(b)
    else if (accs.has('syn')) accFor(null, true).blocks.push(b)
    else warnings.push(`${sheet.sheet}: team composition "${clean(b.team)}" ignored (no team title or team pool)`)
  }
  for (const l of nameLists) {
    const t = findTitle(titles, l.row, l.col)
    if (t) accFor(t).names.push(...l.names)
  }
  for (const ct of courts) {
    const t = findTitle(titles, ct.row, ct.col)
    const a = t ? accs.get(t) : undefined
    if (a && !a.court) a.court = ct.letter
  }
  for (const ref of refs) {
    let best: Acc | undefined
    let bestRow = -1
    for (const a of accs.values()) {
      const row = Math.max(-1, ...a.pools.map((p) => p.row).filter((x) => x < ref.row))
      if (a.pools.length && row > bestRow) {
        best = a
        bestRow = row
      }
    }
    if (!best) {
      const t = findTitle(titles, ref.row, ref.col)
      best = t ? accs.get(t) : undefined
    }
    if (best) best.refs.push(ref)
    else warnings.push(`${sheet.sheet}: bracket ref ${ref.ref} does not belong to any category`)
  }

  // 9. build categories
  const anchor = (a: Acc): number => {
    const rows = [a.title?.row, ...a.pools.map((p) => p.row), ...a.blocks.map((b) => b.row)].filter(
      (x): x is number => x !== undefined
    )
    return Math.min(...rows)
  }
  const ordered = [...accs.values()].sort((a, b) => anchor(a) - anchor(b) || (a.title?.c0 ?? 0) - (b.title?.c0 ?? 0))
  const categories: DrawCategory[] = []
  for (const a of ordered) {
    if (!a.pools.length && !a.names.length && !a.blocks.length) {
      warnings.push(`${sheet.sheet}: title "${a.title?.text ?? ''}" has no participants, ignored`)
      continue
    }
    categories.push(buildCategory(a, sheet))
  }
  return { ...(eventName ? { eventName } : {}), ...(date ? { date } : {}), categories, warnings }
}

function buildCategory(a: Acc, sheet: SheetCells): DrawCategory {
  const warnings: string[] = []
  const warn = (m: string): void => void (warnings.includes(m) || warnings.push(m))
  const mode: 'individual' | 'team' = a.syn || a.title?.team ? 'team' : 'individual'
  const reg = makeRegistry(warn)

  if (mode === 'team') {
    const blocks = [...a.blocks].sort((x, y) => x.row - y.row || x.col - y.col)
    for (const b of blocks) {
      const key = reg.add(b.team)
      reg.setMembers(
        key,
        b.members.map((m) => parsePerson(m, warn))
      )
    }
  } else {
    for (const n of a.names) reg.add(n)
  }

  const pools: DrawPool[] = []
  for (const p of a.pools) {
    const pool: DrawPool = { name: p.name, entrantKeys: [], matches: [] }
    for (const w of p.warnings) warn(w)
    for (const [x, y] of p.pairs) {
      const kx = reg.add(x)
      const ky = reg.add(y)
      if (kx === ky) continue // merged duplicate cells are never a match
      pool.matches.push([kx, ky])
      for (const k of [kx, ky]) if (!pool.entrantKeys.includes(k)) pool.entrantKeys.push(k)
    }
    pools.push(pool)
  }
  // Pools drawn side by side are read row by row (A, G, B, H…): put them in name order (A, B, C…).
  pools.sort((x, y) => x.name.localeCompare(y.name, 'en', { numeric: true }))

  const nameOf = (k: string): string => reg.recs.get(k)?.name ?? k

  // checks: incomplete round robin, entrant in two pools
  for (const pool of pools) {
    const counts = new Map<string, number>(pool.entrantKeys.map((k) => [k, 0]))
    for (const [x, y] of pool.matches) {
      counts.set(x, (counts.get(x) ?? 0) + 1)
      counts.set(y, (counts.get(y) ?? 0) + 1)
    }
    const max = Math.max(0, ...counts.values())
    const few = [...counts].filter(([, n]) => n < max).map(([k]) => nameOf(k))
    if (few.length) warn(`${pool.name}: incomplete round robin (fewer matches: ${few.join(', ')})`)
  }
  const poolsOf = new Map<string, number>()
  for (const pool of pools) for (const k of pool.entrantKeys) poolsOf.set(k, (poolsOf.get(k) ?? 0) + 1)
  for (const [k, n] of poolsOf) if (n > 1) warn(`"${nameOf(k)}" appears in ${n} pools`)

  // bracket: drawn as columns (left half, right half), each read top to bottom in pairs:
  //   A1   B1        left: A1–B2   right: B1–A2
  //   B2   A2
  // A sheet that lists one pairing per row instead (odd columns) falls back to rows.
  const bracket: [string, string][] = []
  const byCol = new Map<number, Ref[]>()
  for (const r of a.refs) byCol.set(r.col, [...(byCol.get(r.col) ?? []), r])
  const columns = [...byCol.keys()].sort((x, y) => x - y).map((c) => byCol.get(c)!.sort((x, y) => x.row - y.row))
  const byColumns = columns.length > 0 && columns.every((col) => col.length % 2 === 0) && a.refs.length > 2
  if (byColumns) for (const col of columns) for (let i = 0; i + 1 < col.length; i += 2) bracket.push([col[i]!.ref, col[i + 1]!.ref])
  const byRow = new Map<number, Ref[]>()
  for (const r of a.refs) byRow.set(r.row, [...(byRow.get(r.row) ?? []), r])
  const singles: string[] = []
  for (const row of byColumns ? [] : [...byRow.keys()].sort((x, y) => x - y)) {
    const list = (byRow.get(row) ?? []).sort((x, y) => x.col - y.col)
    let i = 0
    for (; i + 1 < list.length; i += 2) bracket.push([list[i]!.ref, list[i + 1]!.ref])
    if (i < list.length) singles.push(list[i]!.ref)
  }
  for (let i = 0; i + 1 < singles.length; i += 2) bracket.push([singles[i]!, singles[i + 1]!])
  if (singles.length % 2 === 1) warn(`Odd number of bracket refs (${a.refs.length}); ${singles[singles.length - 1]} is unpaired`)
  const poolByLetter = new Map(pools.map((p) => [p.name.replace(/^Pool /, ''), p]))
  for (const ref of new Set(bracket.flat())) {
    const pool = poolByLetter.get(ref.slice(0, 1))
    if (!pool) warn(`Bracket ref ${ref}: pool ${ref.slice(0, 1)} does not exist`)
    else if (Number(ref.slice(1)) > pool.entrantKeys.length || Number(ref.slice(1)) < 1)
      warn(`Bracket ref ${ref}: ${pool.name} has only ${pool.entrantKeys.length} entrants`)
  }

  // entrants (+ team members)
  const entrants: DrawEntrant[] = [...reg.recs.values()].map((r) => {
    const e: DrawEntrant = { key: r.key, name: r.name }
    if (r.country) e.country = r.country
    if (mode === 'team') {
      e.members = r.members ?? []
      if (!e.members.length) warn(`Team "${r.name}" has no members`)
    }
    return e
  })

  let teamSize: number | undefined
  if (mode === 'team') {
    const freq = new Map<number, number>()
    for (const e of entrants) if (e.members?.length) freq.set(e.members.length, (freq.get(e.members.length) ?? 0) + 1)
    let best = 0
    let bestN = 0
    for (const [size, n] of freq) if (n > bestN || (n === bestN && size > best)) [best, bestN] = [size, n]
    if (best) teamSize = Math.min(5, Math.max(3, best))
  }

  if (a.syn) warn('No category title found for these teams')
  // "Men individual - Pools" -> "Men individual" (the pools file of a category).
  const name = a.title ? clean(a.title.text).replace(/\s*[-–—:]\s*(pools?|groups?)\s*$/i, '') || clean(a.title.text) : 'Teams'
  return {
    name,
    mode,
    ...(a.court ? { court: a.court } : {}),
    entrants,
    pools,
    bracket,
    ...(teamSize ? { teamSize } : {}),
    source: { file: sheet.file, sheet: sheet.sheet },
    warnings
  }
}

/** Parse all sheets; categories keep input order, event name / date come from the first sheet that has them. */
export function parseDrawSheets(sheets: SheetCells[]): DrawImport {
  const out: DrawImport = { categories: [], warnings: [] }
  for (const sheet of sheets) {
    const r = parseSheet(sheet)
    if (!out.eventName && r.eventName) out.eventName = r.eventName
    if (!out.date && r.date) out.date = r.date
    out.categories.push(...r.categories)
    out.warnings.push(...r.warnings.map((w) => `${sheet.file}: ${w}`))
  }
  return out
}
