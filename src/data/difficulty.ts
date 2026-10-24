/**
 * Niveaux de difficulté. Ils jouent sur la puissance des ennemis ET sur le rythme d'arrivée des
 * nouveaux types (pace : multiplicateur des dates d'apparition des phases de vagues).
 */
export interface DifficultyDef {
  /** Name and description live in src/i18n/locales, keyed by this id. */
  id: string;
  color: string;
  /** multiplicateurs ennemis */
  hp: number;
  dmg: number;
  /** multiplicateur de vitesse de déplacement des ennemis (hors boss) */
  speed: number;
  /** multiplicateur du débit d'apparition */
  rate: number;
  /** multiplicateur des dates d'arrivée des nouveaux types d'ennemis (> 1 = plus lent) */
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
