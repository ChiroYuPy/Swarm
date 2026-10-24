/**
 * Tables precomputed from the data files: numeric indices, behavior codes,
 * compiled wave phases. Avoids any string lookup in the hot loop.
 */
import { ALL_WEAPONS, BASE_WEAPONS, type WeaponDef, type WeaponLevel } from '../data/weapons';
import { PASSIVES } from '../data/passives';
import { FUSIONS } from '../data/fusions';
import { ENEMIES, BOSS_ORDER, PHASE_PARAMS, type BossConfig, type BossPhase, type BossSummon, type EnemyBehavior } from '../data/enemies';
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
  if (i === undefined) throw new Error(`Unknown weapon: ${id}`);
  return i;
}
export function enemyId(id: string): number {
  const i = ENEMY_INDEX[id];
  if (i === undefined) throw new Error(`Unknown enemy: ${id}`);
  return i;
}
export function passiveId(id: string): number {
  const i = PASSIVE_INDEX[id];
  if (i === undefined) throw new Error(`Unknown passive: ${id}`);
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

export const BEHAVIOR = {
  CHASER: 0,
  SHOOTER: 2,
  KAMIKAZE: 3,
  SWARM: 4,
  PROP: 5,
  BOSS: 6,
  LEADER: 7,
  BLINKER: 8,
  ORBITER: 9,
  WALL: 10,
  EGG: 11,
} as const satisfies Record<Uppercase<EnemyBehavior>, number>;
export const ENEMY_BEHAVIOR = ENEMIES.map((e) => BEHAVIOR[e.behavior.toUpperCase() as Uppercase<EnemyBehavior>]);
/** Splitter: enemy type born on its death (-1: none). */
export const SPLIT_INTO = ENEMIES.map((e) => (e.splitInto ? enemyId(e.splitInto) : -1));
/**
 * Leaders: the leader type whose aura is the strongest (-1: none) and the speed bonus of a rallied enemy.
 * A rallied enemy only stores until when it is rallied (`boostUntil`), not by which leader (a new Enemy
 * field would change the state hash), so with several leader types the strongest `auraSpeed` applies to
 * all of them. Each leader's own `auraRadius` is read per type.
 */
export const RALLY_TYPE = strongestLeader();
function strongestLeader(): number {
  let best = -1;
  ENEMIES.forEach((e, i) => {
    if (e.behavior === 'leader' && (best < 0 || (e.auraSpeed ?? 0) > (ENEMIES[best].auraSpeed ?? 0))) best = i;
  });
  return best;
}
export const RALLY_SPEED = RALLY_TYPE >= 0 ? (ENEMIES[RALLY_TYPE].auraSpeed ?? 0) : 0;

export interface CompiledFusion {
  result: number;
  weapon: number;
  /** required passive */
  with: number;
}
export const FUSION_TABLE: CompiledFusion[] = FUSIONS.map((f) => ({
  result: weaponId(f.result),
  weapon: weaponId(f.weapon),
  with: passiveId(f.with),
}));

export interface CompiledRate {
  atTick: number;
  rate: number;
}

/** Spawn-rate curve for each difficulty (times × pace, rate × rate). */
export const RATES_BY_DIFFICULTY: CompiledRate[][] = DIFFICULTIES.map((d) =>
  WAVES.rates.map((p) => ({ atTick: Math.round(p.at * d.pace * TICK_RATE), rate: p.rate * d.rate })),
);

/** One wave + its pause: one mix slot. */
export const MIX_TICKS = Math.round((WAVES.waveLength + WAVES.pause) * TICK_RATE);
export const WAVE_TICKS = Math.round(WAVES.waveLength * TICK_RATE);
/** Wave clock between two bosses (the boss arrives at the end of the last wave's pause). */
export const BOSS_TICKS = MIX_TICKS * WAVES.wavesPerBoss;
export const AFTER_BOSS_TICKS = Math.round(WAVES.afterBoss * TICK_RATE);

/**
 * Mix slot from which each type appears, per difficulty (-1: never in the stream).
 * The arrival is rounded up to the next slot.
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
  /** draw weight: mixes with the most recent types come up more often */
  pick: number;
}

/** arrival rank of each type (0 = the first) */
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

/** Debut mix of each type: the first one in the list that contains it. */
export const DEBUT_MIX = new Int32Array(NUM_ENEMY_TYPES).fill(-1);
MIXES.forEach((m, i) => {
  for (const t of m.types) if (DEBUT_MIX[t] < 0) DEBUT_MIX[t] = i;
});

export const HORDE_TYPES = WAVES.horde.types.map(enemyId);

/** Types of the swarm and ring highlights: named by id in WAVES (one type each by design), not found by behaviour. */
export const SWARM_TYPE = enemyId(WAVES.swarm.type);
export const RING_TYPE = enemyId(WAVES.ring.type);
export const PROP_TYPE = uniqueType('prop');
export const WALL_TYPE = uniqueType('wall');
export const EGG_TYPE = uniqueType('egg');
/** How long a wall rises out of the ground (s, not solid yet): a property of the wall type, whatever boss builds it. */
export const WALL_RISE = ENEMIES[WALL_TYPE].rise ?? 0;
/** Bosses in their arrival order. */
export const BOSS_TYPES = BOSS_ORDER.map(enemyId);

export interface CompiledSummon extends BossSummon {
  typeId: number;
}
/**
 * Config of each boss, per enemy type (null for the others). Every phase reads its parameter groups from
 * the config of the boss running it (`BOSS_CONFIGS[e.type]`), never from a specific boss.
 */
export const BOSS_CONFIGS: (BossConfig | null)[] = ENEMIES.map((e) => e.boss ?? null);
/** Phases and reinforcements of each boss, per enemy type (empty for the others). */
export const BOSS_PATTERNS: BossPhase[][] = ENEMIES.map((e) => e.boss?.pattern ?? []);
export const BOSS_SUMMONS: (CompiledSummon | null)[] = ENEMIES.map((e) => {
  const sm = e.boss?.summon;
  return sm ? { ...sm, typeId: enemyId(sm.type) } : null;
});

/** Parameter groups a boss's phases need but its config lacks (PHASE_PARAMS). Empty when complete. */
export function missingBossParams(cfg: BossConfig): string[] {
  const out: string[] = [];
  for (const ph of cfg.pattern) for (const g of PHASE_PARAMS[ph.kind]) if (cfg[g] === undefined && !out.includes(g)) out.push(g);
  return out;
}
ENEMIES.forEach((e) => {
  const missing = e.boss ? missingBossParams(e.boss) : [];
  if (missing.length) throw new Error(`Boss '${e.id}' lacks the parameters of its phases: ${missing.join(', ')}`);
});

/** Egg: enemy type that hatches out of it (-1: none). */
export const HATCH_INTO = ENEMIES.map((e) => (e.hatchInto ? enemyId(e.hatchInto) : -1));

/**
 * The only enemy type with this behavior. Props, walls and eggs are single by design: the spawner, the
 * 'build' and 'lay' boss phases and the wall collisions spawn or match them by type, not by id.
 */
function uniqueType(b: EnemyBehavior): number {
  const types = ENEMIES.flatMap((e, i) => (e.behavior === b ? [i] : []));
  if (types.length !== 1) throw new Error(`Expected exactly one '${b}' enemy, found ${types.length}`);
  return types[0];
}

/**
 * Content that engine code refers to by id (render variants, bot taste). Kept here so a renamed or
 * removed id throws at load instead of silently matching nothing.
 */
export const SQUADRON_WEAPON = weaponId('squadron');
export const KAMIKAZE_DRONES_WEAPON = weaponId('kamikaze_drones');
export const BLACK_HOLE_WEAPON = weaponId('black_holes');
export const BOT_FAVORITE_PASSIVES = ['vitality', 'might', 'armor'].map(passiveId);
