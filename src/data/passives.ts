/** Bonus passifs. Chaque niveau ajoute `perLevel` aux stats du héros (max 5 niveaux). */

export interface PassiveDef {
  /** Name, description and per-level effect live in src/i18n/locales, keyed by this id. */
  id: string;
  color: string;
  perLevel: {
    /** réduction de recharge (0.06 = -6 %) */
    cooldown?: number;
    /** bonus de vitesse (0.06 = +6 %) */
    speed?: number;
    /** bonus de rayon de collecte (0.25 = +25 %) */
    magnet?: number;
    /** bonus de dégâts */
    might?: number;
    /** bonus de zone (rayons, tailles) */
    area?: number;
    /** PV max en plus */
    maxHp?: number;
    /** PV / seconde en plus */
    regen?: number;
    /** réduction des dégâts subis (0.05 = -5 %) */
    armor?: number;
    /** bonus de chance d'obtenir des objets (0.2 = +20 %) */
    luck?: number;
  };
  weight?: number;
}

export const PASSIVES: PassiveDef[] = [
  {
    id: 'might',
    color: '#ff9a3d',
    perLevel: { might: 0.08 },
  },
  {
    id: 'overclock',
    color: '#c08457',
    perLevel: { cooldown: 0.06 },
  },
  {
    id: 'amplifier',
    color: '#d0d0ff',
    perLevel: { area: 0.08 },
  },
  {
    id: 'thrusters',
    color: '#4dd2ff',
    perLevel: { speed: 0.06 },
  },
  {
    id: 'magnet',
    color: '#ff5a5a',
    perLevel: { magnet: 0.25 },
  },
  {
    id: 'vitality',
    color: '#8dff8d',
    perLevel: { maxHp: 15, regen: 0.15 },
  },
  {
    id: 'armor',
    color: '#a0b4ff',
    perLevel: { armor: 0.05 },
  },
  {
    id: 'luck',
    color: '#ffd23a',
    perLevel: { luck: 0.2 },
  },
];
