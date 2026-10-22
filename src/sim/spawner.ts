/**
 * Vagues : chaque vague (flux, essaim, horde ou encerclement) est suivie d'une pause ; toutes les 4 vagues, un boss,
 * seul en piste : l'horloge des vagues s'arrête jusqu'à sa mort. Caisses bonus en continu.
 * Les types d'ennemis arrivent progressivement, plus ou moins vite selon la difficulté. Le flux ne mélange
 * que 2-3 types à la fois (voir WAVES.mixes), choisis sans état à partir de la seed et du créneau.
 *
 * Invariant important : la consommation du flux WAVES ne dépend QUE de l'horloge des vagues. Chaque apparition tire
 * toujours le même nombre de valeurs, même si elle échoue (plafond atteint, obstacle). Ainsi la suite
 * des vagues est identique pour tous les joueurs d'une même seed et d'une même difficulté.
 */
import { WAVES } from '../data/waves';
import { BOSS_HP_GROWTH, ENEMIES } from '../data/enemies';
import { DIFFICULTIES } from '../data/difficulty';
import { DT, TICK_RATE } from './constants';
import { TWO_PI, dcos, dsin } from './dmath';
import { circleHitsObstacle } from './map';
import { spawnEnemy, spawnPickup } from './entities';
import { rollMapItem } from './combat';
import { LOOT } from '../data/loot';
import {
  BOSS_PATTERNS,
  BOSS_TICKS,
  BOSS_TYPES,
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
  WAVE_TICKS,
} from './registry';
import { deriveSeed } from './rng';
import {
  EF_BOSS,
  EF_PROP,
  EV_BOSS_SPAWN,
  EV_FLEE,
  EV_MAP_ITEM,
  EV_NEW_ENEMY,
  EV_PROP,
  EV_RING_WAVE,
  EV_SWARM,
  EV_WAVE,
  PK_VACUUM,
  emit,
  type Enemy,
  type GameState,
} from './state';

/** Multiplicateurs ennemis selon l'horloge des vagues (courbes de temps × difficulté). */
export function hpMul(s: GameState): number {
  const m = (s.clock * DT) / 60;
  return (1 + m * WAVES.hpScalePerMinute + m * m * WAVES.hpScalePerMinute2) * DIFFICULTIES[s.difficulty].hp;
}
export function dmgMul(s: GameState): number {
  return (1 + ((s.clock * DT) / 60) * WAVES.dmgScalePerMinute) * DIFFICULTIES[s.difficulty].dmg;
}
export function spdMul(s: GameState): number {
  return Math.min(WAVES.speedScaleMax, 1 + ((s.clock * DT) / 60) * WAVES.speedScalePerMinute) * DIFFICULTIES[s.difficulty].speed;
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

/** Choix du mélange d'un créneau, connaissant celui du créneau précédent (`avoid`). */
function pickMix(seed: number, difficulty: number, slot: number, avoid: number): number {
  const unlock = UNLOCK_SLOT[difficulty];
  let debut = -1;
  for (let t = 0; t < NUM_ENEMY_TYPES; t++) if (unlock[t] === slot && DEBUT_MIX[t] > debut) debut = DEBUT_MIX[t];
  if (debut >= 0) return debut;
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

/** Suite des mélanges déjà calculée pour une seed et une difficulté (pure : simple cache). */
const mixMemo = { seed: -1, difficulty: -1, list: [] as number[] };

/**
 * Mélange actif pendant le créneau `slot` (index dans MIXES). Un type qui arrive impose son mélange
 * d'arrivée ; sinon tirage pondéré (seed + créneau), jamais le même mélange deux vagues de suite.
 */
export function mixAt(seed: number, difficulty: number, slot: number): number {
  if (mixMemo.seed !== seed || mixMemo.difficulty !== difficulty) {
    mixMemo.seed = seed;
    mixMemo.difficulty = difficulty;
    mixMemo.list.length = 0;
  }
  const list = mixMemo.list;
  while (list.length <= slot) list.push(pickMix(seed, difficulty, list.length, list.length > 0 ? list[list.length - 1] : -1));
  return list[slot];
}

/** Plafond d'ennemis en vie pour les types limités (Golem) : grandit avec le temps depuis son arrivée. */
function underCap(s: GameState, type: number): boolean {
  const d = ENEMIES[type];
  if (!d.capStart) return true;
  const since = Math.max(0, s.clock - Math.max(0, UNLOCK_SLOT[s.difficulty][type]) * MIX_TICKS);
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
  const ignoreObstacles = ENEMIES[type].behavior === 'boss';
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

/** Temps forts (essaim, horde, encerclement) : plafonnés à WAVES.enemyCap ennemis en vie. */
function spawnAt(s: GameState, type: number, x: number, y: number, target: number): Enemy | null {
  if (s.enemyCount >= WAVES.enemyCap) return null;
  if (circleHitsObstacle(s.map, x, y, ENEMIES[type].radius)) return null;
  return spawnEnemy(s, type, x, y, hpMul(s), dmgMul(s), spdMul(s), target);
}

function countProps(s: GameState): number {
  let n = 0;
  for (let i = 0; i < s.enemyCount; i++) if (s.enemies[i].alive && s.enemies[i].flags & EF_PROP) n++;
  return n;
}

/** Caisses bonus : selon le vrai temps (même pendant un boss), position tirée sans état (seed + tick). */
function updateProps(s: GameState): void {
  const pr = WAVES.props;
  if (s.tick % Math.round(pr.every * TICK_RATE) !== 0 || countProps(s) >= pr.max) return;
  const a = (deriveSeed(s.seed, 0x70726f70, s.tick) / 4294967296) * TWO_PI;
  const d = pr.minDist + (deriveSeed(s.seed, 0x70726f71, s.tick) / 4294967296) * (pr.maxDist - pr.minDist);
  const e = spawnAround(s, PROP_TYPE, a, d, targetPlayer(s));
  if (e) {
    e.maxHp = e.hp = ENEMIES[PROP_TYPE].hp;
    emit(s, EV_PROP, e.x, e.y);
  }
}

/** Objets de l'arène (surtout des Aspirateurs) : même principe que les caisses, sans état (seed + tick). */
function updateMapItems(s: GameState): void {
  const m = LOOT.mapItems;
  if (s.tick % Math.round(m.every * TICK_RATE) !== 0) return;
  const p = s.players[targetPlayer(s)];
  let vacuums = 0;
  for (let i = 0; i < s.pickupCount; i++) if (s.pickups[i].kind === PK_VACUUM) vacuums++;
  const u = (salt: number) => deriveSeed(s.seed, salt, s.tick) / 4294967296;
  const kind = rollMapItem(u(0x6d617031), u(0x6d617032), vacuums < m.maxVacuums);
  const a0 = u(0x6d617033) * TWO_PI;
  const d = m.minDist + u(0x6d617034) * (m.maxDist - m.minDist);
  for (let k = 0; k < 12; k++) {
    const a = a0 + (k & 1 ? 1 : -1) * ((k + 1) >> 1) * 0.35;
    const x = p.x + dcos(a) * d;
    const y = p.y + dsin(a) * d;
    if (circleHitsObstacle(s.map, x, y, 24)) continue;
    spawnPickup(s, kind, x, y);
    emit(s, EV_MAP_ITEM, x, y, 0, kind);
    return;
  }
}

/**
 * Le boss arrive : les ennemis normaux s'enfuient, il ne reste que lui (et ce qu'il fait venir).
 * `k` = son rang dans la partie (0 = le premier) : il fixe le boss, sa force et son nom (Mk II…).
 */
function spawnBoss(s: GameState, k = s.bossSpawned): void {
  const type = BOSS_TYPES[k % BOSS_TYPES.length];
  const a = s.rngWaves.next() * TWO_PI;
  for (let i = 0; i < s.enemyCount; i++) {
    const o = s.enemies[i];
    if (!o.alive || o.flags & (EF_BOSS | EF_PROP)) continue;
    emit(s, EV_FLEE, o.x, o.y, o.r, o.type);
    o.alive = false;
  }
  const e = spawnAround(s, type, a, 620, targetPlayer(s));
  s.bossSpawned++;
  if (!e) return;
  const d = ENEMIES[type];
  e.maxHp = e.hp = d.hp * (1 + BOSS_HP_GROWTH * k) * DIFFICULTIES[s.difficulty].hp;
  e.dmg = d.damage * dmgMul(s);
  e.speed = d.speed * (1 + 0.08 * k);
  e.aux2 = k;
  e.ai = 0;
  e.timer = Math.round(BOSS_PATTERNS[type][0].duration * TICK_RATE);
  s.bossId = e.id;
  emit(s, EV_BOSS_SPAWN, e.x, e.y, k, e.type);
}

/** Où en est-on dans les vagues ? (pour le HUD ; `clock` = horloge des vagues) */
export function waveInfo(clock: number) {
  const c = Math.max(0, clock - 1);
  const slot = Math.floor(c / MIX_TICKS);
  const pos = c % MIX_TICKS;
  return {
    /** numéro de la vague en cours ou qui vient de finir (1 = la première) */
    wave: slot + 1,
    slot,
    inWave: pos < WAVE_TICKS,
    /** ticks d'horloge restants avant la fin de la vague (ou de la pause) */
    left: pos < WAVE_TICKS ? WAVE_TICKS - pos : MIX_TICKS - pos,
    /** ticks d'horloge avant le prochain boss */
    toBoss: BOSS_TICKS - (clock % BOSS_TICKS),
  };
}

export function updateSpawner(s: GameState): void {
  updateProps(s);
  updateMapItems(s);
  const sb = s.sandbox;
  // Bac à sable, duel : le boss choisi arrive au premier pas, hors du compte des boss de la partie.
  if (sb && sb.duel >= 0) {
    const next = s.bossSpawned;
    spawnBoss(s, sb.duel);
    s.bossSpawned = next;
    sb.duel = -1;
    return;
  }
  // Boss en vie, ou calme qui suit sa mort : ni vague ni horloge.
  if (s.bossId >= 0 || s.tick < s.calmUntil) return;
  const c = ++s.clock;
  // Boss : à la toute fin de la pause de la dernière vague du cycle.
  if (c % BOSS_TICKS === 0 && (!sb || sb.bosses)) {
    spawnBoss(s);
    return;
  }
  const pos = (c - 1) % MIX_TICKS;
  if (pos >= WAVE_TICKS) return; // pause entre deux vagues
  const slot = Math.floor((c - 1) / MIX_TICKS);
  const t = c * DT;
  const rngW = s.rngWaves;
  const diff = DIFFICULTIES[s.difficulty];
  const { rate } = spawnRate(c, s.difficulty);
  // Bac à sable : nombre d'ennemis multiplié, types choisis (tous disponibles d'emblée), boss facultatifs.
  const mul = sb ? sb.enemyMul : 1;
  const pool = sb?.enemies ?? null;
  const flux = pool ? pool.filter((t) => t !== SWARM_TYPE) : null;

  const mix = MIXES[pool ? 0 : mixAt(s.seed, s.difficulty, slot)];

  // Début de vague : annonce (et arrivée d'un nouveau type d'ennemi).
  if (pos === 0) {
    emit(s, EV_WAVE, 0, 0, slot + 1);
    if (!pool) {
      const unlock = UNLOCK_SLOT[s.difficulty];
      for (let t = 0; t < NUM_ENEMY_TYPES; t++) if (unlock[t] === slot) emit(s, EV_NEW_ENEMY, 0, 0, 0, t);
    }
  }

  s.spawnBudget += rate * DT * mul;
  while (s.spawnBudget >= 1) {
    s.spawnBudget -= 1;
    // Toujours 3 tirages par apparition, quoi qu'il arrive ensuite.
    const type = flux ? flux[Math.min(flux.length - 1, Math.floor(rngW.next() * flux.length))] : rngW.weighted(mix.weights, mix.total);
    const a = rngW.next() * TWO_PI;
    const j = rngW.next();
    if (s.enemyCount >= WAVES.fluxCap || type === undefined) continue;
    if (!underCap(s, type)) continue;
    spawnAround(s, type, a, WAVES.spawnRadius + j * WAVES.spawnJitter, targetPlayer(s));
  }
  if (mul <= 0) return;

  // Essaim : une fois par vague.
  const sw = WAVES.swarm;
  const swFirst = pool ? 0 : sw.firstAt * diff.pace;
  if ((!pool || pool.includes(SWARM_TYPE)) && t >= swFirst && pos === Math.round(sw.at * TICK_RATE)) {
    if (!pool && t - MIX_TICKS * DT < swFirst) emit(s, EV_NEW_ENEMY, 0, 0, 0, SWARM_TYPE);
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

  // Hordes (vagues paires) : beaucoup d'anciens ennemis d'un coup, d'un seul côté.
  const hd = WAVES.horde;
  if (!pool && slot % 2 === 0 && t >= hd.firstAt * diff.pace && pos === Math.round(hd.at * TICK_RATE)) {
    const type = HORDE_TYPES[(slot / 2) % HORDE_TYPES.length];
    const a = rngW.next() * TWO_PI;
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

  // Encerclements (vagues impaires)
  const rg = WAVES.ring;
  const rgFirst = pool ? 0 : rg.firstAt * diff.pace;
  if ((!pool || pool.includes(RING_TYPE)) && slot % 2 === 1 && t >= rgFirst && pos === Math.round(rg.at * TICK_RATE)) {
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
}
