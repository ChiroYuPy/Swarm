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
  // the Golem and the Teleporter were replaced by the Hexagon and the Jumper (v5); the Leader was removed
  golem: 'hexagon',
  teleporteur: 'jumper',
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

/** Before save v3. The weapons removed by the v4 redesign (turret, scythe, phoenix, bastion, squadron) are left out: dropped. */
export const LEGACY_WEAPON_IDS: Readonly<Record<string, string>> = {
  confetti: 'blaster',
  petitspois: 'saws',
  aura: 'force_field',
  laser: 'railgun',
  crepes: 'mines',
  boomerang: 'boomerang',
  rallonge: 'electric_arc',
  klaxon: 'shockwave',
  fouet: 'blade',
  flammes: 'flamethrower',
  drone: 'swarm',
  ricochet: 'shuriken',
  mortier: 'mortar',
  // evolutions
  cotillons: 'spiral',
  trounoir: 'black_holes',
  malaise: 'vampire_field',
  multiprise: 'electric_storm',
  creperang: 'mine_boomerang',
  periph: 'earthquake',
  tornade: 'fire_tornado',
  kamikazes: 'hornets',
  meteores: 'meteors',
};

/**
 * Save v3 weapon ids renamed by the v4 weapon redesign. The other v3 ids are unchanged, except the removed
 * weapons (turret, scythe, phoenix, bastion, squadron), which are dropped.
 */
/** Save v3 weapon ids removed by the v4 redesign (`scythe` is now another weapon, the Blade's evolution). */
export const REMOVED_WEAPON_IDS_V4: ReadonlySet<string> = new Set(['turret', 'scythe', 'phoenix', 'bastion', 'squadron']);

export const RENAMED_WEAPON_IDS_V4: Readonly<Record<string, string>> = {
  orbs: 'saws',
  laser: 'railgun',
  whip: 'blade',
  drone: 'swarm',
  ricochet: 'shuriken',
  kamikaze_drones: 'hornets',
};

/** Save v4 enemy ids replaced by the v5 enemy redesign; the other removed ones (leader, golem_medium, golem_small) are dropped. */
export const REPLACED_ENEMY_IDS_V5: Readonly<Record<string, string>> = {
  golem: 'hexagon',
  teleporter: 'jumper',
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
