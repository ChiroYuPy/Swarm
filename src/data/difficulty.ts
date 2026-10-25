/**
 * Difficulty levels. The waves are the same in every difficulty (data/waves.ts plan): only enemy
 * strength, enemy numbers and the item drops change.
 */
export interface DifficultyDef {
  /** Name and description live in src/i18n/locales, keyed by this id. */
  id: string;
  color: string;
  /** enemy multipliers */
  hp: number;
  dmg: number;
  /** enemy movement speed multiplier (bosses excluded) */
  speed: number;
  /** spawn rate multiplier */
  rate: number;
  /** chance multiplier of the items (heals, bonuses, active items) dropped by enemies */
  loot: number;
}

export const DIFFICULTIES: DifficultyDef[] = [
  {
    id: 'easy',
    color: '#39ff7a',
    hp: 0.55,
    dmg: 0.45,
    speed: 0.85,
    rate: 0.8,
    loot: 1.25,
  },
  {
    id: 'normal',
    color: '#38f6ff',
    hp: 0.92,
    dmg: 0.82,
    speed: 0.92,
    rate: 0.95,
    loot: 1,
  },
  {
    id: 'hard',
    color: '#ff3d6e',
    hp: 1.42,
    dmg: 1.42,
    speed: 1,
    rate: 1.35,
    loot: 0.6,
  },
];

export const DEFAULT_DIFFICULTY = 1;
