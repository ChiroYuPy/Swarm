/**
 * Difficulty levels. They affect enemy strength AND the arrival pace of
 * new types (pace: multiplier of the wave phases' appearance times).
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
  /** multiplier of the arrival times of new enemy types (> 1 = slower) */
  pace: number;
}

export const DIFFICULTIES: DifficultyDef[] = [
  {
    id: 'easy',
    color: '#39ff7a',
    hp: 0.55,
    dmg: 0.45,
    speed: 0.85,
    rate: 0.8,
    pace: 1.6,
  },
  {
    id: 'normal',
    color: '#38f6ff',
    hp: 0.92,
    dmg: 0.82,
    speed: 0.92,
    rate: 0.95,
    pace: 1.15,
  },
  {
    id: 'hard',
    color: '#ff3d6e',
    hp: 1.42,
    dmg: 1.42,
    speed: 1,
    rate: 1.3,
    pace: 0.7,
  },
];

export const DEFAULT_DIFFICULTY = 1;
