/**
 * Railgun: like the Blaster, `count` shots (default 1) `delay` apart at the nearest enemy, but each shot is an
 * instant line of `length` x `width` (it travels at the speed of light) that pierces everything. Optional
 * `burn` on everything the line hits. No projectile: each shot emits EV_SHOOT with the line's ends, and the
 * renderer draws a fading beam fixed where it was fired.
 */
import type { WeaponLevel } from '../../data/weapons';
import { dcos, dsin } from '../dmath';
import { damageEnemy, ignite } from '../combat';
import { clearShotsOnLine } from '../shots';
import { EV_SHOOT, emit, type GameState, type Player, type WeaponInst } from '../state';
import { AIM, MUZZLE_X, MUZZLE_Y, RETRY_TICKS, aim, cdTicks, muzzle, ticks } from './common';

export function rail(s: GameState, p: Player, w: WeaponInst, _slot: number, L: WeaponLevel): void {
  if (w.burstLeft > 0) {
    w.burstTimer -= 1;
    if (w.burstTimer <= 0) {
      // Keeps the last direction when nobody is left in range.
      if (aim(s, p, 640)) w.angle = AIM;
      fireLine(s, p, w, L);
      w.burstLeft--;
      w.burstTimer = ticks(L.delay, 0.12);
    }
  }
  w.timer -= 1;
  if (w.timer > 0) return;
  if (!aim(s, p, 640)) {
    w.timer = RETRY_TICKS;
    return;
  }
  w.angle = AIM;
  fireLine(s, p, w, L);
  w.burstLeft = (L.count ?? 1) - 1;
  w.burstTimer = ticks(L.delay, 0.12);
  w.timer += cdTicks(L, p);
}

function fireLine(s: GameState, p: Player, w: WeaponInst, L: WeaponLevel): void {
  const len = L.length ?? 900;
  const width = (L.width ?? 6) * p.stats.area;
  const ux = dcos(w.angle);
  const uy = dsin(w.angle);
  const dmg = L.damage * p.stats.might;
  const knock = L.knockback ?? 100;
  // The line leaves from just outside the hero's body.
  muzzle(p, w.angle);
  const ox = MUZZLE_X;
  const oy = MUZZLE_Y;
  clearShotsOnLine(s, ox, oy, ux, uy, len, width);
  const g = s.grid;
  const m = g.query(s.enemies, ox + (ux * len) / 2, oy + (uy * len) / 2, len / 2 + width);
  // Copied: a kill can split an enemy (which does not touch the grid) but the burn must see the same list.
  let c = 0;
  for (let q = 0; q < m && c < LINE.length; q++) {
    const idx = g.out[q];
    const e = s.enemies[idx];
    if (!e.alive) continue;
    const rx = e.x - ox;
    const ry = e.y - oy;
    const t = rx * ux + ry * uy;
    if (t < -e.r || t > len + e.r) continue;
    if (Math.abs(rx * uy - ry * ux) > width + e.r) continue;
    LINE[c++] = idx;
  }
  for (let k = 0; k < c; k++) {
    const idx = LINE[k];
    if (L.burn) ignite(s, idx, L.burn * p.stats.might, L.burnTime ?? 2.5, p.index);
    damageEnemy(s, idx, dmg, p.index, ux * knock, uy * knock);
  }
  emit(s, EV_SHOOT, ox, oy, width, w.def, ox + ux * len, oy + uy * len, p.index);
}
const LINE = new Int32Array(512);
