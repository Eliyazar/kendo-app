import { describe, expect, it } from 'vitest'
import type { AdminAction } from './ipc'
import { podium, toPublished } from './published'
import { initialState, reduceApp } from './reducer'
import { diplomaHtml, diplomas, pinSlipsHtml, reportHtml, resultsCsv } from './report'
import type { AppState, Side } from './types'

let clock = 9_000_000
const act = (s: AppState, a: AdminAction): AppState => reduceApp(s, a, (clock += 1000)).state
const activeId = (s: AppState) => s.tournament!.courts[0]!.activeMatchId

function playAll(s: AppState, side: Side): AppState {
  while (activeId(s)) {
    s = act(s, { type: 'ADD_IPPON', side, technique: 'M' })
    if (s.tournament!.matches[activeId(s)!]!.status !== 'awaiting-confirmation') s = act(s, { type: 'ADD_IPPON', side, technique: 'K' })
    s = act(s, { type: 'APPROVE_MATCH' })
  }
  return s
}

function finishedTournament(mode: 'individual' | 'team'): AppState {
  const entrants =
    mode === 'team'
      ? Array.from({ length: 8 }, (_, t) => Array.from({ length: 3 }, (_, p) => ({ name: `Тест ${t}-${p}`, dojo: `Dojo ${t}`, team: `Team ${t}`, country: 'BUL' }))).flat()
      : Array.from({ length: 8 }, (_, i) => ({ name: `Player ${i}`, dojo: `Dojo ${i}`, country: i % 2 ? 'SRB' : 'Bulgaria' }))
  let s = act(initialState(), {
    type: 'CREATE_TOURNAMENT',
    setup: { name: 'Sofia Open', date: '2026-11-14', mode, teamSize: 3, poolSize: 2, advancePerPool: 1, poolMatchMinutes: 3, bracketMatchMinutes: 3, courts: 1, entrants, drawSeed: 2 }
  })
  s = playAll(s, 'aka')
  s = act(s, { type: 'LOCK_POOLS' })
  return playAll(s, 'shiro')
}

describe('final standings and documents', () => {
  it('podium has 1st, 2nd and both semi-final losers as 3rd', () => {
    const t = finishedTournament('individual').tournament!
    expect(t.phase).toBe('finished')
    expect(podium(t).map((p) => p.place)).toEqual([1, 2, 3, 3])
  })

  it('one diploma per medallist with IOC country', () => {
    const t = finishedTournament('individual').tournament!
    const ds = diplomas(t)
    expect(ds).toHaveLength(4)
    expect(ds.every((d) => ['BUL', 'SRB'].includes(d.country))).toBe(true)
    const html = diplomaHtml(ds[0]!)
    expect(html).toContain('1st place')
    expect(html).toContain('Sofia Open')
    expect(html).toContain('14 November 2026')
  })

  it('team diplomas go to every member, escaped safely', () => {
    const t = finishedTournament('team').tournament!
    const ds = diplomas(t)
    expect(ds).toHaveLength(4 * 3)
    expect(ds[0]!.team).toMatch(/^Team /)
    expect(diplomaHtml({ ...ds[0]!, name: '<script>x</script>' })).not.toContain('<script>x')
  })

  it('report, PIN slips and CSV contain the results', () => {
    const t = finishedTournament('team').tournament!
    expect(reportHtml(t)).toContain('Final standings')
    expect(pinSlipsHtml(t, 'https://example.org/t/abc')).toContain(Object.values(t.teams)[0]!.pin)
    const csv = resultsCsv(t)
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.split('\r\n').length).toBeGreaterThan(t.matchQueue.length)
  })

  it('published snapshot hides open team orders but shows started ones', () => {
    let s = act(initialState(), {
      type: 'CREATE_TOURNAMENT',
      setup: {
        name: 'X', date: '2026-11-14', mode: 'team', teamSize: 3, poolSize: 2, advancePerPool: 1, poolMatchMinutes: 3, bracketMatchMinutes: 3, courts: 1, drawSeed: 1,
        entrants: Array.from({ length: 2 }, (_, t) => Array.from({ length: 3 }, (_, p) => ({ name: `P${t}${p}`, dojo: 'D', team: `T${t}` }))).flat()
      }
    })
    const hidden = toPublished(s, 0)!
    expect(hidden.matches.every((m) => m.aka.playerId === null && m.shiro.playerId === null)).toBe(true)
    expect(JSON.stringify(hidden)).not.toContain(Object.values(s.tournament!.teams)[0]!.pin)
    s = act(s, { type: 'TIMER_START' })
    const shown = toPublished(s, 0)!
    expect(shown.matches[0]!.aka.playerId).not.toBeNull()
  })
})
