/**
 * Waves: each wave (stream, swarm, horde or encirclement) is followed by a pause; every 4 waves, a boss,
 * alone with the player in its arena: the wave clock stops until it dies. Bonus crates keep coming.
 * The run follows WAVES.plan, wave by wave (the same in every difficulty), and each wave only mixes 2-3
 * types. After the plan (the run is won), the endless mode draws its mixes statelessly from the seed and the slot.
 *
 * Important invariant: consumption of the WAVES stream depends ONLY on the wave clock. Each spawn always draws
 * the same number of values, even if it fails (cap reached, obstacle). So the sequence
 * of waves is identical for all players with the same seed and the same difficulty.
 */
import { WAVES } from '../data/waves';
import { ENEMIES } from '../data/enemies';
import { DIFFICULTIES } from '../data/difficulty';
import { DT, TICK_RATE } from './constants';
import { TWO_PI, dcos, dsin } from './dmath';
import { circleHitsObstacle } from './map';
import { keepInArena } from './enemies';
import { spawnEnemy, spawnPickup } from './entities';
import { rollMapItem } from './combat';
import { LOOT } from '../data/loot';
import {
  BOSS_PATTERNS,
  BOSS_TICKS,
  BOSS_TYPES,
  CAP,
  ENDLESS_MIXES,
  HORDE_TYPES,
  MIX_TICKS,
  NUM_ENEMY_TYPES,
  PACK,
  PLAN_MIXES,
  PLAN_WAVES,
  PROP_TYPE,
  RATES_BY_DIFFICULTY,
  RING_TYPE,
  SWARM_TYPE,
  UNLOCK_SLOT,
  WAVE_TICKS,
  type CompiledMix,
} from './registry';
import { deriveSeed } from './rng';
import {
  EF_BOSS,
  EF_PROP,
  EV_ARENA,
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

/** Endless mix of a slot, knowing the previous slot's one (`avoid`): a draw from the seed and the slot. */
function pickEndless(seed: number, slot: number, avoid: number): number {
  const n = ENDLESS_MIXES.length;
  if (n <= 1) return 0;
  const r = Math.floor((deriveSeed(seed, 0x6d6978, slot) / 4294967296) * (n - 1));
  return avoid >= 0 && r >= avoid ? r + 1 : r;
}

/** Endless mix sequence already computed for a seed (pure: just a cache). */
const mixMemo = { seed: -1, list: [] as number[] };

/**
 * Mix of wave slot `slot` (0 = the first wave): the planned wave, then (endless mode) a draw from the seed
 * and the slot, never the same mix two waves in a row. The same in every difficulty.
 */
export function mixAt(seed: number, slot: number): CompiledMix {
  if (slot < PLAN_WAVES) return PLAN_MIXES[slot];
  if (mixMemo.seed !== seed) {
    mixMemo.seed = seed;
    mixMemo.list.length = 0;
  }
  const list = mixMemo.list;
  const k = slot - PLAN_WAVES;
  while (list.length <= k) list.push(pickEndless(seed, PLAN_WAVES + list.length, list.length > 0 ? list[list.length - 1] : -1));
  return ENDLESS_MIXES[list[k]];
}

/** Strong types are capped (data/enemies.ts `cap`): no new one from the stream while that many live. */
function underCap(s: GameState, type: number): boolean {
  const cap = CAP[type];
  if (cap <= 0) return true;
  let n = 0;
  for (let i = 0; i < s.enemyCount; i++) if (s.enemies[i].alive && s.enemies[i].type === type) n++;
  return n < cap;
}

function targetPlayer(s: GameState): number {
  const n = s.players.length;
  if (n === 1) return 0;
  // Multiplayer: spread spawns across living players, deterministically (never on a clone).
  for (let k = 0; k < n; k++) {
    const i = (s.tick + k) % n;
    if (s.players[i].alive && s.players[i].master < 0) return i;
  }
  return 0;
}

/** Spawns an enemy around a player. No extra randomness: neighbouring angles are tried. */
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
    return spawnEnemy(s, type, x, y, 1, 1, 1, target);
  }
  return null;
}

/** Highlights (swarm, horde, encirclement): capped at WAVES.enemyCap living enemies. */
function spawnAt(s: GameState, type: number, x: number, y: number, target: number): Enemy | null {
  if (s.enemyCount >= WAVES.enemyCap) return null;
  if (circleHitsObstacle(s.map, x, y, ENEMIES[type].radius)) return null;
  return spawnEnemy(s, type, x, y, 1, 1, 1, target);
}

function countProps(s: GameState): number {
  let n = 0;
  for (let i = 0; i < s.enemyCount; i++) if (s.enemies[i].alive && s.enemies[i].flags & EF_PROP) n++;
  return n;
}

/** Bonus crates: on real time (even during a boss), position drawn statelessly (seed + tick). */
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

/** Arena items (mostly Vacuums): same principle as the crates, stateless (seed + tick). */
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
 * The boss arrives: normal enemies flee, only it remains (and whatever it summons), and its arena closes
 * around the player: a ring neither of them can leave until it dies.
 * `k` = its rank in the game (0 = the first): it sets the boss and its name (Mk II…). Its stats never change.
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
  const target = targetPlayer(s);
  const p = s.players[target];
  s.arenaX = p.x;
  s.arenaY = p.y;
  s.arenaR = WAVES.arena.radius;
  emit(s, EV_ARENA, p.x, p.y, s.arenaR);
  const e = spawnAround(s, type, a, WAVES.arena.bossDistance, target);
  s.bossSpawned++;
  if (!e) return;
  e.aux2 = k;
  e.ai = 0;
  e.timer = Math.round(BOSS_PATTERNS[type][0].duration * TICK_RATE);
  s.bossId = e.id;
  keepInArena(s, e);
  emit(s, EV_BOSS_SPAWN, e.x, e.y, k, e.type);
}

/** Where are we in the waves? (for the HUD; `clock` = wave clock) */
export function waveInfo(clock: number) {
  const c = Math.max(0, clock - 1);
  const slot = Math.floor(c / MIX_TICKS);
  const pos = c % MIX_TICKS;
  return {
    /** number of the current or just-finished wave (1 = the first) */
    wave: slot + 1,
    slot,
    inWave: pos < WAVE_TICKS,
    /** clock ticks left before the end of the wave (or of the pause) */
    left: pos < WAVE_TICKS ? WAVE_TICKS - pos : MIX_TICKS - pos,
    /** clock ticks before the next boss */
    toBoss: BOSS_TICKS - (clock % BOSS_TICKS),
  };
}

export function updateSpawner(s: GameState): void {
  updateProps(s);
  updateMapItems(s);
  const sb = s.sandbox;
  // Sandbox, duel: the chosen boss arrives on the first step, outside the game's boss count.
  if (sb && sb.duel >= 0) {
    const next = s.bossSpawned;
    spawnBoss(s, sb.duel);
    s.bossSpawned = next;
    sb.duel = -1;
    return;
  }
  // Boss alive, or the calm after its death: no wave, no clock.
  if (s.bossId >= 0 || s.tick < s.calmUntil) return;
  const c = ++s.clock;
  // Boss: at the very end of the pause after the cycle's last wave.
  if (c % BOSS_TICKS === 0 && (!sb || sb.bosses)) {
    spawnBoss(s);
    return;
  }
  const pos = (c - 1) % MIX_TICKS;
  if (pos >= WAVE_TICKS) return; // pause between two waves
  const slot = Math.floor((c - 1) / MIX_TICKS);
  const t = c * DT;
  const rngW = s.rngWaves;
  const diff = DIFFICULTIES[s.difficulty];
  const { rate } = spawnRate(c, s.difficulty);
  // Sandbox: enemy count multiplied, chosen types (all available from the start), optional bosses.
  const mul = sb ? sb.enemyMul : 1;
  const pool = sb?.enemies ?? null;
  const flux = pool ? pool.filter((t) => t !== SWARM_TYPE) : null;

  const mix = mixAt(s.seed, slot);

  // Wave start: announcement (and arrival of a new enemy type).
  if (pos === 0) {
    emit(s, EV_WAVE, 0, 0, slot + 1);
    if (!pool) for (let t = 0; t < NUM_ENEMY_TYPES; t++) if (UNLOCK_SLOT[t] === slot) emit(s, EV_NEW_ENEMY, 0, 0, 0, t);
  }

  s.spawnBudget += rate * DT * mul;
  while (s.spawnBudget >= 1) {
    s.spawnBudget -= 1;
    // Always 3 draws per spawn, whatever happens next.
    const type = flux ? flux[Math.min(flux.length - 1, Math.floor(rngW.next() * flux.length))] : rngW.weighted(mix.weights, mix.total);
    const a = rngW.next() * TWO_PI;
    const j = rngW.next();
    if (type === undefined) continue;
    // A pack (Marbles) costs its size, whether it spawns or not (the stream only depends on the clock).
    const n = PACK[type];
    s.spawnBudget -= n - 1;
    if (s.enemyCount >= WAVES.fluxCap || !underCap(s, type)) continue;
    const target = targetPlayer(s);
    const lead = spawnAround(s, type, a, WAVES.spawnRadius + j * WAVES.spawnJitter, target);
    if (!lead || n <= 1) continue;
    // the others around the first one, in a small disc
    const r = ENEMIES[type].radius * 2.3;
    for (let k = 1; k < n; k++) {
      const ga = k * 2.399963229728653;
      const rr = r * Math.sqrt(k);
      spawnAt(s, type, lead.x + dcos(ga) * rr, lead.y + dsin(ga) * rr, target);
    }
  }
  if (mul <= 0) return;

  // Swarm: once per wave.
  const sw = WAVES.swarm;
  if ((pool ? pool.includes(SWARM_TYPE) : slot >= sw.firstWave - 1) && pos === Math.round(sw.at * TICK_RATE)) {
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

  // Hordes (odd-numbered waves): lots of older enemies at once, from a single side.
  const hd = WAVES.horde;
  if (!pool && slot % 2 === 0 && slot >= hd.firstWave - 1 && pos === Math.round(hd.at * TICK_RATE)) {
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

  // Encirclements (even-numbered waves)
  const rg = WAVES.ring;
  if ((pool ? pool.includes(RING_TYPE) : slot >= rg.firstWave - 1) && slot % 2 === 1 && pos === Math.round(rg.at * TICK_RATE)) {
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
