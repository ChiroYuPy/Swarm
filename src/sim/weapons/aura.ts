/**
 * Aura: damage (and optional `slow`, `lifesteal`) every `tick` to enemies within `radius` of the player.
 * No projectile; visuals read w.vR / w.activeTicks.
 */
import type { WeaponLevel } from '../../data/weapons';
import { TICK_RATE } from '../constants';
import { damageEnemy, healPlayer } from '../combat';
import { clearShotsIn } from '../shots';
import type { GameState, Player, WeaponInst } from '../state';

export function aura(s: GameState, p: Player, w: WeaponInst, _slot: number, L: WeaponLevel): void {
  const R = (L.radius ?? 80) * p.stats.area;
  w.vR = R;
  if (w.activeTicks > 0) w.activeTicks--;
  w.tickTimer -= 1;
  if (w.tickTimer > 0) return;
  w.tickTimer += Math.max(1, Math.round((L.tick ?? 0.5) * TICK_RATE));
  const dmg = L.damage * p.stats.might;
  const slow = L.slow ?? 0;
  clearShotsIn(s, p.x, p.y, R);
  const g = s.grid;
  const n = g.query(s.enemies, p.x, p.y, R);
  let heal = 0;
  let hit = false;
  for (let q = 0; q < n; q++) {
    const idx = g.out[q];
    const e = s.enemies[idx];
    if (!e.alive) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const rr = R + e.r;
    if (dx * dx + dy * dy >= rr * rr) continue;
    if (slow > 0) {
      e.slowFactor = e.slowUntil > s.tick ? Math.max(e.slowFactor, slow) : slow;
      e.slowUntil = s.tick + Math.round((L.tick ?? 0.5) * TICK_RATE) + 6;
    }
    damageEnemy(s, idx, dmg, p.index, 0, 0);
    heal += dmg * (L.lifesteal ?? 0);
    hit = true;
  }
  if (hit) w.activeTicks = 8; // visual flash of the tick, only if it hit someone
  if (heal > 0) healPlayer(s, p, Math.min(heal, 4), false);
}
