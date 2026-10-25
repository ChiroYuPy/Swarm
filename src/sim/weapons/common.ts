/**
 * Shared helpers for weapon updaters: cooldown in ticks, nearest / biggest enemy targeting, aiming (result in AIM),
 * cone test, facing, and the HITS scratch buffer used by the mortar (reset at the start of each call).
 */
import type { WeaponLevel } from '../../data/weapons';
import { INPUT_DIRS, TICK_RATE } from '../constants';
import { TWO_PI, datan2 } from '../dmath';
import { EF_PROP, type GameState, type Player } from '../state';

export const HITS = new Int32Array(64);
export let hitN = 0;

export function resetHits(): void {
  hitN = 0;
}
export function pushHit(id: number): void {
  HITS[hitN++] = id;
}

export function isExcludedHit(id: number): boolean {
  for (let i = 0; i < hitN; i++) if (HITS[i] === id) return true;
  return false;
}

export function cdTicks(L: WeaponLevel, p: Player): number {
  return Math.max(1, (L.cooldown ?? 1) * p.stats.cooldownMul * TICK_RATE);
}

export function target(s: GameState, x: number, y: number, range: number): number {
  return s.grid.nearest(s.enemies, x, y, range, undefined, 0, true);
}

/** Enemies at least this big count as "big" for the weapons that weigh them (Blade, Mortar, Swarm). */
export const BIG_RADIUS = 18;

/**
 * The biggest enemy by MAX HP within `range` of (x, y) (ties: the nearest), never the bonus crate or a
 * motionless obstacle. Targeting by max HP (not current HP) keeps the weapon on a big one it has already
 * wounded until it is finished. -1 if nobody is in range.
 */
export function biggest(s: GameState, x: number, y: number, range: number): number {
  const g = s.grid;
  const m = g.query(s.enemies, x, y, range);
  let best = -1;
  let bestHp = -1;
  let bestD = Infinity;
  for (let q = 0; q < m; q++) {
    const idx = g.out[q];
    const e = s.enemies[idx];
    if (!e.alive || e.speed === 0 || e.flags & EF_PROP) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d = dx * dx + dy * dy;
    if (d > range * range) continue;
    if (e.maxHp > bestHp || (e.maxHp === bestHp && d < bestD)) {
      best = idx;
      bestHp = e.maxHp;
      bestD = d;
    }
  }
  return best;
}

/** Shortest signed angle from `b` to `a` (radians, -PI..PI). */
export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return d;
}

/** Angle toward the last target found by `aim`. */
export let AIM = 0;

export function setAim(a: number): void {
  AIM = a;
}

/**
 * Manual aim: the chosen direction, whether or not there are enemies there.
 * Otherwise, aims at the nearest enemy in range. Returns false if there is nobody (the weapon does not fire).
 */
export function aim(s: GameState, p: Player, range: number): boolean {
  if (p.aim >= 0) {
    AIM = (p.aim * TWO_PI) / INPUT_DIRS;
    return true;
  }
  const ti = target(s, p.x, p.y, range);
  if (ti < 0) return false;
  const e = s.enemies[ti];
  AIM = datan2(e.y - p.y, e.x - p.x);
  return true;
}

/** Nobody in range: the weapon stays loaded and retries soon. */
export const RETRY_TICKS = 6;

export const ticks = (sec: number | undefined, def: number) => Math.max(1, Math.round((sec ?? def) * TICK_RATE));

/** Is the enemy at (dx, dy) from the player inside the cone of axis `a`, half-angle `arc` and length `len`? */
export function inCone(dx: number, dy: number, r: number, a: number, arc: number, len: number): boolean {
  const d2 = dx * dx + dy * dy;
  const reach = len + r;
  if (d2 > reach * reach) return false;
  if (arc >= Math.PI) return true;
  const d = Math.sqrt(d2);
  if (d < r) return true;
  let diff = datan2(dy, dx) - a;
  while (diff > Math.PI) diff -= TWO_PI;
  while (diff < -Math.PI) diff += TWO_PI;
  return Math.abs(diff) <= arc + r / d;
}

/** "In front of you" direction: the manual aim, otherwise the walking direction. */
export function facing(p: Player): number {
  return p.aim >= 0 ? (p.aim * TWO_PI) / INPUT_DIRS : datan2(p.faceY, p.faceX);
}
