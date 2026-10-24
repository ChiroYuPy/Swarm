/**
 * Melee sweeps in front of / around the player, no projectile: whip (fanned lashes, strong knockback, optional
 * stun) and scythe (cone hits dealing % of max HP, execute). Visuals read w.angles / w.vLen / w.vW / w.vN.
 */
import type { WeaponLevel } from '../../data/weapons';
import { TICK_RATE } from '../constants';
import { TWO_PI, dcos, dsin } from '../dmath';
import { damageEnemy, pushEnemy } from '../combat';
import { EF_BOSS, EV_SHOOT, emit, type GameState, type Player, type WeaponInst } from '../state';
import { RETRY_TICKS, cdTicks, facing, inCone, target } from './common';

export const WHIP_FX_TICKS = 16;
/** gap between two Whip lashes (1/20 of a turn) */
const WHIP_STEP = TWO_PI / 20;

/** Whip: lashes fanned out in front of you (1/5 of a turn at most) that hurt and knock far back along their axis. */
export function whip(s: GameState, p: Player, w: WeaponInst, _slot: number, L: WeaponLevel): void {
  if (w.activeTicks > 0) w.activeTicks--;
  w.timer -= 1;
  if (w.timer > 0) return;
  const len = (L.length ?? 160) * p.stats.area;
  if (target(s, p.x, p.y, len + 30) < 0) {
    w.timer = RETRY_TICKS;
    return;
  }
  const width = (L.width ?? 26) * p.stats.area;
  const n = Math.min(8, L.count ?? 1);
  const base = facing(p);
  const knock = L.knockback ?? 420;
  const stun = Math.round((L.stun ?? 0) * TICK_RATE);
  const dmg = L.damage * p.stats.might;
  const g = s.grid;
  for (let k = 0; k < n; k++) {
    // Fan centred in front of you: 18° between two lashes, 72° for 5.
    const a = base + (k - (n - 1) / 2) * WHIP_STEP;
    w.angles[k] = a;
    const ux = dcos(a);
    const uy = dsin(a);
    const m = g.query(s.enemies, p.x + (ux * len) / 2, p.y + (uy * len) / 2, len / 2 + width);
    for (let q = 0; q < m; q++) {
      const idx = g.out[q];
      const e = s.enemies[idx];
      if (!e.alive) continue;
      const rx = e.x - p.x;
      const ry = e.y - p.y;
      const t = rx * ux + ry * uy;
      if (t < -e.r || t > len + e.r) continue;
      if (Math.abs(rx * uy - ry * ux) > width + e.r) continue;
      if (dmg > 0) damageEnemy(s, idx, dmg, p.index, ux * knock, uy * knock);
      else pushEnemy(s, idx, ux * knock, uy * knock);
      if (stun > 0 && !(e.flags & EF_BOSS)) e.stunUntil = Math.max(e.stunUntil, s.tick + stun);
    }
  }
  w.vLen = len;
  w.vW = width;
  w.vN = n;
  w.activeTicks = WHIP_FX_TICKS;
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

export const SCYTHE_FX_TICKS = 18;

/**
 * Scythe: an instant hit all around you that removes a share of each target's max HP (less on
 * bosses): as many hits for a small one as for a big one. It finishes off nearly dead enemies.
 */
export function scythe(s: GameState, p: Player, w: WeaponInst, _slot: number, L: WeaponLevel): void {
  if (w.activeTicks > 0) w.activeTicks--;
  w.timer -= 1;
  if (w.timer > 0) return;
  const len = (L.length ?? 150) * p.stats.area;
  if (target(s, p.x, p.y, len + 30) < 0) {
    w.timer = RETRY_TICKS;
    return;
  }
  const arc = L.arc ?? Math.PI;
  const n = Math.min(4, L.count ?? 1);
  const base = facing(p);
  const dmg = L.damage * p.stats.might;
  const pct = (L.pctHp ?? 0) * p.stats.might;
  const bossPct = (L.bossPct ?? 0) * p.stats.might;
  const knock = L.knockback ?? 100;
  const exec = L.execute ?? 0;
  const g = s.grid;
  for (let k = 0; k < n; k++) {
    const a = base + (k * TWO_PI) / n;
    w.angles[k] = a;
    const m = g.query(s.enemies, p.x, p.y, len);
    for (let q = 0; q < m; q++) {
      const idx = g.out[q];
      const e = s.enemies[idx];
      if (!e.alive) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (!inCone(dx, dy, e.r, a, arc, len)) continue;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const hit = dmg + e.maxHp * (e.flags & EF_BOSS ? bossPct : pct);
      damageEnemy(s, idx, hit, p.index, (dx / d) * knock, (dy / d) * knock);
      if (exec > 0 && e.alive && !(e.flags & EF_BOSS) && e.hp < e.maxHp * exec) damageEnemy(s, idx, e.hp + 1, p.index, 0, 0);
    }
  }
  w.vLen = len;
  w.vW = arc;
  w.vN = n;
  w.activeTicks = SCYTHE_FX_TICKS;
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}
