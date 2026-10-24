/**
 * Data shapes exchanged between main.ts and the UI: the app callbacks the screens call (AppApi), and
 * what main.ts hands to the level-up, pause and game over screens. Re-exported from ui.ts.
 */
import type { ScoreRecord } from '../sim';
import type { StatDetail } from '../render/hud';
import type { SandboxSetup, SaveData, Settings } from '../storage/storage';

/** Échange d'arme au level-up : charges, emplacement en cours d'échange (-1), armes du joueur. */
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
  /** échange d'arme au level-up : ouvrir pour l'emplacement `slot`, ou annuler */
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
  /** multiplicateurs actuels, pour afficher les vrais chiffres des armes */
  might: number;
  cooldownMul: number;
}

/** Partie en cours, pour le résumé de la pause. */
export interface RunInfo {
  /** score, temps, niveau, éliminés et difficulté, comme ils seraient enregistrés maintenant */
  record: ScoreRecord;
  bossKills: number;
  /** meilleur score de la difficulté avant cette partie (0 : aucun) */
  best: number;
  sandbox: boolean;
}

export interface DeathInfo {
  record: ScoreRecord;
  bossKills: number;
  /** meilleur score de la difficulté avant cette partie */
  bestBefore: number;
  /** rang obtenu dans le top 10 de la difficulté (0 = hors classement) */
  rank: number;
  build: BuildInfo;
  canReplay: boolean;
  isReplay: boolean;
  /** partie de bac à sable (non classée) ; `survived` : terminée sans mourir */
  sandbox: boolean;
  survived: boolean;
}

export type NavDir = 'left' | 'right' | 'up' | 'down';
