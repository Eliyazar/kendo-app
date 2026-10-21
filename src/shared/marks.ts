import type { ScoreMark } from './match-engine'

/** Letter shown for a scoring mark. Fusen-gachi has no letter (drawn as an empty circle). */
export const markLetter = (m: ScoreMark): string => (m.kind === 'technique' ? m.technique : m.kind === 'hansoku' ? 'H' : '')
