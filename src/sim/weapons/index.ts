/**
 * Weapon behaviors: every data `behavior` maps to one updater, run once per tick per equipped weapon.
 * To add a weapon: reuse an existing behavior in data/weapons.ts; for a new behavior, add it to the `Behavior`
 * union in data/weapons.ts, write its updater in a new file here (shared helpers in common.ts), then add it
 * to `UPDATER_BY_BEHAVIOR` below.
 */
import { ALL_WEAPONS, type Behavior, type WeaponLevel } from '../../data/weapons';
import { weaponLevel } from '../registry';
import type { GameState, Player, WeaponInst } from '../state';
import { arc } from './arc';
import { aura } from './aura';
import { blade } from './blade';
import { boomerang } from './boomerang';
import { flame } from './flame';
import { mine } from './mine';
import { mortar } from './mortar';
import { orbit } from './orbit';
import { projectile, spiral } from './projectile';
import { pulse } from './pulse';
import { rail } from './rail';
import { shuriken } from './shuriken';
import { swarm } from './swarm';

export { ticks } from './common';
export { spawnMine } from './mine';
export { RING_FADE } from './pulse';
export { RAIL_FX_TICKS } from './rail';
export { lockedTarget } from './arc';
export { BLADE_FADE_TICKS } from './blade';
export { BEE_DEAD, BEE_GO, BEE_HOME, BEE_IDLE, BEE_LIFE, BEE_RING, BEE_STUCK, beeTarget, ringAngle } from './swarm';
export { SHURIKEN_BOX_X, SHURIKEN_BOX_Y } from './shuriken';
export { spawnBlaze, spawnShell } from './mortar';

type WeaponUpdater = (s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel) => void;

const UPDATER_BY_BEHAVIOR: Record<Behavior, WeaponUpdater> = {
  projectile,
  spiral,
  orbit,
  aura,
  rail,
  mine,
  boomerang,
  arc,
  pulse,
  blade,
  flame,
  swarm,
  shuriken,
  mortar,
};
/** Updater per weapon index, resolved once from the data. */
const WEAPON_UPDATERS: WeaponUpdater[] = ALL_WEAPONS.map((d) => UPDATER_BY_BEHAVIOR[d.behavior]);

export function updateWeapons(s: GameState, p: Player): void {
  for (let slot = 0; slot < p.weapons.length; slot++) {
    const w = p.weapons[slot];
    WEAPON_UPDATERS[w.def](s, p, w, slot, weaponLevel(w.def, w.level));
  }
}
