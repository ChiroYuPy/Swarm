/**
 * Bac à sable : une partie aux réglages libres (invincibilité, niveau et équipement de départ, ennemis
 * choisis…), jamais classée. Les réglages font partie de la configuration de la partie : elle reste
 * déterministe et rejouable comme une autre.
 */
import { xpForLevel } from '../data/hero';
import { PICKUPS } from '../data/loot';
import { MAX_ITEM_LEVEL, MAX_PASSIVE_SLOTS, MAX_WEAPON_SLOTS, TICK_RATE } from './constants';
import { BEHAVIOR, BOSS_TICKS, ENEMY_BEHAVIOR, ENEMY_INDEX, FUSION_TABLE, PASSIVE_INDEX, WEAPON_INDEX, PROP_TYPE, weaponMaxLevel } from './registry';
import { addWeapon } from './levelup';
import { computeStats } from './player';
import { PassiveInst, type GameState, type Player, type SandboxRules } from './state';

export interface SandboxConfig {
  invincible: boolean;
  /** niveau de départ du héros */
  level: number;
  /** minute de départ : les ennemis sont aussi forts et variés qu'à ce moment-là */
  startMinute: number;
  /** multiplicateur du nombre d'ennemis (0 = aucun) */
  enemyMul: number;
  /** types d'ennemis autorisés (ids), null = progression normale */
  enemies: string[] | null;
  bosses: boolean;
  /** multiplicateur des dégâts du héros */
  might: number;
  /** multiplicateur de l'XP ramassée */
  xp: number;
  /** équipement de départ (remplace l'arme de départ) */
  weapons: { id: string; level: number }[];
  passives: { id: string; level: number }[];
  /** objet activable en réserve au départ (id de data/loot.ts), null = aucun */
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
    xp: clamp(c.xp, 0, 100),
  };
}

/** Prépare le héros et l'horloge selon les réglages. Les ids inconnus (vieille sauvegarde) sont ignorés. */
export function applySandbox(s: GameState, c: SandboxConfig): void {
  s.sandbox = compileSandbox(c);
  const startTick = Math.round(clamp(c.startMinute, 0, 120) * 60 * TICK_RATE);
  s.tick = startTick;
  s.clock = startTick;
  // Les boss déjà « passés » comptent : le prochain a la force (et le rang) qu'il aurait eus à ce moment.
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
  // Une évolution déjà en main : son arme d'origine n'est plus proposée (comme après une vraie évolution).
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
  p.activable = item;
  p.mightMul = clamp(c.might, 0.1, 100);
  computeStats(p);
  p.hp = p.stats.maxHp;
}
