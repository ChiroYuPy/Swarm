/**
 * Vagues : flux continu (débit fonction du temps), essaims, encerclements, caisses bonus, boss toutes les 3 minutes.
 * Les types d'ennemis arrivent progressivement (phases), plus ou moins vite selon la difficulté.
 *
 * Invariant important : la consommation du flux WAVES ne dépend QUE du temps. Chaque apparition tire
 * toujours le même nombre de valeurs, même si elle échoue (plafond atteint, obstacle). Ainsi la suite
 * des vagues est identique pour tous les joueurs d'une même seed et d'une même difficulté.
 */
import { WAVES } from '../data/waves';
import { BOSS, ENEMIES } from '../data/enemies';
import { DIFFICULTIES } from '../data/difficulty';
import { DT, TICK_RATE } from './constants';
import { TWO_PI, dcos, dsin } from './dmath';
import { circleHitsObstacle } from './map';
import { spawnEnemy } from './entities';
import { BOSS_TYPE, PROP_TYPE, RING_TYPE, SWARM_TYPE, WAVE_PHASES_BY_DIFFICULTY } from './registry';
import { EF_PROP, EV_BOSS_SPAWN, EV_NEW_ENEMY, EV_PROP, EV_RING_WAVE, EV_SWARM, emit, type Enemy, type GameState } from './state';

/** Multiplicateurs ennemis au temps courant (courbes de temps × difficulté). */
export function hpMul(s: GameState): number {
  const m = (s.tick * DT) / 60;
  return (1 + m * WAVES.hpScalePerMinute + m * m * WAVES.hpScalePerMinute2) * DIFFICULTIES[s.difficulty].hp;
}
export function dmgMul(s: GameState): number {
  return (1 + ((s.tick * DT) / 60) * WAVES.dmgScalePerMinute) * DIFFICULTIES[s.difficulty].dmg;
}
export function spdMul(s: GameState): number {
  return Math.min(WAVES.speedScaleMax, 1 + ((s.tick * DT) / 60) * WAVES.speedScalePerMinute) * DIFFICULTIES[s.difficulty].speed;
}

export function spawnRate(tick: number, difficulty = 1): { rate: number; phase: number } {
  const phases = WAVE_PHASES_BY_DIFFICULTY[difficulty];
  let pi = 0;
  for (let i = 0; i < phases.length; i++) if (phases[i].atTick <= tick) pi = i;
  const ph = phases[pi];
  const next = phases[pi + 1];
  let rate: number;
  if (next) {
    const f = (tick - ph.atTick) / (next.atTick - ph.atTick);
    rate = ph.rate + (next.rate - ph.rate) * f;
  } else {
    rate = ph.rate + WAVES.lateGrowth * DIFFICULTIES[difficulty].rate * ((tick - ph.atTick) / TICK_RATE);
  }
  return { rate, phase: pi };
}

function targetPlayer(s: GameState): number {
  const n = s.players.length;
  if (n === 1) return 0;
  // Multi : on répartit les apparitions entre joueurs vivants, de façon déterministe.
  for (let k = 0; k < n; k++) {
    const i = (s.tick + k) % n;
    if (s.players[i].alive) return i;
  }
  return 0;
}

/** Fait apparaître un ennemi autour d'un joueur. Sans aléa supplémentaire : on essaie des angles voisins. */
function spawnAround(s: GameState, type: number, angle: number, radius: number, target: number): Enemy | null {
  const p = s.players[target];
  const r = ENEMIES[type].radius;
  const ignoreObstacles = type === BOSS_TYPE;
  for (let k = 0; k < 12; k++) {
    const off = (k & 1 ? 1 : -1) * ((k + 1) >> 1) * 0.35;
    const a = angle + off;
    const x = p.x + dcos(a) * radius;
    const y = p.y + dsin(a) * radius;
    if (!ignoreObstacles && circleHitsObstacle(s.map, x, y, r + 4)) continue;
    return spawnEnemy(s, type, x, y, hpMul(s), dmgMul(s), spdMul(s), target);
  }
  return null;
}

function spawnAt(s: GameState, type: number, x: number, y: number, target: number): Enemy | null {
  if (circleHitsObstacle(s.map, x, y, ENEMIES[type].radius)) return null;
  return spawnEnemy(s, type, x, y, hpMul(s), dmgMul(s), spdMul(s), target);
}

function countProps(s: GameState): number {
  let n = 0;
  for (let i = 0; i < s.enemyCount; i++) if (s.enemies[i].alive && s.enemies[i].flags & EF_PROP) n++;
  return n;
}

export function updateSpawner(s: GameState): void {
  const tick = s.tick;
  const t = tick * DT;
  const rngW = s.rngWaves;
  const diff = DIFFICULTIES[s.difficulty];
  const phases = WAVE_PHASES_BY_DIFFICULTY[s.difficulty];
  const { rate, phase } = spawnRate(tick, s.difficulty);
  const ph = phases[phase];

  // Arrivée d'un nouveau type d'ennemi : annonce.
  if (ph.atTick === tick) for (const nt of ph.newTypes) emit(s, EV_NEW_ENEMY, 0, 0, 0, nt);

  s.spawnBudget += rate * DT;
  while (s.spawnBudget >= 1) {
    s.spawnBudget -= 1;
    // Toujours 3 tirages par apparition, quoi qu'il arrive ensuite.
    const type = rngW.weighted(ph.weights, ph.total);
    const a = rngW.next() * TWO_PI;
    const j = rngW.next();
    if (s.enemyCount >= WAVES.enemyCap) continue;
    // Boss en vie : on saute une partie des apparitions (sans changer le nombre de tirages).
    if (s.bossId >= 0 && j < 1 - WAVES.bossRateMul) continue;
    spawnAround(s, type, a, WAVES.spawnRadius + j * WAVES.spawnJitter, targetPlayer(s));
  }

  // Essaims
  const sw = WAVES.swarm;
  const swFirst = Math.round(sw.firstAt * diff.pace * TICK_RATE);
  const swEvery = Math.round(sw.every * TICK_RATE);
  if (tick >= swFirst && (tick - swFirst) % swEvery === 0) {
    if (tick === swFirst) emit(s, EV_NEW_ENEMY, 0, 0, 0, SWARM_TYPE);
    const a = rngW.next() * TWO_PI;
    const target = targetPlayer(s);
    const p = s.players[target];
    const count = Math.round((sw.count + Math.floor((t / 60) * sw.countPerMinute)) * diff.rate);
    const cx = p.x + dcos(a) * WAVES.spawnRadius;
    const cy = p.y + dsin(a) * WAVES.spawnRadius;
    for (let k = 0; k < count; k++) {
      const rr = 10 * Math.sqrt(k);
      const ga = k * 2.399963229728653;
      spawnAt(s, SWARM_TYPE, cx + dcos(ga) * rr, cy + dsin(ga) * rr, target);
    }
    emit(s, EV_SWARM, cx, cy, count);
  }

  // Encerclements
  const rg = WAVES.ring;
  const rgFirst = Math.round(rg.firstAt * diff.pace * TICK_RATE);
  const rgEvery = Math.round(rg.every * TICK_RATE);
  if (tick >= rgFirst && (tick - rgFirst) % rgEvery === 0) {
    const a0 = rngW.next() * TWO_PI;
    const target = targetPlayer(s);
    const p = s.players[target];
    const count = Math.round((rg.count + Math.floor((t / 60) * rg.countPerMinute)) * diff.rate);
    for (let k = 0; k < count; k++) {
      const a = a0 + (k * TWO_PI) / count;
      spawnAt(s, RING_TYPE, p.x + dcos(a) * rg.radius, p.y + dsin(a) * rg.radius, target);
    }
    emit(s, EV_RING_WAVE, p.x, p.y, count);
  }

  // Caisses bonus
  const pr = WAVES.props;
  const prEvery = Math.round(pr.every * TICK_RATE);
  if (tick % prEvery === 0) {
    const a = rngW.next() * TWO_PI;
    const d = pr.minDist + rngW.next() * (pr.maxDist - pr.minDist);
    if (countProps(s) < pr.max) {
      const e = spawnAround(s, PROP_TYPE, a, d, targetPlayer(s));
      if (e) {
        e.maxHp = e.hp = ENEMIES[PROP_TYPE].hp;
        emit(s, EV_PROP, e.x, e.y);
      }
    }
  }

  // Boss
  const bossEvery = Math.round(WAVES.bossEvery * TICK_RATE);
  if (tick > 0 && tick % bossEvery === 0) {
    const a = rngW.next() * TWO_PI;
    const target = targetPlayer(s);
    const k = s.bossSpawned;
    const e = spawnAround(s, BOSS_TYPE, a, 620, target);
    s.bossSpawned++;
    if (e) {
      e.maxHp = e.hp = ENEMIES[BOSS_TYPE].hp * (1 + BOSS.hpGrowth * k) * diff.hp;
      e.dmg = ENEMIES[BOSS_TYPE].damage * dmgMul(s);
      e.speed = ENEMIES[BOSS_TYPE].speed * (1 + 0.08 * k);
      e.aux2 = k;
      e.ai = 0;
      e.timer = Math.round(BOSS.pattern[0].duration * TICK_RATE);
      s.bossId = e.id;
      emit(s, EV_BOSS_SPAWN, e.x, e.y, k, e.type);
    }
  }
}
