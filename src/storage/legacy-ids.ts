/**
 * Content ids used before save v3 (French/legacy names) and their current English ids.
 * Only the save migration reads this table: game code must always use the current ids.
 */

export const LEGACY_ENEMY_IDS: Readonly<Record<string, string>> = {
  triangle: 'hunter',
  losange: 'rusher',
  carre: 'block',
  pentagone: 'shooter',
  orbiteur: 'orbiter',
  golem: 'golem',
  golem2: 'golem_medium',
  golem3: 'golem_small',
  meneur: 'leader',
  teleporteur: 'teleporter',
  cercle: 'bomber',
  points: 'swarm',
  distributeur: 'bonus_crate',
  mur: 'wall',
  oeuf: 'egg',
  // bosses
  boss: 'trapezoid',
  hexagone: 'builder_hexagon',
  etoile: 'ricochet_star',
  oeil: 'laser_eye',
  reine: 'swarm_queen',
};

export const LEGACY_WEAPON_IDS: Readonly<Record<string, string>> = {
  confetti: 'blaster',
  petitspois: 'orbs',
  aura: 'force_field',
  laser: 'laser',
  crepes: 'mines',
  boomerang: 'boomerang',
  rallonge: 'electric_arc',
  klaxon: 'shockwave',
  fouet: 'whip',
  flammes: 'flamethrower',
  tourelle: 'turret',
  drone: 'drone',
  ricochet: 'ricochet',
  mortier: 'mortar',
  // evolutions
  cotillons: 'spiral',
  trounoir: 'black_holes',
  malaise: 'vampire_field',
  multiprise: 'electric_storm',
  creperang: 'mine_boomerang',
  periph: 'earthquake',
  faux: 'scythe',
  tornade: 'fire_tornado',
  phenix: 'phoenix',
  bastion: 'bastion',
  escadrille: 'squadron',
  kamikazes: 'kamikaze_drones',
  meteores: 'meteors',
};

export const LEGACY_PASSIVE_IDS: Readonly<Record<string, string>> = {
  biceps: 'might',
  cafe: 'overclock',
  lunettes: 'amplifier',
  chaussettes: 'thrusters',
  aimant: 'magnet',
  soupe: 'vitality',
  blindage: 'armor',
  chance: 'luck',
};

/** Difficulties are saved by index; kept for completeness (e.g. external tools that used the names). */
export const LEGACY_DIFFICULTY_IDS: Readonly<Record<string, string>> = {
  facile: 'easy',
  normal: 'normal',
  difficile: 'hard',
};

/** Current id for a legacy one, or null when it is unknown (the caller drops it). */
export function upgradeId(table: Readonly<Record<string, string>>, id: unknown): string | null {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(table, id)) return null;
  return table[id];
}
