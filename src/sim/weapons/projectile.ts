/**
 * Projectile (bullets fired in a burst: `count` shots in a row, `delay` apart) and spiral (rotating ring of
 * bullets + periodic aimed burst). Both spawn PJ_BULLET (see projectiles.ts).
 */
import type { WeaponLevel } from '../../data/weapons';
import { TICK_RATE } from '../constants';
import { TWO_PI, dcos, dsin } from '../dmath';
import { spawnProjectile } from '../entities';
import { EV_SHOOT, PJ_BULLET, emit, type GameState, type Player, type Projectile, type WeaponInst } from '../state';
import { AIM, RETRY_TICKS, aim, cdTicks, ticks } from './common';

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
  const speed = L.speed ?? 450;
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

/** Blaster: a burst of `count` bullets in a row at the nearest enemy (re-aimed on every shot). */
export function projectile(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  if (w.burstLeft > 0) {
    w.burstTimer -= 1;
    if (w.burstTimer <= 0) {
      // Keeps the last direction when nobody is left in range.
      if (aim(s, p, 640)) w.angle = AIM;
      spawnBullet(s, p, slot, w.def, w.angle, L);
      w.burstLeft--;
      w.burstTimer = ticks(L.delay, 0.075);
    }
  }
  w.timer -= 1;
  if (w.timer > 0) return;
  if (!aim(s, p, 640)) {
    w.timer = RETRY_TICKS;
    return;
  }
  w.angle = AIM;
  spawnBullet(s, p, slot, w.def, w.angle, L);
  w.burstLeft = (L.count ?? 1) - 1;
  w.burstTimer = ticks(L.delay, 0.075);
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
