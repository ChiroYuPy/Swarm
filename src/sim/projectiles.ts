/** Projectile update: bullets, enemy bullets, mines, boomerangs, waves, shurikens, bees, shells, ground fire. */
import { DT, MAX_WEAPON_SLOTS, TICK_RATE } from './constants';
import { LOOT } from '../data/loot';
import { clearShotsIn } from './shots';
import { pointInObstacle } from './map';
import { PI, TWO_PI, datan2, dcos, dsin } from './dmath';
import { removeProjectile } from './entities';
import { damageEnemy, explode, hurtPlayer } from './combat';
import { weaponLevel } from './registry';
import {
  BEE_DEAD,
  BEE_GO,
  BEE_HOME,
  BEE_IDLE,
  BEE_LIFE,
  BEE_RING,
  BEE_STUCK,
  RING_FADE,
  SHURIKEN_BOX_X,
  SHURIKEN_BOX_Y,
  beeTarget,
  ringAngle,
  spawnBlaze,
  spawnMine,
  ticks,
} from './weapons';
import {
  EF_BOSS,
  EF_PROP,
  EV_SHOT_DOWN,
  EV_WALL_HIT,
  DMG_FIRE,
  PJ_BEE,
  PJ_BOOMERANG,
  PJ_BULLET,
  PJ_EBULLET,
  PJ_MINE,
  PJ_RING,
  PJ_FIRE,
  PJ_BLAZE,
  PJ_SHELL,
  PJ_SHURIKEN,
  emit,
  type GameState,
  type Player,
  type Projectile,
  type WeaponInst,
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
    // Destroyed during the step (Shooter bullet shot down, player bullet spent on it).
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
      case PJ_FIRE:
        fire(s, b);
        break;
      case PJ_SHURIKEN:
        dead = shuriken(s, b);
        break;
      case PJ_BLAZE:
        blaze(s, b);
        break;
      case PJ_BEE:
        dead = bee(s, b);
        break;
      case PJ_SHELL:
        dead = shell(s, b);
        break;
      default:
        // Exhaustive: a ProjectileKind without its case fails to typecheck here.
        b.kind satisfies never;
    }
    if (!dead) {
      b.life--;
      if (b.life <= 0) {
        if (b.kind === PJ_MINE) mineBlast(s, b);
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

/** Ground flame (Ricochet star): burns whoever stays on it, in small ticks (no invulnerability). */
const FIRE_TICK = 10;
function fire(s: GameState, b: Projectile): void {
  if (s.tick % FIRE_TICK !== 0) return;
  for (const p of s.players) {
    if (!p.alive) continue;
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const rr = b.r + p.r * 0.5;
    if (dx * dx + dy * dy < rr * rr) hurtPlayer(s, p, (b.a * FIRE_TICK) / TICK_RATE, true);
  }
}

/** Shooter bullet hit by a player bullet or boomerang? (a non-piercing bullet is spent on it) */
function hitByShot(s: GameState, b: Projectile): boolean {
  for (let j = 0; j < s.projCount; j++) {
    const o = s.projectiles[j];
    if ((o.kind !== PJ_BULLET && o.kind !== PJ_BOOMERANG && o.kind !== PJ_SHURIKEN) || o.life <= 0) continue;
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

/** Player's ground fire (Meteor crater): burns the enemies on it, in small ticks. */
function blaze(s: GameState, b: Projectile): void {
  if ((s.tick + b.age) % FIRE_TICK !== 0) return;
  const g = s.grid;
  const n = g.query(s.enemies, b.x, b.y, b.r);
  const dmg = (b.a * FIRE_TICK) / TICK_RATE;
  for (let k = 0; k < n; k++) {
    const idx = g.out[k];
    if (s.enemies[idx].alive) damageEnemy(s, idx, dmg, b.owner, 0, 0, true, DMG_FIRE);
  }
}


/** Weapon of player `o` that created this projectile (null if it is gone: evolution, swap). */
function ownerWeapon(o: Player, def: number): WeaponInst | null {
  for (const w of o.weapons) if (w.def === def) return w;
  return null;
}

/** Index of the enemy a bee tracks (index `c`, id `ty`), found again by id if the pool moved it; -1 if it is gone. */
function trackTarget(s: GameState, b: Projectile): number {
  if (b.c < 0) return -1;
  if (b.c < s.enemyCount && s.enemies[b.c].alive && s.enemies[b.c].id === b.ty) return b.c;
  for (let k = 0; k < s.enemyCount; k++) {
    const e = s.enemies[k];
    if (e.alive && e.id === b.ty) return (b.c = k);
  }
  return (b.c = -1);
}

/** Shuriken: flies straight, bounces off the edges of the screen box around its player, cuts what it crosses. */
function shuriken(s: GameState, b: Projectile): boolean {
  const o = s.players[b.owner];
  if (!o || !o.alive) return true;
  b.x += b.vx * DT;
  b.y += b.vy * DT;
  if (b.x > o.x + SHURIKEN_BOX_X || b.x < o.x - SHURIKEN_BOX_X) {
    b.vx = b.x > o.x ? -Math.abs(b.vx) : Math.abs(b.vx);
    b.x = b.x > o.x ? o.x + SHURIKEN_BOX_X : o.x - SHURIKEN_BOX_X;
  }
  if (b.y > o.y + SHURIKEN_BOX_Y || b.y < o.y - SHURIKEN_BOX_Y) {
    b.vy = b.y > o.y ? -Math.abs(b.vy) : Math.abs(b.vy);
    b.y = b.y > o.y ? o.y + SHURIKEN_BOX_Y : o.y - SHURIKEN_BOX_Y;
  }
  const w = ownerWeapon(o, b.weapon);
  const hitCd = Math.round((w ? (weaponLevel(b.weapon, w.level).hitCd ?? 0.3) : 0.3) * TICK_RATE);
  const key = b.owner * MAX_WEAPON_SLOTS + (b.slot % MAX_WEAPON_SLOTS);
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
  const g = s.grid;
  const n = g.query(s.enemies, b.x, b.y, b.r);
  for (let k = 0; k < n; k++) {
    const idx = g.out[k];
    const e = s.enemies[idx];
    if (!e.alive || e.immune[key] > s.tick) continue;
    const dx = e.x - b.x;
    const dy = e.y - b.y;
    const rr = b.r + e.r;
    if (dx * dx + dy * dy >= rr * rr) continue;
    e.immune[key] = s.tick + hitCd;
    damageEnemy(s, idx, b.damage, b.owner, (b.vx / sp) * b.knock, (b.vy / sp) * b.knock);
  }
  return false;
}

/** Steers a bee toward (x, y): limited turn rate, and it slows down in tight turns (small curves, no big loops). */
function steerBee(b: Projectile, x: number, y: number, speed: number, turn: number): void {
  const want = datan2(y - b.y, x - b.x);
  let d = want - b.tx;
  while (d > PI) d -= TWO_PI;
  while (d < -PI) d += TWO_PI;
  b.tx += d > turn ? turn : d < -turn ? -turn : d;
  const c = dcos(d);
  const sp = speed * (0.45 + 0.55 * (c > 0 ? c : 0));
  b.x += dcos(b.tx) * sp * DT;
  b.y += dsin(b.tx) * sp * DT;
}

/** a waiting bee looks for a target this often (ticks) */
const BEE_LOOK = 18;
/** a bee chasing a target that gets this much further than the range comes back */
const BEE_LEASH = 1.25;

/**
 * Bee (Swarm, Hornets): see weapons/swarm.ts. It waits in its slot of the ring around the player, darts at
 * its target, plants itself in it (or explodes, for hornets), dies and comes back to its slot after a while.
 */
function bee(s: GameState, b: Projectile): boolean {
  const o = s.players[b.owner];
  if (!o || !o.alive) return true;
  const w = ownerWeapon(o, b.weapon);
  if (!w) return true;
  const L = weaponLevel(b.weapon, w.level);
  b.life = BEE_LIFE;
  const n = Math.min(16, L.count ?? 3);
  if (b.d >= n) return true;
  const ra = ringAngle(s, b.d, n);
  const sx = o.x + dcos(ra) * BEE_RING;
  const sy = o.y + dsin(ra) * BEE_RING;
  const speed = L.speed ?? 275;
  const turn = (L.turn ?? 11) * DT;
  const range = L.range ?? 300;
  switch (b.a) {
    case BEE_DEAD:
      if (--b.b > 0) return false;
      b.a = BEE_IDLE;
      b.x = b.px = sx;
      b.y = b.py = sy;
      b.tx = ra + PI / 2;
      b.b = 12;
      b.age = 0;
      return false;
    case BEE_IDLE: {
      const k = Math.min(1, 8 * DT);
      b.x += (sx - b.x) * k;
      b.y += (sy - b.y) * k;
      b.tx = ra + PI / 2;
      if (--b.b > 0) return false;
      b.b = BEE_LOOK;
      const t = beeTarget(s, b, o.x, o.y, range);
      if (t >= 0) {
        b.a = BEE_GO;
        b.c = t;
        b.ty = s.enemies[t].id;
      }
      return false;
    }
    case BEE_HOME: {
      steerBee(b, sx, sy, speed, turn);
      const dx = sx - b.x;
      const dy = sy - b.y;
      if (dx * dx + dy * dy < 100) {
        b.a = BEE_IDLE;
        b.b = 6;
      }
      return false;
    }
    case BEE_GO: {
      const t = trackTarget(s, b);
      const e = t >= 0 ? s.enemies[t] : null;
      const lim = range * BEE_LEASH;
      if (!e || (e.x - o.x) * (e.x - o.x) + (e.y - o.y) * (e.y - o.y) > lim * lim) {
        b.a = BEE_HOME;
        b.c = b.ty = -1;
        return false;
      }
      steerBee(b, e.x, e.y, speed, turn);
      const dx = e.x - b.x;
      const dy = e.y - b.y;
      const rr = e.r + 4;
      if (dx * dx + dy * dy > rr * rr) return false;
      if (L.dive) {
        explode(s, b.x, b.y, (L.radius ?? 110) * o.stats.area, L.damage * o.stats.might, b.owner, L.knockback ?? 220);
        beeDies(b, L);
        return false;
      }
      b.a = BEE_STUCK;
      b.vx = b.x - e.x;
      b.vy = b.y - e.y;
      b.b = ticks(L.stay, 1.5);
      return false;
    }
    case BEE_STUCK: {
      const t = trackTarget(s, b);
      if (t >= 0) {
        const e = s.enemies[t];
        b.x = e.x + b.vx;
        b.y = e.y + b.vy;
        const tk = ticks(L.tick, 0.3);
        if (b.b % tk === 0) damageEnemy(s, t, L.damage * o.stats.might * (tk / TICK_RATE), b.owner, 0, 0);
      }
      if (--b.b <= 0 || t < 0 || !s.enemies[t].alive) beeDies(b, L);
      return false;
    }
  }
  return false;
}

function beeDies(b: Projectile, L: { respawn?: number }): void {
  b.a = BEE_DEAD;
  b.b = ticks(L.respawn, 0.8);
  b.c = b.ty = -1;
}

/** Shell: flies to its target and explodes (burning crater for a meteor). */
function shell(s: GameState, b: Projectile): boolean {
  if (b.age < b.a) {
    const t = b.age / b.a;
    b.x = b.vx + (b.tx - b.vx) * t;
    b.y = b.vy + (b.ty - b.vy) * t;
    return false;
  }
  b.x = b.tx;
  b.y = b.ty;
  explode(s, b.x, b.y, b.b, b.damage, b.owner, b.knock);
  const o = s.players[b.owner];
  if (b.c === 1 && o) {
    const L = weaponLevel(b.weapon, 1);
    spawnBlaze(
      s,
      b.owner,
      b.weapon,
      b.x,
      b.y,
      (L.blazeRadius ?? 50) * o.stats.area,
      (L.blazeDamage ?? 16) * o.stats.might,
      ticks(L.blazeLife, 2),
    );
  }
  return true;
}

/** a mine caught in another one's blast goes off this many ticks later (the chain reaction is visible) */
const CHAIN_TICKS = 6;

/** Mine: armed after `a` ticks, goes off when an enemy enters its trigger radius, or when a blast sets it off. */
function mine(s: GameState, b: Projectile): boolean {
  if (b.d > 0) {
    if (--b.d > 0) return false;
    mineBlast(s, b);
    return true;
  }
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
  mineBlast(s, b);
  return true;
}

/** A mine explodes and sets off the same player's other mines inside its blast. */
function mineBlast(s: GameState, b: Projectile): void {
  explode(s, b.x, b.y, b.b, b.damage, b.owner, b.knock);
  for (let j = 0; j < s.projCount; j++) {
    const o = s.projectiles[j];
    if (o === b || o.kind !== PJ_MINE || o.owner !== b.owner || o.d > 0 || o.life <= 0) continue;
    const dx = o.x - b.x;
    const dy = o.y - b.y;
    if (dx * dx + dy * dy <= b.b * b.b) o.d = CHAIN_TICKS;
  }
}

/**
 * Boomerang: out along (vx, vy) for `b` ticks, fast at the throw and slowing down to a stop at range `d`, then
 * back to where the player is now, mirroring the way out (slow start, back to full speed when it arrives).
 * (tx, ty) = start point, then the turning point. Each way hits an enemy once.
 */
function boomerang(s: GameState, b: Projectile): boolean {
  const o = s.players[b.owner];
  if (!o || !o.alive) return true;
  if (b.a === 0) {
    const k = b.age / b.b;
    if (k >= 1) {
      b.a = 1;
      b.tx = b.x;
      b.ty = b.y;
      b.hitCount = 0;
    } else {
      const f = dsin((k * PI) / 2);
      b.x = b.tx + b.vx * b.d * f;
      b.y = b.ty + b.vy * b.d * f;
    }
  }
  if (b.a === 1) {
    const k = (b.age - b.b) / b.b;
    if (k >= 1) return true;
    const f = 1 - dcos((k * PI) / 2);
    b.x = b.tx + (o.x - b.tx) * f;
    b.y = b.ty + (o.y - b.ty) * f;
  }

  // Mine boomerang: drops mini mines along the way.
  const L = weaponLevel(b.weapon, 1);
  if (L.dropEvery) {
    b.c -= 1;
    if (b.c <= 0) {
      b.c += Math.max(1, Math.round(L.dropEvery * TICK_RATE));
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

  const mx = b.x - b.px;
  const my = b.y - b.py;
  const ml = Math.sqrt(mx * mx + my * my) || 1;
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
    damageEnemy(s, idx, b.damage, b.owner, (mx / ml) * b.knock, (my / ml) * b.knock);
  }
  return false;
}

/**
 * Shockwave: grows to its radius `a` in `b` ticks, hurting and pushing each enemy once as the front reaches it,
 * then keeps growing a little while it fades (no more effect).
 */
function ring(s: GameState, b: Projectile): boolean {
  if (b.age > b.b) {
    b.r = b.a * (1 + (0.85 * (b.age - b.b)) / b.b);
    return b.age > b.b * (1 + RING_FADE);
  }
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
    if (b.d > 0) {
      e.slowFactor = e.slowUntil > s.tick ? Math.max(e.slowFactor, b.d) : b.d;
      e.slowUntil = Math.max(e.slowUntil, s.tick + b.tx);
    }
    damageEnemy(s, idx, b.damage, b.owner, nx * b.knock, ny * b.knock);
  }
  return false;
}
