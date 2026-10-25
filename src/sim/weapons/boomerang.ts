/**
 * Boomerang: PJ_BOOMERANG thrown toward the aim. It flies out `range` in `duration` / 2 (fast at the throw,
 * slowing down to a stop), then comes back to where the player is now, picking up speed the same way
 * (a = 0 out / 1 back, b = half flight in ticks, (vx, vy) = unit direction, (tx, ty) = start then turning
 * point, d = range; see projectiles.ts).
 */
import type { WeaponLevel } from '../../data/weapons';
import { dcos, dsin } from '../dmath';
import { spawnProjectile } from '../entities';
import { EV_SHOOT, PJ_BOOMERANG, emit, type GameState, type Player, type WeaponInst } from '../state';
import { AIM, MUZZLE_X, MUZZLE_Y, RETRY_TICKS, aim, cdTicks, muzzle, ticks } from './common';

/** gap between the boomerangs of a throw (radians) */
const FAN = 0.45;

export function boomerang(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  const range = (L.range ?? 230) * p.stats.area;
  if (!aim(s, p, range + 130)) {
    w.timer = RETRY_TICKS;
    return;
  }
  const a0 = AIM;
  const n = L.count ?? 1;
  const half = Math.max(2, Math.round(ticks(L.duration, 1.3) / 2));
  for (let k = 0; k < n; k++) {
    const b = spawnProjectile(s);
    if (!b) break;
    const a = a0 + (k - (n - 1) / 2) * FAN;
    b.kind = PJ_BOOMERANG;
    b.owner = p.index;
    b.slot = slot;
    b.weapon = w.def;
    muzzle(p, a);
    b.x = b.px = b.tx = MUZZLE_X;
    b.y = b.py = b.ty = MUZZLE_Y;
    b.vx = dcos(a);
    b.vy = dsin(a);
    b.a = 0;
    b.b = half;
    b.c = 0;
    b.d = range;
    b.pierce = -1;
    b.r = (L.size ?? 11) * p.stats.area;
    b.damage = L.damage * p.stats.might;
    b.knock = L.knockback ?? 80;
    b.life = half * 2 + 2;
  }
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}
