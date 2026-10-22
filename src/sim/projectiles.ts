/** Mise à jour des projectiles : balles, balles ennemies, mines, boomerangs, ondes. */
import { DT, TICK_RATE } from './constants';
import { LOOT } from '../data/loot';
import { clearShotsIn } from './shots';
import { pointInObstacle } from './map';
import { removeProjectile } from './entities';
import { damageEnemy, explode, hurtPlayer } from './combat';
import { weaponLevel } from './registry';
import { spawnMine } from './weapons';
import {
  EF_BOSS,
  EF_PROP,
  EV_SHOT_DOWN,
  EV_WALL_HIT,
  PJ_BOOMERANG,
  PJ_BULLET,
  PJ_EBULLET,
  PJ_MINE,
  PJ_RING,
  emit,
  type GameState,
  type Projectile,
} from './state';

function hasHit(b: Projectile, id: number): boolean {
  const n = b.hitCount < 8 ? b.hitCount : 8;
  for (let i = 0; i < n; i++) if (b.hitIds[i] === id) return true;
  return false;
}
function addHit(b: Projectile, id: number): void {
  b.hitIds[b.hitCount & 7] = id;
  b.hitCount++;
}

export function updateProjectiles(s: GameState): void {
  for (let i = s.projCount - 1; i >= 0; i--) {
    const b = s.projectiles[i];
    // Détruit en cours de pas (balle de Tireur abattue, balle du joueur usée sur elle).
    if (b.life <= 0) {
      removeProjectile(s, i);
      continue;
    }
    b.px = b.x;
    b.py = b.y;
    b.age++;
    let dead = false;
    switch (b.kind) {
      case PJ_BULLET:
        dead = bullet(s, b);
        break;
      case PJ_EBULLET:
        dead = enemyBullet(s, b);
        break;
      case PJ_MINE:
        dead = mine(s, b);
        break;
      case PJ_BOOMERANG:
        dead = boomerang(s, b);
        break;
      case PJ_RING:
        dead = ring(s, b);
        break;
    }
    if (!dead) {
      b.life--;
      if (b.life <= 0) {
        if (b.kind === PJ_MINE) explode(s, b.x, b.y, b.b, b.damage, b.owner, b.knock);
        dead = true;
      }
    }
    if (dead) removeProjectile(s, i);
  }
}

function bullet(s: GameState, b: Projectile): boolean {
  b.x += b.vx * DT;
  b.y += b.vy * DT;
  if (pointInObstacle(s.map, b.x, b.y)) {
    emit(s, EV_WALL_HIT, b.x, b.y, 0, b.weapon);
    return true;
  }
  const g = s.grid;
  const n = g.query(s.enemies, b.x, b.y, b.r);
  for (let k = 0; k < n; k++) {
    const idx = g.out[k];
    const e = s.enemies[idx];
    if (!e.alive || hasHit(b, e.id)) continue;
    const dx = e.x - b.x;
    const dy = e.y - b.y;
    const rr = b.r + e.r;
    if (dx * dx + dy * dy >= rr * rr) continue;
    addHit(b, e.id);
    const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
    damageEnemy(s, idx, b.damage, b.owner, (b.vx / sp) * b.knock, (b.vy / sp) * b.knock);
    if (b.pierce === 0) return true;
    if (b.pierce > 0) b.pierce--;
  }
  return false;
}

function enemyBullet(s: GameState, b: Projectile): boolean {
  const tf = s.clockUntil > s.tick ? LOOT.clockFactor : 1;
  b.x += b.vx * DT * tf;
  b.y += b.vy * DT * tf;
  if (b.a === 1 && hitByShot(s, b)) {
    emit(s, EV_SHOT_DOWN, b.x, b.y);
    return true;
  }
  if (pointInObstacle(s.map, b.x, b.y)) {
    emit(s, EV_WALL_HIT, b.x, b.y, 1, 0);
    return true;
  }
  for (const p of s.players) {
    if (!p.alive) continue;
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const rr = p.r + b.r;
    if (dx * dx + dy * dy < rr * rr) {
      hurtPlayer(s, p, b.damage);
      return true;
    }
  }
  return false;
}

/** Balle de Tireur touchée par une balle ou un boomerang du joueur ? (une balle sans perforation s'y use) */
function hitByShot(s: GameState, b: Projectile): boolean {
  for (let j = 0; j < s.projCount; j++) {
    const o = s.projectiles[j];
    if ((o.kind !== PJ_BULLET && o.kind !== PJ_BOOMERANG) || o.life <= 0) continue;
    const dx = o.x - b.x;
    const dy = o.y - b.y;
    const rr = o.r + b.r;
    if (dx * dx + dy * dy >= rr * rr) continue;
    if (o.kind === PJ_BULLET) {
      if (o.pierce === 0) o.life = 0;
      else if (o.pierce > 0) o.pierce--;
    }
    return true;
  }
  return false;
}

function mine(s: GameState, b: Projectile): boolean {
  if (b.age < b.a) return false;
  const g = s.grid;
  const n = g.query(s.enemies, b.x, b.y, b.c);
  let trigger = false;
  for (let k = 0; k < n; k++) {
    const e = s.enemies[g.out[k]];
    if (!e.alive || e.flags & EF_PROP) continue;
    const dx = e.x - b.x;
    const dy = e.y - b.y;
    const rr = b.c + e.r;
    if (dx * dx + dy * dy < rr * rr) {
      trigger = true;
      break;
    }
  }
  if (!trigger) return false;
  explode(s, b.x, b.y, b.b, b.damage, b.owner, b.knock);
  return true;
}

function boomerang(s: GameState, b: Projectile): boolean {
  if (b.a === 0) {
    b.d -= b.b * DT;
    if (b.d <= 0) {
      b.a = 1;
      b.d = 0;
      b.hitCount = 0;
    } else {
      b.x += b.vx * b.d * DT;
      b.y += b.vy * b.d * DT;
    }
  } else {
    const o = s.players[b.owner];
    if (!o || !o.alive) return true;
    const dx = o.x - b.x;
    const dy = o.y - b.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 22) return true;
    b.d = Math.min(b.d + b.b * DT * 1.6, 640);
    const step = Math.min(dist, b.d * DT);
    b.vx = dx / dist;
    b.vy = dy / dist;
    b.x += b.vx * step;
    b.y += b.vy * step;
  }

  // Crêpe-rang : sème des mini-crêpes.
  const L = weaponLevel(b.weapon, 1);
  if (L.dropEvery) {
    b.c -= 1;
    if (b.c <= 0) {
      b.c += Math.max(1, Math.round(L.dropEvery * TICK_RATE));
      const o = s.players[b.owner];
      spawnMine(
        s,
        b.owner,
        b.weapon,
        b.x,
        b.y,
        (L.mineDamage ?? 25) * o.stats.might,
        (L.mineRadius ?? 60) * o.stats.area,
        26,
        3 * TICK_RATE,
        8,
        120,
      );
    }
  }

  const g = s.grid;
  const n = g.query(s.enemies, b.x, b.y, b.r);
  for (let k = 0; k < n; k++) {
    const idx = g.out[k];
    const e = s.enemies[idx];
    if (!e.alive || hasHit(b, e.id)) continue;
    const dx = e.x - b.x;
    const dy = e.y - b.y;
    const rr = b.r + e.r;
    if (dx * dx + dy * dy >= rr * rr) continue;
    addHit(b, e.id);
    damageEnemy(s, idx, b.damage, b.owner, b.vx * b.knock, b.vy * b.knock);
  }
  return false;
}

function ring(s: GameState, b: Projectile): boolean {
  if (b.age > b.b) return true;
  const prevR = (b.a * (b.age - 1)) / b.b;
  const rr = (b.a * b.age) / b.b;
  b.r = rr;
  clearShotsIn(s, b.x, b.y, rr);
  const g = s.grid;
  const n = g.query(s.enemies, b.x, b.y, rr);
  for (let k = 0; k < n; k++) {
    const idx = g.out[k];
    const e = s.enemies[idx];
    if (!e.alive) continue;
    const dx = e.x - b.x;
    const dy = e.y - b.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const dd = d - e.r > 0 ? d - e.r : 0;
    if (dd > rr || (dd <= prevR && b.age > 1)) continue;
    const nx = d > 0.001 ? dx / d : 0;
    const ny = d > 0.001 ? dy / d : 0;
    if (b.c > 0 && !(e.flags & EF_BOSS)) e.stunUntil = Math.max(e.stunUntil, s.tick + b.c);
    damageEnemy(s, idx, b.damage, b.owner, nx * b.knock, ny * b.knock);
  }
  return false;
}
