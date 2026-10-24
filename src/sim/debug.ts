/**
 * Load-testing tools. Only used by the `?stress=1` mode (unranked games).
 * Stays deterministic: computed positions, no randomness.
 */
import { TWO_PI, dcos, dsin } from './dmath';
import { circleHitsObstacle } from './map';
import { spawnEnemy } from './entities';
import { enemyId, weaponId } from './registry';
import { computeStats } from './player';
import { addWeapon } from './levelup';
import { PassiveInst, type GameState } from './state';
import { PASSIVES } from '../data/passives';

export function debugSpawnHorde(s: GameState, count: number): void {
  const p = s.players[0];
  const types = ['hunter', 'rusher', 'block', 'shooter', 'swarm'].map(enemyId);
  for (let i = 0; i < count; i++) {
    const ring = 260 + (i % 9) * 70;
    const a = (i * TWO_PI * 0.618033988749895) % TWO_PI;
    const x = p.x + dcos(a) * ring;
    const y = p.y + dsin(a) * ring;
    if (circleHitsObstacle(s.map, x, y, 14)) continue;
    // Very high HP: the horde must survive to measure performance with 500+ enemies on screen.
    spawnEnemy(s, types[i % types.length], x, y, 60, 0.3, 1, 0);
  }
}

/** Gives the hero a big build (to measure performance with lots of projectiles). */
export function debugBigBuild(s: GameState): void {
  const p = s.players[0];
  p.weapons.length = 0;
  for (const id of ['spiral', 'black_holes', 'mine_boomerang', 'earthquake', 'electric_storm']) addWeapon(p, weaponId(id));
  p.passives = PASSIVES.slice(0, 4).map((_, i) => {
    const x = new PassiveInst();
    x.def = i;
    x.level = 5;
    return x;
  });
  computeStats(p);
  p.hp = p.base.maxHp = p.stats.maxHp = 5000;
}
