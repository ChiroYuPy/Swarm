/** Enemy and boss AI, separation, contact with players. */
import { TRAPEZOID_BOSS, ENEMIES, RICOCHET_STAR_BOSS, BUILDER_HEXAGON_BOSS, LASER_EYE_BOSS, SWARM_QUEEN_BOSS, type BossPhaseKind } from '../data/enemies';
import { LOOT } from '../data/loot';
import { WAVES } from '../data/waves';
import { DT, TICK_RATE } from './constants';
import { PI, TWO_PI, dcos, datan2, dsin, turnToward } from './dmath';
import { AVOID, avoidance, circleHitsObstacle, moveCircle, segmentClear } from './map';
import { spawnEnemy, spawnProjectile } from './entities';
import { explode, hurtPlayer, nearestPlayer } from './combat';
import {
  BEHAVIOR,
  BOSS_PATTERNS,
  BOSS_SPIRALS,
  BOSS_SUMMONS,
  EGG_TYPE,
  ENEMY_BEHAVIOR,
  LEADER_SPEED,
  SWARM_TYPE,
  WALL_TYPE,
} from './registry';
import { dmgMul, hpMul, spdMul } from './spawner';
import {
  EF_BOSS,
  EF_PROP,
  EV_BLINK,
  EV_CAGE,
  EV_ENEMY_SHOT,
  EV_FUSE,
  EV_HATCH,
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

const SEP_STRENGTH = 95;
const KB_DECAY = 0.82;

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

/** Leader: rallies the enemies around it until the next tick (the effect dies with it). */
function boostAround(s: GameState, e: Enemy, self: number, R: number): void {
  const until = s.tick + 2;
  const n = s.grid.query(s.enemies, e.x, e.y, R);
  const out = s.grid.out;
  for (let k = 0; k < n; k++) {
    const j = out[k];
    if (j === self) continue;
    const o = s.enemies[j];
    if (!o.alive || o.flags & (EF_PROP | EF_BOSS)) continue;
    const ox = o.x - e.x;
    const oy = o.y - e.y;
    if (ox * ox + oy * oy < R * R) o.boostUntil = until;
  }
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
    if (e.boostUntil > tick) speed *= 1 + LEADER_SPEED;
    if (e.slowUntil > tick) speed *= 1 - e.slowFactor;
    const stunned = e.stunUntil > tick;
    if (stunned) speed = 0;

    DX = 0;
    DY = 0;
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
        keepAway(s, e, dx, dy, dist, d.keepMin ?? 240, d.keepMax ?? 340);
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
      case BEHAVIOR.LEADER:
        keepAway(s, e, dx, dy, dist, d.keepMin ?? 200, d.keepMax ?? 300);
        boostAround(s, e, i, d.auraRadius ?? 170);
        break;
      case BEHAVIOR.ORBITER: {
        // Tightening spiral: mostly sideways, a little inward; when very close, it dives in.
        if (dist > 420 || dist < 70) pathDir(s, e, dx, dy, dist);
        else {
          const side = e.id & 1 ? 1 : -1;
          const ux = dx / dist;
          const uy = dy / dist;
          DX = -uy * side * 0.92 + ux * 0.39;
          DY = ux * side * 0.92 + uy * 0.39;
        }
        break;
      }
      case BEHAVIOR.BLINKER: {
        // ai 0: moves slowly. ai 1: the ground is marked at (aux, aux2), it appears there after `fuse`.
        if (e.ai === 0) {
          pathDir(s, e, dx, dy, dist);
          e.timer -= tf;
          if (e.timer <= 0) {
            if (dist > 120 && dist < 620 && !stunned && !circleHitsObstacle(s.map, p.x, p.y, e.r)) {
              e.ai = 1;
              e.aux = p.x;
              e.aux2 = p.y;
              e.timer = Math.round((d.fuse ?? 1) * TICK_RATE);
              emit(s, EV_FUSE, p.x, p.y, 1, e.type);
            } else {
              e.timer = 20;
            }
          }
        } else {
          speed = 0;
          e.timer -= tf;
          if (e.timer <= 0) {
            e.x = e.px = e.aux;
            e.y = e.py = e.aux2;
            e.kbx = e.kby = 0;
            e.ai = 0;
            e.timer = Math.round((d.blinkEvery ?? 3.5) * TICK_RATE) + (e.id % 23);
            const R = d.blastRadius ?? 52;
            const dmg = (d.blastDamage ?? 10) * dmgMul(s);
            for (const q of s.players) {
              if (!q.alive) continue;
              const qx = q.x - e.x;
              const qy = q.y - e.y;
              const rr = R + q.r;
              if (qx * qx + qy * qy < rr * rr) hurtPlayer(s, q, dmg);
            }
            emit(s, EV_BLINK, e.x, e.y, R, e.type);
          }
        }
        break;
      }
      default: {
        const unhandled: never = beh;
        throw new Error(`Unhandled enemy behavior ${unhandled}`);
      }
    }

    // Soft separation between neighbouring enemies (grid built at the start of the tick).
    let sx = 0;
    let sy = 0;
    // solid walls: get fully pushed out of them (no soft separation)
    let hx = 0;
    let hy = 0;
    let checks = 0;
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
          const rr = e.r + o.r;
          const dd = ddx * ddx + ddy * ddy;
          if (dd >= rr * rr) continue;
          if (o.type === WALL_TYPE) {
            if (o.ai === 1 && dd > 0.0001) {
              const dl = Math.sqrt(dd);
              hx += (ddx / dl) * (rr - dl);
              hy += (ddy / dl) * (rr - dl);
            }
            continue;
          }
          checks++;
          if (dd < 0.0001) {
            sx += e.id < o.id ? 1 : -1;
          } else {
            const dl = Math.sqrt(dd);
            const push = (rr - dl) / rr;
            sx += (ddx / dl) * push;
            sy += (ddy / dl) * push;
          }
          if (checks >= 14) break;
        }
      }
    }

    const vx = (DX * speed + sx * SEP_STRENGTH + e.kbx) * tf;
    const vy = (DY * speed + sy * SEP_STRENGTH + e.kby) * tf;
    moveCircle(s.map, e, vx * DT + hx, vy * DT + hy, e.r);
    e.kbx *= KB_DECAY;
    e.kby *= KB_DECAY;
    if (beh === BEHAVIOR.SHOOTER) {
      // The Shooter faces where it aims, not where it walks.
      e.vx = dcos(e.aux);
      e.vy = dsin(e.aux);
    } else if (DX !== 0 || DY !== 0) {
      e.vx = DX;
      e.vy = DY;
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
 * reinforcements…) and a per-tick behavior. The boss hovers over obstacles.
 */
function updateBoss(s: GameState, e: Enemy, p: Player, dx: number, dy: number, dist: number, tf: number): void {
  const pat = BOSS_PATTERNS[e.type];
  if (e.timer <= 0) {
    e.ai = (e.ai + 1) % pat.length;
    e.timer = Math.round(pat[e.ai].duration * TICK_RATE);
    enterPhase(s, e, pat[e.ai].kind, p, dx, dy);
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
      const c = BOSS_SPIRALS[e.type]!;
      const every = Math.max(1, Math.round(c.spiralEvery * TICK_RATE));
      if (elapsed % every === 0) {
        const arms = c.spiralArms + (c.spiralArmsPerBoss ?? 0) * e.aux2;
        for (let k = 0; k < arms; k++) fireEnemyBullet(s, e.x, e.y, e.aux + (k * TWO_PI) / arms, c.bulletSpeed, c.bulletDamage * dm);
        e.aux += c.spiralTurn;
        if (elapsed % (every * 3) === 0) emit(s, EV_ENEMY_SHOT, e.x, e.y, 1, e.type);
      }
      break;
    }
    case 'charge':
      // Warning line, then it charges to the end of the line (e.ax: distance travelled).
      if (elapsed >= Math.round(TRAPEZOID_BOSS.chargeTelegraph * TICK_RATE) && e.ax < TRAPEZOID_BOSS.chargeLength) {
        VX = dcos(e.aux) * TRAPEZOID_BOSS.chargeSpeed;
        VY = dsin(e.aux) * TRAPEZOID_BOSS.chargeSpeed;
        e.ax += TRAPEZOID_BOSS.chargeSpeed * DT * tf;
      }
      break;
    case 'volley': {
      const every = Math.round(BUILDER_HEXAGON_BOSS.volleyEvery * TICK_RATE);
      if ((elapsed - 1) % every === 0) {
        const a = datan2(dy, dx);
        const n = BUILDER_HEXAGON_BOSS.volleyCount;
        for (let k = 0; k < n; k++) {
          fireEnemyBullet(s, e.x, e.y, a + (k - (n - 1) / 2) * BUILDER_HEXAGON_BOSS.volleySpread, BUILDER_HEXAGON_BOSS.bulletSpeed, BUILDER_HEXAGON_BOSS.bulletDamage * dm);
        }
        emit(s, EV_ENEMY_SHOT, e.x, e.y, 1, e.type);
      }
      break;
    }
    case 'dash':
      dash(s, e, elapsed, dm);
      break;
    case 'burst':
      if (elapsed === 1 || elapsed === total >> 1) {
        const n = RICOCHET_STAR_BOSS.burstArms;
        const off = elapsed === 1 ? 0 : PI / n;
        for (let k = 0; k < n; k++) fireEnemyBullet(s, e.x, e.y, off + (k * TWO_PI) / n, RICOCHET_STAR_BOSS.bulletSpeed, RICOCHET_STAR_BOSS.bulletDamage * dm);
        emit(s, EV_ENEMY_SHOT, e.x, e.y, 1, e.type);
      }
      break;
    case 'watch': {
      if (!stunned) {
        keepAway(s, e, dx, dy, dist, LASER_EYE_BOSS.keepMin, LASER_EYE_BOSS.keepMax);
        VX = DX * e.speed;
        VY = DY * e.speed;
      }
      const every = Math.round(LASER_EYE_BOSS.shootEvery * TICK_RATE);
      if (elapsed % every === 0 && dist < 600) {
        fireEnemyBullet(s, e.x, e.y, datan2(dy, dx), LASER_EYE_BOSS.bulletSpeed, LASER_EYE_BOSS.bulletDamage * dm);
        emit(s, EV_ENEMY_SHOT, e.x, e.y, 0, e.type);
      }
      break;
    }
    case 'sweep':
      sweep(s, e, elapsed / total, dm);
      break;
    case 'flee':
      if (!stunned) {
        keepAway(s, e, dx, dy, dist, SWARM_QUEEN_BOSS.keepMin, SWARM_QUEEN_BOSS.keepMax);
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
  if (VX !== 0 || VY !== 0) {
    const l = Math.sqrt(VX * VX + VY * VY);
    e.vx = VX / l;
    e.vy = VY / l;
  }
}

function enterPhase(s: GameState, e: Enemy, kind: BossPhaseKind, p: Player, dx: number, dy: number): void {
  switch (kind) {
    case 'charge':
      e.aux = datan2(dy, dx);
      e.ax = 0;
      break;
    case 'summon':
      summon(s, e, p);
      break;
    case 'build':
      buildCage(s, e, p);
      break;
    case 'aim':
      // Ricochet star: dash direction, and bounce box centred on the player.
      e.aux = datan2(dy, dx);
      e.ax = p.x;
      e.ay = p.y;
      break;
    case 'focus': {
      // Laser eye: the cone goes from one edge to the other through the player, one way then the other.
      const c = datan2(dy, dx);
      const dir = e.ai & 2 ? -1 : 1;
      e.ax = c - (dir * LASER_EYE_BOSS.arc) / 2;
      e.ay = c + (dir * LASER_EYE_BOSS.arc) / 2;
      e.aux = e.ax;
      break;
    }
    case 'sweep':
      e.aux = e.ax;
      emit(s, EV_LASER, e.x, e.y, 0, e.type);
      break;
    case 'lay': {
      layEggs(s, e);
      const a = datan2(dy, dx);
      const n = SWARM_QUEEN_BOSS.volleyCount;
      for (let k = 0; k < n; k++) {
        fireEnemyBullet(s, e.x, e.y, a + (k - (n - 1) / 2) * SWARM_QUEEN_BOSS.volleySpread, SWARM_QUEEN_BOSS.bulletSpeed, SWARM_QUEEN_BOSS.bulletDamage * dmgMul(s));
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

/** Ricochet star: dashes, bounces off the edges of its box, drops flames. */
function dash(s: GameState, e: Enemy, elapsed: number, dm: number): void {
  const H = RICOCHET_STAR_BOSS.box;
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
  VX = ux * RICOCHET_STAR_BOSS.dashSpeed;
  VY = uy * RICOCHET_STAR_BOSS.dashSpeed;
  if (elapsed % RICOCHET_STAR_BOSS.fireEvery === 0) {
    const b = spawnProjectile(s);
    if (!b) return;
    b.kind = PJ_FIRE;
    b.owner = -1;
    b.x = b.px = e.x;
    b.y = b.py = e.y;
    b.vx = b.vy = 0;
    b.r = RICOCHET_STAR_BOSS.fireRadius;
    b.a = RICOCHET_STAR_BOSS.fireDps * dm;
    b.life = Math.round(RICOCHET_STAR_BOSS.fireLife * TICK_RATE);
  }
}

/** Laser eye: the beam turns from e.ax to e.ay; it hurts whoever is on it (once, thanks to invulnerability). */
function sweep(s: GameState, e: Enemy, f: number, dm: number): void {
  e.aux = e.ax + (e.ay - e.ax) * Math.min(1, f);
  const ux = dcos(e.aux);
  const uy = dsin(e.aux);
  for (const q of s.players) {
    if (!q.alive) continue;
    const qx = q.x - e.x;
    const qy = q.y - e.y;
    const along = qx * ux + qy * uy;
    const perp = Math.abs(qy * ux - qx * uy);
    if (along > 0 && along < LASER_EYE_BOSS.beamLength + q.r && perp < LASER_EYE_BOSS.beamWidth / 2 + q.r) hurtPlayer(s, q, LASER_EYE_BOSS.beamDamage * dm);
  }
}

/**
 * Builder hexagon: a hexagonal cage of walls around the player (they rise, then become solid),
 * one cycle in `cageEvery`, with an exit in the middle of two opposite sides. `ax` = cages already attempted.
 */
function buildCage(s: GameState, e: Enemy, p: Player): void {
  e.ax++;
  if ((e.ax - 1) % BUILDER_HEXAGON_BOSS.cageEvery !== 0) return;
  const R = BUILDER_HEXAGON_BOSS.cageRadius;
  const n = Math.max(1, Math.round(R / BUILDER_HEXAGON_BOSS.wallSpacing));
  const life = Math.round(BUILDER_HEXAGON_BOSS.wallLife * TICK_RATE);
  const solid = Math.round((BUILDER_HEXAGON_BOSS.wallLife - BUILDER_HEXAGON_BOSS.wallRise) * TICK_RATE);
  const hm = hpMul(s);
  // The exits change sides from one cage to the next.
  const gapSide = ((e.ax - 1) / BUILDER_HEXAGON_BOSS.cageEvery) % 3;
  const g0 = Math.floor((n - BUILDER_HEXAGON_BOSS.gapWalls) / 2) + 1;
  for (let side = 0; side < 6; side++) {
    const a0 = (side * PI) / 3 + PI / 6;
    const a1 = a0 + PI / 3;
    const x0 = p.x + dcos(a0) * R;
    const y0 = p.y + dsin(a0) * R;
    const x1 = p.x + dcos(a1) * R;
    const y1 = p.y + dsin(a1) * R;
    for (let j = 0; j < n; j++) {
      if (side % 3 === gapSide && j >= g0 && j < g0 + BUILDER_HEXAGON_BOSS.gapWalls) continue;
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

/** Queen: lays an egg (three now and then) where she stands. */
function layEggs(s: GameState, e: Enemy): void {
  if (s.sandbox && !s.sandbox.summons) return;
  let eggs = 0;
  for (let i = 0; i < s.enemyCount; i++) if (s.enemies[i].alive && s.enemies[i].type === EGG_TYPE) eggs++;
  // ay = layings already done (aux is used by the dart spiral)
  e.ay++;
  const n = Math.min(SWARM_QUEEN_BOSS.maxEggs - eggs, e.ay % SWARM_QUEEN_BOSS.bigEvery === 0 ? 3 : 1);
  const hm = hpMul(s);
  for (let k = 0; k < n; k++) {
    const a = (k * TWO_PI) / 3 + e.ay;
    const egg = spawnEnemy(s, EGG_TYPE, e.x + (n > 1 ? dcos(a) * 34 : 0), e.y + (n > 1 ? dsin(a) * 34 : 0), hm, 1, 1, e.target);
    if (!egg) return;
    egg.timer = Math.round(SWARM_QUEEN_BOSS.hatchAfter * TICK_RATE) + k * 12;
  }
}

/** Egg: it hatches into Swarm. */
function hatch(s: GameState, egg: Enemy): void {
  egg.alive = false;
  egg.hp = 0;
  const n = SWARM_QUEEN_BOSS.hatchCount;
  for (let k = 0; k < n; k++) {
    const a = (k * TWO_PI) / n;
    spawnEnemy(s, SWARM_TYPE, egg.x + dcos(a) * 12, egg.y + dsin(a) * 12, hpMul(s) * SWARM_QUEEN_BOSS.broodHp, dmgMul(s), spdMul(s), egg.target);
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

/** Boss contact damage: much stronger when it rushes (Trapezoid charge, Ricochet star dash). */
function bossContactMul(e: Enemy): number {
  const kind = BOSS_PATTERNS[e.type][e.ai]?.kind;
  if (kind === 'charge' && e.ax > 0 && e.ax < TRAPEZOID_BOSS.chargeLength) return TRAPEZOID_BOSS.chargeDamage;
  if (kind === 'dash') return RICOCHET_STAR_BOSS.dashDamage;
  return 1;
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
