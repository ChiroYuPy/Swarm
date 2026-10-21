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

export const BEHAVIOR = { CHASER: 0, DASHER: 1, SHOOTER: 2, KAMIKAZE: 3, SWARM: 4, PROP: 5, BOSS: 6 } as const;
const BEHAVIOR_BY_NAME: Record<string, number> = {
  chaser: BEHAVIOR.CHASER,
  dasher: BEHAVIOR.DASHER,
  shooter: BEHAVIOR.SHOOTER,
  kamikaze: BEHAVIOR.KAMIKAZE,
  swarm: BEHAVIOR.SWARM,
  prop: BEHAVIOR.PROP,
  boss: BEHAVIOR.BOSS,
};
export const ENEMY_BEHAVIOR = ENEMIES.map((e) => BEHAVIOR_BY_NAME[e.behavior]);

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

export interface CompiledPhase {
  atTick: number;
  rate: number;
  weights: Float64Array;
  total: number;
  /** types d'ennemis qui apparaissent pour la première fois dans cette phase (annoncés au joueur) */
  newTypes: number[];
}

/** Phases de vagues compilées pour chaque difficulté (dates × pace, débit × rate). */
export const WAVE_PHASES_BY_DIFFICULTY: CompiledPhase[][] = DIFFICULTIES.map((d) => {
  const seen = new Set<number>();
  return WAVES.phases.map((p) => {
    const weights = new Float64Array(NUM_ENEMY_TYPES);
    let total = 0;
    const newTypes: number[] = [];
    for (const [id, w] of Object.entries(p.weights)) {
      const t = enemyId(id);
      weights[t] = w;
      total += w;
      if (w > 0 && !seen.has(t)) {
        seen.add(t);
        newTypes.push(t);
      }
    }
    return { atTick: Math.round(p.at * d.pace * TICK_RATE), rate: p.rate * d.rate, weights, total, newTypes };
  });
});

export const SWARM_TYPE = enemyId(WAVES.swarm.type);
export const RING_TYPE = enemyId(WAVES.ring.type);
export const BOSS_TYPE = enemyId('boss');
export const PROP_TYPE = enemyId('distributeur');
export const BOSS_SUMMON_TYPE = enemyId(BOSS.summonType);
