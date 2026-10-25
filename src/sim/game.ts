/**
 * Public API of the simulation.
 *
 *   const s = createGame({ seed: 'TOFU-FURIEUX-42' });
 *   step(s, [inputCode]);     // one step = 1/60 s (or a "zero-time" step if a level-up awaits a choice)
 *   s.players[0].hp ...       // direct read of the state
 *
 * The sim is a pure function of (seed, input sequence): no access to the DOM, the clock, or Math.random.
 */
import { HERO, SCORE, xpForLevel } from '../data/hero';
import { DEFAULT_DIFFICULTY, DIFFICULTIES } from '../data/difficulty';
import { DT, GAME_VERSION, INPUT_AIM_AUTO, INPUT_AIM_BASE, INPUT_CHOICE_BASE, INPUT_DIRS, INPUT_SWAP_BASE, INPUT_SWAP_CANCEL, INPUT_USE, INPUT_DASH, MAX_PLAYERS, SIM_VERSION } from './constants';
import { WorldMap } from './map';
import { Rng, STREAM, deriveSeed, hashString } from './rng';
import { SpatialGrid } from './grid';
import { NavField } from './navfield';
import { Player, makePools, emit, EF_BOSS, EV_CLONE_END, type GameState } from './state';
import { computeStats, startDash, updatePlayer, useActivable } from './player';
import { LOOT } from '../data/loot';
import { addWeapon, applyChoice, handleSwapCode, rollOffers } from './levelup';
import { updateSpawner } from './spawner';
import { keepInArena, pushOutOfWalls, updateContacts, updateEnemies } from './enemies';
import { processShatters, updateBurns } from './combat';
import { SHURIKEN_BOX_X, SHURIKEN_BOX_Y, updateWeapons } from './weapons';
import { updateProjectiles } from './projectiles';
import { updateGems, updatePickups } from './pickups';
import { compactEnemies } from './entities';
import { weaponId } from './registry';
import { applySandbox, type SandboxConfig } from './sandbox';

export interface GameConfig {
  seed: string;
  /** index into data/difficulty.ts (Normal by default) */
  difficulty?: number;
  /** number of players in the same game (1 for this version) */
  players?: number;
  /** sandbox settings: free game, never ranked */
  sandbox?: SandboxConfig;
}

/** Normalizes a text seed: uppercase, surrounding spaces trimmed. */
export function normalizeSeed(seed: string): string {
  const s = seed.trim().toUpperCase();
  return s.length > 0 ? s.slice(0, 40) : '0';
}

export function createGame(cfg: GameConfig): GameState {
  const seedLabel = normalizeSeed(cfg.seed);
  const seed = hashString(seedLabel);
  const pools = makePools();
  const n = Math.max(1, Math.min(MAX_PLAYERS, cfg.players ?? 1));
  const difficulty = Math.max(0, Math.min(DIFFICULTIES.length - 1, cfg.difficulty ?? DEFAULT_DIFFICULTY));
  const s: GameState = {
    version: SIM_VERSION,
    seed,
    seedLabel,
    difficulty,
    tick: 0,
    over: false,
    map: new WorldMap(seed),
    players: [],
    enemies: pools.enemies,
    enemyCount: 0,
    nextEnemyId: 1,
    projectiles: pools.projectiles,
    projCount: 0,
    gems: pools.gems,
    gemCount: 0,
    gemMergeCursor: 0,
    pickups: pools.pickups,
    pickupCount: 0,
    rngWaves: new Rng(deriveSeed(seed, STREAM.WAVES)),
    rngLoot: new Rng(deriveSeed(seed, STREAM.LOOT)),
    spawnBudget: 0,
    bossSpawned: 0,
    bossId: -1,
    clock: 0,
    calmUntil: 0,
    arenaX: 0,
    arenaY: 0,
    arenaR: 0,
    won: false,
    boxX: SHURIKEN_BOX_X,
    boxY: SHURIKEN_BOX_Y,
    chestCount: 0,
    totalKills: 0,
    clockUntil: 0,
    sandbox: null,
    grid: new SpatialGrid(),
    nav: new NavField(),
    shatters: [],
    events: pools.events,
    eventCount: 0,
  };
  for (let i = 0; i < n; i++) {
    const p = new Player();
    p.index = i;
    p.r = HERO.radius;
    // The world is centred on the origin, which is always clear.
    p.x = p.px = (i - (n - 1) / 2) * 40;
    p.y = p.py = 0;
    computeStats(p);
    p.hp = p.stats.maxHp;
    p.xpNext = xpForLevel(1);
    p.swaps = LOOT.swaps.start;
    addWeapon(p, weaponId(HERO.startWeapon));
    s.players.push(p);
  }
  if (cfg.sandbox) applySandbox(s, cfg.sandbox);
  return s;
}

/** Anchor point of the spatial grid: the first living player. */
function anchor(s: GameState): Player {
  for (const p of s.players) if (p.alive) return p;
  return s.players[0];
}

/** Is the player waiting for a level-up choice? (the game is then frozen) */
export function isAwaitingChoice(s: GameState, player = 0): boolean {
  const p = s.players[player];
  return !!p && p.alive && p.pendingLevels > 0 && p.offers.length > 0;
}

/**
 * Advances the simulation by one step. `inputs[i]` = input code of player i.
 * If a player must pick an upgrade, the world is frozen: the step only applies
 * a possible choice code (200..202) without advancing time.
 * Codes 210 (use the active item), 211 (dash) and the aim codes (130..194) are "zero-time" steps too.
 */
export function step(s: GameState, inputs: ArrayLike<number>): void {
  s.eventCount = 0;
  if (s.over) return;
  let consumed = false;
  for (let i = 0; i < s.players.length; i++) {
    const p = s.players[i];
    // Safety net: a pending level always has offers.
    if (p.alive && p.pendingLevels > 0 && p.offers.length === 0) rollOffers(s, p);
    const code = inputs[i] ?? 0;
    if (p.alive && p.pendingLevels > 0 && p.offers.length > 0 && code >= INPUT_CHOICE_BASE && code < INPUT_CHOICE_BASE + 3) {
      applyChoice(s, p, code - INPUT_CHOICE_BASE);
      consumed = true;
    } else if (code >= INPUT_AIM_AUTO && code < INPUT_AIM_BASE + INPUT_DIRS) {
      p.aim = code - INPUT_AIM_BASE;
      consumed = true;
    } else if (code >= INPUT_SWAP_BASE && code <= INPUT_SWAP_CANCEL) {
      handleSwapCode(s, p, code);
      consumed = true;
    } else if (code === INPUT_USE) {
      if (p.alive && p.pendingLevels === 0) {
        s.grid.build(s.enemies, s.enemyCount, anchor(s).x, anchor(s).y);
        useActivable(s, p);
        processShatters(s);
        compactEnemies(s);
      }
      consumed = true;
    } else if (code === INPUT_DASH) {
      if (p.alive && p.pendingLevels === 0) startDash(s, p);
      consumed = true;
    }
  }
  if (consumed) return;
  for (const p of s.players) if (p.alive && p.pendingLevels > 0) return;
  tick(s, inputs);
}

function tick(s: GameState, inputs: ArrayLike<number>): void {
  s.tick++;
  // Clones: they vanish on time, or along with their original.
  for (const c of s.players) {
    if (c.master < 0 || !c.alive) continue;
    if (s.tick >= c.expires || !s.players[c.master].alive) {
      c.alive = false;
      emit(s, EV_CLONE_END, c.x, c.y, 0, 0, 0, 0, c.index);
    }
  }
  for (let i = 0; i < s.players.length; i++) {
    updatePlayer(s, s.players[i], inputs[i] ?? 0);
    pushOutOfWalls(s, s.players[i]);
    keepInArena(s, s.players[i]);
  }
  const a = anchor(s);
  updateSpawner(s);
  s.grid.build(s.enemies, s.enemyCount, a.x, a.y);
  updateEnemies(s);
  s.grid.build(s.enemies, s.enemyCount, a.x, a.y);
  for (const p of s.players) if (p.alive) updateWeapons(s, p);
  updateProjectiles(s);
  updateBurns(s);
  updateContacts(s);
  processShatters(s);
  compactEnemies(s);
  updateGems(s);
  updatePickups(s);
  let anyAlive = false;
  for (const p of s.players) {
    if (!p.alive || p.master >= 0) continue;
    anyAlive = true;
    if (p.pendingLevels > 0 && p.offers.length === 0) rollOffers(s, p);
  }
  if (!anyAlive) s.over = true;
}

/** Elapsed game time in seconds. */
export function gameTime(s: GameState): number {
  return s.tick * DT;
}

export interface ScoreResult {
  survivedSec: number;
  kills: number;
  bossKills: number;
  level: number;
  score: number;
}

export function computeScore(s: GameState, player = 0): ScoreResult {
  const p = s.players[player];
  const ticks = p.deathTick >= 0 ? p.deathTick : s.tick;
  const t = ticks * DT;
  return {
    survivedSec: Math.round(t * 10) / 10,
    kills: p.kills,
    bossKills: p.bossKills,
    level: p.level,
    score: Math.floor(t) * SCORE.perSecond + p.kills * SCORE.perKill + p.bossKills * SCORE.perBoss,
  };
}

/** Score of a game (local leaderboard). The seed is kept so the game can be revalidated later. */
export interface ScoreRecord {
  seed: string;
  difficulty: number;
  survivedSec: number;
  kills: number;
  level: number;
  score: number;
  version: string;
  date: string;
}

export function makeScoreRecord(s: GameState, dateIso: string, player = 0): ScoreRecord {
  const r = computeScore(s, player);
  return {
    seed: s.seedLabel,
    difficulty: s.difficulty,
    survivedSec: r.survivedSec,
    kills: r.kills,
    level: r.level,
    score: r.score,
    version: GAME_VERSION,
    date: dateIso,
  };
}

/** The living boss, if any (for the UI). */
export function findBoss(s: GameState) {
  if (s.bossId < 0) return null;
  for (let i = 0; i < s.enemyCount; i++) {
    const e = s.enemies[i];
    if (e.alive && e.flags & EF_BOSS) return e;
  }
  return null;
}
