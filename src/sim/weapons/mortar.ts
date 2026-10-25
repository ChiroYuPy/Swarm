/**
 * Mortar / meteors: PJ_SHELL lobbed onto groups of enemies (vx/vy = start, tx/ty = target, a = flight ticks,
 * b = blast radius, c = meteor flag; see projectiles.ts). The mortar only aims at groups far from you, and
 * where they will be when the shell lands (they walk toward you). Meteors leave a PJ_BLAZE crater
 * (r = radius, a = dps). Enemies of a group already shelled go in the shared HITS buffer.
 */
import type { WeaponLevel } from '../../data/weapons';
import { DT } from '../constants';
import { spawnProjectile } from '../entities';
import { EF_PROP, EV_SHOOT, PJ_BLAZE, PJ_SHELL, emit, type GameState, type Player, type WeaponInst } from '../state';
import { BIG_RADIUS, RETRY_TICKS, cdTicks, isExcludedHit, pushHit, resetHits, ticks } from './common';

/** the Mortar does not target enemies closer to you than this */
const MORTAR_MIN = 210;
/** predicted enemies stop this far from their player */
const STOP_SHORT = 30;

/** Mortar candidates: index and predicted position at impact. */
const CAND = new Int32Array(48);
const CX = new Float64Array(48);
const CY = new Float64Array(48);
/** aimed point found by `mortarTarget` */
let AIM_X = 0;
let AIM_Y = 0;

/**
 * The Mortar aims at the predicted centre of the heaviest group (big enemies count triple) among the enemies
 * farther than `minDist`, `flight` ticks ahead. False if nobody is in range.
 */
function mortarTarget(s: GameState, p: Player, range: number, minDist: number, radius: number, flight: number): boolean {
  const g = s.grid;
  const m = g.query(s.enemies, p.x, p.y, range);
  const t = flight * DT;
  let c = 0;
  for (let q = 0; q < m && c < CAND.length; q++) {
    const idx = g.out[q];
    const e = s.enemies[idx];
    if (!e.alive || e.speed === 0 || e.flags & EF_PROP || isExcludedHit(e.id)) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < minDist * minDist || d2 > range * range) continue;
    // It walks toward its player (still while stunned or frozen).
    const tp = s.players[e.target] ?? p;
    const tx = tp.x - e.x;
    const ty = tp.y - e.y;
    const td = Math.sqrt(tx * tx + ty * ty) || 1;
    const held = e.stunUntil > s.tick || e.frozenUntil > s.tick;
    const slow = e.slowUntil > s.tick ? 1 - e.slowFactor : 1;
    const step = held ? 0 : Math.min(e.speed * slow * t, Math.max(0, td - STOP_SHORT));
    CAND[c] = idx;
    CX[c] = e.x + (tx / td) * step;
    CY[c++] = e.y + (ty / td) * step;
  }
  let bestScore = 0;
  for (let k = 0; k < c; k++) {
    let score = 0;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let j = 0; j < c; j++) {
      const dx = CX[j] - CX[k];
      const dy = CY[j] - CY[k];
      if (dx * dx + dy * dy > radius * radius) continue;
      score += s.enemies[CAND[j]].r >= BIG_RADIUS ? 3 : 1;
      sx += CX[j];
      sy += CY[j];
      n++;
    }
    if (score > bestScore) {
      bestScore = score;
      AIM_X = sx / n;
      AIM_Y = sy / n;
    }
  }
  if (bestScore === 0) return false;
  // That group is taken: the next shell of the same volley looks for another one.
  for (let j = 0; j < c; j++) {
    const dx = CX[j] - AIM_X;
    const dy = CY[j] - AIM_Y;
    if (dx * dx + dy * dy <= radius * radius) pushHit(s.enemies[CAND[j]].id);
  }
  return true;
}

/** Mortar / Meteors: shells (or meteors) onto groups of enemies. */
export function mortar(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  const range = L.range ?? 520;
  const n = L.count ?? 1;
  const radius = (L.radius ?? 88) * p.stats.area;
  const flight = ticks(L.duration, 0.9);
  resetHits();
  let fired = 0;
  for (let k = 0; k < n; k++) {
    if (!mortarTarget(s, p, range, L.meteor ? 0 : MORTAR_MIN, radius, flight)) break;
    // A meteor falls from the sky right onto its target; a shell starts from you.
    const sx = L.meteor ? AIM_X : p.x;
    const sy = L.meteor ? AIM_Y : p.y;
    spawnShell(s, p.index, slot, w.def, sx, sy, AIM_X, AIM_Y, flight, radius, L.damage * p.stats.might, L.knockback ?? 100, L.meteor ? 1 : 0);
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
