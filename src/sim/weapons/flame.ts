/**
 * Flame: cone jets (w.angles) damaging every `tick` for `duration`; with `spin`, permanent rotating jets.
 * No projectile; visuals read w.vLen / w.vW (arc) / w.vN.
 */
import type { WeaponLevel } from '../../data/weapons';
import { DT } from '../constants';
import { TWO_PI } from '../dmath';
import { damageEnemy } from '../combat';
import { EV_SHOOT, emit, type GameState, type Player, type WeaponInst } from '../state';
import { AIM, RETRY_TICKS, aim, cdTicks, inCone, ticks } from './common';

/**
 * Lance-flammes : des jets côte à côte, centrés là où tu vises, figés dans leur direction de départ (comme le laser).
 * Tornade de feu : des jets répartis tout autour, qui tournent sans arrêt.
 */
export function flame(s: GameState, p: Player, w: WeaponInst, _slot: number, L: WeaponLevel): void {
  const len = (L.length ?? 135) * p.stats.area;
  const arc = L.arc ?? 0.32;
  const n = Math.min(8, L.count ?? 1);
  w.vLen = len;
  w.vW = arc;
  w.vN = n;
  if (L.spin) {
    w.angle += L.spin * DT;
    if (w.angle > TWO_PI) w.angle -= TWO_PI;
    for (let b = 0; b < n; b++) w.angles[b] = w.angle + (b * TWO_PI) / n;
    w.activeTicks = 2;
    flameTick(s, p, w, L, len, arc, n);
    return;
  }
  if (w.activeTicks > 0) {
    w.activeTicks--;
    flameTick(s, p, w, L, len, arc, n);
    return;
  }
  w.timer -= 1;
  if (w.timer > 0) return;
  if (!aim(s, p, len + 40)) {
    w.timer = RETRY_TICKS;
    return;
  }
  for (let b = 0; b < n; b++) w.angles[b] = AIM + (b - (n - 1) / 2) * 2 * arc;
  w.activeTicks = ticks(L.duration, 1.4);
  w.tickTimer = 0;
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

function flameTick(s: GameState, p: Player, w: WeaponInst, L: WeaponLevel, len: number, arc: number, n: number): void {
  w.tickTimer -= 1;
  if (w.tickTimer > 0) return;
  w.tickTimer += ticks(L.tick, 0.12);
  const dmg = L.damage * p.stats.might;
  const g = s.grid;
  const m = g.query(s.enemies, p.x, p.y, len);
  for (let q = 0; q < m; q++) {
    const idx = g.out[q];
    const e = s.enemies[idx];
    if (!e.alive) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    for (let b = 0; b < n; b++) {
      if (!inCone(dx, dy, e.r, w.angles[b], arc, len)) continue;
      damageEnemy(s, idx, dmg, p.index, 0, 0);
      break;
    }
  }
}
