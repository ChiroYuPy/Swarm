/** Simulation entry point (pure logic, no DOM). */
export * from './constants';
export * from './state';
export {
  createGame,
  step,
  isAwaitingChoice,
  normalizeSeed,
  gameTime,
  computeScore,
  makeScoreRecord,
  findBoss,
  type GameConfig,
  type ScoreRecord,
  type ScoreResult,
} from './game';
export { compileSandbox, sandboxStartTick, MAX_DUEL_MARK, MAX_START_WAVE, type SandboxConfig } from './sandbox';
export { hashState, serializeState, deserializeState } from './serialize';
export { encodeMove, aimDir, aimCode, choiceCode, swapCode, isChoiceCode, isZeroTimeCode, encodeLog, decodeLog, InputLog } from './inputcodec';
export { replayToEnd, ReplayCursor } from './replay';
export { availableFusions, canSwap } from './levelup';
export { WorldMap, generateChunk, circleHitsObstacle, OB_CIRCLE, OB_HEX, OB_RECT, type Obstacle } from './map';
export {
  FUSION_TABLE,
  weaponDef,
  weaponLevel,
  weaponMaxLevel,
  BEHAVIOR,
  ENEMY_BEHAVIOR,
  BOSS_CONFIGS,
  BOSS_PATTERNS,
  BOSS_TICKS,
  BOSS_TYPES,
  PLAN_MIXES,
  ENDLESS_MIXES,
  PLAN_WAVES,
  VICTORY_BOSS,
  UNLOCK_SLOT,
  SPLIT_INTO,
  MIX_TICKS,
  WAVE_TICKS,
  WALL_TYPE,
  WALL_RISE,
  EGG_TYPE,
  HORNETS_WEAPON,
  BLACK_HOLE_WEAPON,
  VAMPIRE_FIELD_WEAPON,
  BOT_FAVORITE_PASSIVES,
} from './registry';
export { hashString, Rng, STREAM, deriveSeed } from './rng';
export { spawnRate, mixAt, waveInfo } from './spawner';
export { applyBuffs } from './player';
