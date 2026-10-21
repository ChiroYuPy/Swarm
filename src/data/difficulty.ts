/**
 * Niveaux de difficulté. Ils jouent sur la puissance des ennemis ET sur le rythme d'arrivée des
 * nouveaux types (pace : multiplicateur des dates d'apparition des phases de vagues).
 */
export interface DifficultyDef {
  id: string;
  name: string;
  desc: string;
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
    id: 'facile',
    name: 'Facile',
    desc: 'Ennemis moins nombreux et moins coriaces. Les nouveaux types arrivent tranquillement.',
    color: '#39ff7a',
    hp: 0.7,
    dmg: 0.6,
    speed: 1,
    rate: 0.75,
    pace: 1.5,
  },
  {
    id: 'normal',
    name: 'Normal',
    desc: 'L’expérience prévue : la pression monte régulièrement.',
    color: '#38f6ff',
    hp: 1,
    dmg: 1,
    speed: 1,
    rate: 1,
    pace: 1,
  },
  {
    id: 'difficile',
    name: 'Difficile',
    desc: 'Plus nombreux, plus solides, plus tôt. Pour les habitués.',
    color: '#ff3d6e',
    hp: 1.3,
    dmg: 1.3,
    speed: 1,
    rate: 1.3,
    pace: 0.7,
  },
];

export const DEFAULT_DIFFICULTY = 1;
