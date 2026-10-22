/**
 * Vagues : flux continu (débit fonction du temps), essaims, hordes, encerclements, caisses bonus, boss toutes les 3 minutes.
 * Les types d'ennemis arrivent progressivement, plus ou moins vite selon la difficulté. Le flux ne mélange
 * que 2-3 types à la fois (voir WAVES.mixes), choisis sans état à partir de la seed et du créneau.
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
import {
  BOSS_TYPE,
  DEBUT_MIX,
  HORDE_TYPES,
  MIXES,
  MIX_TICKS,
  NUM_ENEMY_TYPES,
  PROP_TYPE,
  RATES_BY_DIFFICULTY,
  RING_TYPE,
  SWARM_TYPE,
  UNLOCK_SLOT,
} from './registry';
import { deriveSeed } from './rng';
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

export function spawnRate(tick: number, difficulty = 1): { rate: number } {
  const pts = RATES_BY_DIFFICULTY[difficulty];
  let pi = 0;
  for (let i = 0; i < pts.length; i++) if (pts[i].atTick <= tick) pi = i;
  const ph = pts[pi];
  const next = pts[pi + 1];
  let rate: number;
  if (next) {
    const f = (tick - ph.atTick) / (next.atTick - ph.atTick);
    rate = ph.rate + (next.rate - ph.rate) * f;
  } else {
    rate = ph.rate + WAVES.lateGrowth * DIFFICULTIES[difficulty].rate * ((tick - ph.atTick) / TICK_RATE);
  }
  return { rate };
}

function mixAvailable(unlock: Int32Array, i: number, slot: number): boolean {
  for (const t of MIXES[i].types) if (unlock[t] < 0 || unlock[t] > slot) return false;
  return true;
}

/**
 * Mélange actif pendant le créneau `slot` (index dans MIXES). Un type qui arrive impose son mélange
 * d'arrivée ; sinon tirage pondéré (seed + créneau), en évitant de reprendre le mélange précédent.
 */
export function mixAt(seed: number, difficulty: number, slot: number, depth = 1): number {
  const unlock = UNLOCK_SLOT[difficulty];
  let debut = -1;
  for (let t = 0; t < NUM_ENEMY_TYPES; t++) if (unlock[t] === slot && DEBUT_MIX[t] > debut) debut = DEBUT_MIX[t];
  if (debut >= 0) return debut;
  const avoid = depth > 0 && slot > 0 ? mixAt(seed, difficulty, slot - 1, 0) : -1;
  let total = 0;
  for (let i = 0; i < MIXES.length; i++) if (i !== avoid && mixAvailable(unlock, i, slot)) total += MIXES[i].pick;
  if (total <= 0) return Math.max(0, avoid);
  let r = (deriveSeed(seed, 0x6d6978, slot) / 4294967296) * total;
  let last = 0;
  for (let i = 0; i < MIXES.length; i++) {
    if (i === avoid || !mixAvailable(unlock, i, slot)) continue;
    last = i;
    r -= MIXES[i].pick;
    if (r < 0) return i;
  }
  return last;
}

/** Plafond d'ennemis en vie pour les types limités (Golem) : grandit avec le temps depuis son arrivée. */
function underCap(s: GameState, type: number): boolean {
  const d = ENEMIES[type];
  if (!d.capStart) return true;
  const since = Math.max(0, s.tick - Math.max(0, UNLOCK_SLOT[s.difficulty][type]) * MIX_TICKS);
  const cap = Math.min(d.capMax ?? 99, d.capStart + Math.floor((since / (60 * TICK_RATE)) * (d.capPerMinute ?? 0)));
  let n = 0;
  for (let i = 0; i < s.enemyCount; i++) if (s.enemies[i].alive && s.enemies[i].type === type) n++;
  return n < cap;
}

function targetPlayer(s: GameState): number {
  const n = s.players.length;
  if (n === 1) return 0;
  // Multi : on répartit les apparitions entre joueurs vivants, de façon déterministe (jamais sur un clone).
  for (let k = 0; k < n; k++) {
    const i = (s.tick + k) % n;
    if (s.players[i].alive && s.players[i].master < 0) return i;
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
  const { rate } = spawnRate(tick, s.difficulty);
  const slot = Math.floor(tick / MIX_TICKS);
  // Bac à sable : nombre d'ennemis multiplié, types choisis (tous disponibles d'emblée), boss facultatifs.
  const sb = s.sandbox;
  const mul = sb ? sb.enemyMul : 1;
  const pool = sb?.enemies ?? null;
  const flux = pool ? pool.filter((t) => t !== SWARM_TYPE) : null;

  const mix = MIXES[pool ? 0 : mixAt(s.seed, s.difficulty, slot)];

  // Arrivée d'un nouveau type d'ennemi (début de créneau) : annonce.
  if (tick % MIX_TICKS === 0 && !pool) {
    const unlock = UNLOCK_SLOT[s.difficulty];
    for (let t = 0; t < NUM_ENEMY_TYPES; t++) if (unlock[t] === slot) emit(s, EV_NEW_ENEMY, 0, 0, 0, t);
  }

  s.spawnBudget += rate * DT * mul;
  while (s.spawnBudget >= 1) {
    s.spawnBudget -= 1;
    // Toujours 3 tirages par apparition, quoi qu'il arrive ensuite.
    const type = flux ? flux[Math.min(flux.length - 1, Math.floor(rngW.next() * flux.length))] : rngW.weighted(mix.weights, mix.total);
    const a = rngW.next() * TWO_PI;
    const j = rngW.next();
    if (s.enemyCount >= WAVES.enemyCap || type === undefined) continue;
    // Boss en vie : on saute une partie des apparitions (sans changer le nombre de tirages).
    if (s.bossId >= 0 && j < 1 - WAVES.bossRateMul) continue;
    if (!underCap(s, type)) continue;
    spawnAround(s, type, a, WAVES.spawnRadius + j * WAVES.spawnJitter, targetPlayer(s));
  }

  // Essaims
  const sw = WAVES.swarm;
  const swFirst = pool ? 10 * TICK_RATE : Math.round(sw.firstAt * diff.pace * TICK_RATE);
  const swEvery = Math.round(sw.every * TICK_RATE);
  const swOn = mul > 0 && (!pool || pool.includes(SWARM_TYPE));
  if (swOn && tick >= swFirst && (tick - swFirst) % swEvery === 0) {
    if (tick === swFirst && !pool) emit(s, EV_NEW_ENEMY, 0, 0, 0, SWARM_TYPE);
    const a = rngW.next() * TWO_PI;
    const target = targetPlayer(s);
    const p = s.players[target];
    const count = Math.round((sw.count + Math.floor((t / 60) * sw.countPerMinute)) * diff.rate * Math.min(mul, 3));
    const cx = p.x + dcos(a) * WAVES.spawnRadius;
    const cy = p.y + dsin(a) * WAVES.spawnRadius;
    for (let k = 0; k < count; k++) {
      const rr = 10 * Math.sqrt(k);
      const ga = k * 2.399963229728653;
      spawnAt(s, SWARM_TYPE, cx + dcos(ga) * rr, cy + dsin(ga) * rr, target);
    }
    emit(s, EV_SWARM, cx, cy, count);
  }

  // Hordes : beaucoup d'anciens ennemis d'un coup, d'un seul côté.
  const hd = WAVES.horde;
  const hdFirst = Math.round(hd.firstAt * diff.pace * TICK_RATE);
  const hdEvery = Math.round(hd.every * TICK_RATE);
  if (mul > 0 && !pool && tick >= hdFirst && (tick - hdFirst) % hdEvery === 0) {
    const type = HORDE_TYPES[((tick - hdFirst) / hdEvery) % HORDE_TYPES.length];
    const a = rngW.next() * TWO_PI;
    // Pas de horde pendant un boss (le tirage est fait quand même : flux indépendant du joueur).
    if (s.bossId < 0) {
      const target = targetPlayer(s);
      const p = s.players[target];
      const count = Math.round((hd.count + Math.floor((t / 60) * hd.countPerMinute)) * diff.rate);
      const cx = p.x + dcos(a) * WAVES.spawnRadius;
      const cy = p.y + dsin(a) * WAVES.spawnRadius;
      for (let k = 0; k < count; k++) {
        const rr = 15 * Math.sqrt(k);
        const ga = k * 2.399963229728653;
        spawnAt(s, type, cx + dcos(ga) * rr, cy + dsin(ga) * rr, target);
      }
      emit(s, EV_SWARM, cx, cy, count, type + 1);
    }
  }

  // Encerclements
  const rg = WAVES.ring;
  const rgFirst = pool ? 20 * TICK_RATE : Math.round(rg.firstAt * diff.pace * TICK_RATE);
  const rgEvery = Math.round(rg.every * TICK_RATE);
  const rgOn = mul > 0 && (!pool || pool.includes(RING_TYPE));
  if (rgOn && tick >= rgFirst && (tick - rgFirst) % rgEvery === 0) {
    const a0 = rngW.next() * TWO_PI;
    const target = targetPlayer(s);
    const p = s.players[target];
    const count = Math.round((rg.count + Math.floor((t / 60) * rg.countPerMinute)) * diff.rate * Math.min(mul, 3));
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
  if (tick > 0 && tick % bossEvery === 0 && (!sb || sb.bosses)) {
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
