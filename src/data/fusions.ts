/**
 * Evolutions: `weapon` (max-level base weapon) + `with` (max-level passive) => `result`.
 * The weapon is replaced by its evolution (same slot), the passive is kept.
 * The order of this list is also the priority when several evolutions are possible.
 * (In the code, an evolution is still called a "fusion".)
 */

export interface FusionDef {
  result: string;
  weapon: string;
  /** required passive */
  with: string;
}

export const FUSIONS: FusionDef[] = [
  { result: 'spiral', weapon: 'blaster', with: 'overclock' },
  { result: 'black_holes', weapon: 'orbs', with: 'magnet' },
  { result: 'vampire_field', weapon: 'force_field', with: 'vitality' },
  { result: 'electric_storm', weapon: 'electric_arc', with: 'overclock' },
  { result: 'mine_boomerang', weapon: 'boomerang', with: 'amplifier' },
  { result: 'earthquake', weapon: 'shockwave', with: 'thrusters' },
  { result: 'scythe', weapon: 'whip', with: 'might' },
  { result: 'fire_tornado', weapon: 'flamethrower', with: 'amplifier' },
  { result: 'phoenix', weapon: 'flamethrower', with: 'vitality' },
  { result: 'bastion', weapon: 'turret', with: 'armor' },
  { result: 'squadron', weapon: 'ricochet', with: 'armor' },
  { result: 'kamikaze_drones', weapon: 'drone', with: 'might' },
  { result: 'meteors', weapon: 'mortar', with: 'luck' },
];
