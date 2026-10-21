import { describe, expect, it } from 'vitest'
import { pinHash as appPinHash } from '../../src/shared/published'
import { checkBearer, pinHash, safeEqual, sha256Hex, verifyPin } from '../src/pin'

describe('pin hashing', () => {
  it('matches the known SHA-256 of "abc"', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('hashes salt:teamId:pin and agrees with the desktop app implementation', async () => {
    const mine = await pinHash('s4lt', 'team_1', '123456')
    expect(mine).toMatch(/^[0-9a-f]{64}$/)
    expect(mine).toBe(await sha256Hex('s4lt:team_1:123456'))
    expect(mine).toBe(await appPinHash('s4lt', 'team_1', '123456'))
  })

  it('verifies only the right PIN of the right team', async () => {
    const secret = { salt: 's', pinHashes: { t1: await pinHash('s', 't1', '123456'), t2: await pinHash('s', 't2', '567890') } }
    expect(await verifyPin(secret, 't1', '123456')).toBe(true)
    expect(await verifyPin(secret, 't1', '567890')).toBe(false)
    expect(await verifyPin(secret, 't2', '567890')).toBe(true)
    expect(await verifyPin(secret, 'nope', '123456')).toBe(false)
    expect(await verifyPin(secret, '__proto__', '123456')).toBe(false)
  })

  it('compares strings of different length safely', async () => {
    expect(await safeEqual('abc', 'abc')).toBe(true)
    expect(await safeEqual('abc', 'abcd')).toBe(false)
    expect(await safeEqual('', 'x')).toBe(false)
  })

  it('checks bearer tokens', async () => {
    expect(await checkBearer('Bearer secret-key', 'secret-key')).toBe(true)
    expect(await checkBearer('bearer secret-key', 'secret-key')).toBe(true)
    expect(await checkBearer('Bearer wrong', 'secret-key')).toBe(false)
    expect(await checkBearer('secret-key', 'secret-key')).toBe(false)
    expect(await checkBearer(null, 'secret-key')).toBe(false)
    expect(await checkBearer('Bearer x', undefined)).toBe(false)
  })
})
