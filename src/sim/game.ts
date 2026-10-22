/**
 * API publique de la simulation.
 *
 *   const s = createGame({ seed: 'TOFU-FURIEUX-42' });
 *   step(s, [inputCode]);     // un pas = 1/60 s (ou un pas « zéro » si un level-up attend un choix)
 *   s.players[0].hp ...       // lecture directe de l'état
 *
 * La sim est une fonction pure de (seed, suite d'entrées) : aucun accès au DOM, à l'horloge, ni à Math.random.
 */
import { HERO, SCORE, xpForLevel } from '../data/hero';
import { DEFAULT_DIFFICULTY, DIFFICULTIES } from '../data/difficulty';
import { DT, GAME_VERSION, INPUT_AIM_AUTO, INPUT_AIM_BASE, INPUT_CHOICE_BASE, INPUT_DIRS, INPUT_SWAP_BASE, INPUT_SWAP_CANCEL, INPUT_USE, MAX_PLAYERS, SIM_VERSION } from './constants';
import { WorldMap } from './map';
import { Rng, STREAM, deriveSeed, hashString } from './rng';
import { SpatialGrid } from './grid';
import { NavField } from './navfield';
import { Player, makePools, emit, EF_BOSS, EV_CLONE_END, type GameState } from './state';
import { computeStats, updatePlayer, useActivable } from './player';
import { LOOT } from '../data/loot';
import { addWeapon, applyChoice, handleSwapCode, rollOffers } from './levelup';
import { updateSpawner } from './spawner';
import { pushOutOfWalls, updateContacts, updateEnemies } from './enemies';
import { processShatters } from './combat';
import { updateWeapons } from './weapons';
import { updateProjectiles } from './projectiles';
import { updateGems, updatePickups } from './pickups';
import { compactEnemies } from './entities';
import { weaponId } from './registry';
import { applySandbox, type SandboxConfig } from './sandbox';

export interface GameConfig {
  seed: string;
  /** index dans data/difficulty.ts (Normal par défaut) */
  difficulty?: number;
  /** nombre de joueurs dans la même partie (1 pour cette version) */
  players?: number;
  /** réglages du bac à sable : partie libre, jamais classée */
  sandbox?: SandboxConfig;
}

/** Normalise une seed texte : majuscules, espaces retirés aux bords. */
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
    // Le monde est centré sur l'origine, toujours dégagée.
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

/** Point d'ancrage de la grille spatiale : le premier joueur vivant. */
function anchor(s: GameState): Player {
  for (const p of s.players) if (p.alive) return p;
  return s.players[0];
}

/** Le joueur attend-il un choix de level-up ? (la partie est alors figée) */
export function isAwaitingChoice(s: GameState, player = 0): boolean {
  const p = s.players[player];
  return !!p && p.alive && p.pendingLevels > 0 && p.offers.length > 0;
}

/**
 * Avance la simulation d'un pas. `inputs[i]` = code d'entrée du joueur i.
 * Si un joueur doit choisir une amélioration, le monde est figé : le pas ne fait qu'appliquer
 * un éventuel code de choix (200..202) sans faire avancer le temps.
 * Le code 210 (utiliser l'objet activable) et les codes de visée (130..194) sont eux aussi des pas « zéro ».
 */
export function step(s: GameState, inputs: ArrayLike<number>): void {
  s.eventCount = 0;
  if (s.over) return;
  let consumed = false;
  for (let i = 0; i < s.players.length; i++) {
    const p = s.players[i];
    // Filet de sécurité : un niveau en attente a toujours des propositions.
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
    }
  }
  if (consumed) return;
  for (const p of s.players) if (p.alive && p.pendingLevels > 0) return;
  tick(s, inputs);
}

function tick(s: GameState, inputs: ArrayLike<number>): void {
  s.tick++;
  // Clones : ils disparaissent à l'heure, ou avec leur modèle.
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
  }
  const a = anchor(s);
  updateSpawner(s);
  s.grid.build(s.enemies, s.enemyCount, a.x, a.y);
  updateEnemies(s);
  s.grid.build(s.enemies, s.enemyCount, a.x, a.y);
  for (const p of s.players) if (p.alive) updateWeapons(s, p);
  updateProjectiles(s);
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

/** Temps de jeu écoulé en secondes. */
export function gameTime(s: GameState): number {
  return s.tick * DT;
}

export interface ScoreResult {
  tempsSurvecu: number;
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
    tempsSurvecu: Math.round(t * 10) / 10,
    kills: p.kills,
    bossKills: p.bossKills,
    level: p.level,
    score: Math.floor(t) * SCORE.perSecond + p.kills * SCORE.perKill + p.bossKills * SCORE.perBoss,
  };
}

/** Score d'une partie (classement local). La seed est gardée pour pouvoir revalider la partie plus tard. */
export interface ScoreRecord {
  seed: string;
  difficulty: number;
  tempsSurvecu: number;
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
    tempsSurvecu: r.tempsSurvecu,
    kills: r.kills,
    level: r.level,
    score: r.score,
    version: GAME_VERSION,
    date: dateIso,
  };
}

/** Le boss vivant, s'il y en a un (pour l'interface). */
export function findBoss(s: GameState) {
  if (s.bossId < 0) return null;
  for (let i = 0; i < s.enemyCount; i++) {
    const e = s.enemies[i];
    if (e.alive && e.flags & EF_BOSS) return e;
  }
  return null;
}
