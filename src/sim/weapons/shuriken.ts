/**
 * Shuriken: `count` PJ_SHURIKEN blades thrown in a star, flying straight for `life` s and bouncing off the
 * screen edges (a box around the player), cutting everything they cross (each enemy at most once per `hitCd`
 * per weapon). A new throw comes as the previous one ends. See projectiles.ts.
 */
import type { WeaponLevel } from '../../data/weapons';
import { TICK_RATE } from '../constants';
import { TWO_PI, dcos, dsin } from '../dmath';
import { spawnProjectile } from '../entities';
import { EV_SHOOT, PJ_SHURIKEN, emit, type GameState, type Player, type WeaponInst } from '../state';
import { AIM, MUZZLE_X, MUZZLE_Y, RETRY_TICKS, aim, muzzle, ticks } from './common';

/** half-size of the bounce box around the player (the screen at normal zoom is about 1400 x 860) */
export const SHURIKEN_BOX_X = 640;
export const SHURIKEN_BOX_Y = 380;

export function shuriken(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  if (!aim(s, p, 640)) {
    w.timer = RETRY_TICKS;
    return;
  }
  const n = L.count ?? 1;
  const speed = L.speed ?? 440;
  const life = ticks(L.life, 4);
  for (let k = 0; k < n; k++) {
    const b = spawnProjectile(s);
    if (!b) break;
    const a = AIM + (k * TWO_PI) / n;
    b.kind = PJ_SHURIKEN;
    b.owner = p.index;
    b.slot = slot;
    b.weapon = w.def;
    muzzle(p, a);
    b.x = b.px = MUZZLE_X;
    b.y = b.py = MUZZLE_Y;
    b.vx = dcos(a) * speed;
    b.vy = dsin(a) * speed;
    b.r = (L.size ?? 15) * p.stats.area;
    b.damage = L.damage * p.stats.might;
    b.knock = 30;
    b.pierce = -1;
    b.life = life;
  }
  // Next throw as this one ends (the cooldown passive shortens the gap).
  w.timer = life + Math.max(1, Math.round(0.6 * TICK_RATE * p.stats.cooldownMul));
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}
