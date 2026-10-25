/**
 * Difficulty levels. The waves are the same in every difficulty (data/waves.ts plan): only the number of
 * enemies and the item drops change. Enemy stats are fixed: they never depend on the difficulty or the time.
 */
export interface DifficultyDef {
  /** Name and description live in src/i18n/locales, keyed by this id. */
  id: string;
  color: string;
  /** spawn rate multiplier */
  rate: number;
  /** chance multiplier of the items (heals, bonuses, active items) dropped by enemies */
  loot: number;
}

export const DIFFICULTIES: DifficultyDef[] = [
  {
    id: 'easy',
    color: '#39ff7a',
    rate: 0.8,
    loot: 1.25,
  },
  {
    id: 'normal',
    color: '#38f6ff',
    rate: 0.95,
    loot: 1,
  },
  {
    id: 'hard',
    color: '#ff3d6e',
    rate: 1.35,
    loot: 0.6,
  },
];

export const DEFAULT_DIFFICULTY = 1;
