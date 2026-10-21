import { describe, expect, it } from 'vitest'
import type { LineupSubmission } from '../src/contract'
import { buildEncounterInfos, openEncountersFor, overlayPending, validateLineup } from '../src/lineup'
import { teamSecret, teamSnapshot } from './fixtures'

const snap = teamSnapshot()
const secret = teamSecret()

describe('open encounters', () => {
  it('lists only open encounters where the team appears, with its side and current order', () => {
    const a = openEncountersFor(snap, secret.openLineups, 'tA')
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ teamMatchId: 'tm1', side: 'aka', opponentTeamId: 'tB', lineup: ['a1', null, null] })
    expect(openEncountersFor(snap, secret.openLineups, 'tB')[0]).toMatchObject({ side: 'shiro', opponentTeamId: 'tA' })
    expect(openEncountersFor(snap, secret.openLineups, 'tZ')).toEqual([])
  })

  it('ignores encounters that are not open any more', () => {
    const closed = teamSnapshot()
    closed.encounters[0]!.lineupOpen = false
    expect(openEncountersFor(closed, secret.openLineups, 'tA')).toEqual([])
  })

  it('builds the captain view', () => {
    const subs: LineupSubmission[] = [{ id: 's1', teamId: 'tA', teamMatchId: 'tm1', lineup: ['a1', 'a2', 'a3'], at: 1 }]
    const [info] = buildEncounterInfos(snap, secret.openLineups, 'tA', subs, new Set())
    expect(info).toMatchObject({ teamMatchId: 'tm1', courtName: 'Court A', opponentTeamName: 'Beta', side: 'aka', submitted: true, confirmed: false })
    expect(buildEncounterInfos(snap, secret.openLineups, 'tB', subs, new Set(['tm1:tB']))[0]).toMatchObject({ submitted: false, confirmed: true })
  })
})

describe('lineup validation', () => {
  const check = (team: string, tm: string, lineup: (string | null)[]) => validateLineup(snap, secret.openLineups, team, tm, lineup)

  it('accepts members, reserves and empty slots', () => {
    expect(check('tA', 'tm1', ['a4', 'a2', 'a1'])).toEqual({ ok: true, side: 'aka' })
    expect(check('tA', 'tm1', [null, null, null]).ok).toBe(true)
    expect(check('tB', 'tm1', ['b1', null, 'b3'])).toEqual({ ok: true, side: 'shiro' })
  })

  it('rejects the wrong length', () => {
    expect(check('tA', 'tm1', ['a1', 'a2']).ok).toBe(false)
    expect(check('tA', 'tm1', ['a1', 'a2', 'a3', 'a4']).ok).toBe(false)
  })

  it('rejects players of other teams and duplicates', () => {
    expect(check('tA', 'tm1', ['a1', 'b1', 'a2']).ok).toBe(false)
    expect(check('tA', 'tm1', ['a1', 'a1', 'a2']).ok).toBe(false)
    expect(check('tA', 'tm1', ['nobody', null, null]).ok).toBe(false)
  })

  it('rejects encounters that are closed, unknown or not the team\'s', () => {
    expect(check('tA', 'tm0', ['a1', 'a2', 'a3']).ok).toBe(false)
    expect(check('tA', 'tmX', ['a1', 'a2', 'a3']).ok).toBe(false)
    expect(check('tZ', 'tm1', ['a1', 'a2', 'a3']).ok).toBe(false)
  })
})

describe('overlay of pending submissions on a fresh publish', () => {
  it('keeps the captain order, newest wins, ignores stale or invalid ones', () => {
    const subs: LineupSubmission[] = [
      { id: '1', teamId: 'tA', teamMatchId: 'tm1', lineup: ['a2', 'a3', 'a1'], at: 1 },
      { id: '2', teamId: 'tA', teamMatchId: 'tm1', lineup: ['a3', 'a2', 'a1'], at: 2 },
      { id: '3', teamId: 'tB', teamMatchId: 'tm0', lineup: ['b1', 'b2', 'b3'], at: 3 }, // encounter not open
      { id: '4', teamId: 'tB', teamMatchId: 'tm1', lineup: ['b1'], at: 4 } // wrong length
    ]
    const merged = overlayPending(snap, secret, subs)
    expect(merged.tm1!.tA).toEqual(['a3', 'a2', 'a1'])
    expect(merged.tm1!.tB).toEqual([null, null, null])
    expect(merged.tm0).toBeUndefined()
    expect(secret.openLineups.tm1!.tA).toEqual(['a1', null, null]) // input not mutated
  })
})
