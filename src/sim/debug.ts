/**
 * Outils de test de charge. N'est utilisé que par le mode `?stress=1` (parties non classées).
 * Reste déterministe : positions calculées, aucun aléa.
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
  const types = ['triangle', 'losange', 'carre', 'pentagone', 'points'].map(enemyId);
  for (let i = 0; i < count; i++) {
    const ring = 260 + (i % 9) * 70;
    const a = (i * TWO_PI * 0.618033988749895) % TWO_PI;
    const x = p.x + dcos(a) * ring;
    const y = p.y + dsin(a) * ring;
    if (circleHitsObstacle(s.map, x, y, 14)) continue;
    // PV très élevés : la horde doit tenir pour mesurer les perfs avec 500+ ennemis à l'écran.
    spawnEnemy(s, types[i % types.length], x, y, 60, 0.3, 1, 0);
  }
}

/** Donne un gros build au héros (pour mesurer les perfs avec beaucoup de projectiles). */
export function debugBigBuild(s: GameState): void {
  const p = s.players[0];
  p.weapons.length = 0;
  for (const id of ['cotillons', 'trounoir', 'creperang', 'periph', 'multiprise']) addWeapon(p, weaponId(id));
  p.passives = PASSIVES.slice(0, 4).map((_, i) => {
    const x = new PassiveInst();
    x.def = i;
    x.level = 5;
    return x;
  });
  computeStats(p);
  p.hp = p.base.maxHp = p.stats.maxHp = 5000;
}
