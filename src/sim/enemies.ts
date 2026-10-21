/** IA des ennemis, du boss, séparation, contact avec les joueurs. */
import { BOSS, ENEMIES } from '../data/enemies';
import { WAVES } from '../data/waves';
import { DT, TICK_RATE } from './constants';
import { PI, TWO_PI, dcos, datan2, dsin } from './dmath';
import { AVOID, avoidance, circleHitsObstacle, moveCircle, segmentClear } from './map';
import { spawnEnemy, spawnProjectile } from './entities';
import { explode, hurtPlayer, nearestPlayer } from './combat';
import { BEHAVIOR, BOSS_SUMMON_TYPE, ENEMY_BEHAVIOR } from './registry';
import { dmgMul, hpMul, spdMul } from './spawner';
import { EV_ENEMY_SHOT, EV_FUSE, PJ_EBULLET, emit, type Enemy, type GameState, type Player } from './state';

const SEP_STRENGTH = 95;
const KB_DECAY = 0.82;

/** Direction souhaitée (sortie des fonctions de pilotage), sans allocation. */
let DX = 0;
let DY = 0;

/** index du joueur pour lequel le champ de navigation est calculé ce tick (-1 : aucun) */
let navPlayer = -1;

/**
 * Direction vers le joueur : tout droit s'il est en vue, sinon en suivant le champ de navigation
 * (chemin le plus court autour des obstacles). Évitement local en dernier recours.
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

function fireEnemyBullet(s: GameState, x: number, y: number, angle: number, speed: number, damage: number): void {
  const b = spawnProjectile(s);
  if (!b) return;
  b.kind = PJ_EBULLET;
  b.owner = -1;
  b.x = b.px = x;
  b.y = b.py = y;
  b.vx = dcos(angle) * speed;
  b.vy = dsin(angle) * speed;
  b.r = 6;
  b.damage = damage;
  b.life = 4 * TICK_RATE;
}

function relocate(s: GameState, e: Enemy, p: Player, dx: number, dy: number): void {
  // Replace l'ennemi de l'autre côté du joueur, à distance d'apparition.
  const base = datan2(dy, dx); // direction ennemi -> joueur
  for (let k = 0; k < 7; k++) {
    const a = base + (k & 1 ? 1 : -1) * ((k + 1) >> 1) * 0.4;
    const x = p.x + dcos(a) * WAVES.spawnRadius;
    const y = p.y + dsin(a) * WAVES.spawnRadius;
    if (circleHitsObstacle(s.map, x, y, e.r)) continue;
    e.x = e.px = x;
    e.y = e.py = y;
    e.kbx = e.kby = 0;
    return;
  }
}

export function updateEnemies(s: GameState): void {
  const tick = s.tick;
  const grid = s.grid;
  const cols = grid.cols;
  const rows = grid.rows;
  const enemies = s.enemies;
  const relocate2 = WAVES.relocateDistance * WAVES.relocateDistance;
  const despawn2 = WAVES.props.despawn * WAVES.props.despawn;
  const frozen = s.freezeUntil > tick;
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
      // Caisse oubliée loin derrière : elle disparaît (monde infini).
      const pi = nearestPlayer(s, e.x, e.y);
      if (pi >= 0) {
        const q = s.players[pi];
        const ddx = q.x - e.x;
        const ddy = q.y - e.y;
        if (ddx * ddx + ddy * ddy > despawn2) e.alive = false;
      }
      continue;
    }
    // Gel : tout est figé (y compris les mèches et les tirs).
    if (frozen) continue;

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
      updateBoss(s, e, dx, dy, dist);
      continue;
    }
    if (d2 > relocate2) {
      relocate(s, e, p, dx, dy);
      continue;
    }

    const d = ENEMIES[e.type];
    let speed = e.speed;
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
        const keepMin = d.keepMin ?? 240;
        const keepMax = d.keepMax ?? 340;
        if (dist > keepMax) pathDir(s, e, dx, dy, dist);
        else if (dist < keepMin) {
          DX = -dx / dist;
          DY = -dy / dist;
        } else {
          const side = e.id & 1 ? 1 : -1;
          DX = (-dy / dist) * side * 0.8;
          DY = (dx / dist) * side * 0.8;
        }
        e.timer -= 1;
        if (e.timer <= 0) {
          if (dist < 560 && !stunned) {
            const a = datan2(dy, dx);
            fireEnemyBullet(s, e.x, e.y, a, d.bulletSpeed ?? 190, (d.bulletDamage ?? 8) * dmgMul(s));
            emit(s, EV_ENEMY_SHOT, e.x, e.y, 0, e.type);
            e.timer = Math.round((d.shootEvery ?? 2.6) * TICK_RATE);
          } else {
            e.timer = 20;
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
          e.timer -= 1;
          if (e.timer <= 0) {
            e.alive = false;
            e.hp = 0;
            explode(s, e.x, e.y, d.blastRadius ?? 85, (d.blastDamage ?? 20) * 1.5, ti, 200, (d.blastDamage ?? 20) * dmgMul(s));
            continue;
          }
        }
        break;
      }
    }

    // Séparation douce entre ennemis voisins (grille construite en début de tick).
    let sx = 0;
    let sy = 0;
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

    const vx = DX * speed + sx * SEP_STRENGTH + e.kbx;
    const vy = DY * speed + sy * SEP_STRENGTH + e.kby;
    moveCircle(s.map, e, vx * DT, vy * DT, e.r);
    e.kbx *= KB_DECAY;
    e.kby *= KB_DECAY;
    if (DX !== 0 || DY !== 0) {
      e.vx = DX;
      e.vy = DY;
    }
  }
}

function updateBoss(s: GameState, e: Enemy, dx: number, dy: number, dist: number): void {
  const pat = BOSS.pattern;
  if (e.timer <= 0) {
    e.ai = (e.ai + 1) % pat.length;
    e.timer = Math.round(pat[e.ai].duration * TICK_RATE);
    const kind = pat[e.ai].kind;
    if (kind === 'charge') e.aux = datan2(dy, dx);
    if (kind === 'summon') summon(s, e);
  }
  e.timer -= 1;
  const ph = pat[e.ai];
  const elapsed = Math.round(ph.duration * TICK_RATE) - e.timer;
  let vx = 0;
  let vy = 0;
  const stunned = e.stunUntil > s.tick;
  switch (ph.kind) {
    case 'chase':
      if (dist > 1 && !stunned) {
        vx = (dx / dist) * e.speed;
        vy = (dy / dist) * e.speed;
      }
      break;
    case 'spiral': {
      const every = Math.max(1, Math.round(BOSS.spiralEvery * TICK_RATE));
      if (elapsed % every === 0) {
        const arms = BOSS.spiralArms + e.aux2;
        for (let k = 0; k < arms; k++) {
          fireEnemyBullet(s, e.x, e.y, e.aux + (k * TWO_PI) / arms, BOSS.bulletSpeed, BOSS.bulletDamage * dmgMul(s));
        }
        e.aux += BOSS.spiralTurn;
        if (elapsed % (every * 3) === 0) emit(s, EV_ENEMY_SHOT, e.x, e.y, 1, e.type);
      }
      break;
    }
    case 'charge': {
      const tele = Math.round(BOSS.chargeTelegraph * TICK_RATE);
      if (elapsed >= tele) {
        vx = dcos(e.aux) * BOSS.chargeSpeed;
        vy = dsin(e.aux) * BOSS.chargeSpeed;
      }
      break;
    }
    case 'summon':
      break;
  }
  // Le boss plane au-dessus des obstacles.
  e.x += vx * DT;
  e.y += vy * DT;
  if (vx !== 0 || vy !== 0) {
    const l = Math.sqrt(vx * vx + vy * vy);
    e.vx = vx / l;
    e.vy = vy / l;
  }
}

function summon(s: GameState, boss: Enemy): void {
  const n = BOSS.summonCount + boss.aux2 * 2;
  for (let k = 0; k < n; k++) {
    const a = (k * TWO_PI) / n + PI / n;
    const x = boss.x + dcos(a) * (boss.r + 40);
    const y = boss.y + dsin(a) * (boss.r + 40);
    if (circleHitsObstacle(s.map, x, y, 12)) continue;
    spawnEnemy(s, BOSS_SUMMON_TYPE, x, y, hpMul(s), dmgMul(s), spdMul(s), boss.target);
  }
}

/** Dégâts de contact ennemis -> joueurs. */
export function updateContacts(s: GameState): void {
  const tick = s.tick;
  if (s.freezeUntil > tick) return;
  const grid = s.grid;
  for (const p of s.players) {
    if (!p.alive) continue;
    const n = grid.query(s.enemies, p.x, p.y, p.r);
    const out = grid.out;
    for (let k = 0; k < n; k++) {
      const e = s.enemies[out[k]];
      if (!e.alive || e.dmg <= 0 || e.attackReady > tick) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const rr = e.r + p.r;
      if (dx * dx + dy * dy >= rr * rr) continue;
      if (!hurtPlayer(s, p, e.dmg)) continue;
      e.attackReady = tick + 30;
      if (!p.alive) break;
    }
  }
}
