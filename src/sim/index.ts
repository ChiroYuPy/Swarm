/** Point d'entrée de la simulation (logique pure, sans DOM). */
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
export { availableFusions, offerOrder, canSwap } from './levelup';
export { WorldMap, generateChunk, circleHitsObstacle, OB_CIRCLE, OB_HEX, OB_RECT, type Obstacle } from './map';
export {
  FUSION_TABLE,
  weaponDef,
  weaponLevel,
  weaponMaxLevel,
  BEHAVIOR,
  ENEMY_BEHAVIOR,
  BOSS_PATTERNS,
  BOSS_TICKS,
  BOSS_TYPES,
  MIXES,
  MIX_TICKS,
  WAVE_TICKS,
  WALL_TYPE,
  EGG_TYPE,
} from './registry';
export { hashString, Rng, STREAM, deriveSeed } from './rng';
export { spawnRate, mixAt, waveInfo } from './spawner';
export { applyBuffs } from './player';
