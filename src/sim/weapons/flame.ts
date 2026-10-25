/**
 * Flame: cone jets (w.angles) damaging every `tick` for `duration` and setting enemies on fire (`burn` damage
 * per second for `burnTime`); with `spin`, permanent rotating jets. No projectile; visuals read
 * w.vLen / w.vW (arc) / w.vN.
 */
import type { WeaponLevel } from '../../data/weapons';
import { DT } from '../constants';
import { TWO_PI, datan2, turnToward } from '../dmath';
import { damageEnemy, ignite } from '../combat';
import { DMG_FIRE, EV_SHOOT, emit, type GameState, type Player, type WeaponInst } from '../state';
import { AIM, RETRY_TICKS, aim, cdTicks, inCone, target, ticks } from './common';

/**
 * Flamethrower: one strong jet toward the nearest enemy, turning slowly (`turn`) to follow it while it burns.
 * Fire tornado: jets spread all around, spinning nonstop.
 */
export function flame(s: GameState, p: Player, w: WeaponInst, _slot: number, L: WeaponLevel): void {
  const len = (L.length ?? 140) * p.stats.area;
  const arc = L.arc ?? 0.2;
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
    if (p.aim < 0 && L.turn) {
      const t = target(s, p.x, p.y, len + 20);
      if (t >= 0) {
        const e = s.enemies[t];
        w.angle = turnToward(w.angle, datan2(e.y - p.y, e.x - p.x), L.turn * DT);
      }
    } else if (p.aim >= 0 && aim(s, p, len)) w.angle = AIM;
    for (let b = 0; b < n; b++) w.angles[b] = w.angle + (b - (n - 1) / 2) * 2 * arc;
    flameTick(s, p, w, L, len, arc, n);
    return;
  }
  w.timer -= 1;
  if (w.timer > 0) return;
  if (!aim(s, p, len + 30)) {
    w.timer = RETRY_TICKS;
    return;
  }
  w.angle = AIM;
  for (let b = 0; b < n; b++) w.angles[b] = w.angle + (b - (n - 1) / 2) * 2 * arc;
  w.activeTicks = ticks(L.duration, 1.0);
  w.tickTimer = 0;
  // The cooldown runs once the jet is over.
  w.timer = cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

function flameTick(s: GameState, p: Player, w: WeaponInst, L: WeaponLevel, len: number, arc: number, n: number): void {
  w.tickTimer -= 1;
  if (w.tickTimer > 0) return;
  w.tickTimer += ticks(L.tick, 0.12);
  const dmg = L.damage * p.stats.might;
  const burn = (L.burn ?? 0) * p.stats.might;
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
      if (burn > 0) ignite(s, idx, burn, L.burnTime ?? 2.5, p.index);
      damageEnemy(s, idx, dmg, p.index, 0, 0, false, DMG_FIRE);
      break;
    }
  }
}
