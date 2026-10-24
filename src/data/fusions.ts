/**
 * Évolutions : `weapon` (arme de base niveau max) + `with` (passif niveau max) => `result`.
 * L'arme est remplacée par son évolution (même emplacement), le passif est conservé.
 * L'ordre de cette liste sert aussi de priorité quand plusieurs évolutions sont possibles.
 * (Dans le code, une évolution s'appelle encore « fusion ».)
 */

export interface FusionDef {
  result: string;
  weapon: string;
  /** passif requis */
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
