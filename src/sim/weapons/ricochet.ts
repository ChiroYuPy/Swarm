/**
 * Ricochet: homing discs (PJ_RICOCHET) bouncing from enemy to enemy (a = bounces left, c = last hit id;
 * see projectiles.ts).
 */
import type { WeaponLevel } from '../../data/weapons';
import { dcos, dsin } from '../dmath';
import { spawnProjectile } from '../entities';
import { EV_SHOOT, PJ_RICOCHET, emit, type GameState, type Player, type WeaponInst } from '../state';
import { AIM, RETRY_TICKS, aim, cdTicks, ticks } from './common';

/** Ricochet: homing discs bouncing from enemy to enemy (see projectiles.ts). */
export function ricochet(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  if (!aim(s, p, L.range ?? 520)) {
    w.timer = RETRY_TICKS;
    return;
  }
  const n = L.count ?? 1;
  const a0 = AIM;
  for (let k = 0; k < n; k++) spawnDisc(s, p, slot, w.def, p.x, p.y, a0 + (k - (n - 1) / 2) * 0.35, L);
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

export function spawnDisc(s: GameState, p: Player, slot: number, def: number, x: number, y: number, a: number, L: WeaponLevel): void {
  const b = spawnProjectile(s);
  if (!b) return;
  const speed = L.shotSpeed ?? L.speed ?? 440;
  b.kind = PJ_RICOCHET;
  b.owner = p.index;
  b.slot = slot;
  b.weapon = def;
  b.x = b.px = x;
  b.y = b.py = y;
  b.vx = dcos(a) * speed;
  b.vy = dsin(a) * speed;
  b.a = L.bounces ?? 4;
  b.c = -1;
  b.r = (L.size ?? 10) * p.stats.area;
  b.damage = L.damage * p.stats.might;
  b.knock = 50;
  b.pierce = -1;
  b.life = ticks(L.life, 3);
}
