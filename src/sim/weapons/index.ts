/**
 * Weapon behaviors: every data `behavior` maps to one updater, run once per tick per equipped weapon.
 * To add a weapon: reuse an existing behavior in data/weapons.ts; for a new behavior, add it to the `Behavior`
 * union in data/weapons.ts, write its updater in a new file here (shared helpers in common.ts), then add it
 * to `UPDATER_BY_BEHAVIOR` below.
 */
import { ALL_WEAPONS, type Behavior, type WeaponLevel } from '../../data/weapons';
import { weaponLevel } from '../registry';
import type { GameState, Player, WeaponInst } from '../state';
import { aura } from './aura';
import { beam } from './beam';
import { boomerang } from './boomerang';
import { chain } from './chain';
import { drone } from './drone';
import { flame } from './flame';
import { scythe, whip } from './melee';
import { mine } from './mine';
import { mortar } from './mortar';
import { orbit } from './orbit';
import { phoenix } from './phoenix';
import { projectile, spiral } from './projectile';
import { pulse } from './pulse';
import { ricochet } from './ricochet';
import { turret } from './turret';

export { ticks } from './common';
export { spawnBullet } from './projectile';
export { spawnMine } from './mine';
export { spawnRing } from './pulse';
export { SCYTHE_FX_TICKS, WHIP_FX_TICKS } from './melee';
export { DRONE_LIFE, huntTarget } from './drone';
export { spawnDisc } from './ricochet';
export { spawnBlaze, spawnShell } from './mortar';

type WeaponUpdater = (s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel) => void;

const UPDATER_BY_BEHAVIOR: Record<Behavior, WeaponUpdater> = {
  projectile,
  spiral,
  orbit,
  aura,
  beam,
  mine,
  boomerang,
  chain,
  pulse,
  whip,
  scythe,
  mortar,
  phoenix,
  flame,
  turret,
  drone,
  ricochet,
};
/** Updater per weapon index, resolved once from the data. */
const WEAPON_UPDATERS: WeaponUpdater[] = ALL_WEAPONS.map((d) => UPDATER_BY_BEHAVIOR[d.behavior]);

export function updateWeapons(s: GameState, p: Player): void {
  for (let slot = 0; slot < p.weapons.length; slot++) {
    const w = p.weapons[slot];
    WEAPON_UPDATERS[w.def](s, p, w, slot, weaponLevel(w.def, w.level));
  }
}
