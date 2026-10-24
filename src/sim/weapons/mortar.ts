/**
 * Mortar / meteors: PJ_SHELL lobbed onto the densest groups (vx/vy = start, tx/ty = target, a = flight ticks,
 * b = blast radius, c = meteor flag; see projectiles.ts). Meteors leave a PJ_BLAZE crater (r = radius, a = dps).
 * Picked targets go in the shared HITS buffer.
 */
import type { WeaponLevel } from '../../data/weapons';
import { spawnProjectile } from '../entities';
import { EV_SHOOT, PJ_BLAZE, PJ_SHELL, emit, type GameState, type Player, type WeaponInst } from '../state';
import { RETRY_TICKS, cdTicks, isExcludedHit, pushHit, resetHits, target, ticks } from './common';

/** the Mortar does not target enemies closer to you than this */
const MORTAR_MIN = 200;

/** Mortar candidates (copied: the neighbour search reuses the grid). */
const CAND = new Int32Array(24);

/** The Mortar targets the densest group in range (excluding enemies right next to you), or the nearest one. */
function mortarTarget(s: GameState, p: Player, range: number, minDist: number): number {
  const g = s.grid;
  const m = g.query(s.enemies, p.x, p.y, range);
  let c = 0;
  for (let q = 0; q < m && c < CAND.length; q++) {
    const e = s.enemies[g.out[q]];
    if (!e.alive || e.speed === 0 || isExcludedHit(e.id)) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    if (dx * dx + dy * dy < minDist * minDist) continue;
    CAND[c++] = g.out[q];
  }
  let best = -1;
  let bestN = -1;
  for (let k = 0; k < c; k++) {
    const e = s.enemies[CAND[k]];
    const n = g.query(s.enemies, e.x, e.y, 70);
    if (n > bestN) {
      bestN = n;
      best = CAND[k];
    }
  }
  return best >= 0 ? best : target(s, p.x, p.y, range);
}

/** Mortar / Meteors: shells (or meteors) onto groups of enemies. */
export function mortar(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  const range = L.range ?? 480;
  const n = L.count ?? 1;
  resetHits();
  let fired = 0;
  for (let k = 0; k < n; k++) {
    const t = mortarTarget(s, p, range, L.meteor ? 0 : MORTAR_MIN);
    if (t < 0) break;
    const e = s.enemies[t];
    pushHit(e.id);
    // A meteor falls from the sky right onto its target; a shell starts from you.
    const sx = L.meteor ? e.x : p.x;
    const sy = L.meteor ? e.y : p.y;
    spawnShell(
      s,
      p.index,
      slot,
      w.def,
      sx,
      sy,
      e.x,
      e.y,
      ticks(L.duration, 0.7),
      (L.radius ?? 70) * p.stats.area,
      L.damage * p.stats.might,
      L.knockback ?? 160,
      L.meteor ? 1 : 0,
    );
    fired++;
  }
  if (!fired) {
    w.timer = RETRY_TICKS;
    return;
  }
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

/** Shell flying from (sx, sy) to (tx, ty) for `flight` ticks. `meteor`: leaves a burning crater. */
export function spawnShell(
  s: GameState,
  owner: number,
  slot: number,
  def: number,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  flight: number,
  radius: number,
  damage: number,
  knock: number,
  meteor: number,
): void {
  const b = spawnProjectile(s);
  if (!b) return;
  b.kind = PJ_SHELL;
  b.owner = owner;
  b.slot = slot;
  b.weapon = def;
  b.x = b.px = sx;
  b.y = b.py = sy;
  b.vx = sx;
  b.vy = sy;
  b.tx = tx;
  b.ty = ty;
  b.a = Math.max(1, flight);
  b.b = radius;
  b.c = meteor;
  b.damage = damage;
  b.knock = knock;
  b.life = b.a + 2;
  b.pierce = -1;
}

/** Player's burning ground (Meteor crater): `dps` damage per second to enemies on it. */
export function spawnBlaze(s: GameState, owner: number, def: number, x: number, y: number, radius: number, dps: number, life: number): void {
  const b = spawnProjectile(s);
  if (!b) return;
  b.kind = PJ_BLAZE;
  b.owner = owner;
  b.weapon = def;
  b.x = b.px = x;
  b.y = b.py = y;
  b.r = radius;
  b.a = dps;
  b.life = life;
  b.pierce = -1;
}
