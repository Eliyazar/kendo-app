// Demo tournament for development: 9 players from 5 dojos, pools of 3.

import type { TournamentSetup } from './setup'

const PLAYERS: [string, string][] = [
  ['Takeshi Yamada', 'Kenshinkan'],
  ['Anna Novak', 'Mumeishi'],
  ['Lukas Berger', 'Kendo Wien'],
  ['Sofia Rossi', 'Shinbukan'],
  ['Kenji Sato', 'Kenshinkan'],
  ['Marie Dubois', 'Mumeishi'],
  ['Jonas Weber', 'Kendo Wien'],
  ['Elena Petrova', 'Shinbukan'],
  ['Hiro Tanaka', 'Kenshinkan']
]

export function createDemoSetup(now: number): TournamentSetup {
  return {
    name: 'Demo Taikai',
    date: new Date(now).toISOString().slice(0, 10),
    mode: 'individual',
    poolSize: 3,
    advancePerPool: 2,
    poolMatchMinutes: 3,
    bracketMatchMinutes: 3,
    entrants: PLAYERS.map(([name, dojo]) => ({ name, dojo })),
    drawSeed: 7
  }
}
