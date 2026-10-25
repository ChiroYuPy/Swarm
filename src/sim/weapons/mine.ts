/**
 * Mine: drops one PJ_MINE trap under the player every cooldown; it stays `life` s (a = arm ticks, b = blast
 * radius, c = trigger radius; see projectiles.ts). Each mine goes off on its own: no chain reaction.
 * A mine is never dropped where its blast zone would overlap one of this weapon's mines: the weapon stays
 * ready and drops it as soon as the player has moved far enough.
 */
import type { WeaponLevel } from '../../data/weapons';
import { TICK_RATE } from '../constants';
import { spawnProjectile } from '../entities';
import { EV_SHOOT, PJ_MINE, emit, type GameState, type Player, type WeaponInst } from '../state';
import { cdTicks } from './common';

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
  m.life = life;
  m.r = 9;
  m.knock = knock;
}

/** Does a blast zone of radius `r` at (x, y) overlap one of the mines of this owner and weapon? */
function overlapsMine(s: GameState, owner: number, def: number, x: number, y: number, r: number): boolean {
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_MINE || b.owner !== owner || b.weapon !== def) continue;
    const dx = b.x - x;
    const dy = b.y - y;
    const d = b.b + r;
    if (dx * dx + dy * dy < d * d) return true;
  }
  return false;
}

export function mine(s: GameState, p: Player, w: WeaponInst, _slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  const radius = (L.radius ?? 48) * p.stats.area;
  if (overlapsMine(s, p.index, w.def, p.x, p.y, radius)) {
    // Checked again next tick.
    w.timer = 1;
    return;
  }
  spawnMine(
    s,
    p.index,
    w.def,
    p.x,
    p.y,
    L.damage * p.stats.might,
    radius,
    L.trigger ?? 20,
    Math.round((L.life ?? 8) * TICK_RATE),
    ARM_TICKS,
    L.knockback ?? 150,
  );
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}
