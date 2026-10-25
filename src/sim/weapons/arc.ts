/**
 * Electric arc: every `cooldown`, the bolt locks onto the biggest enemy in `range` (by max HP) for `duration`.
 * Every `tick` it shocks that main target (`damage`, held in place by a short `stun`) and arcs from it to its
 * `jumps` nearest neighbours within `jumpRange` (60% damage, `sideStun`). If the main target dies or gets away,
 * the bolt jumps to the next biggest for the rest of the window. No projectile; emits EV_LINE per arc; the
 * locked target is w.lockIdx / w.lockId, w.activeTicks the window left (visuals).
 */
import type { WeaponLevel } from '../../data/weapons';
import { TICK_RATE } from '../constants';
import { damageEnemy } from '../combat';
import { DMG_ELEC, EF_BOSS, EV_LINE, EV_SHOOT, emit, type GameState, type Player, type WeaponInst } from '../state';
import { RETRY_TICKS, biggest, cdTicks, ticks } from './common';

/** neighbours take this share of the main target's damage */
const SIDE_SHARE = 0.6;
/** the lock breaks when the main target gets this much further than the range */
const LEASH = 1.25;

/** Index of the locked enemy (found again by id if the pool moved it), or -1. */
export function lockedTarget(s: GameState, w: WeaponInst): number {
  if (w.lockId < 0) return -1;
  const i = w.lockIdx;
  if (i >= 0 && i < s.enemyCount && s.enemies[i].alive && s.enemies[i].id === w.lockId) return i;
  for (let k = 0; k < s.enemyCount; k++) {
    const e = s.enemies[k];
    if (e.alive && e.id === w.lockId) {
      w.lockIdx = k;
      return k;
    }
  }
  w.lockIdx = w.lockId = -1;
  return -1;
}

function lock(s: GameState, w: WeaponInst, idx: number): void {
  w.lockIdx = idx;
  w.lockId = idx >= 0 ? s.enemies[idx].id : -1;
}

export function arc(s: GameState, p: Player, w: WeaponInst, _slot: number, L: WeaponLevel): void {
  const range = L.range ?? 230;
  if (w.activeTicks > 0) {
    w.activeTicks--;
    let t = lockedTarget(s, w);
    if (t >= 0) {
      const e = s.enemies[t];
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * dx + dy * dy > range * range * LEASH * LEASH) t = -1;
    }
    if (t < 0) {
      t = biggest(s, p.x, p.y, range);
      lock(s, w, t);
    }
    if (w.activeTicks === 0) lock(s, w, -1);
    w.tickTimer -= 1;
    if (t < 0 || w.tickTimer > 0) return;
    w.tickTimer += ticks(L.tick, 0.2);
    shock(s, p, w, t, L);
    return;
  }
  w.timer -= 1;
  if (w.timer > 0) return;
  const t = biggest(s, p.x, p.y, range);
  if (t < 0) {
    w.timer = RETRY_TICKS;
    return;
  }
  lock(s, w, t);
  w.activeTicks = ticks(L.duration, 0.8);
  w.tickTimer = 1;
  // The cooldown runs once the window is over.
  w.timer = cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

/** One tick: the main target, then its nearest neighbours. */
function shock(s: GameState, p: Player, w: WeaponInst, t: number, L: WeaponLevel): void {
  const main = s.enemies[t];
  const mx = main.x;
  const my = main.y;
  const mainId = main.id;
  const dmg = L.damage * p.stats.might;
  const stun = Math.round((L.stun ?? 0) * TICK_RATE);
  const sideStun = Math.round((L.sideStun ?? 0) * TICK_RATE);
  // Neighbours first (the main target may die from its shock), the nearest `jumps` ones.
  const jr = L.jumpRange ?? 110;
  const g = s.grid;
  const m = g.query(s.enemies, mx, my, jr);
  let c = 0;
  for (let q = 0; q < m && c < NEAR.length; q++) {
    const idx = g.out[q];
    const e = s.enemies[idx];
    if (!e.alive || e.id === mainId || e.speed === 0) continue;
    const dx = e.x - mx;
    const dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d > jr * jr) continue;
    NEAR[c] = idx;
    NEAR_D[c++] = d;
  }
  const jumps = Math.min(c, L.jumps ?? 3);
  for (let k = 0; k < jumps; k++) {
    let best = k;
    for (let j = k + 1; j < c; j++) if (NEAR_D[j] < NEAR_D[best]) best = j;
    const ti = NEAR[best];
    const td = NEAR_D[best];
    NEAR[best] = NEAR[k];
    NEAR_D[best] = NEAR_D[k];
    NEAR[k] = ti;
    NEAR_D[k] = td;
  }
  emit(s, EV_LINE, p.x, p.y, 0, w.def, mx, my, p.index);
  if (stun > 0 && !(main.flags & EF_BOSS)) main.stunUntil = Math.max(main.stunUntil, s.tick + stun);
  damageEnemy(s, t, dmg, p.index, 0, 0, false, DMG_ELEC);
  for (let k = 0; k < jumps; k++) {
    const e = s.enemies[NEAR[k]];
    if (!e.alive) continue;
    emit(s, EV_LINE, mx, my, 0, w.def, e.x, e.y, p.index);
    if (sideStun > 0 && !(e.flags & EF_BOSS)) e.stunUntil = Math.max(e.stunUntil, s.tick + sideStun);
    damageEnemy(s, NEAR[k], dmg * SIDE_SHARE, p.index, 0, 0, false, DMG_ELEC);
  }
}
const NEAR = new Int32Array(96);
const NEAR_D = new Float64Array(96);
