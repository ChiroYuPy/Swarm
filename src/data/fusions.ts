/**
 * Evolutions: a base weapon at max level evolves into `result` (an "Evolution" card at the next level-up,
 * or the boss chest). The weapon is replaced by its evolution, in the same slot. Passives play no part.
 * The order of this list is also the priority when several evolutions are possible.
 * (In the code, an evolution is still called a "fusion".)
 */

export interface FusionDef {
  result: string;
  weapon: string;
}

export const FUSIONS: FusionDef[] = [
  { result: 'spiral', weapon: 'blaster' },
  { result: 'mine_boomerang', weapon: 'boomerang' },
  { result: 'meteors', weapon: 'mortar' },
  { result: 'black_holes', weapon: 'saws' },
  { result: 'vampire_field', weapon: 'force_field' },
  { result: 'earthquake', weapon: 'shockwave' },
  { result: 'fire_tornado', weapon: 'flamethrower' },
  { result: 'electric_storm', weapon: 'electric_arc' },
  { result: 'hornets', weapon: 'swarm' },
  { result: 'scythe', weapon: 'blade' },
];
