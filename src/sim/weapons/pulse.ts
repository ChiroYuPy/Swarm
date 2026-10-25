/**
 * Pulse: shockwaves (PJ_RING) centred on the player, `count` per burst spaced by `delay`
 * (a = radius, b = duration, c = stun, d = slow, tx = slow time; see projectiles.ts). A wave hurts and pushes
 * while it grows to its radius in `duration`, then keeps growing a little while it fades (visual only).
 */
import type { WeaponLevel } from '../../data/weapons';
import { TICK_RATE } from '../constants';
import { spawnProjectile } from '../entities';
import { EV_RING, PJ_RING, emit, type GameState, type Player, type WeaponInst } from '../state';
import { RETRY_TICKS, cdTicks, target } from './common';

/** after its damage, a wave keeps growing and fading for this share of its duration */
export const RING_FADE = 0.7;

export function pulse(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  if (w.burstLeft > 0) {
    w.burstTimer -= 1;
    if (w.burstTimer <= 0) {
      emitRing(s, p, w, slot, L);
      w.burstLeft--;
      w.burstTimer = Math.round((L.delay ?? 0.15) * TICK_RATE);
    }
  }
  w.timer -= 1;
  if (w.timer > 0) return;
  if (target(s, p.x, p.y, (L.radius ?? 140) * p.stats.area + 40) < 0) {
    w.timer = RETRY_TICKS;
    return;
  }
  emitRing(s, p, w, slot, L);
  w.burstLeft = (L.count ?? 1) - 1;
  w.burstTimer = Math.round((L.delay ?? 0.15) * TICK_RATE);
  w.timer += cdTicks(L, p);
}

function emitRing(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  spawnRing(s, p, slot, w.def, p.x, p.y, L);
}

/** Shockwave of player `p` centred on (x, y). */
export function spawnRing(s: GameState, p: Player, slot: number, def: number, x: number, y: number, L: WeaponLevel): void {
  const b = spawnProjectile(s);
  if (!b) return;
  const dur = Math.max(2, Math.round((L.duration ?? 0.35) * TICK_RATE));
  b.kind = PJ_RING;
  b.owner = p.index;
  b.slot = slot;
  b.weapon = def;
  b.x = b.px = x;
  b.y = b.py = y;
  b.a = (L.radius ?? 140) * p.stats.area;
  b.b = dur;
  b.c = Math.round((L.stun ?? 0) * TICK_RATE);
  b.d = L.slow ?? 0;
  b.tx = Math.round((L.slowTime ?? 0) * TICK_RATE);
  b.r = 0;
  b.damage = L.damage * p.stats.might;
  b.knock = L.knockback ?? 250;
  b.life = dur + Math.round(dur * RING_FADE) + 1;
  b.pierce = -1;
  emit(s, EV_RING, x, y, b.a, def, 0, 0, p.index);
}
