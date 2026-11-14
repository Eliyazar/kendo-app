import { afterEach, expect, it, vi } from 'vitest'
import type { AdminAction } from '@shared/ipc'
import { lineupOf } from '@shared/encounters'
import { initialState, reduceApp } from '@shared/reducer'
import type { LineupSubmission } from '@shared/published'
import type { AppState } from '@shared/types'
import { Publisher } from './publisher'

afterEach(() => vi.unstubAllGlobals())

it("a captain's typed names become players of the team and their order", async () => {
  let clock = 1_000_000
  let state: AppState = reduceApp(
    initialState(),
    {
      type: 'CREATE_TOURNAMENT',
      setup: {
        name: 'X', date: '2026-11-15', mode: 'team', teamSize: 3, poolSize: 2, advancePerPool: 1, poolMatchMinutes: 3, bracketMatchMinutes: 3, courts: 1, drawSeed: 1,
        entrants: Array.from({ length: 2 }, (_, t) => Array.from({ length: 3 }, (_, p) => ({ name: `P${t}${p}`, dojo: 'D', team: `T${t}` }))).flat()
      }
    },
    clock
  ).state
  const dispatch = (a: AdminAction) => {
    try {
      state = reduceApp(state, a, (clock += 1000)).state
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, error: (err as Error).message }
    }
  }
  const t0 = () => state.competition!.categories[0]!
  // T0 has only one name entered by the table.
  const team = Object.values(t0().teams).find((x) => x.name === 'T0')!
  for (const id of team.members.slice(1)) dispatch({ type: 'REMOVE_TEAM_MEMBER', teamId: team.id, playerId: id })
  const tm = Object.values(t0().teamMatches)[0]!
  const kept = team.members[0]!
  const sub: LineupSubmission = { id: 's1', teamId: team.id, teamMatchId: tm.id, lineup: ['+Ivan  Petrov', kept, '+Georgi Ivanov'], at: 1 }

  vi.stubGlobal('fetch', async (url: string) => new Response(JSON.stringify(url.endsWith('/inbox') ? { submissions: [sub] } : {}), { status: 200 }))
  const notices: string[] = []
  const pub = new Publisher({ getState: () => state, config: () => ({ enabled: true, url: 'https://x', key: 'k' }), dispatch, notice: (t) => notices.push(t), onStatus: () => {} })
  await (pub as unknown as { pullInbox(): Promise<void> }).pullInbox()
  pub.stop()

  const t = t0()
  const side = t.teamMatches[tm.id]!.akaTeamId === team.id ? 'aka' : 'shiro'
  const names = lineupOf(t, t.teamMatches[tm.id]!, side).map((id) => (id ? t.players[id]!.name : null))
  expect(names).toEqual(['Ivan Petrov', t.players[kept]!.name, 'Georgi Ivanov'])
  expect(t.teams[team.id]!.members).toHaveLength(3)
  expect(notices[0]).toMatch(/applied/)
})
