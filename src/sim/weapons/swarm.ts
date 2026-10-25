/**
 * Swarm: keeps `count` PJ_BEE agents around the player (their logic is in projectiles.ts, `bee`). A bee waits
 * in a calm ring around you, darts at a target (the nuisances first: shooters, orbiters, jumpers,
 * then the nearest enemy), plants itself in it for `stay` s dealing `damage` per second, dies,
 * and comes back to the ring after `respawn` s. Hornets (`dive`) explode on contact instead.
 */
import type { WeaponLevel } from '../../data/weapons';
import { DT } from '../constants';
import { TWO_PI, dcos, dsin } from '../dmath';
import { spawnProjectile } from '../entities';
import { BEHAVIOR, ENEMY_BEHAVIOR } from '../registry';
import { EF_PROP, PJ_BEE, type GameState, type Player, type Projectile, type WeaponInst } from '../state';
import { BIG_RADIUS } from './common';

export const BEE_IDLE = 0;
export const BEE_GO = 1;
export const BEE_STUCK = 2;
export const BEE_HOME = 3;
export const BEE_DEAD = 4;

/** "infinite" bee lifetime (it lives as long as the weapon) */
export const BEE_LIFE = 1 << 30;
/** radius of the ring of waiting bees around the player */
export const BEE_RING = 40;
/** turn rate of the ring around the player (rad/s) */
const RING_SPIN = 1.3;

export function swarm(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  const n = Math.min(16, L.count ?? 3);
  let used = 0;
  let alive = 0;
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_BEE || b.owner !== p.index || b.weapon !== w.def || b.life <= 0) continue;
    used |= 1 << b.d;
    alive++;
  }
  w.vN = alive;
  if (alive >= n) return;
  for (let k = 0; k < n; k++) {
    if (used & (1 << k)) continue;
    const b = spawnProjectile(s);
    if (!b) return;
    const a = ringAngle(s, k, n);
    b.kind = PJ_BEE;
    b.owner = p.index;
    b.slot = slot;
    b.weapon = w.def;
    b.x = b.px = p.x + dcos(a) * BEE_RING;
    b.y = b.py = p.y + dsin(a) * BEE_RING;
    b.vx = b.vy = 0;
    b.tx = a + Math.PI / 2;
    b.r = 6;
    b.a = BEE_IDLE;
    b.b = 12 + k * 4;
    b.c = -1;
    b.ty = -1;
    b.d = k;
    b.life = BEE_LIFE;
    b.pierce = -1;
  }
}

/** Angle of ring slot `k` out of `n` at this tick. */
export function ringAngle(s: GameState, k: number, n: number): number {
  let a = s.tick * DT * RING_SPIN + (k * TWO_PI) / n;
  a -= Math.floor(a / TWO_PI) * TWO_PI;
  return a;
}

/** the nuisances, by behavior: they keep away from you (shooters, orbiters, jumpers) */
const NUISANCE_BEHAVIORS: number[] = [BEHAVIOR.SHOOTER, BEHAVIOR.ORBITER, BEHAVIOR.JUMPER];
const NUISANCE: boolean[] = ENEMY_BEHAVIOR.map((b) => NUISANCE_BEHAVIORS.includes(b));
/** other enemies are only chased this close to you (share of the range) */
const NEAR_SHARE = 0.7;

/**
 * Bee target around the player `o`: a nuisance in `range` first, otherwise an enemy within NEAR_SHARE of it,
 * the nearest to the player each time. An enemy only takes 1 bee (3 if big). -1 if none.
 */
export function beeTarget(s: GameState, self: Projectile, ox: number, oy: number, range: number): number {
  const g = s.grid;
  const m = g.query(s.enemies, ox, oy, range);
  let best = -1;
  let bestRank = 2;
  let bestD = Infinity;
  const near2 = range * range * NEAR_SHARE * NEAR_SHARE;
  for (let q = 0; q < m; q++) {
    const idx = g.out[q];
    const e = s.enemies[idx];
    if (!e.alive || e.speed === 0 || e.flags & EF_PROP) continue;
    const dx = e.x - ox;
    const dy = e.y - oy;
    const d = dx * dx + dy * dy;
    if (d > range * range) continue;
    const rank = NUISANCE[e.type] ? 0 : 1;
    if (rank === 1 && d > near2) continue;
    if (rank > bestRank || (rank === bestRank && d >= bestD)) continue;
    if (beesOn(s, self, e.id) >= (e.r >= BIG_RADIUS ? 3 : 1)) continue;
    best = idx;
    bestRank = rank;
    bestD = d;
  }
  return best;
}

/** Bees of the same player already going for, or planted in, enemy `id`. */
function beesOn(s: GameState, self: Projectile, id: number): number {
  let n = 0;
  for (let j = 0; j < s.projCount; j++) {
    const q = s.projectiles[j];
    if (q !== self && q.kind === PJ_BEE && q.owner === self.owner && q.c >= 0 && q.ty === id && (q.a === BEE_GO || q.a === BEE_STUCK)) n++;
  }
  return n;
}
