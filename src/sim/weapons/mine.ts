/**
 * Mine: drops one PJ_MINE trap under the player every cooldown when enemies are near, at most `count` on the
 * ground (a = arm ticks, b = blast radius, c = trigger radius, d = chain fuse; see projectiles.ts). A blast
 * sets off the other mines inside it: they go off in a chain.
 */
import type { WeaponLevel } from '../../data/weapons';
import { TICK_RATE } from '../constants';
import { spawnProjectile } from '../entities';
import { EV_SHOOT, PJ_MINE, emit, type GameState, type Player, type WeaponInst } from '../state';
import { RETRY_TICKS, cdTicks, target } from './common';

/** a mine is armed (can be triggered by enemies) this long after being dropped (ticks) */
const ARM_TICKS = Math.round(0.35 * TICK_RATE);

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
  m.d = 0;
  m.life = life;
  m.r = 9;
  m.knock = knock;
}

export function mine(s: GameState, p: Player, w: WeaponInst, _slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  // Mines are traps: drop them as soon as enemies come close, not into the void; and not too many at once.
  let laid = 0;
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind === PJ_MINE && b.owner === p.index && b.weapon === w.def && b.life > 0) laid++;
  }
  if (laid >= (L.count ?? 5) || target(s, p.x, p.y, 400) < 0) {
    w.timer = RETRY_TICKS;
    return;
  }
  spawnMine(
    s,
    p.index,
    w.def,
    p.x,
    p.y,
    L.damage * p.stats.might,
    (L.radius ?? 48) * p.stats.area,
    L.trigger ?? 20,
    Math.round((L.life ?? 8) * TICK_RATE),
    ARM_TICKS,
    L.knockback ?? 150,
  );
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}
