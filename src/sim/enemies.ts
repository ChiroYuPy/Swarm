/**
 * Enemy and boss AI, steering, shape-aware collisions between enemies, the boss arena, contact with players.
 * Movement: each behaviour says where it wants to go; the enemy accelerates toward that velocity (no
 * instant change), turns its facing progressively, and slides along the enemies it brushes against.
 */
import { ENEMIES, type BossConfig, type BossLay, type BossPhaseKind, type EnemyShape } from '../data/enemies';
import { LOOT } from '../data/loot';
import { WAVES } from '../data/waves';
import { DT, TICK_RATE } from './constants';
import { PI, TWO_PI, clamp, dcos, datan2, dsin, turnToward } from './dmath';
import { AVOID, avoidance, circleHitsObstacle, moveCircle, segmentClear } from './map';
import { spawnEnemy, spawnProjectile } from './entities';
import { explode, hurtPlayer, nearestPlayer } from './combat';
import {
  BEHAVIOR,
  BOSS_CONFIGS,
  BOSS_PATTERNS,
  BOSS_SUMMONS,
  EGG_TYPE,
  ENEMY_BEHAVIOR,
  HATCH_INTO,
  WALL_RISE,
  WALL_TYPE,
} from './registry';
import { dmgMul, hpMul, spdMul } from './spawner';
import { deriveSeed } from './rng';
import {
  EF_BOSS,
  EF_PROP,
  EV_CAGE,
  EV_ENEMY_SHOT,
  EV_FUSE,
  EV_HATCH,
  EV_LAND,
  EV_LASER,
  EV_RING_WAVE,
  EV_WALL_HIT,
  PJ_EBULLET,
  PJ_FIRE,
  emit,
  type Enemy,
  type GameState,
  type Player,
} from './state';

const KB_DECAY = 0.82;
/** facing turn rate (radians/s) */
const FACE_TURN = 7;
/** collisions: share of the overlap resolved per tick, cap per neighbour and per tick (units) */
const SEP_SHARE = 0.5;
const SEP_PAIR_MAX = 4;
const SEP_MAX = 6;
/** orbiters veer away from what they brush against (radians/s) */
const VEER = 3;

/** Desired direction (output of the steering functions), without allocation. */
let DX = 0;
let DY = 0;

/** index of the player the navigation field is computed for this tick (-1: none) */
let navPlayer = -1;

/**
 * Direction toward the player: straight if in sight, otherwise following the navigation field
 * (shortest path around obstacles). Local avoidance as a last resort.
 */
function pathDir(s: GameState, e: Enemy, dx: number, dy: number, dist: number): void {
  if (dist < 0.001) {
    DX = 0;
    DY = 0;
    return;
  }
  const ux = dx / dist;
  const uy = dy / dist;
  if (dist < 48 || segmentClear(s.map, e.x, e.y, e.x + dx, e.y + dy, e.r * 0.85)) {
    DX = ux;
    DY = uy;
    return;
  }
  if (e.target === navPlayer && s.nav.dir(e.x, e.y)) {
    DX = s.nav.x;
    DY = s.nav.y;
    return;
  }
  if (avoidance(s.map, e.x, e.y, e.r, ux, uy, Math.min(dist, 110))) {
    const nx = ux * 0.35 + AVOID.x;
    const ny = uy * 0.35 + AVOID.y;
    const l = Math.sqrt(nx * nx + ny * ny) || 1;
    DX = nx / l;
    DY = ny / l;
    return;
  }
  DX = ux;
  DY = uy;
}

/**
 * Outline of each shape, for collisions: a regular polygon (sides, circumradius × radius, angle of a vertex
 * in the facing frame) or a disc (sides 0). The diamond has its own formula.
 */
const OUTLINE: Record<EnemyShape, [number, number, number]> = {
  triangle: [3, 1.15, 0],
  dart: [3, 1.15, 0],
  diamond: [0, 1, 0],
  square: [4, 1.24, PI / 4],
  pentagon: [5, 1, 0],
  hexagon: [6, 1, PI / 6],
  octagon: [8, 1, PI / 8],
  circle: [0, 1, 0],
  dot: [0, 1, 0],
  bomb: [0, 1, 0],
  box: [0, 1, 0],
  trapezoid: [0, 1, 0],
  star: [0, 1, 0],
  eye: [0, 1, 0],
  queen: [0, 1, 0],
  block: [0, 1, 0],
  egg: [0, 1, 0],
};
const OUT_SIDES = ENEMIES.map((d) => (d.shape === 'diamond' ? -1 : OUTLINE[d.shape][0]));
const OUT_R = ENEMIES.map((d) => OUTLINE[d.shape][1] * d.radius);
const OUT_A0 = ENEMIES.map((d) => OUTLINE[d.shape][2]);
/** inradius / circumradius of a regular n-gon, for n = 0..8 */
const IN_K = [1, 1, 1, 1, 1, 1, 1, 1, 1].map((v, n) => (n >= 3 ? dcos(PI / n) : v));
/** widest outline over the radius (collision broad phase) */
const OUT_MAX = 1.3;

/** Distance from an enemy's centre to its outline in the world direction (nx, ny) (unit). */
function extent(e: Enemy, nx: number, ny: number): number {
  const sides = OUT_SIDES[e.type];
  if (sides === 0) return e.r;
  let fx = e.vx;
  let fy = e.vy;
  if (fx === 0 && fy === 0) fx = 1;
  // the direction in the enemy's own frame (facing = +x)
  const c = nx * fx + ny * fy;
  const sn = ny * fx - nx * fy;
  if (sides < 0) return 1 / (Math.abs(c) / (e.r * 1.25) + Math.abs(sn) / (e.r * 0.8));
  const phi = datan2(sn, c);
  const step = TWO_PI / sides;
  const a0 = OUT_A0[e.type];
  const k = Math.round((phi - a0 - step / 2) / step);
  const face = a0 + step / 2 + k * step;
  return (OUT_R[e.type] * IN_K[sides]) / Math.max(0.2, dcos(phi - face));
}

/** Deterministic value in [0, 1) for an enemy's own random choices (flight radius, hop side...). */
function enemyRand(s: GameState, e: Enemy, salt: number): number {
  return deriveSeed(s.seed, salt, e.id, s.tick) / 4294967296;
}

/** `breakable`: Shooter bullet, which the player's weapons can destroy (b.a = 1). */
function fireEnemyBullet(s: GameState, x: number, y: number, angle: number, speed: number, damage: number, breakable = false): void {
  const b = spawnProjectile(s);
  if (!b) return;
  b.kind = PJ_EBULLET;
  b.owner = -1;
  b.a = breakable ? 1 : 0;
  b.x = b.px = x;
  b.y = b.py = y;
  b.vx = dcos(angle) * speed;
  b.vy = dsin(angle) * speed;
  b.r = 6;
  b.damage = damage;
  b.life = 4 * TICK_RATE;
}

/** Keeps its distance: approaches, backs off, or circles the player between `keepMin` and `keepMax`. */
function keepAway(s: GameState, e: Enemy, dx: number, dy: number, dist: number, keepMin: number, keepMax: number): void {
  if (dist > keepMax) pathDir(s, e, dx, dy, dist);
  else if (dist < keepMin) {
    DX = -dx / dist;
    DY = -dy / dist;
  } else {
    const side = e.id & 1 ? 1 : -1;
    DX = (-dy / dist) * side * 0.8;
    DY = (dx / dist) * side * 0.8;
  }
}

/** Shooter: keeps to its band, sliding sideways (`ax`: side, flipped every few seconds, `ay`: ticks before the flip). */
function shooterMove(s: GameState, e: Enemy, dx: number, dy: number, dist: number, keepMin: number, keepMax: number): void {
  if (dist > keepMax + 60) {
    pathDir(s, e, dx, dy, dist);
    return;
  }
  if (e.ax === 0) {
    e.ax = e.id & 1 ? 1 : -1;
    e.ay = Math.round((2 + 2 * enemyRand(s, e, 0x73747266)) * TICK_RATE);
  }
  if (--e.ay <= 0) {
    e.ax = -e.ax;
    e.ay = Math.round((2 + 2 * enemyRand(s, e, 0x73747266)) * TICK_RATE);
  }
  const ux = dx / dist;
  const uy = dy / dist;
  const mid = (keepMin + keepMax) / 2;
  const want = clamp((dist - mid) / ((keepMax - keepMin) / 2), -1, 1);
  const side = 0.45 * e.ax;
  DX = ux * want - uy * side;
  DY = uy * want + ux * side;
}

/**
 * Orbiter flight (data/enemies.ts EnemyFlight). ai: 0 new, 1 circling, 2 diving, 3 pulling out.
 * aux = heading, aux2 = flight speed, ax = circle radius, ay = side (±1), timer = ticks before the dive
 * (circling) or in the state (diving, pulling out). Sets the velocity directly.
 */
function fly(s: GameState, e: Enemy, p: Player, dx: number, dy: number, dist: number, speed: number, tf: number): void {
  const f = ENEMIES[e.type].fly!;
  if (e.ai === 0) {
    e.ay = e.id & 1 ? 1 : -1;
    e.aux = datan2(dy, dx) + e.ay * 1.2;
    e.aux2 = e.speed * 0.7;
    e.ax = f.orbit * (0.9 + 0.25 * enemyRand(s, e, 0x6f726231));
    e.timer = Math.round((f.waitMin + (f.waitMax - f.waitMin) * enemyRand(s, e, 0x6f726232)) * TICK_RATE);
    e.ai = 1;
  }
  // angle from the player to it
  const phi = datan2(-dy, -dx);
  let want = e.aux;
  let wantV = e.speed;
  let turn = f.turn;
  if (e.ai === 1) {
    e.timer -= tf;
    e.ax = Math.max(f.orbit * 0.6, e.ax - f.tighten * DT * tf);
    const err = clamp(((dist - e.ax) / e.ax) * 1.4, -0.9, 0.9);
    want = phi + e.ay * (PI / 2 + err);
    if (e.timer <= 0) {
      e.ai = 2;
      e.timer = 0;
    }
  } else if (e.ai === 2) {
    // it lines up first (slowing down to turn), then dives straight: fast, but it cannot follow a dodge
    want = datan2(dy, dx);
    let off = want - e.aux;
    while (off > PI) off -= TWO_PI;
    while (off < -PI) off += TWO_PI;
    wantV = Math.abs(off) < 0.35 ? f.dive : e.speed * 0.6;
    turn = f.turn * 1.15;
    e.timer += tf;
    if (dist < e.r + p.r + 4 || e.timer > 2.6 * TICK_RATE) {
      e.ai = 3;
      e.timer = 0;
    }
  } else {
    // carries on past the player and swings back out to the circle
    want = phi + e.ay * 0.6;
    wantV = f.dive * 0.75;
    e.timer += tf;
    if (dist > e.ax && e.timer > 0.5 * TICK_RATE) backToCircle(s, e);
  }
  if (speed <= 0) wantV = 0;
  e.aux = turnToward(e.aux, want, turn * DT * tf);
  e.aux2 += clamp(wantV - e.aux2, -f.accel * DT * tf, f.accel * DT * tf);
  // slowed: it flies slower, by the same factor
  const k = e.speed > 0 ? speed / e.speed : 0;
  e.mvx = dcos(e.aux) * e.aux2 * k;
  e.mvy = dsin(e.aux) * e.aux2 * k;
}

/** Orbiter: back to circling, at a new radius, for a new wait. */
function backToCircle(s: GameState, e: Enemy): void {
  const f = ENEMIES[e.type].fly!;
  e.ai = 1;
  e.ax = f.orbit * (0.9 + 0.25 * enemyRand(s, e, 0x6f726231));
  e.timer = Math.round((f.waitMin + (f.waitMax - f.waitMin) * enemyRand(s, e, 0x6f726232)) * TICK_RATE);
}

/**
 * Orbiter against something it cannot fly over (the arena ring), (nx, ny) pointing away from it:
 * it glances off along it instead of pressing into it, and stops swinging out if that is where it was going.
 */
function flyerBlocked(s: GameState, e: Enemy, nx: number, ny: number): void {
  const hx = dcos(e.aux);
  const hy = dsin(e.aux);
  const dot = hx * nx + hy * ny;
  if (dot >= 0) return;
  const tx = hx - dot * nx;
  const ty = hy - dot * ny;
  e.aux = tx * tx + ty * ty > 1e-6 ? datan2(ty, tx) : e.aux + PI / 2;
  if (e.ai === 3) backToCircle(s, e);
}

/** Jumper states (ai). */
const HOP_WALK = 0;
const HOP_CROUCH = 1;
const HOP_AIR = 2;
const HOP_REST = 3;
const HOP_CROUCH_BACK = 4;
const HOP_AIR_BACK = 5;
const HOP_REST_BACK = 6;

/**
 * Jumper (data/enemies.ts EnemyHop): `ax, ay` = landing spot, `aux, aux2` = take-off spot, timer = ticks
 * left in the state (walking: before the next attack). Returns false while it walks (normal movement),
 * true when it moves by itself (crouching, in the air, resting).
 */
function hop(s: GameState, e: Enemy, p: Player, dx: number, dy: number, dist: number, stunned: boolean, tf: number): boolean {
  const d = ENEMIES[e.type];
  const h = d.hop!;
  const ticks = (sec: number) => Math.max(1, Math.round(sec * TICK_RATE));
  switch (e.ai) {
    case HOP_WALK: {
      // keeps its distance, then jumps at the player's spot
      if (dist > h.range * 0.8) pathDir(s, e, dx, dy, dist);
      else if (dist < h.range * 0.62) {
        DX = -dx / dist;
        DY = -dy / dist;
      }
      e.timer -= tf;
      if (e.timer <= 0 && dist < h.range && !stunned && !circleHitsObstacle(s.map, p.x, p.y, e.r)) {
        e.ai = HOP_CROUCH;
        e.ax = p.x;
        e.ay = p.y;
        e.timer = ticks(h.crouch);
        emit(s, EV_FUSE, p.x, p.y, 2, e.type);
      }
      return false;
    }
    case HOP_CROUCH:
    case HOP_CROUCH_BACK:
      e.timer -= tf;
      e.vx = e.ax - e.x;
      e.vy = e.ay - e.y;
      {
        const l = Math.sqrt(e.vx * e.vx + e.vy * e.vy) || 1;
        e.vx /= l;
        e.vy /= l;
      }
      if (e.timer <= 0) {
        e.ai = e.ai === HOP_CROUCH ? HOP_AIR : HOP_AIR_BACK;
        e.aux = e.x;
        e.aux2 = e.y;
        e.timer = ticks(h.air);
      }
      return true;
    case HOP_AIR:
    case HOP_AIR_BACK: {
      e.timer -= tf;
      const air = ticks(h.air);
      const k = Math.min(1, 1 - e.timer / air);
      e.x = e.aux + (e.ax - e.aux) * k;
      e.y = e.aux2 + (e.ay - e.aux2) * k;
      if (e.timer <= 0) {
        const R = d.blastRadius ?? 40;
        if (e.ai === HOP_AIR) {
          // the landing: the only moment it hurts
          const dmg = (d.blastDamage ?? 10) * dmgMul(s);
          for (const q of s.players) {
            if (!q.alive) continue;
            const qx = q.x - e.x;
            const qy = q.y - e.y;
            const rr = R + q.r;
            if (qx * qx + qy * qy < rr * rr) hurtPlayer(s, q, dmg);
          }
        }
        emit(s, EV_LAND, e.x, e.y, e.ai === HOP_AIR ? R : 0, e.type);
        e.ai = e.ai === HOP_AIR ? HOP_REST : HOP_REST_BACK;
        e.timer = ticks(h.rest);
      }
      return true;
    }
    case HOP_REST:
      e.timer -= tf;
      if (e.timer <= 0) {
        // hops away, to one side or the other
        const side = enemyRand(s, e, 0x686f7031) < 0.5 ? 1 : -1;
        const a0 = datan2(-dy, -dx) + side * (0.9 + 0.5 * enemyRand(s, e, 0x686f7032));
        let tx = e.x + dcos(a0) * h.away;
        let ty = e.y + dsin(a0) * h.away;
        if (circleHitsObstacle(s.map, tx, ty, e.r)) {
          tx = e.x - (dx / dist) * h.away;
          ty = e.y - (dy / dist) * h.away;
          if (circleHitsObstacle(s.map, tx, ty, e.r)) {
            tx = e.x;
            ty = e.y;
          }
        }
        e.ai = HOP_CROUCH_BACK;
        e.ax = tx;
        e.ay = ty;
        e.timer = ticks(h.crouchBack);
      }
      return true;
    default:
      e.timer -= tf;
      if (e.timer <= 0) {
        e.ai = HOP_WALK;
        e.timer = ticks(h.every);
      }
      return true;
  }
}

/** Is this enemy in the air (a jumping Jumper): no collisions, no contact. */
function airborne(e: Enemy): boolean {
  return ENEMY_BEHAVIOR[e.type] === BEHAVIOR.JUMPER && (e.ai === HOP_AIR || e.ai === HOP_AIR_BACK);
}

/** Turns the facing (vx, vy) toward the unit vector (tx, ty), at most `step` radians. */
function turnFacing(e: Enemy, tx: number, ty: number, step: number): void {
  let fx = e.vx;
  let fy = e.vy;
  if (fx === 0 && fy === 0) {
    e.vx = tx;
    e.vy = ty;
    return;
  }
  const dot = fx * tx + fy * ty;
  if (dot >= dcos(step)) {
    e.vx = tx;
    e.vy = ty;
    return;
  }
  const c = dcos(step);
  const sn = (fx * ty - fy * tx > 0 ? 1 : -1) * dsin(step);
  const nx = fx * c - fy * sn;
  const ny = fx * sn + fy * c;
  const l = Math.sqrt(nx * nx + ny * ny) || 1;
  fx = nx / l;
  fy = ny / l;
  e.vx = fx;
  e.vy = fy;
}

export function updateEnemies(s: GameState): void {
  const tick = s.tick;
  const grid = s.grid;
  const cols = grid.cols;
  const rows = grid.rows;
  const enemies = s.enemies;
  const lost2 = WAVES.lostDistance * WAVES.lostDistance;
  const despawn2 = WAVES.props.despawn * WAVES.props.despawn;
  // Clock: the whole rest of the world runs in slow motion (movement and timers).
  const tf = s.clockUntil > tick ? LOOT.clockFactor : 1;
  navPlayer = -1;
  for (const p of s.players) {
    if (!p.alive) continue;
    s.nav.update(s.map, p.x, p.y);
    navPlayer = p.index;
    break;
  }

  for (let i = 0; i < s.enemyCount; i++) {
    const e = enemies[i];
    if (!e.alive) continue;
    e.px = e.x;
    e.py = e.y;
    const beh = ENEMY_BEHAVIOR[e.type];
    if (beh === BEHAVIOR.PROP) {
      // Crate left far behind: it disappears (infinite world).
      const pi = nearestPlayer(s, e.x, e.y);
      if (pi >= 0) {
        const q = s.players[pi];
        const ddx = q.x - e.x;
        const ddy = q.y - e.y;
        if (ddx * ddx + ddy * ddy > despawn2) e.alive = false;
      }
      continue;
    }
    if (beh === BEHAVIOR.WALL) {
      // Wall: it rises (not solid yet), holds, then falls on its own.
      e.timer -= tf;
      if (e.ai === 0 && e.timer <= e.aux) e.ai = 1;
      if (e.timer <= 0) e.alive = false;
      continue;
    }
    if (beh === BEHAVIOR.EGG) {
      if (e.frozenUntil > tick) continue;
      e.timer -= tf;
      if (e.timer <= 0) hatch(s, e);
      continue;
    }
    // Frozen: locked in place (including its fuse and its shots).
    if (e.frozenUntil > tick) continue;

    let ti = e.target;
    if (!s.players[ti] || !s.players[ti].alive) {
      ti = nearestPlayer(s, e.x, e.y);
      if (ti < 0) continue;
      e.target = ti;
    }
    const p = s.players[ti];
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;
    const dist = Math.sqrt(d2);

    if (beh === BEHAVIOR.BOSS) {
      updateBoss(s, e, p, dx, dy, dist, tf);
      continue;
    }
    if (d2 > lost2) {
      // Lost: far from every player, it disappears (no gem, no score). Otherwise it switches target.
      const ni = nearestPlayer(s, e.x, e.y);
      const q = s.players[ni];
      if (ni === ti || (q.x - e.x) * (q.x - e.x) + (q.y - e.y) * (q.y - e.y) > lost2) {
        e.alive = false;
        continue;
      }
      e.target = ni;
    }

    const d = ENEMIES[e.type];
    let speed = e.speed;
    if (e.slowUntil > tick) speed *= 1 - e.slowFactor;
    const stunned = e.stunUntil > tick;
    if (stunned) speed = 0;

    DX = 0;
    DY = 0;
    /** the behaviour sets the velocity itself (flight), or moves the enemy itself (a Jumper's hop) */
    let direct = false;
    let selfMoved = false;
    switch (beh) {
      case BEHAVIOR.CHASER:
        pathDir(s, e, dx, dy, dist);
        break;
      case BEHAVIOR.SWARM: {
        pathDir(s, e, dx, dy, dist);
        const w = dsin(tick * 0.12 + e.id * 1.7) * 0.6;
        const nx = DX - DY * w;
        const ny = DY + DX * w;
        const nl = Math.sqrt(nx * nx + ny * ny);
        if (nl > 0.001) {
          DX = nx / nl;
          DY = ny / nl;
        }
        break;
      }
      case BEHAVIOR.SHOOTER: {
        shooterMove(s, e, dx, dy, dist, d.keepMin ?? 240, d.keepMax ?? 340);
        // It turns toward you little by little (aux = its heading) and only shoots straight ahead.
        if (e.ai === 0) {
          e.aux = datan2(dy, dx);
          e.ai = 1;
        }
        const want = datan2(dy, dx);
        if (!stunned) e.aux = turnToward(e.aux, want, SHOOTER_TURN * DT * tf);
        e.timer -= tf;
        if (e.timer <= 0) {
          let off = want - e.aux;
          while (off > PI) off -= TWO_PI;
          while (off < -PI) off += TWO_PI;
          if (dist < 560 && !stunned && Math.abs(off) < SHOOTER_CONE) {
            const a = e.aux;
            fireEnemyBullet(s, e.x, e.y, a, d.bulletSpeed ?? 190, (d.bulletDamage ?? 8) * dmgMul(s), true);
            emit(s, EV_ENEMY_SHOT, e.x, e.y, 0, e.type);
            e.timer = Math.round((d.shootEvery ?? 2.6) * TICK_RATE);
          } else {
            e.timer = dist < 560 && !stunned ? 1 : 20;
          }
        }
        break;
      }
      case BEHAVIOR.KAMIKAZE: {
        if (e.ai === 0) {
          pathDir(s, e, dx, dy, dist);
          if (dist < (d.triggerRange ?? 64)) {
            e.ai = 1;
            e.timer = Math.round((d.fuse ?? 0.7) * TICK_RATE);
            emit(s, EV_FUSE, e.x, e.y, 0, e.type);
          }
        } else {
          speed = 0;
          e.timer -= tf;
          if (e.timer <= 0) {
            e.alive = false;
            e.hp = 0;
            explode(s, e.x, e.y, d.blastRadius ?? 85, (d.blastDamage ?? 20) * 1.5, ti, 200, (d.blastDamage ?? 20) * dmgMul(s));
            continue;
          }
        }
        break;
      }
      case BEHAVIOR.ORBITER:
        fly(s, e, p, dx, dy, dist, speed, tf);
        direct = true;
        break;
      case BEHAVIOR.JUMPER:
        selfMoved = hop(s, e, p, dx, dy, dist, stunned, tf);
        break;
      default: {
        const unhandled: never = beh;
        throw new Error(`Unhandled enemy behavior ${unhandled}`);
      }
    }

    if (selfMoved) {
      // crouching, in the air or resting: it does not walk (knockback still pushes it on the ground)
      e.mvx = 0;
      e.mvy = 0;
      if (!airborne(e) && (e.kbx !== 0 || e.kby !== 0)) {
        moveCircle(s.map, e, e.kbx * tf * DT, e.kby * tf * DT, e.r);
      }
      e.kbx *= KB_DECAY;
      e.kby *= KB_DECAY;
      keepInArena(s, e, e);
      continue;
    }

    // Steering: accelerate toward the wanted velocity, with limited acceleration (stunned: stops dead).
    if (!direct) {
      if (stunned) {
        e.mvx = 0;
        e.mvy = 0;
      } else {
        const acc = (d.accel ?? Math.max(170, e.speed * 3)) * DT;
        let ax = DX * speed - e.mvx;
        let ay = DY * speed - e.mvy;
        const al = Math.sqrt(ax * ax + ay * ay);
        if (al > acc) {
          ax *= acc / al;
          ay *= acc / al;
        }
        e.mvx += ax;
        e.mvy += ay;
      }
    }

    // Collisions with neighbouring enemies (grid built at the start of the tick), along their real outlines:
    // overlaps are pushed apart (the lighter one moves more), the speed that drives into the other one is
    // dropped and the sideways one kept, so they graze and slide instead of stopping dead.
    let sx = 0;
    let sy = 0;
    // solid walls: get fully pushed out of them
    let hx = 0;
    let hy = 0;
    let checks = 0;
    const flyer = beh === BEHAVIOR.ORBITER;
    const me = e.r * e.r;
    const ccx = Math.min(cols - 1, Math.max(0, Math.floor((e.x - grid.ox) / 64)));
    const ccy = Math.min(rows - 1, Math.max(0, Math.floor((e.y - grid.oy) / 64)));
    for (let oy = -1; oy <= 1 && checks < 14; oy++) {
      const cy = ccy + oy;
      if (cy < 0 || cy >= rows) continue;
      for (let ox = -1; ox <= 1 && checks < 14; ox++) {
        const cx = ccx + ox;
        if (cx < 0 || cx >= cols) continue;
        const c = cy * cols + cx;
        const st = grid.cellStart[c];
        const en = grid.cellStart[c + 1];
        for (let k = st; k < en; k++) {
          const j = grid.items[k];
          if (j === i) continue;
          const o = enemies[j];
          if (!o.alive) continue;
          const ddx = e.x - o.x;
          const ddy = e.y - o.y;
          const dd = ddx * ddx + ddy * ddy;
          if (o.type === WALL_TYPE) {
            // (flyers go over the boss walls, as over the obstacles)
            const rr = e.r + o.r;
            if (!flyer && o.ai === 1 && dd < rr * rr && dd > 0.0001) {
              const dl = Math.sqrt(dd);
              hx += (ddx / dl) * (rr - dl);
              hy += (ddy / dl) * (rr - dl);
            }
            continue;
          }
          const rr = (e.r + o.r) * OUT_MAX;
          if (dd >= rr * rr || airborne(o) || o.flags & EF_PROP) continue;
          checks++;
          if (dd < 0.0001) {
            sx += e.id < o.id ? 1 : -1;
            continue;
          }
          const dl = Math.sqrt(dd);
          // n: from the other one toward this one
          const nx = ddx / dl;
          const ny = ddy / dl;
          const over = extent(e, -nx, -ny) + extent(o, nx, ny) - dl;
          if (over <= 0) continue;
          const mo = o.r * o.r;
          const w = o.kbResist >= 0.95 ? 1 : mo / (me + mo);
          const push = Math.min(SEP_PAIR_MAX, over * SEP_SHARE) * w;
          sx += nx * push;
          sy += ny * push;
          const into = -(e.mvx * nx + e.mvy * ny);
          if (into > 0) {
            const k2 = Math.min(1, 2 * w);
            e.mvx += nx * into * k2;
            e.mvy += ny * into * k2;
          }
          if (flyer && -(dcos(e.aux) * nx + dsin(e.aux) * ny) > 0) {
            // heading toward it: veer off to the side it is not on
            e.aux += (dcos(e.aux) * ny - dsin(e.aux) * nx > 0 ? 1 : -1) * VEER * DT * tf;
          }
          if (checks >= 14) break;
        }
      }
    }
    const sl = Math.sqrt(sx * sx + sy * sy);
    if (sl > SEP_MAX) {
      sx *= SEP_MAX / sl;
      sy *= SEP_MAX / sl;
    }

    const vx = (e.mvx + e.kbx) * tf;
    const vy = (e.mvy + e.kby) * tf;
    if (flyer) {
      // it flies over the obstacles and the boss walls, not over the arena ring: it glances off it
      e.x += vx * DT + sx;
      e.y += vy * DT + sy;
      const bx = e.x;
      const by = e.y;
      keepInArena(s, e, e);
      if (e.x !== bx || e.y !== by) {
        const ax = s.arenaX - e.x;
        const ay = s.arenaY - e.y;
        const al = Math.sqrt(ax * ax + ay * ay) || 1;
        flyerBlocked(s, e, ax / al, ay / al);
      }
    } else {
      moveCircle(s.map, e, vx * DT + sx + hx, vy * DT + sy + hy, e.r);
      keepInArena(s, e, e);
    }
    e.kbx *= KB_DECAY;
    e.kby *= KB_DECAY;
    if (beh === BEHAVIOR.SHOOTER) {
      // The Shooter faces where it aims, not where it walks.
      e.vx = dcos(e.aux);
      e.vy = dsin(e.aux);
    } else {
      const v2 = e.mvx * e.mvx + e.mvy * e.mvy;
      if (v2 > 36) {
        const vl = Math.sqrt(v2);
        turnFacing(e, e.mvx / vl, e.mvy / vl, (flyer ? FACE_TURN * 2 : FACE_TURN) * DT * tf);
      }
    }
  }
}

/** Shooter turn speed (radians per second) and half-angle within which it shoots */
const SHOOTER_TURN = 2.2;
const SHOOTER_CONE = 0.12;

/** Desired boss velocity this tick (output of the phases). */
let VX = 0;
let VY = 0;

/**
 * Boss: a looping sequence of phases (data/enemies.ts). Each phase has an entry (aim, cage,
 * reinforcements…) and a per-tick behavior, and reads its parameter groups from the config of the
 * boss running it (present: checked by the registry at load). The boss hovers over obstacles.
 */
function updateBoss(s: GameState, e: Enemy, p: Player, dx: number, dy: number, dist: number, tf: number): void {
  const cfg = BOSS_CONFIGS[e.type]!;
  const pat = cfg.pattern;
  if (e.timer <= 0) {
    e.ai = (e.ai + 1) % pat.length;
    e.timer = Math.round(pat[e.ai].duration * TICK_RATE);
    enterPhase(s, e, cfg, pat[e.ai].kind, p, dx, dy);
  }
  e.timer -= 1;
  const ph = pat[e.ai];
  const total = Math.round(ph.duration * TICK_RATE);
  const elapsed = total - e.timer;
  const stunned = e.stunUntil > s.tick;
  const dm = dmgMul(s);
  VX = 0;
  VY = 0;
  switch (ph.kind) {
    case 'chase':
      if (dist > 1 && !stunned) {
        VX = (dx / dist) * e.speed;
        VY = (dy / dist) * e.speed;
      }
      break;
    case 'spiral': {
      const c = cfg.spiral!;
      const b = cfg.bullets!;
      const every = Math.max(1, Math.round(c.every * TICK_RATE));
      if (elapsed % every === 0) {
        const arms = c.arms + (c.armsPerBoss ?? 0) * e.aux2;
        for (let k = 0; k < arms; k++) fireEnemyBullet(s, e.x, e.y, e.aux + (k * TWO_PI) / arms, b.speed, b.damage * dm);
        e.aux += c.turn;
        if (elapsed % (every * 3) === 0) emit(s, EV_ENEMY_SHOT, e.x, e.y, 1, e.type);
      }
      break;
    }
    case 'charge': {
      // Warning line, then it charges to the end of the line (e.ax: distance travelled).
      const c = cfg.charge!;
      if (elapsed >= Math.round(c.telegraph * TICK_RATE) && e.ax < c.length) {
        VX = dcos(e.aux) * c.speed;
        VY = dsin(e.aux) * c.speed;
        e.ax += c.speed * DT * tf;
      }
      break;
    }
    case 'volley': {
      const v = cfg.volley!;
      const b = cfg.bullets!;
      const every = Math.round(v.every * TICK_RATE);
      if ((elapsed - 1) % every === 0) {
        const a = datan2(dy, dx);
        const n = v.count;
        for (let k = 0; k < n; k++) {
          fireEnemyBullet(s, e.x, e.y, a + (k - (n - 1) / 2) * v.spread, b.speed, b.damage * dm);
        }
        emit(s, EV_ENEMY_SHOT, e.x, e.y, 1, e.type);
      }
      break;
    }
    case 'dash':
      dash(s, e, cfg, elapsed, dm);
      break;
    case 'burst':
      if (elapsed === 1 || elapsed === total >> 1) {
        const b = cfg.bullets!;
        const n = cfg.burst!.arms;
        const off = elapsed === 1 ? 0 : PI / n;
        for (let k = 0; k < n; k++) fireEnemyBullet(s, e.x, e.y, off + (k * TWO_PI) / n, b.speed, b.damage * dm);
        emit(s, EV_ENEMY_SHOT, e.x, e.y, 1, e.type);
      }
      break;
    case 'watch': {
      const w = cfg.watch!;
      const b = cfg.bullets!;
      if (!stunned) {
        keepAway(s, e, dx, dy, dist, w.keepMin, w.keepMax);
        VX = DX * e.speed;
        VY = DY * e.speed;
      }
      const every = Math.round(w.shootEvery * TICK_RATE);
      if (elapsed % every === 0 && dist < 600) {
        fireEnemyBullet(s, e.x, e.y, datan2(dy, dx), b.speed, b.damage * dm);
        emit(s, EV_ENEMY_SHOT, e.x, e.y, 0, e.type);
      }
      break;
    }
    case 'sweep':
      sweep(s, e, cfg, elapsed / total, dm);
      break;
    case 'flee':
      if (!stunned) {
        const f = cfg.flee!;
        keepAway(s, e, dx, dy, dist, f.keepMin, f.keepMax);
        VX = DX * e.speed;
        VY = DY * e.speed;
      }
      break;
    case 'summon':
    case 'build':
    case 'aim':
    case 'focus':
    case 'lay':
      // motionless (everything happens on phase entry)
      break;
    default: {
      const unhandled: never = ph.kind;
      throw new Error(`Unhandled boss phase ${unhandled}`);
    }
  }
  // Clock: its phases go on, but it crawls.
  e.x += VX * DT * tf;
  e.y += VY * DT * tf;
  keepInArena(s, e);
  if (VX !== 0 || VY !== 0) {
    const l = Math.sqrt(VX * VX + VY * VY);
    e.vx = VX / l;
    e.vy = VY / l;
  }
}

function enterPhase(s: GameState, e: Enemy, cfg: BossConfig, kind: BossPhaseKind, p: Player, dx: number, dy: number): void {
  switch (kind) {
    case 'charge':
      e.aux = datan2(dy, dx);
      e.ax = 0;
      break;
    case 'summon':
      summon(s, e, p);
      break;
    case 'build':
      buildCage(s, e, cfg, p);
      break;
    case 'aim':
      // Dash direction, and bounce box centred on the player.
      e.aux = datan2(dy, dx);
      e.ax = p.x;
      e.ay = p.y;
      break;
    case 'focus': {
      // The cone goes from one edge to the other through the player, one way then the other.
      const arc = cfg.laser!.arc;
      const c = datan2(dy, dx);
      const dir = e.ai & 2 ? -1 : 1;
      e.ax = c - (dir * arc) / 2;
      e.ay = c + (dir * arc) / 2;
      e.aux = e.ax;
      break;
    }
    case 'sweep':
      e.aux = e.ax;
      emit(s, EV_LASER, e.x, e.y, 0, e.type);
      break;
    case 'lay': {
      const l = cfg.lay!;
      const b = cfg.bullets!;
      layEggs(s, e, l);
      const a = datan2(dy, dx);
      const n = l.volleyCount;
      for (let k = 0; k < n; k++) {
        fireEnemyBullet(s, e.x, e.y, a + (k - (n - 1) / 2) * l.volleySpread, b.speed, b.damage * dmgMul(s));
      }
      emit(s, EV_ENEMY_SHOT, e.x, e.y, 1, e.type);
      break;
    }
    case 'chase':
    case 'spiral':
    case 'volley':
    case 'dash':
    case 'burst':
    case 'watch':
    case 'flee':
      // nothing on entry
      break;
    default: {
      const unhandled: never = kind;
      throw new Error(`Unhandled boss phase ${unhandled}`);
    }
  }
}

/** Dash (Ricochet star): bounces off the edges of its box, drops flames. */
function dash(s: GameState, e: Enemy, cfg: BossConfig, elapsed: number, dm: number): void {
  const d = cfg.dash!;
  const H = d.box;
  let ux = dcos(e.aux);
  let uy = dsin(e.aux);
  if ((e.x - e.ax > H && ux > 0) || (e.x - e.ax < -H && ux < 0)) {
    e.aux = PI - e.aux;
    ux = -ux;
    emit(s, EV_WALL_HIT, e.x, e.y, 2, e.type);
  }
  if ((e.y - e.ay > H && uy > 0) || (e.y - e.ay < -H && uy < 0)) {
    e.aux = -e.aux;
    uy = -uy;
    emit(s, EV_WALL_HIT, e.x, e.y, 2, e.type);
  }
  // the arena wall bounces it too
  if (s.arenaR > 0) {
    const ox = e.x - s.arenaX;
    const oy = e.y - s.arenaY;
    const od = Math.sqrt(ox * ox + oy * oy);
    if (od > s.arenaR - e.r - 2 && od > 0.001 && ux * ox + uy * oy > 0) {
      const nx = ox / od;
      const ny = oy / od;
      const dot = ux * nx + uy * ny;
      ux -= 2 * dot * nx;
      uy -= 2 * dot * ny;
      e.aux = datan2(uy, ux);
      emit(s, EV_WALL_HIT, e.x, e.y, 2, e.type);
    }
  }
  VX = ux * d.speed;
  VY = uy * d.speed;
  if (elapsed % d.fireEvery === 0) {
    const b = spawnProjectile(s);
    if (!b) return;
    b.kind = PJ_FIRE;
    b.owner = -1;
    b.x = b.px = e.x;
    b.y = b.py = e.y;
    b.vx = b.vy = 0;
    b.r = d.fireRadius;
    b.a = d.fireDps * dm;
    b.life = Math.round(d.fireLife * TICK_RATE);
  }
}

/** Sweep (Laser eye): the beam turns from e.ax to e.ay; it hurts whoever is on it (once, thanks to invulnerability). */
function sweep(s: GameState, e: Enemy, cfg: BossConfig, f: number, dm: number): void {
  const L = cfg.laser!;
  e.aux = e.ax + (e.ay - e.ax) * Math.min(1, f);
  const ux = dcos(e.aux);
  const uy = dsin(e.aux);
  for (const q of s.players) {
    if (!q.alive) continue;
    const qx = q.x - e.x;
    const qy = q.y - e.y;
    const along = qx * ux + qy * uy;
    const perp = Math.abs(qy * ux - qx * uy);
    if (along > 0 && along < L.length + q.r && perp < L.width / 2 + q.r) hurtPlayer(s, q, L.damage * dm);
  }
}

/**
 * Build (Builder hexagon): a hexagonal cage of walls around the player (they rise, then become solid),
 * one cycle in `cage.every`, with an exit in the middle of two opposite sides. `ax` = cages already attempted.
 */
function buildCage(s: GameState, e: Enemy, cfg: BossConfig, p: Player): void {
  const c = cfg.cage!;
  e.ax++;
  if ((e.ax - 1) % c.every !== 0) return;
  const R = c.radius;
  const n = Math.max(1, Math.round(R / c.wallSpacing));
  const life = Math.round(c.wallLife * TICK_RATE);
  const solid = Math.round((c.wallLife - WALL_RISE) * TICK_RATE);
  const hm = hpMul(s);
  // The exits change sides from one cage to the next.
  const gapSide = ((e.ax - 1) / c.every) % 3;
  const g0 = Math.floor((n - c.gapWalls) / 2) + 1;
  for (let side = 0; side < 6; side++) {
    const a0 = (side * PI) / 3 + PI / 6;
    const a1 = a0 + PI / 3;
    const x0 = p.x + dcos(a0) * R;
    const y0 = p.y + dsin(a0) * R;
    const x1 = p.x + dcos(a1) * R;
    const y1 = p.y + dsin(a1) * R;
    for (let j = 0; j < n; j++) {
      if (side % 3 === gapSide && j >= g0 && j < g0 + c.gapWalls) continue;
      const x = x0 + ((x1 - x0) * j) / n;
      const y = y0 + ((y1 - y0) * j) / n;
      if (circleHitsObstacle(s.map, x, y, 4)) continue;
      const w = spawnEnemy(s, WALL_TYPE, x, y, hm, 1, 1, e.target);
      if (!w) return;
      w.timer = life;
      w.aux = solid;
    }
  }
  emit(s, EV_CAGE, p.x, p.y, R, e.type);
}

/** Lay (Swarm queen): an egg (three now and then) where it stands. */
function layEggs(s: GameState, e: Enemy, l: BossLay): void {
  if (s.sandbox && !s.sandbox.summons) return;
  let eggs = 0;
  for (let i = 0; i < s.enemyCount; i++) if (s.enemies[i].alive && s.enemies[i].type === EGG_TYPE) eggs++;
  // ay = layings already done (aux is used by the dart spiral)
  e.ay++;
  const n = Math.min(l.maxEggs - eggs, e.ay % l.bigEvery === 0 ? 3 : 1);
  const hm = hpMul(s);
  for (let k = 0; k < n; k++) {
    const a = (k * TWO_PI) / 3 + e.ay;
    const egg = spawnEnemy(s, EGG_TYPE, e.x + (n > 1 ? dcos(a) * 34 : 0), e.y + (n > 1 ? dsin(a) * 34 : 0), hm, 1, 1, e.target);
    if (!egg) return;
    egg.timer = Math.round(l.hatchAfter * TICK_RATE) + k * 12;
  }
}

/** Egg: it hatches into its `hatchInto` type (the Swarm queen's eggs: Swarm). */
function hatch(s: GameState, egg: Enemy): void {
  egg.alive = false;
  egg.hp = 0;
  const d = ENEMIES[egg.type];
  const into = HATCH_INTO[egg.type];
  const n = into < 0 ? 0 : (d.hatchCount ?? 0);
  for (let k = 0; k < n; k++) {
    const a = (k * TWO_PI) / n;
    spawnEnemy(s, into, egg.x + dcos(a) * 12, egg.y + dsin(a) * 12, hpMul(s) * (d.hatchHp ?? 1), dmgMul(s), spdMul(s), egg.target);
  }
  emit(s, EV_HATCH, egg.x, egg.y, n);
}

/** Reinforcements: a big pack of a single type, unless there are already plenty (the boss must stay hittable). */
function summon(s: GameState, boss: Enemy, p: Player): void {
  const sm = BOSS_SUMMONS[boss.type];
  if (!sm || (s.sandbox && !s.sandbox.summons)) return;
  let alive = 0;
  for (let i = 0; i < s.enemyCount; i++) {
    const o = s.enemies[i];
    if (o.alive && !(o.flags & (EF_BOSS | EF_PROP)) && o.type !== WALL_TYPE) alive++;
  }
  const n = Math.min(sm.maxAlive - alive, sm.count + sm.perBoss * boss.aux2);
  if (n <= 0) return;
  const self = sm.around === 'self';
  const cx = self ? boss.x : p.x;
  const cy = self ? boss.y : p.y;
  const R = self ? boss.r + sm.radius : sm.radius;
  const r = ENEMIES[sm.typeId].radius;
  for (let k = 0; k < n; k++) {
    const a = (k * TWO_PI) / n + PI / n;
    const x = cx + dcos(a) * R;
    const y = cy + dsin(a) * R;
    if (circleHitsObstacle(s.map, x, y, r)) continue;
    spawnEnemy(s, sm.typeId, x, y, hpMul(s) * (sm.hp ?? 1), dmgMul(s), spdMul(s), boss.target);
  }
  if (!self) emit(s, EV_RING_WAVE, p.x, p.y, n);
}

/** Boss contact damage: much stronger when it rushes (charge, dash), as set by its own config. */
function bossContactMul(e: Enemy): number {
  const kind = BOSS_PATTERNS[e.type][e.ai]?.kind;
  if (kind === 'charge') {
    const c = BOSS_CONFIGS[e.type]!.charge!;
    if (e.ax > 0 && e.ax < c.length) return c.damage;
  }
  if (kind === 'dash') return BOSS_CONFIGS[e.type]!.dash!.damage;
  return 1;
}

/**
 * Boss arena: keeps a player or an enemy inside the ring (sliding along it). Nothing while it is open.
 * Outward speed is dropped so nothing presses into the wall.
 */
export function keepInArena(s: GameState, o: { x: number; y: number; r: number; alive: boolean }, v?: Enemy): void {
  const R = s.arenaR;
  if (R <= 0 || !o.alive) return;
  const dx = o.x - s.arenaX;
  const dy = o.y - s.arenaY;
  const lim = R - o.r;
  const d2 = dx * dx + dy * dy;
  if (d2 <= lim * lim) return;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  o.x = s.arenaX + nx * lim;
  o.y = s.arenaY + ny * lim;
  if (v) {
    const out = v.mvx * nx + v.mvy * ny;
    if (out > 0) {
      v.mvx -= nx * out;
      v.mvy -= ny * out;
    }
    const kb = v.kbx * nx + v.kby * ny;
    if (kb > 0) {
      v.kbx -= nx * kb;
      v.kby -= ny * kb;
    }
  }
}

/** The Builder hexagon's walls block players (sliding along, as against an obstacle). */
export function pushOutOfWalls(s: GameState, p: Player): void {
  if (!p.alive) return;
  for (let i = 0; i < s.enemyCount; i++) {
    const w = s.enemies[i];
    if (!w.alive || w.type !== WALL_TYPE || w.ai !== 1) continue;
    const dx = p.x - w.x;
    const dy = p.y - w.y;
    const rr = p.r + w.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2);
    if (d < 0.001) moveCircle(s.map, p, rr, 0, p.r);
    else moveCircle(s.map, p, (dx / d) * (rr - d), (dy / d) * (rr - d), p.r);
  }
}

/** Enemy -> player contact damage. */
export function updateContacts(s: GameState): void {
  const tick = s.tick;
  const grid = s.grid;
  for (const p of s.players) {
    if (!p.alive) continue;
    const n = grid.query(s.enemies, p.x, p.y, p.r);
    const out = grid.out;
    for (let k = 0; k < n; k++) {
      const e = s.enemies[out[k]];
      if (!e.alive || e.dmg <= 0 || e.attackReady > tick || e.frozenUntil > tick) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const rr = e.r + p.r;
      if (dx * dx + dy * dy >= rr * rr) continue;
      if (!hurtPlayer(s, p, e.flags & EF_BOSS ? e.dmg * bossContactMul(e) : e.dmg)) continue;
      e.attackReady = tick + 30;
      if (!p.alive) break;
    }
  }
}
