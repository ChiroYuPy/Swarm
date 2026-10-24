/** Projectile update: bullets, enemy bullets, mines, boomerangs, waves. */
import { DT, MAX_WEAPON_SLOTS, TICK_RATE } from './constants';
import { LOOT } from '../data/loot';
import { clearShotsIn } from './shots';
import { pointInObstacle } from './map';
import { TWO_PI, datan2, dcos, dsin, turnToward } from './dmath';
import { removeProjectile } from './entities';
import { damageEnemy, explode, hurtPlayer } from './combat';
import { weaponLevel } from './registry';
import { DRONE_LIFE, huntTarget, spawnBlaze, spawnBullet, spawnDisc, spawnMine, spawnRing, ticks } from './weapons';
import {
  EF_BOSS,
  EF_PROP,
  EV_SHOT_DOWN,
  EV_WALL_HIT,
  EV_EXPLOSION,
  PJ_BOOMERANG,
  PJ_BULLET,
  PJ_EBULLET,
  PJ_MINE,
  PJ_RING,
  PJ_FIRE,
  PJ_BLAZE,
  PJ_DRONE,
  PJ_PHOENIX,
  PJ_RICOCHET,
  PJ_SHELL,
  PJ_TURRET,
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
      case PJ_TURRET:
        dead = turret(s, b);
        break;
      case PJ_RICOCHET:
        dead = ricochet(s, b);
        break;
      case PJ_BLAZE:
        blaze(s, b);
        break;
      case PJ_DRONE:
        dead = droneAgent(s, b);
        break;
      case PJ_SHELL:
        dead = shell(s, b);
        break;
      case PJ_PHOENIX:
        dead = phoenix(s, b);
        break;
      default:
        // Exhaustive: a ProjectileKind without its case fails to typecheck here.
        b.kind satisfies never;
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
    if ((o.kind !== PJ_BULLET && o.kind !== PJ_BOOMERANG && o.kind !== PJ_RICOCHET && o.kind !== PJ_PHOENIX) || o.life <= 0) continue;
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

/** Player's ground fire (Meteor crater, Phoenix trail): burns the enemies on it, in small ticks. */
function blaze(s: GameState, b: Projectile): void {
  if ((s.tick + b.age) % FIRE_TICK !== 0) return;
  const g = s.grid;
  const n = g.query(s.enemies, b.x, b.y, b.r);
  const dmg = (b.a * FIRE_TICK) / TICK_RATE;
  for (let k = 0; k < n; k++) {
    const idx = g.out[k];
    if (s.enemies[idx].alive) damageEnemy(s, idx, dmg, b.owner, 0, 0, true);
  }
}

/** Turret: aims at the nearest enemy in range and shoots; the Bastion also releases knockback waves. */
function turret(s: GameState, b: Projectile): boolean {
  const o = s.players[b.owner];
  if (!o || !o.alive) return true;
  const L = weaponLevel(b.weapon, b.lv);
  b.a -= 1;
  if (b.a <= 0) {
    const ti = s.grid.nearest(s.enemies, b.x, b.y, L.range ?? 320, undefined, 0, true);
    if (ti < 0) b.a = 6;
    else {
      const e = s.enemies[ti];
      const ang = datan2(e.y - b.y, e.x - b.x);
      b.vx = dcos(ang);
      b.vy = dsin(ang);
      const nb = L.burstCount ?? 1;
      const spread = L.spread ?? 0;
      // Bullets go just a bit further than the turret's range.
      const life = Math.max(1, Math.round((((L.range ?? 320) + 60) / (L.speed ?? 520)) * TICK_RATE));
      for (let k = 0; k < nb; k++) {
        const t = spawnBullet(s, o, b.slot, b.weapon, ang + (k - (nb - 1) / 2) * spread, L, b.x + b.vx * 12, b.y + b.vy * 12);
        if (t) t.life = life;
      }
      b.a += Math.max(1, Math.round((L.fireEvery ?? 0.45) * o.stats.cooldownMul * TICK_RATE));
    }
  }
  if (L.ringEvery) {
    b.d -= 1;
    if (b.d <= 0) {
      b.d += Math.max(1, Math.round(L.ringEvery * TICK_RATE));
      spawnRing(s, o, b.slot, b.weapon, b.x, b.y, L);
    }
  }
  return false;
}

/** Ricochet disc: bounces off obstacles, and from enemy to enemy. `a` = bounces left. */
function ricochet(s: GameState, b: Projectile): boolean {
  // Homing: targets the nearest not-yet-hit enemy and steers toward it.
  const g0 = s.grid;
  if ((b.age & 3) === 1 || !validTarget(s, b)) {
    b.c = g0.nearest(s.enemies, b.x, b.y, RICOCHET_SEEK, b.hitIds, b.hitCount < 8 ? b.hitCount : 8, true);
    if (b.c >= 0) b.ty = s.enemies[b.c].id;
  }
  if (b.c >= 0) steer(b, s.enemies[b.c].x, s.enemies[b.c].y, RICOCHET_STEER);
  const nx = b.x + b.vx * DT;
  const ny = b.y + b.vy * DT;
  if (pointInObstacle(s.map, nx, ny)) {
    if (!pointInObstacle(s.map, nx, b.y)) b.vy = -b.vy;
    else if (!pointInObstacle(s.map, b.x, ny)) b.vx = -b.vx;
    else {
      b.vx = -b.vx;
      b.vy = -b.vy;
    }
    emit(s, EV_WALL_HIT, b.x, b.y, 0, b.weapon);
    return --b.a < 0;
  }
  b.x = nx;
  b.y = ny;
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
    if (--b.a < 0) return true;
    // Bounce deflected toward the nearest not-yet-hit enemy (only halfway: it can miss it).
    const t = g.nearest(s.enemies, b.x, b.y, RICOCHET_SEEK, b.hitIds, b.hitCount < 8 ? b.hitCount : 8, true);
    b.c = t;
    if (t >= 0) {
      b.ty = s.enemies[t].id;
      steer(b, s.enemies[t].x, s.enemies[t].y, RICOCHET_BOUNCE);
    }
    break;
  }
  return false;
}
/** homing range, turn share per step in flight, and deflection when bouncing off an enemy */
const RICOCHET_SEEK = 190;
const RICOCHET_STEER = 0.06;
const RICOCHET_BOUNCE = 0.55;

/** Is the tracked target (index `c`, id `ty`) still the same one and alive? */
function validTarget(s: GameState, b: Projectile): boolean {
  if (b.c < 0 || b.c >= s.enemyCount) return false;
  const e = s.enemies[b.c];
  return e.alive && e.id === b.ty;
}

/** Steers the velocity toward (x, y) without changing its magnitude; `k` = turn share per step (0..1). */
function steer(b: Projectile, x: number, y: number, k: number): void {
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (sp < 1e-6) return;
  const dx = x - b.x;
  const dy = y - b.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) return;
  const vx = (b.vx / sp) * (1 - k) + (dx / d) * k;
  const vy = (b.vy / sp) * (1 - k) + (dy / d) * k;
  const n = Math.sqrt(vx * vx + vy * vy) || 1;
  b.vx = (vx / n) * sp;
  b.vy = (vy / n) * sp;
}

/** Weapon of player `o` that created this projectile (null if it is gone: evolution, swap). */
function ownerWeapon(o: Player, def: number): WeaponInst | null {
  for (const w of o.weapons) if (w.def === def) return w;
  return null;
}

/**
 * Autonomous drone: it goes hunting a target (nuisances first, except kamikazes which charge into the pack),
 * avoiding those your other drones already target. It flies like a plane: it only turns while moving forward
 * and only shoots ahead. Drone: strafing passes, then it breaks away and comes back. Squadron (`orbit`): it circles
 * its target at a distance and launches its homing discs straight ahead. Shot down on contact with enemies,
 * it respawns near you. `tx` = break-away ticks left after a pass.
 */
function droneAgent(s: GameState, b: Projectile): boolean {
  const o = s.players[b.owner];
  if (!o || !o.alive) return true;
  const w = ownerWeapon(o, b.weapon);
  if (!w) return true;
  const L = weaponLevel(b.weapon, w.level);
  b.life = DRONE_LIFE;
  const range = L.range ?? 520;
  const lx = b.x - o.x;
  const ly = b.y - o.y;
  const leashed = lx * lx + ly * ly > DRONE_LEASH * DRONE_LEASH;
  if (leashed) b.c = -1;
  else if (b.age % 30 === 0 || !validTarget(s, b)) {
    // Targets are searched around you, avoiding the other drones' ones.
    b.c = huntTarget(s, o.x, o.y, range, !L.dive, CLAIMED, claimTargets(s, b));
    if (b.c >= 0) b.ty = s.enemies[b.c].id;
    b.tx = 0;
  }
  const speed = L.speed ?? 260;
  const e = b.c >= 0 && validTarget(s, b) ? s.enemies[b.c] : null;
  if (!e) b.c = -1;
  const sp0 = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  const heading = sp0 > 1e-6 ? datan2(b.vy, b.vx) : 0;
  let want = speed;
  let desired: number;
  if (e && b.tx > 0) {
    // Break-away: it veers off its target at an angle before coming back for a new pass.
    b.tx--;
    desired = heading + (b.d & 1 ? 1 : -1);
  } else if (e && L.orbit) {
    // Aims at a point on the circle around the target, slightly ahead of itself: it circles around.
    const keep = (L.attackRange ?? 280) * 0.7;
    const a = datan2(b.y - e.y, b.x - e.x) + (b.d & 1 ? 0.6 : -0.6);
    desired = datan2(e.y + dsin(a) * keep - b.y, e.x + dcos(a) * keep - b.x);
  } else if (e) {
    const ex = e.x - b.x;
    const ey = e.y - b.y;
    desired = datan2(ey, ex);
    const brk = (L.attackRange ?? 180) * 0.4 + e.r;
    if (!L.dive && ex * ex + ey * ey < brk * brk) b.tx = DRONE_BREAK;
  } else {
    // Patrol: it circles around you.
    const a = b.age * 0.025 + b.d * 1.9;
    desired = datan2(o.y + dsin(a) * 70 - b.y, o.x + dcos(a) * 70 - b.x);
    want = speed * 0.6;
  }
  if (leashed) want = speed * 1.6;
  // Spacing from your other drones: they do not pile up in the same spot.
  let sx = 0;
  let sy = 0;
  for (let j = 0; j < s.projCount; j++) {
    const q = s.projectiles[j];
    if (q === b || q.kind !== PJ_DRONE || q.owner !== b.owner) continue;
    const qx = b.x - q.x;
    const qy = b.y - q.y;
    const d2 = qx * qx + qy * qy;
    if (d2 >= DRONE_SPACING * DRONE_SPACING || d2 < 1e-6) continue;
    const d = Math.sqrt(d2);
    const k = (DRONE_SPACING - d) / (DRONE_SPACING * d);
    sx += qx * k;
    sy += qy * k;
  }
  if (sx !== 0 || sy !== 0) {
    const dvx = dcos(desired) + sx * 1.5;
    const dvy = dsin(desired) + sy * 1.5;
    desired = datan2(dvy, dvx);
  }
  // Limited turn rate, and never stopped: it must move forward to turn.
  const h = turnToward(heading, desired, (L.turn ?? 3.2) * DT);
  const sp = Math.max(speed * 0.4, sp0 + (want - sp0) * 0.08);
  b.vx = dcos(h) * sp;
  b.vy = dsin(h) * sp;
  b.x += b.vx * DT;
  b.y += b.vy * DT;

  if (L.dive) {
    // Kamikaze: a bomb that explodes on contact, then it respawns near you.
    if (!e) return false;
    const ex = e.x - b.x;
    const ey = e.y - b.y;
    const rr = e.r + 14;
    if (ex * ex + ey * ey > rr * rr) return false;
    explode(s, b.x, b.y, (L.radius ?? 150) * o.stats.area, L.damage * o.stats.might, b.owner, L.knockback ?? 260);
    w.burstTimer = ticks(L.respawn, 1.6);
    return true;
  }

  // Shooting: only if the target is ahead of it, in range (when orbiting, its homing discs catch up with it).
  b.a -= 1;
  if (b.a <= 0 && e) {
    const ex = e.x - b.x;
    const ey = e.y - b.y;
    const reach = L.attackRange ?? 180;
    const ang = datan2(ey, ex);
    let diff = ang - h;
    while (diff > Math.PI) diff -= TWO_PI;
    while (diff < -Math.PI) diff += TWO_PI;
    if (ex * ex + ey * ey <= reach * reach && (L.orbit || Math.abs(diff) < DRONE_CONE)) {
      if (L.bounces) spawnDisc(s, o, b.slot, b.weapon, b.x, b.y, L.orbit ? h : ang, L);
      else {
        const t = spawnBullet(s, o, b.slot, b.weapon, ang, L, b.x, b.y);
        if (t) t.life = Math.max(1, Math.round(((reach + 60) / (L.shotSpeed ?? 600)) * TICK_RATE));
      }
      b.a = Math.max(1, Math.round((L.cooldown ?? 0.7) * o.stats.cooldownMul * TICK_RATE));
    } else b.a = 2;
  }

  // On contact with enemies, it takes damage.
  const g = s.grid;
  const n = g.query(s.enemies, b.x, b.y, b.r);
  for (let k = 0; k < n; k++) {
    const en = s.enemies[g.out[k]];
    if (!en.alive || en.dmg <= 0 || en.speed === 0) continue;
    const ox = en.x - b.x;
    const oy = en.y - b.y;
    const rr = en.r + b.r;
    if (ox * ox + oy * oy < rr * rr) b.b -= en.dmg * DT * 2;
  }
  if (b.b <= 0) {
    emit(s, EV_EXPLOSION, b.x, b.y, 20, 0);
    w.burstTimer = ticks(L.respawn, 3);
    return true;
  }
  return false;
}
/** beyond this distance from the player, a drone comes back */
const DRONE_LEASH = 650;
/** break-away duration after a strafing pass */
const DRONE_BREAK = 30;
/** half-angle of the firing cone, ahead of the drone */
const DRONE_CONE = 0.3;
/** distance below which two drones move apart */
const DRONE_SPACING = 46;

/** Ids of the targets already claimed by the same player's other drones. */
const CLAIMED = new Int32Array(32);
function claimTargets(s: GameState, self: Projectile): number {
  let n = 0;
  for (let j = 0; j < s.projCount && n < CLAIMED.length; j++) {
    const q = s.projectiles[j];
    if (q === self || q.kind !== PJ_DRONE || q.owner !== self.owner || q.c < 0) continue;
    CLAIMED[n++] = q.ty;
  }
  return n;
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

/**
 * Phoenix: a firebird launched along the line picked by weapons/phoenix.ts, which then flies straight through
 * the horde without ever turning. It burns every enemy it touches (at most once per `hitCd`) and leaves a
 * trail of fire on the ground. (vx, vy) = heading.
 */
function phoenix(s: GameState, b: Projectile): boolean {
  const o = s.players[b.owner];
  if (!o || !o.alive) return true;
  const L = weaponLevel(b.weapon, 1);
  const key = b.owner * MAX_WEAPON_SLOTS + (b.slot % MAX_WEAPON_SLOTS);
  const g = s.grid;
  const sp = L.speed ?? 470;
  b.x += b.vx * sp * DT;
  b.y += b.vy * sp * DT;
  if (b.age % PHOENIX_TRAIL === 0) {
    spawnBlaze(
      s,
      b.owner,
      b.weapon,
      b.x,
      b.y,
      (L.blazeRadius ?? 28) * o.stats.area,
      (L.blazeDamage ?? 18) * o.stats.might,
      ticks(L.blazeLife, 1.8),
    );
  }
  const hitCd = Math.round((L.hitCd ?? 0.35) * TICK_RATE);
  const n = g.query(s.enemies, b.x, b.y, b.r);
  for (let k = 0; k < n; k++) {
    const idx = g.out[k];
    const e = s.enemies[idx];
    if (!e.alive || e.immune[key] > s.tick) continue;
    const ex = e.x - b.x;
    const ey = e.y - b.y;
    const rr = b.r + e.r;
    if (ex * ex + ey * ey >= rr * rr) continue;
    e.immune[key] = s.tick + hitCd;
    damageEnemy(s, idx, b.damage, b.owner, b.vx * b.knock, b.vy * b.knock);
  }
  return false;
}
/** one fire puddle every N ticks behind the Phoenix */
const PHOENIX_TRAIL = 9;

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

  // Mine boomerang: drops mini mines along the way.
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
    if (b.d > 0) {
      e.slowFactor = e.slowUntil > s.tick ? Math.max(e.slowFactor, b.d) : b.d;
      e.slowUntil = Math.max(e.slowUntil, s.tick + b.tx);
    }
    damageEnemy(s, idx, b.damage, b.owner, nx * b.knock, ny * b.knock);
  }
  return false;
}
