/**
 * Sandbox: a game with free settings (invincibility, starting level and loadout, chosen
 * enemies…), never ranked. The settings are part of the game configuration: it stays
 * deterministic and replayable like any other.
 */
import { BOSS_ORDER } from '../data/enemies';
import { xpForLevel } from '../data/hero';
import { PICKUPS } from '../data/loot';
import { MAX_ITEM_LEVEL, MAX_PASSIVE_SLOTS, MAX_WEAPON_SLOTS } from './constants';
import { BEHAVIOR, BOSS_TICKS, ENEMY_BEHAVIOR, ENEMY_INDEX, FUSION_TABLE, MIX_TICKS, PASSIVE_INDEX, WEAPON_INDEX, PROP_TYPE, weaponMaxLevel } from './registry';
import { addWeapon } from './levelup';
import { computeStats } from './player';
import { PassiveInst, type GameState, type Player, type SandboxRules } from './state';

export interface SandboxConfig {
  invincible: boolean;
  /** hero's starting level */
  level: number;
  /** starting wave (1 = the first): enemies are as strong and varied as at that point */
  startWave: number;
  /** enemy count multiplier (0 = none) */
  enemyMul: number;
  /** allowed enemy types (ids), null = normal progression */
  enemies: string[] | null;
  bosses: boolean;
  /** duel: this boss (id) arrives right at the start, alone, with the strength of its appearance no. `duelMark` (1 = Mk I) */
  duel: string | null;
  duelMark: number;
  /** boss reinforcements (and the Queen's eggs) */
  summons: boolean;
  /** hero damage multiplier */
  might: number;
  /** collected XP multiplier */
  xp: number;
  /** starting loadout (replaces the starting weapon) */
  weapons: { id: string; level: number }[];
  passives: { id: string; level: number }[];
  /** active item held at the start (id from data/loot.ts), null = none */
  item: string | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

export function compileSandbox(c: SandboxConfig): SandboxRules {
  return {
    invincible: !!c.invincible,
    enemyMul: clamp(c.enemyMul, 0, 10),
    enemies: c.enemies
      ? c.enemies.map((id) => ENEMY_INDEX[id]).filter((t) => t !== undefined && ENEMY_BEHAVIOR[t] !== BEHAVIOR.BOSS && t !== PROP_TYPE)
      : null,
    bosses: !!c.bosses,
    summons: c.summons !== false,
    duel: duelRank(c),
    xp: clamp(c.xp, 0, 100),
  };
}

/** Rank of the duel boss among a game's bosses (Ricochet star Mk II = its 2nd appearance), -1 = none. */
function duelRank(c: SandboxConfig): number {
  const i = c.duel ? BOSS_ORDER.indexOf(c.duel) : -1;
  return i < 0 ? -1 : (clamp(Math.round(c.duelMark), 1, MAX_DUEL_MARK) - 1) * BOSS_ORDER.length + i;
}
export const MAX_DUEL_MARK = 5;

/** First tick of the starting wave. */
export function sandboxStartTick(c: SandboxConfig): number {
  return (clamp(Math.round(c.startWave), 1, MAX_START_WAVE) - 1) * MIX_TICKS;
}
export const MAX_START_WAVE = 40;

/** Sets up the hero and the clock from the settings. Unknown ids (old save) are ignored. */
export function applySandbox(s: GameState, c: SandboxConfig): void {
  s.sandbox = compileSandbox(c);
  const startTick = sandboxStartTick(c);
  s.tick = startTick;
  s.clock = startTick;
  // Bosses already "past" count: the next one has the strength (and rank) it would have had at that point.
  s.bossSpawned = Math.floor(startTick / BOSS_TICKS);
  for (const p of s.players) applyLoadout(p, c);
}

function applyLoadout(p: Player, c: SandboxConfig): void {
  p.weapons.length = 0;
  for (const w of c.weapons) {
    const def = WEAPON_INDEX[w.id];
    if (def === undefined || p.weapons.length >= MAX_WEAPON_SLOTS || p.weapons.some((x) => x.def === def)) continue;
    addWeapon(p, def).level = clamp(Math.round(w.level), 1, weaponMaxLevel(def));
  }
  // An evolution already held: its base weapon is no longer offered (as after a real evolution).
  for (const f of FUSION_TABLE) {
    if (!p.weapons.some((x) => x.def === f.result)) continue;
    if (!p.weapons.some((x) => x.def === f.weapon) && !p.banned.includes(f.weapon)) p.banned.push(f.weapon);
  }
  p.passives = [];
  for (const x of c.passives) {
    const def = PASSIVE_INDEX[x.id];
    if (def === undefined || p.passives.length >= MAX_PASSIVE_SLOTS || p.passives.some((y) => y.def === def)) continue;
    const inst = new PassiveInst();
    inst.def = def;
    inst.level = clamp(Math.round(x.level), 1, MAX_ITEM_LEVEL);
    p.passives.push(inst);
  }
  p.level = clamp(Math.round(c.level), 1, 200);
  p.xpNext = xpForLevel(p.level);
  const item = PICKUPS.findIndex((k) => k.id === c.item && k.kind === 'active');
  p.activeItem = item;
  p.mightMul = clamp(c.might, 0.1, 100);
  computeStats(p);
  p.hp = p.stats.maxHp;
}
