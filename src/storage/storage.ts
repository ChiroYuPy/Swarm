/**
 * Versioned local save (localStorage, always inside try/catch): settings, last difficulty,
 * local leaderboard (top 10 per difficulty), last sandbox settings.
 * To evolve the format: bump SAVE_VERSION and add a step in `migrate`.
 */
import type { SandboxConfig, ScoreRecord } from '../sim';
import { DEFAULT_DIFFICULTY, DIFFICULTIES } from '../data/difficulty';
import { HERO } from '../data/hero';
import { DEFAULT_LOCALE, isLocale, type Locale } from '../i18n';
import { LEGACY_ENEMY_IDS, LEGACY_PASSIVE_IDS, LEGACY_WEAPON_IDS, upgradeId } from './legacy-ids';

export const SAVE_KEY = 'swarm.save';
/** Key used before the project was renamed, moved to SAVE_KEY on first load. */
export const LEGACY_SAVE_KEY = 'neonawak.save';
export const SAVE_VERSION = 3;
export const TOP_PER_DIFFICULTY = 10;

export interface Settings {
  /** master volume 0..1 */
  volume: number;
  /** music volume 0..1 */
  music: number;
  /** sound effects volume 0..1 */
  sfx: number;
  muted: boolean;
  quality: 'high' | 'low';
  shake: boolean;
  damageNumbers: boolean;
  showFps: boolean;
  /** pauses the game when the window loses focus */
  autoPause: boolean;
  /** UI language (saves without it read as the default, French) */
  language: Locale;
}

export interface SaveData {
  version: number;
  settings: Settings;
  /** last chosen difficulty */
  difficulty: number;
  /** best scores, at most TOP_PER_DIFFICULTY per difficulty */
  scores: ScoreRecord[];
  /** last sandbox settings */
  sandbox: SandboxSetup;
}

/** A sandbox game: base difficulty + settings. */
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
      startWave: 1,
      enemyMul: 1,
      enemies: null,
      bosses: true,
      duel: null,
      duelMark: 1,
      summons: true,
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
  language: DEFAULT_LOCALE,
};

export function defaultSave(): SaveData {
  return { version: SAVE_VERSION, settings: { ...DEFAULT_SETTINGS }, difficulty: DEFAULT_DIFFICULTY, scores: [], sandbox: defaultSandbox() };
}

/** Migrates any known version to the current one. */
export function migrate(raw: unknown): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  let version = typeof r.version === 'number' ? r.version : 0;
  let data: Record<string, unknown> = { ...r };
  if (version === 0) {
    // v0 (prototype): { pseudo, best: ScoreRecord[] }
    data = { scores: Array.isArray(r.best) ? r.best : [], settings: r.settings };
    version = 1;
  }
  if (version === 1) {
    // v1: pseudo, seedBests, replays, daily challenge. Only the settings and the scores are kept (as Normal).
    const old = Array.isArray(data.scores) ? (data.scores as Record<string, unknown>[]) : [];
    data = {
      settings: data.settings,
      difficulty: DEFAULT_DIFFICULTY,
      scores: old.map((s) => ({ ...s, difficulty: DEFAULT_DIFFICULTY, level: typeof s.level === 'number' ? s.level : 0 })),
    };
    version = 2;
  }
  if (version === 2) {
    // v2 → v3: content ids renamed to English (sandbox setup), score field tempsSurvecu → survivedSec.
    data = { ...data, scores: Array.isArray(data.scores) ? data.scores.map(upgradeScore) : [], sandbox: upgradeSandbox(data.sandbox) };
    version = 3;
  }
  if (version > SAVE_VERSION) return base; // save from a future version: do not break it, ignore it
  const d = typeof data.difficulty === 'number' ? data.difficulty : DEFAULT_DIFFICULTY;
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(typeof data.settings === 'object' && data.settings ? (data.settings as Partial<Settings>) : {}) };
  // No save version bump for the language: a missing (older save) or unknown value reads as the default.
  if (!isLocale(settings.language)) settings.language = DEFAULT_LOCALE;
  return {
    version: SAVE_VERSION,
    settings,
    difficulty: Math.max(0, Math.min(DIFFICULTIES.length - 1, d)),
    scores: Array.isArray(data.scores) ? (data.scores as ScoreRecord[]).filter(isScore) : [],
    sandbox: readSandbox(data.sandbox),
  };
}

/** v2 → v3 score record: `tempsSurvecu` becomes `survivedSec`. */
function upgradeScore(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const { tempsSurvecu, ...rest } = raw as Record<string, unknown>;
  return { ...rest, survivedSec: typeof rest.survivedSec === 'number' ? rest.survivedSec : typeof tempsSurvecu === 'number' ? tempsSurvecu : 0 };
}

/** v2 → v3 sandbox setup: legacy weapon / passive / enemy / duel ids mapped to the current ones, unknown ids dropped. */
function upgradeSandbox(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const setup = raw as Record<string, unknown>;
  if (!setup.rules || typeof setup.rules !== 'object') return setup;
  const rules = { ...(setup.rules as Record<string, unknown>) };
  const loadout = (list: unknown, table: Readonly<Record<string, string>>) =>
    Array.isArray(list)
      ? list.flatMap((x) => {
          const id = x && typeof x === 'object' ? upgradeId(table, (x as { id?: unknown }).id) : null;
          return id ? [{ ...(x as object), id }] : [];
        })
      : list;
  if ('weapons' in rules) rules.weapons = loadout(rules.weapons, LEGACY_WEAPON_IDS);
  if ('passives' in rules) rules.passives = loadout(rules.passives, LEGACY_PASSIVE_IDS);
  if (Array.isArray(rules.enemies)) rules.enemies = rules.enemies.flatMap((id) => upgradeId(LEGACY_ENEMY_IDS, id) ?? []);
  if (typeof rules.duel === 'string') rules.duel = upgradeId(LEGACY_ENEMY_IDS, rules.duel);
  return { ...setup, rules };
}

/** Sandbox settings read back carefully: any missing or invalid field falls back to its default value. */
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
      k === 'enemies' || k === 'item' || k === 'duel'
        ? v === null || (k === 'enemies' ? Array.isArray(v) : typeof v === 'string')
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

/** Save written by a newer version of the game: ignore it and, above all, do not overwrite it. */
let futureSaveDetected = false;

/** Raw save text, moving a legacy-key save to SAVE_KEY if that is all there is. */
function readSaveText(): string | null {
  const txt = localStorage.getItem(SAVE_KEY);
  if (txt !== null) return txt;
  const legacy = localStorage.getItem(LEGACY_SAVE_KEY);
  if (legacy === null) return null;
  try {
    localStorage.setItem(SAVE_KEY, legacy);
    localStorage.removeItem(LEGACY_SAVE_KEY);
  } catch {
    // keep the legacy key, it will be retried on next load
  }
  return legacy;
}

export function loadSave(): SaveData {
  try {
    const txt = readSaveText();
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

const byScore = (a: ScoreRecord, b: ScoreRecord) => b.score - a.score || b.survivedSec - a.survivedSec;

/** Leaderboard of a difficulty, from best to worst. */
export function topScores(data: SaveData, difficulty: number): ScoreRecord[] {
  return data.scores.filter((s) => s.difficulty === difficulty).sort(byScore);
}

export function bestScore(data: SaveData, difficulty: number): number {
  return topScores(data, difficulty)[0]?.score ?? 0;
}

/** Records a score. Returns its rank within its difficulty (1 = first, 0 = outside the top). */
export function recordScore(data: SaveData, rec: ScoreRecord): number {
  const list = [...topScores(data, rec.difficulty), rec].sort(byScore).slice(0, TOP_PER_DIFFICULTY);
  data.scores = [...data.scores.filter((s) => s.difficulty !== rec.difficulty), ...list];
  return list.indexOf(rec) + 1;
}
