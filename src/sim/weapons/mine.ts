/**
 * Mine: drops `count` PJ_MINE traps around the player when enemies are near (a = arm ticks,
 * b = blast radius, c = trigger radius; see projectiles.ts).
 */
import type { WeaponLevel } from '../../data/weapons';
import { TICK_RATE } from '../constants';
import { TWO_PI, dcos, dsin } from '../dmath';
import { spawnProjectile } from '../entities';
import { EV_SHOOT, PJ_MINE, emit, type GameState, type Player, type WeaponInst } from '../state';
import { RETRY_TICKS, cdTicks, target } from './common';

export function spawnMine(
  s: GameState,
  owner: number,
  def: number,
  x: number,
  y: number,
  damage: number,
  radius: number,
  trigger: number,
  life: number,
  arm: number,
  knock: number,
): void {
  const m = spawnProjectile(s);
  if (!m) return;
  m.kind = PJ_MINE;
  m.owner = owner;
  m.weapon = def;
  m.x = m.px = x;
  m.y = m.py = y;
  m.damage = damage;
  m.b = radius;
  m.c = trigger;
  m.a = arm;
  m.life = life;
  m.r = 9;
  m.knock = knock;
}

export function mine(s: GameState, p: Player, w: WeaponInst, _slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  // Mines are traps: drop them as soon as enemies come close, not into the void.
  if (target(s, p.x, p.y, 400) < 0) {
    w.timer = RETRY_TICKS;
    return;
  }
  const n = L.count ?? 1;
  for (let k = 0; k < n; k++) {
    const a = w.angle + (k * TWO_PI) / n;
    const dist = n === 1 ? 0 : 42;
    spawnMine(
      s,
      p.index,
      w.def,
      p.x + dcos(a) * dist,
      p.y + dsin(a) * dist,
      L.damage * p.stats.might,
      (L.radius ?? 70) * p.stats.area,
      L.trigger ?? 34,
      Math.round((L.life ?? 9) * TICK_RATE),
      24,
      L.knockback ?? 200,
    );
  }
  w.angle += 2.4;
  if (w.angle > TWO_PI) w.angle -= TWO_PI;
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}
