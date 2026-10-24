/**
 * Data shapes exchanged between the app (app/app.ts) and the UI: the app callbacks the screens call (AppApi), and
 * what the app hands to the level-up, pause and game over screens. Re-exported from ui.ts.
 */
import type { ScoreRecord } from '../sim';
import type { StatDetail } from '../render/hud';
import type { SandboxSetup, SaveData, Settings } from '../storage/storage';

/** Weapon swap on level-up: charges, slot being swapped (-1), player weapons. */
export interface LevelUpSwap {
  charges: number;
  slot: number;
  weapons: { id: string; name: string; color: string; can: boolean }[];
}

export interface AppApi {
  save: SaveData;
  play(difficulty: number): void;
  playSandbox(setup: SandboxSetup): void;
  retry(): void;
  pickOffer(i: number): void;
  /** weapon swap on level-up: open it for slot `slot`, or cancel */
  startSwap(slot: number): void;
  cancelSwap(): void;
  resume(): void;
  quit(): void;
  toMenu(screen?: 'menu' | 'sandbox'): void;
  watchLastRun(): void;
  applySettings(s: Settings): void;
  uiSound(kind: 'ui' | 'uiMove' | 'uiBack'): void;
  introPowerOn(): void;
  introDone(): void;
}

export interface BuildInfo {
  weapons: { id: string; level: number; fusion: boolean }[];
  passives: { id: string; level: number }[];
  stats: StatDetail[];
  /** current multipliers, to show the real weapon numbers */
  might: number;
  cooldownMul: number;
}

/** Current run, for the pause summary. */
export interface RunInfo {
  /** score, time, level, kills and difficulty, as they would be recorded now */
  record: ScoreRecord;
  bossKills: number;
  /** best score in the difficulty before this run (0: none) */
  best: number;
  sandbox: boolean;
}

export interface DeathInfo {
  record: ScoreRecord;
  bossKills: number;
  /** best score in the difficulty before this run */
  bestBefore: number;
  /** rank reached in the difficulty's top 10 (0 = unranked) */
  rank: number;
  build: BuildInfo;
  canReplay: boolean;
  isReplay: boolean;
  /** sandbox run (unranked); `survived`: ended without dying */
  sandbox: boolean;
  survived: boolean;
}

export type NavDir = 'left' | 'right' | 'up' | 'down';
