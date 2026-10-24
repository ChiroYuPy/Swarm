/**
 * Orbit: `count` orbs circling the player at `radius`, hitting on contact (per-enemy immunity `hitCd`),
 * optionally pulling enemies in (`pull`, `pullRadius`). No projectile; visuals read w.vN / w.vR / w.vS.
 */
import type { WeaponLevel } from '../../data/weapons';
import { DT, MAX_WEAPON_SLOTS, TICK_RATE } from '../constants';
import { TWO_PI, dcos, dsin } from '../dmath';
import { damageEnemy } from '../combat';
import { clearShotsIn } from '../shots';
import { EF_BOSS, type GameState, type Player, type WeaponInst } from '../state';

export function orbit(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  const n = L.count ?? 2;
  const R = (L.radius ?? 75) * p.stats.area;
  const orbR = (L.size ?? 9) * p.stats.area;
  w.angle += (L.rotSpeed ?? 3) * DT;
  if (w.angle > TWO_PI) w.angle -= TWO_PI;
  w.vN = n;
  w.vR = R;
  w.vS = orbR;
  const key = p.index * MAX_WEAPON_SLOTS + slot;
  const hitCd = Math.round((L.hitCd ?? 0.5) * TICK_RATE);
  const dmg = L.damage * p.stats.might;
  const knock = L.knockback ?? 60;
  const pull = L.pull ?? 0;
  const pullR = (L.pullRadius ?? 0) * p.stats.area;
  const enemies = s.enemies;
  const g = s.grid;
  for (let k = 0; k < n; k++) {
    const a = w.angle + (k * TWO_PI) / n;
    const ox = p.x + dcos(a) * R;
    const oy = p.y + dsin(a) * R;
    clearShotsIn(s, ox, oy, orbR);
    if (pull > 0) {
      const m = g.query(enemies, ox, oy, pullR);
      for (let q = 0; q < m; q++) {
        const e = enemies[g.out[q]];
        if (!e.alive || e.flags & EF_BOSS || e.speed === 0) continue;
        const dx = ox - e.x;
        const dy = oy - e.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > pullR * pullR || d2 < 1) continue;
        const d = Math.sqrt(d2);
        e.kbx += (dx / d) * pull * 0.18;
        e.kby += (dy / d) * pull * 0.18;
      }
    }
    const m = g.query(enemies, ox, oy, orbR);
    for (let q = 0; q < m; q++) {
      const idx = g.out[q];
      const e = enemies[idx];
      if (!e.alive || e.immune[key] > s.tick) continue;
      const dx = e.x - ox;
      const dy = e.y - oy;
      const rr = orbR + e.r;
      if (dx * dx + dy * dy >= rr * rr) continue;
      e.immune[key] = s.tick + hitCd;
      const px = e.x - p.x;
      const py = e.y - p.y;
      const pd = Math.sqrt(px * px + py * py) || 1;
      damageEnemy(s, idx, dmg, p.index, (px / pd) * knock, (py / pd) * knock);
    }
  }
}
