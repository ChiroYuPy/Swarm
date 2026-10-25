/** Entity creation / removal in the pools. No allocation. */
import { ENEMIES } from '../data/enemies';
import { MAX_ENEMIES, MAX_GEMS, MAX_PICKUPS, MAX_PROJECTILES, PICKUP_LIFE } from './constants';
import { BEHAVIOR, ENEMY_BEHAVIOR } from './registry';
import { EF_BOSS, EF_PROP, PK_CHEST, type Enemy, type GameState, type Projectile } from './state';

export function spawnEnemy(
  s: GameState,
  type: number,
  x: number,
  y: number,
  hpMul: number,
  dmgMul: number,
  spdMul: number,
  target: number,
): Enemy | null {
  if (s.enemyCount >= MAX_ENEMIES) return null;
  const e = s.enemies[s.enemyCount++];
  const d = ENEMIES[type];
  const beh = ENEMY_BEHAVIOR[type];
  e.id = s.nextEnemyId++;
  e.type = type;
  e.alive = true;
  e.flags = beh === BEHAVIOR.PROP ? EF_PROP : beh === BEHAVIOR.BOSS ? EF_BOSS : 0;
  e.x = e.px = x;
  e.y = e.py = y;
  e.vx = 0;
  e.vy = 0;
  e.maxHp = e.hp = d.hp * hpMul;
  e.r = d.radius;
  e.speed = d.speed * spdMul;
  e.dmg = d.damage * dmgMul;
  e.xp = d.xp;
  e.kbx = 0;
  e.kby = 0;
  e.kbResist = d.kbResist;
  e.slowUntil = 0;
  e.slowFactor = 0;
  e.stunUntil = 0;
  e.frozenUntil = 0;
  e.burnUntil = 0;
  e.burnDps = 0;
  e.burnNext = 0;
  e.burnOwner = -1;
  e.boostUntil = 0;
  e.hitTick = -1000;
  e.attackReady = 0;
  e.ai = 0;
  e.timer = 0;
  e.aux = 0;
  e.aux2 = 0;
  e.ax = 0;
  e.ay = 0;
  e.target = target;
  e.immune.fill(0);
  return e;
}

export function compactEnemies(s: GameState): void {
  const arr = s.enemies;
  for (let i = s.enemyCount - 1; i >= 0; i--) {
    if (arr[i].alive) continue;
    const last = s.enemyCount - 1;
    if (i !== last) {
      const tmp = arr[i];
      arr[i] = arr[last];
      arr[last] = tmp;
    }
    s.enemyCount--;
  }
}

export function spawnProjectile(s: GameState): Projectile | null {
  if (s.projCount >= MAX_PROJECTILES) return null;
  const p = s.projectiles[s.projCount++];
  p.kind = 0;
  p.owner = 0;
  p.slot = 0;
  p.weapon = 0;
  p.x = p.y = p.px = p.py = 0;
  p.vx = p.vy = 0;
  p.r = 4;
  p.damage = 0;
  p.life = 60;
  p.age = 0;
  p.pierce = 0;
  p.knock = 0;
  p.hitCount = 0;
  p.a = p.b = p.c = p.d = 0;
  return p;
}

export function removeProjectile(s: GameState, i: number): void {
  const arr = s.projectiles;
  const last = s.projCount - 1;
  if (i !== last) {
    const tmp = arr[i];
    arr[i] = arr[last];
    arr[last] = tmp;
  }
  s.projCount--;
}

export function gemTier(v: number): number {
  return v < 3 ? 0 : v < 10 ? 1 : v < 40 ? 2 : 3;
}

/** Beyond GEM_MERGE_AT gems on the ground, a new gem merges into a nearby idle gem. */
const GEM_MERGE_AT = 200;
const GEM_MERGE_R2 = 64 * 64;

export function spawnGem(s: GameState, x: number, y: number, value: number): void {
  if (s.gemCount >= GEM_MERGE_AT) {
    for (let i = 0; i < s.gemCount; i++) {
      const g = s.gems[i];
      if (g.magnet) continue;
      const dx = g.x - x;
      const dy = g.y - y;
      if (dx * dx + dy * dy > GEM_MERGE_R2) continue;
      g.value += value;
      g.tier = gemTier(g.value);
      return;
    }
  }
  if (s.gemCount >= MAX_GEMS) {
    // Too many gems: merge the value into an existing gem (deterministic choice).
    const g = s.gems[s.gemMergeCursor % s.gemCount];
    s.gemMergeCursor++;
    g.value += value;
    g.tier = gemTier(g.value);
    return;
  }
  const g = s.gems[s.gemCount++];
  g.x = g.px = x;
  g.y = g.py = y;
  g.value = value;
  g.tier = gemTier(value);
  g.magnet = false;
  g.speed = 0;
}

export function removeGem(s: GameState, i: number): void {
  const arr = s.gems;
  const last = s.gemCount - 1;
  if (i !== last) {
    const tmp = arr[i];
    arr[i] = arr[last];
    arr[last] = tmp;
  }
  s.gemCount--;
}

export function spawnPickup(s: GameState, kind: number, x: number, y: number): void {
  if (s.pickupCount >= MAX_PICKUPS) return;
  const p = s.pickups[s.pickupCount++];
  p.kind = kind;
  p.x = x;
  p.y = y;
  p.life = kind === PK_CHEST ? -1 : PICKUP_LIFE;
  p.magnet = false;
  p.speed = 0;
}

export function removePickup(s: GameState, i: number): void {
  const arr = s.pickups;
  const last = s.pickupCount - 1;
  if (i !== last) {
    const tmp = arr[i];
    arr[i] = arr[last];
    arr[last] = tmp;
  }
  s.pickupCount--;
}
