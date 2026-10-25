/**
 * Blade: a sword sweep around the player toward the densest group in reach (big enemies count double),
 * alternating left and right. With `arc` of a half turn or more (Scythe), every swing is a full turn, and
 * enemies under the outer `tip` share of the reach take double damage. The blade really sweeps: an enemy is
 * hit when the blade passes over it, once per swing. No projectile; visuals read w.angles (0 = start,
 * 1 = signed sweep, 2 = current angle, 3 = tip share, 4 = reach), w.vN (sweep ticks), w.tickTimer (ticks
 * elapsed) and w.activeTicks (ticks left, sweep + fade).
 */
import type { WeaponLevel } from '../../data/weapons';
import { INPUT_DIRS, MAX_WEAPON_SLOTS } from '../constants';
import { PI, TWO_PI, datan2 } from '../dmath';
import { damageEnemy } from '../combat';
import { EV_SHOOT, emit, type GameState, type Player, type WeaponInst } from '../state';
import { BIG_RADIUS, RETRY_TICKS, angleDiff, cdTicks, inCone } from './common';

export const BLADE_SWEEP_TICKS = 8;
export const BLADE_TURN_TICKS = 16;
/** the trail fades out for this many ticks after the sweep */
export const BLADE_FADE_TICKS = 7;
const DIRS = 24;

export function blade(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  if (w.activeTicks > 0) {
    w.activeTicks--;
    if (w.tickTimer < w.vN) {
      w.tickTimer++;
      const k = w.tickTimer / w.vN;
      const cur = w.angles[0] + w.angles[1] * (1 - (1 - k) * (1 - k));
      cut(s, p, w, slot, L, w.angles[2], cur);
      w.angles[2] = cur;
    }
    return;
  }
  w.timer -= 1;
  if (w.timer > 0) return;
  const half = L.arc ?? Math.PI / 4;
  const reach = (L.length ?? 95) * p.stats.area;
  const a0 = p.aim >= 0 ? (p.aim * TWO_PI) / INPUT_DIRS : densest(s, p, reach + 18, half);
  if (a0 === null) {
    w.timer = RETRY_TICKS;
    return;
  }
  w.shots++;
  const full = half >= PI;
  const dir = w.shots & 1 ? 1 : -1;
  w.angles[0] = full ? a0 : a0 - half * dir;
  w.angles[1] = (full ? TWO_PI : 2 * half) * dir;
  w.angles[2] = w.angles[0];
  w.angles[3] = L.tip ?? 0;
  w.angles[4] = reach;
  w.vN = full ? BLADE_TURN_TICKS : BLADE_SWEEP_TICKS;
  w.tickTimer = 0;
  w.activeTicks = w.vN + BLADE_FADE_TICKS;
  w.timer = cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

/** Hits what the blade crossed between the angles `from` and `to`. */
function cut(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel, from: number, to: number): void {
  const R = w.angles[4];
  const tipR = R * (1 - w.angles[3]);
  const dmg = L.damage * p.stats.might;
  const knock = L.knockback ?? 60;
  const mid = (from + to) / 2;
  const span = Math.abs(to - from) / 2 + 0.1;
  const key = p.index * MAX_WEAPON_SLOTS + slot;
  const g = s.grid;
  const m = g.query(s.enemies, p.x, p.y, R + 24);
  for (let q = 0; q < m; q++) {
    const idx = g.out[q];
    const e = s.enemies[idx];
    if (!e.alive || e.immune[key] > s.tick) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    if (!inCone(dx, dy, e.r, mid, span, R)) continue;
    e.immune[key] = s.tick + w.vN + 1;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const tip = w.angles[3] > 0 && d + e.r >= tipR;
    damageEnemy(s, idx, tip ? dmg * 2 : dmg, p.index, (dx / d) * knock, (dy / d) * knock);
  }
}

const ANG = new Float64Array(160);
const WEIGHT = new Float64Array(160);

/** Direction (out of DIRS) holding the most enemies within `reach` and `half` of it; null if nobody is in reach. */
function densest(s: GameState, p: Player, reach: number, half: number): number | null {
  const g = s.grid;
  const m = g.query(s.enemies, p.x, p.y, reach);
  let c = 0;
  for (let q = 0; q < m && c < ANG.length; q++) {
    const e = s.enemies[g.out[q]];
    if (!e.alive || e.speed === 0) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const rr = reach + e.r;
    if (dx * dx + dy * dy > rr * rr) continue;
    ANG[c] = datan2(dy, dx);
    WEIGHT[c++] = e.r >= BIG_RADIUS ? 2 : 1;
  }
  if (c === 0) return null;
  let best = 0;
  let bestN = -1;
  for (let i = 0; i < DIRS; i++) {
    const a = (i * TWO_PI) / DIRS;
    let n = 0;
    for (let k = 0; k < c; k++) if (Math.abs(angleDiff(ANG[k], a)) <= half) n += WEIGHT[k];
    if (n > bestN) {
      bestN = n;
      best = a;
    }
  }
  return best;
}
