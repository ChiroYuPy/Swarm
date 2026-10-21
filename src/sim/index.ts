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
export { compileSandbox, type SandboxConfig } from './sandbox';
export { hashState, serializeState, deserializeState } from './serialize';
export { encodeMove, choiceCode, isChoiceCode, isZeroTimeCode, encodeLog, decodeLog, InputLog } from './inputcodec';
export { replayToEnd, ReplayCursor } from './replay';
export { availableFusions, offerOrder } from './levelup';
export { WorldMap, generateChunk, circleHitsObstacle, OB_CIRCLE, OB_HEX, OB_RECT, type Obstacle } from './map';
export { FUSION_TABLE, weaponDef, weaponLevel, weaponMaxLevel, BEHAVIOR, ENEMY_BEHAVIOR } from './registry';
export { hashString, Rng, STREAM, deriveSeed } from './rng';
export { spawnRate } from './spawner';
export { applyBuffs } from './player';
