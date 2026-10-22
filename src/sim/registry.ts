/**
 * Tables précalculées à partir des fichiers de données : index numériques, codes de comportement,
 * phases de vagues compilées. Évite toute recherche par chaîne dans la boucle chaude.
 */
import { ALL_WEAPONS, BASE_WEAPONS, type WeaponDef, type WeaponLevel } from '../data/weapons';
import { PASSIVES } from '../data/passives';
import { FUSIONS } from '../data/fusions';
import { ENEMIES, BOSS } from '../data/enemies';
import { WAVES } from '../data/waves';
import { DIFFICULTIES } from '../data/difficulty';
import { TICK_RATE } from './constants';

function indexOf<T extends { id: string }>(list: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  list.forEach((x, i) => (out[x.id] = i));
  return out;
}

export const WEAPON_INDEX = indexOf(ALL_WEAPONS);
export const NUM_BASE_WEAPONS = BASE_WEAPONS.length;
export const PASSIVE_INDEX = indexOf(PASSIVES);
export const ENEMY_INDEX = indexOf(ENEMIES);
export const NUM_ENEMY_TYPES = ENEMIES.length;

export function weaponId(id: string): number {
  const i = WEAPON_INDEX[id];
  if (i === undefined) throw new Error(`Arme inconnue : ${id}`);
  return i;
}
export function enemyId(id: string): number {
  const i = ENEMY_INDEX[id];
  if (i === undefined) throw new Error(`Ennemi inconnu : ${id}`);
  return i;
}
export function passiveId(id: string): number {
  const i = PASSIVE_INDEX[id];
  if (i === undefined) throw new Error(`Passif inconnu : ${id}`);
  return i;
}

export function weaponDef(i: number): WeaponDef {
  return ALL_WEAPONS[i];
}
export function weaponLevel(i: number, level: number): WeaponLevel {
  const levels = ALL_WEAPONS[i].levels;
  return levels[Math.min(level, levels.length) - 1];
}
export function weaponMaxLevel(i: number): number {
  return ALL_WEAPONS[i].levels.length;
}

export const BEHAVIOR = { CHASER: 0, SHOOTER: 2, KAMIKAZE: 3, SWARM: 4, PROP: 5, BOSS: 6, LEADER: 7, BLINKER: 8, ORBITER: 9 } as const;
const BEHAVIOR_BY_NAME: Record<string, number> = {
  chaser: BEHAVIOR.CHASER,
  shooter: BEHAVIOR.SHOOTER,
  kamikaze: BEHAVIOR.KAMIKAZE,
  swarm: BEHAVIOR.SWARM,
  prop: BEHAVIOR.PROP,
  boss: BEHAVIOR.BOSS,
  leader: BEHAVIOR.LEADER,
  blinker: BEHAVIOR.BLINKER,
  orbiter: BEHAVIOR.ORBITER,
};
export const ENEMY_BEHAVIOR = ENEMIES.map((e) => BEHAVIOR_BY_NAME[e.behavior]);
/** Diviseur : type d'ennemi né à sa mort (-1 : aucun). */
export const SPLIT_INTO = ENEMIES.map((e) => (e.splitInto ? enemyId(e.splitInto) : -1));
/** Meneur : bonus de vitesse des ennemis qu'il galvanise. */
export const LEADER_SPEED = ENEMIES.find((e) => e.behavior === 'leader')?.auraSpeed ?? 0;

export interface CompiledFusion {
  result: number;
  weapon: number;
  with: number;
  withPassive: boolean;
}
export const FUSION_TABLE: CompiledFusion[] = FUSIONS.map((f) => ({
  result: weaponId(f.result),
  weapon: weaponId(f.weapon),
  with: f.withKind === 'weapon' ? weaponId(f.with) : passiveId(f.with),
  withPassive: f.withKind === 'passive',
}));

export interface CompiledRate {
  atTick: number;
  rate: number;
}

/** Courbe de débit pour chaque difficulté (dates × pace, débit × rate). */
export const RATES_BY_DIFFICULTY: CompiledRate[][] = DIFFICULTIES.map((d) =>
  WAVES.rates.map((p) => ({ atTick: Math.round(p.at * d.pace * TICK_RATE), rate: p.rate * d.rate })),
);

export const MIX_TICKS = Math.round(WAVES.mixEvery * TICK_RATE);

/**
 * Créneau de mélange à partir duquel chaque type apparaît, par difficulté (-1 : jamais dans le flux).
 * L'arrivée est arrondie au créneau suivant.
 */
export const UNLOCK_SLOT: Int32Array[] = DIFFICULTIES.map((d) => {
  const out = new Int32Array(NUM_ENEMY_TYPES).fill(-1);
  for (const [id, at] of Object.entries(WAVES.unlocks)) out[enemyId(id)] = Math.ceil((at * d.pace * TICK_RATE) / MIX_TICKS);
  return out;
});

export interface CompiledMix {
  weights: Float64Array;
  total: number;
  types: number[];
  /** poids de tirage : les mélanges aux types les plus récents sortent plus souvent */
  pick: number;
}

/** rang d'arrivée de chaque type (0 = le premier) */
const UNLOCK_RANK = new Int32Array(NUM_ENEMY_TYPES);
Object.entries(WAVES.unlocks)
  .sort((a, b) => a[1] - b[1])
  .forEach(([id], i) => (UNLOCK_RANK[enemyId(id)] = i));

export const MIXES: CompiledMix[] = WAVES.mixes.map((m) => {
  const weights = new Float64Array(NUM_ENEMY_TYPES);
  let total = 0;
  let rank = 0;
  const types: number[] = [];
  for (const [id, w] of Object.entries(m)) {
    const t = enemyId(id);
    weights[t] = w;
    total += w;
    types.push(t);
    rank = Math.max(rank, UNLOCK_RANK[t]);
  }
  return { weights, total, types, pick: (rank + 1) * Math.sqrt(rank + 1) };
});

/** Mélange d'arrivée de chaque type : le premier de la liste qui le contient. */
export const DEBUT_MIX = new Int32Array(NUM_ENEMY_TYPES).fill(-1);
MIXES.forEach((m, i) => {
  for (const t of m.types) if (DEBUT_MIX[t] < 0) DEBUT_MIX[t] = i;
});

export const HORDE_TYPES = WAVES.horde.types.map(enemyId);

export const SWARM_TYPE = enemyId(WAVES.swarm.type);
export const RING_TYPE = enemyId(WAVES.ring.type);
export const BOSS_TYPE = enemyId('boss');
export const PROP_TYPE = enemyId('distributeur');
export const BOSS_SUMMON_TYPE = enemyId(BOSS.summonType);
