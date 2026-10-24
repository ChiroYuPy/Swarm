/**
 * Boomerang: PJ_BOOMERANG thrown toward the aim, decelerating then coming back (vx/vy = unit direction,
 * b = deceleration, d = initial speed; see projectiles.ts).
 */
import type { WeaponLevel } from '../../data/weapons';
import { TICK_RATE } from '../constants';
import { dcos, dsin } from '../dmath';
import { spawnProjectile } from '../entities';
import { EV_SHOOT, PJ_BOOMERANG, emit, type GameState, type Player, type WeaponInst } from '../state';
import { AIM, RETRY_TICKS, aim, cdTicks } from './common';

export function boomerang(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  if (!aim(s, p, 520)) {
    w.timer = RETRY_TICKS;
    return;
  }
  const a0 = AIM;
  const n = L.count ?? 1;
  const speed = L.speed ?? 400;
  const range = L.range ?? 260;
  for (let k = 0; k < n; k++) {
    const b = spawnProjectile(s);
    if (!b) break;
    const a = a0 + (k - (n - 1) / 2) * 0.5;
    b.kind = PJ_BOOMERANG;
    b.owner = p.index;
    b.slot = slot;
    b.weapon = w.def;
    b.x = b.px = p.x;
    b.y = b.py = p.y;
    b.vx = dcos(a);
    b.vy = dsin(a);
    b.a = 0;
    b.b = (speed * speed) / (2 * range);
    b.c = 0;
    b.d = speed;
    b.pierce = -1;
    b.r = (L.size ?? 11) * p.stats.area;
    b.damage = L.damage * p.stats.might;
    b.knock = L.knockback ?? 80;
    b.life = 6 * TICK_RATE;
  }
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}
