/**
 * Turret: drops `count` PJ_TURRET that shoot on their own (lv = weapon level, a = first shot delay,
 * d = ring period from `ringEvery`; see projectiles.ts).
 */
import type { WeaponLevel } from '../../data/weapons';
import { TWO_PI, dcos, dsin } from '../dmath';
import { spawnProjectile } from '../entities';
import { EV_SHOOT, PJ_TURRET, emit, type GameState, type Player, type WeaponInst } from '../state';
import { RETRY_TICKS, cdTicks, target, ticks } from './common';

/** Turret / Bastion: dropped where you stand, it shoots on its own (see projectiles.ts). */
export function turret(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  if (target(s, p.x, p.y, (L.range ?? 320) + 120) < 0) {
    w.timer = RETRY_TICKS;
    return;
  }
  const n = L.count ?? 1;
  for (let k = 0; k < n; k++) {
    const b = spawnProjectile(s);
    if (!b) break;
    const a = w.angle + (k * TWO_PI) / n;
    const dist = n === 1 ? 0 : 44;
    b.kind = PJ_TURRET;
    b.owner = p.index;
    b.slot = slot;
    b.weapon = w.def;
    b.lv = w.level;
    b.x = b.px = p.x + dcos(a) * dist;
    b.y = b.py = p.y + dsin(a) * dist;
    b.vx = dcos(a);
    b.vy = dsin(a);
    b.r = 14;
    b.a = 12 + k * 5;
    b.d = ticks(L.ringEvery, 2);
    b.life = ticks(L.life, 12);
    b.pierce = -1;
  }
  w.angle += 2.4;
  if (w.angle > TWO_PI) w.angle -= TWO_PI;
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}
