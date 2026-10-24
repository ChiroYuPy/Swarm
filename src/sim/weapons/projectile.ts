/**
 * Projectile (straight bullets, fanned by `spread`) and spiral (rotating ring of bullets + periodic aimed burst).
 * Both spawn PJ_BULLET (see projectiles.ts); spawnBullet is also used by turrets and drones.
 */
import type { WeaponLevel } from '../../data/weapons';
import { TICK_RATE } from '../constants';
import { TWO_PI, dcos, dsin } from '../dmath';
import { spawnProjectile } from '../entities';
import { EV_SHOOT, PJ_BULLET, emit, type GameState, type Player, type Projectile, type WeaponInst } from '../state';
import { AIM, RETRY_TICKS, aim, cdTicks } from './common';

/** Bullet of player `p`, starting from (ox, oy) (by default, from the player). */
export function spawnBullet(
  s: GameState,
  p: Player,
  slot: number,
  def: number,
  a: number,
  L: WeaponLevel,
  ox = p.x,
  oy = p.y,
): Projectile | null {
  const b = spawnProjectile(s);
  if (!b) return null;
  const speed = L.shotSpeed ?? L.speed ?? 450;
  b.kind = PJ_BULLET;
  b.owner = p.index;
  b.slot = slot;
  b.weapon = def;
  b.x = b.px = ox;
  b.y = b.py = oy;
  b.vx = dcos(a) * speed;
  b.vy = dsin(a) * speed;
  b.life = Math.round((L.life ?? 1.2) * TICK_RATE);
  b.damage = L.damage * p.stats.might;
  b.pierce = L.pierce ?? 0;
  b.r = (L.size ?? 5) * p.stats.area;
  b.knock = 40;
  return b;
}

export function projectile(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  if (!aim(s, p, 640)) {
    w.timer = RETRY_TICKS;
    return;
  }
  const a = AIM;
  const n = L.count ?? 1;
  const spread = L.spread ?? 0.2;
  for (let k = 0; k < n; k++) spawnBullet(s, p, slot, w.def, a + (k - (n - 1) / 2) * spread, L);
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

export function spiral(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  if (!aim(s, p, 640)) {
    w.timer = RETRY_TICKS;
    return;
  }
  const n = L.count ?? 3;
  for (let k = 0; k < n; k++) spawnBullet(s, p, slot, w.def, w.angle + (k * TWO_PI) / n, L);
  w.angle += L.rotStep ?? 0.4;
  if (w.angle > TWO_PI) w.angle -= TWO_PI;
  w.shots++;
  const every = L.burstEvery ?? 8;
  if (w.shots % every === 0) {
    const a = AIM;
    const bc = L.burstCount ?? 5;
    const spread = L.spread ?? 0.15;
    for (let k = 0; k < bc; k++) spawnBullet(s, p, slot, w.def, a + (k - (bc - 1) / 2) * spread, L);
  }
  w.timer += cdTicks(L, p);
  if (w.shots % 3 === 0) emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}
