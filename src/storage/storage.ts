/**
 * Sauvegarde locale versionnée (localStorage, toujours sous try/catch) : réglages, dernière difficulté,
 * classement local (top 10 par difficulté), derniers réglages du bac à sable.
 * Pour faire évoluer le format : incrémenter SAVE_VERSION et ajouter une étape dans `migrate`.
 */
import type { SandboxConfig, ScoreRecord } from '../sim';
import { DEFAULT_DIFFICULTY, DIFFICULTIES } from '../data/difficulty';
import { HERO } from '../data/hero';

export const SAVE_KEY = 'neonawak.save';
export const SAVE_VERSION = 2;
export const TOP_PER_DIFFICULTY = 10;

export interface Settings {
  /** volume général 0..1 */
  volume: number;
  /** volume de la musique 0..1 */
  music: number;
  /** volume des effets sonores 0..1 */
  sfx: number;
  muted: boolean;
  quality: 'high' | 'low';
  shake: boolean;
  damageNumbers: boolean;
  showFps: boolean;
  /** met la partie en pause quand la fenêtre perd le focus */
  autoPause: boolean;
}

export interface SaveData {
  version: number;
  settings: Settings;
  /** dernière difficulté choisie */
  difficulty: number;
  /** meilleurs scores, au plus TOP_PER_DIFFICULTY par difficulté */
  scores: ScoreRecord[];
  /** derniers réglages du bac à sable */
  sandbox: SandboxSetup;
}

/** Une partie de bac à sable : difficulté de base + réglages. */
export interface SandboxSetup {
  difficulty: number;
  rules: SandboxConfig;
}

export function defaultSandbox(): SandboxSetup {
  return {
    difficulty: DEFAULT_DIFFICULTY,
    rules: {
      invincible: true,
      level: 1,
      startMinute: 0,
      enemyMul: 1,
      enemies: null,
      bosses: true,
      might: 1,
      xp: 1,
      weapons: [{ id: HERO.startWeapon, level: 1 }],
      passives: [],
      item: null,
    },
  };
}

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.7,
  music: 0.45,
  sfx: 0.8,
  muted: false,
  quality: 'high',
  shake: true,
  damageNumbers: true,
  showFps: false,
  autoPause: true,
};

export function defaultSave(): SaveData {
  return { version: SAVE_VERSION, settings: { ...DEFAULT_SETTINGS }, difficulty: DEFAULT_DIFFICULTY, scores: [], sandbox: defaultSandbox() };
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
    sandbox: readSandbox(data.sandbox),
  };
}

/** Réglages du bac à sable relus avec prudence : tout champ manquant ou invalide reprend sa valeur par défaut. */
function readSandbox(raw: unknown): SandboxSetup {
  const def = defaultSandbox();
  if (!raw || typeof raw !== 'object') return def;
  const r = raw as Partial<SandboxSetup>;
  const rules = (r.rules && typeof r.rules === 'object' ? r.rules : {}) as Partial<SandboxConfig>;
  const out = { ...def.rules };
  for (const k of Object.keys(out) as (keyof SandboxConfig)[]) {
    const v = rules[k];
    const d = def.rules[k];
    const ok =
      k === 'enemies' || k === 'item'
        ? v === null || (k === 'item' ? typeof v === 'string' : Array.isArray(v))
        : k === 'weapons' || k === 'passives'
          ? Array.isArray(v)
          : typeof v === typeof d;
    if (ok) (out as Record<string, unknown>)[k] = v;
  }
  const d = typeof r.difficulty === 'number' ? r.difficulty : def.difficulty;
  return { difficulty: Math.max(0, Math.min(DIFFICULTIES.length - 1, d)), rules: out };
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
