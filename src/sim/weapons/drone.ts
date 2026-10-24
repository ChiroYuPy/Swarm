/**
 * Drone: keeps `count` PJ_DRONE agents alive (b = hp, c = target id, d = formation index; see projectiles.ts),
 * plus huntTarget, the drone target picker used by projectiles.ts.
 */
import type { WeaponLevel } from '../../data/weapons';
import { dcos, dsin } from '../dmath';
import { spawnProjectile } from '../entities';
import { BEHAVIOR, ENEMY_BEHAVIOR } from '../registry';
import { PJ_DRONE, type GameState, type Player, type WeaponInst } from '../state';

/**
 * Drone / Squadron / Kamikaze drones: autonomous agents (PJ_DRONE projectiles, see projectiles.ts).
 * The weapon only refills the squad: a downed drone comes back near you after `respawn` s.
 */
export function drone(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  const n = L.count ?? 1;
  let alive = 0;
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind === PJ_DRONE && b.owner === p.index && b.weapon === w.def && b.life > 0) alive++;
  }
  w.vN = alive;
  if (alive >= n) return;
  if (w.burstTimer > 0) {
    w.burstTimer--;
    return;
  }
  const b = spawnProjectile(s);
  if (!b) return;
  const a = w.angle + alive * 2.1;
  w.angle += 1.3;
  b.kind = PJ_DRONE;
  b.owner = p.index;
  b.slot = slot;
  b.weapon = w.def;
  b.x = b.px = p.x + dcos(a) * 30;
  b.y = b.py = p.y + dsin(a) * 30;
  b.vx = dcos(a) * 80;
  b.vy = dsin(a) * 80;
  b.r = 8;
  b.a = 20;
  b.b = L.hp ?? 50;
  b.c = -1;
  b.d = alive;
  b.life = DRONE_LIFE;
  b.pierce = -1;
  w.burstTimer = 15; // missing drones arrive one by one
}
/** "infinite" drone lifetime (it dies when shot down, or when the weapon goes away) */
export const DRONE_LIFE = 1 << 30;

/**
 * Drone target, the nearest to (x, y) in this order: a free nuisance, a free enemy, an already-claimed nuisance,
 * an already-claimed enemy. "Claimed" = already targeted by another of your drones (ids in `claimed[0..nClaimed)`).
 */
// the nuisances, by behavior: shooters, leaders, blinkers, bombs
const PRIORITY_BEHAVIORS: number[] = [BEHAVIOR.SHOOTER, BEHAVIOR.LEADER, BEHAVIOR.BLINKER, BEHAVIOR.KAMIKAZE];
const PRIORITY: number[] = ENEMY_BEHAVIOR.flatMap((b, t) => (PRIORITY_BEHAVIORS.includes(b) ? [t] : []));
export function huntTarget(
  s: GameState,
  x: number,
  y: number,
  range: number,
  priorityFirst: boolean,
  claimed: Int32Array,
  nClaimed: number,
): number {
  const g = s.grid;
  const m = g.query(s.enemies, x, y, range);
  let best = -1;
  let bestD = Infinity;
  let bestRank = 4;
  for (let q = 0; q < m; q++) {
    const idx = g.out[q];
    const e = s.enemies[idx];
    if (!e.alive || e.speed === 0) continue;
    let taken = false;
    for (let k = 0; k < nClaimed; k++) {
      if (claimed[k] === e.id) {
        taken = true;
        break;
      }
    }
    const rank = (taken ? 2 : 0) + (priorityFirst && PRIORITY.includes(e.type) ? 0 : 1);
    if (rank > bestRank) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d = dx * dx + dy * dy;
    if (rank < bestRank || d < bestD) {
      best = idx;
      bestD = d;
      bestRank = rank;
    }
  }
  return best;
}
