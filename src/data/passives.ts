/** Passive bonuses. Each level adds `perLevel` to the hero's stats (max 5 levels). */

export interface PassiveDef {
  /** Name, description and per-level effect live in src/i18n/locales, keyed by this id. */
  id: string;
  color: string;
  perLevel: {
    /** cooldown reduction (0.06 = -6%) */
    cooldown?: number;
    /** speed bonus (0.06 = +6%) */
    speed?: number;
    /** pickup radius bonus (0.25 = +25%) */
    magnet?: number;
    /** damage bonus */
    might?: number;
    /** area bonus (radii, sizes) */
    area?: number;
    /** extra max HP */
    maxHp?: number;
    /** extra HP / second */
    regen?: number;
    /** damage taken reduction (0.05 = -5%) */
    armor?: number;
    /** item drop chance bonus (0.2 = +20%) */
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
