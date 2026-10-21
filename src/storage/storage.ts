/**
 * Sauvegarde locale versionnée (localStorage, toujours sous try/catch) : réglages, dernière difficulté,
 * classement local (top 10 par difficulté).
 * Pour faire évoluer le format : incrémenter SAVE_VERSION et ajouter une étape dans `migrate`.
 */
import type { ScoreRecord } from '../sim';
import { DEFAULT_DIFFICULTY, DIFFICULTIES } from '../data/difficulty';

export const SAVE_KEY = 'neonawak.save';
export const SAVE_VERSION = 2;
export const TOP_PER_DIFFICULTY = 10;

export interface Settings {
  /** volume général 0..1 */
  volume: number;
  /** volume de la musique 0..1 */
  music: number;
  muted: boolean;
  quality: 'high' | 'low';
  shake: boolean;
  damageNumbers: boolean;
  showFps: boolean;
}

export interface SaveData {
  version: number;
  settings: Settings;
  /** dernière difficulté choisie */
  difficulty: number;
  /** meilleurs scores, au plus TOP_PER_DIFFICULTY par difficulté */
  scores: ScoreRecord[];
}

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.7,
  music: 0.45,
  muted: false,
  quality: 'high',
  shake: true,
  damageNumbers: true,
  showFps: false,
};

export function defaultSave(): SaveData {
  return { version: SAVE_VERSION, settings: { ...DEFAULT_SETTINGS }, difficulty: DEFAULT_DIFFICULTY, scores: [] };
}

/** Migre n'importe quelle version connue vers la version courante. */
export function migrate(raw: unknown): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  let version = typeof r.version === 'number' ? r.version : 0;
  let data: Record<string, unknown> = { ...r };
  if (version === 0) {
    // v0 (prototype) : { pseudo, best: ScoreRecord[] }
    data = { scores: Array.isArray(r.best) ? r.best : [], settings: r.settings };
    version = 1;
  }
  if (version === 1) {
    // v1 : pseudo, seedBests, replays, défi du jour. On ne garde que les réglages et les scores (en Normal).
    const old = Array.isArray(data.scores) ? (data.scores as Record<string, unknown>[]) : [];
    data = {
      settings: data.settings,
      difficulty: DEFAULT_DIFFICULTY,
      scores: old.map((s) => ({ ...s, difficulty: DEFAULT_DIFFICULTY, level: typeof s.level === 'number' ? s.level : 0 })),
    };
    version = 2;
  }
  if (version > SAVE_VERSION) return base; // sauvegarde d'une version future : on ne la casse pas, on l'ignore
  const d = typeof data.difficulty === 'number' ? data.difficulty : DEFAULT_DIFFICULTY;
  return {
    version: SAVE_VERSION,
    settings: { ...DEFAULT_SETTINGS, ...(typeof data.settings === 'object' && data.settings ? (data.settings as Partial<Settings>) : {}) },
    difficulty: Math.max(0, Math.min(DIFFICULTIES.length - 1, d)),
    scores: Array.isArray(data.scores) ? (data.scores as ScoreRecord[]).filter(isScore) : [],
  };
}

function isScore(x: unknown): x is ScoreRecord {
  const r = x as ScoreRecord;
  return !!r && typeof r.score === 'number' && typeof r.difficulty === 'number';
}

/** Sauvegarde écrite par une version plus récente du jeu : on l'ignore et, surtout, on ne l'écrase pas. */
let futureSaveDetected = false;

export function loadSave(): SaveData {
  try {
    const txt = localStorage.getItem(SAVE_KEY);
    if (!txt) return defaultSave();
    const raw = JSON.parse(txt) as { version?: unknown };
    if (typeof raw.version === 'number' && raw.version > SAVE_VERSION) futureSaveDetected = true;
    return migrate(raw);
  } catch {
    return defaultSave();
  }
}

export function writeSave(data: SaveData): boolean {
  if (futureSaveDetected) return false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

const byScore = (a: ScoreRecord, b: ScoreRecord) => b.score - a.score || b.tempsSurvecu - a.tempsSurvecu;

/** Classement d'une difficulté, du meilleur au moins bon. */
export function topScores(data: SaveData, difficulty: number): ScoreRecord[] {
  return data.scores.filter((s) => s.difficulty === difficulty).sort(byScore);
}

export function bestScore(data: SaveData, difficulty: number): number {
  return topScores(data, difficulty)[0]?.score ?? 0;
}

/** Enregistre un score. Renvoie son rang dans sa difficulté (1 = premier, 0 = hors du top). */
export function recordScore(data: SaveData, rec: ScoreRecord): number {
  const list = [...topScores(data, rec.difficulty), rec].sort(byScore).slice(0, TOP_PER_DIFFICULTY);
  data.scores = [...data.scores.filter((s) => s.difficulty !== rec.difficulty), ...list];
  return list.indexOf(rec) + 1;
}
