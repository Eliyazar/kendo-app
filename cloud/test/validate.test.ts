import { describe, expect, it } from 'vitest'
import { etagMatches } from '../src/http'
import { isSlug, validateAckBody, validateLineupBody, validatePublishPayload, validateTeamLogin } from '../src/validate'
import { teamPayload } from './fixtures'

describe('slug', () => {
  it('accepts 6-32 lowercase alphanumerics only', () => {
    for (const ok of ['abcdef', 'a1b2c3d4e5', 'x'.repeat(32)]) expect(isSlug(ok)).toBe(true)
    for (const bad of ['abcde', 'x'.repeat(33), 'ABCDEF', 'abc-def', 'abc def', '../abcdef', 'abcdef\n', '', 12345678, null]) expect(isSlug(bad)).toBe(false)
  })
})

describe('publish payload', () => {
  it('accepts a well-formed payload', () => {
    const r = validatePublishPayload(teamPayload())
    expect(r.ok).toBe(true)
  })

  it('rejects wrong shapes', () => {
    const bad = (mutate: (p: Record<string, any>) => void) => {
      const p = JSON.parse(JSON.stringify(teamPayload()))
      mutate(p)
      return validatePublishPayload(p)
    }
    expect(validatePublishPayload(null).ok).toBe(false)
    expect(validatePublishPayload([]).ok).toBe(false)
    expect(bad((p) => (p.slug = 'BAD')).ok).toBe(false)
    expect(bad((p) => (p.snapshot.version = 2)).ok).toBe(false)
    expect(bad((p) => delete p.snapshot).ok).toBe(false)
    expect(bad((p) => delete p.secret).ok).toBe(false)
    expect(bad((p) => (p.snapshot.teams = {})).ok).toBe(false)
    expect(bad((p) => (p.snapshot.tournament.mode = 'weird')).ok).toBe(false)
    expect(bad((p) => (p.secret.pinHashes.tA = 'short')).ok).toBe(false)
    expect(bad((p) => (p.secret.openLineups.tm1.tA = ['a1', 5])).ok).toBe(false)
    expect(bad((p) => (p.secret.salt = 3)).ok).toBe(false)
  })
})

describe('request bodies', () => {
  it('team login needs a teamId and a 6-digit PIN', () => {
    expect(validateTeamLogin({ teamId: 'tA', pin: '123456' }).ok).toBe(true)
    expect(validateTeamLogin({ teamId: 'tA', pin: '123' }).ok).toBe(false)
    expect(validateTeamLogin({ teamId: 'tA', pin: 123456 }).ok).toBe(false)
    expect(validateTeamLogin({ pin: '123456' }).ok).toBe(false)
    expect(validateTeamLogin('x').ok).toBe(false)
  })

  it('lineup body', () => {
    const base = { teamId: 'tA', pin: '123456', teamMatchId: 'tm1', lineup: ['a1', null, 'a2'] }
    expect(validateLineupBody(base).ok).toBe(true)
    expect(validateLineupBody({ ...base, lineup: 'a1' }).ok).toBe(false)
    expect(validateLineupBody({ ...base, lineup: ['a1', 3] }).ok).toBe(false)
    expect(validateLineupBody({ ...base, teamMatchId: '' }).ok).toBe(false)
  })

  it('ack body', () => {
    expect(validateAckBody({ ids: ['a', 'b'] }).ok).toBe(true)
    expect(validateAckBody({ ids: [1] }).ok).toBe(false)
    expect(validateAckBody({}).ok).toBe(false)
  })
})

describe('etag', () => {
  it('matches single, weak and listed validators', () => {
    expect(etagMatches('"1"', '"1"')).toBe(true)
    expect(etagMatches('W/"1"', '"1"')).toBe(true)
    expect(etagMatches('"0", "1"', '"1"')).toBe(true)
    expect(etagMatches('"0"', '"1"')).toBe(false)
    expect(etagMatches(null, '"1"')).toBe(false)
  })
})
