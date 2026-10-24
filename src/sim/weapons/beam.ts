/**
 * Beam: `count` lasers fixed in their firing direction (w.angles) for `duration`, damaging along
 * `length` x `width` every `tick`. No projectile; visuals read w.vLen / w.vW / w.vN.
 */
import type { WeaponLevel } from '../../data/weapons';
import { TICK_RATE } from '../constants';
import { TWO_PI, dcos, dsin } from '../dmath';
import { damageEnemy } from '../combat';
import { clearShotsOnLine } from '../shots';
import { EV_SHOOT, emit, type GameState, type Player, type WeaponInst } from '../state';
import { AIM, RETRY_TICKS, aim, cdTicks } from './common';

export function beam(s: GameState, p: Player, w: WeaponInst, _slot: number, L: WeaponLevel): void {
  const len = L.length ?? 420;
  const width = (L.width ?? 8) * p.stats.area;
  const n = Math.min(4, L.count ?? 1);
  w.vLen = len;
  w.vW = width;
  w.vN = n;
  if (w.activeTicks > 0) {
    w.activeTicks--;
    w.tickTimer -= 1;
    if (w.tickTimer <= 0) {
      w.tickTimer += Math.max(1, Math.round((L.tick ?? 0.1) * TICK_RATE));
      const dmg = L.damage * p.stats.might;
      const g = s.grid;
      for (let b = 0; b < n; b++) {
        const ux = dcos(w.angles[b]);
        const uy = dsin(w.angles[b]);
        clearShotsOnLine(s, p.x, p.y, ux, uy, len, width);
        const m = g.query(s.enemies, p.x + (ux * len) / 2, p.y + (uy * len) / 2, len / 2 + width);
        for (let q = 0; q < m; q++) {
          const idx = g.out[q];
          const e = s.enemies[idx];
          if (!e.alive) continue;
          const rx = e.x - p.x;
          const ry = e.y - p.y;
          const t = rx * ux + ry * uy;
          if (t < -e.r || t > len + e.r) continue;
          const perp = Math.abs(rx * uy - ry * ux);
          if (perp > width + e.r) continue;
          damageEnemy(s, idx, dmg, p.index, 0, 0);
        }
      }
    }
    return;
  }
  w.timer -= 1;
  if (w.timer > 0) return;
  if (!aim(s, p, len)) {
    w.timer = RETRY_TICKS;
    return;
  }
  for (let b = 0; b < n; b++) w.angles[b] = AIM + (b * TWO_PI) / n;
  w.activeTicks = Math.round((L.duration ?? 0.4) * TICK_RATE);
  w.tickTimer = 0;
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}
