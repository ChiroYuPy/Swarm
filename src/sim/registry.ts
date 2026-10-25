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
  JUMPER: 7,
  ORBITER: 9,
  WALL: 10,
  EGG: 11,
} as const satisfies Record<Uppercase<EnemyBehavior>, number>;
export const ENEMY_BEHAVIOR = ENEMIES.map((e) => BEHAVIOR[e.behavior.toUpperCase() as Uppercase<EnemyBehavior>]);
/** Splitter: enemy type born on its death (-1: none). */
export const SPLIT_INTO = ENEMIES.map((e) => (e.splitInto ? enemyId(e.splitInto) : -1));
/** Wave-stream pack size (1: alone) and cap on living ones (0: none), per type. */
export const PACK = ENEMIES.map((e) => Math.max(1, e.pack ?? 1));
export const CAP = ENEMIES.map((e) => e.cap ?? 0);
/** Steering: how fast each type reaches the speed it wants (units/s²). */
export const ACCEL = ENEMIES.map((e) => e.accel ?? Math.max(170, e.speed * 3));

export interface CompiledFusion {
  result: number;
  weapon: number;
}
export const FUSION_TABLE: CompiledFusion[] = FUSIONS.map((f) => ({
  result: weaponId(f.result),
  weapon: weaponId(f.weapon),
}));

export interface CompiledRate {
  atTick: number;
  rate: number;
}

/** Spawn-rate curve for each difficulty (rate × the difficulty's rate). */
export const RATES_BY_DIFFICULTY: CompiledRate[][] = DIFFICULTIES.map((d) =>
  WAVES.rates.map((p) => ({ atTick: Math.round(p.at * TICK_RATE), rate: p.rate * d.rate })),
);

/** One wave + its pause: one mix slot. */
export const MIX_TICKS = Math.round((WAVES.waveLength + WAVES.pause) * TICK_RATE);
export const WAVE_TICKS = Math.round(WAVES.waveLength * TICK_RATE);
/** Wave clock between two bosses (the boss arrives at the end of the last wave's pause). */
export const BOSS_TICKS = MIX_TICKS * WAVES.wavesPerBoss;
export const AFTER_BOSS_TICKS = Math.round(WAVES.afterBoss * TICK_RATE);

export interface CompiledMix {
  weights: Float64Array;
  total: number;
  types: number[];
}

function compileMix(m: Record<string, number>): CompiledMix {
  const weights = new Float64Array(NUM_ENEMY_TYPES);
  let total = 0;
  const types: number[] = [];
  for (const [id, w] of Object.entries(m)) {
    const t = enemyId(id);
    weights[t] = w;
    total += w;
    types.push(t);
  }
  return { weights, total, types };
}

/** The run's waves, in order (WAVES.plan), then the endless mode's mixes (WAVES.mixes). */
export const PLAN_MIXES: CompiledMix[] = WAVES.plan.map(compileMix);
export const ENDLESS_MIXES: CompiledMix[] = WAVES.mixes.map(compileMix);
/** Number of planned waves; the boss after the last one is the last of the run (victory). */
export const PLAN_WAVES = PLAN_MIXES.length;
/** Rank (0 = the first) of the boss whose death wins the run. */
export const VICTORY_BOSS = Math.floor(PLAN_WAVES / WAVES.wavesPerBoss) - 1;
if (PLAN_WAVES % WAVES.wavesPerBoss !== 0 || VICTORY_BOSS < 0 || VICTORY_BOSS >= BOSS_ORDER.length)
  throw new Error('WAVES.plan must be whole blocks of wavesPerBoss waves, one per boss of BOSS_ORDER at most');

/**
 * Wave slot (0 = the first wave) in which each type arrives, -1 if never: the first planned wave that
 * contains it, or the first wave of its highlight (the Swarm). The same in every difficulty.
 */
export const UNLOCK_SLOT = new Int32Array(NUM_ENEMY_TYPES).fill(-1);
PLAN_MIXES.forEach((m, slot) => {
  for (const t of m.types) if (UNLOCK_SLOT[t] < 0) UNLOCK_SLOT[t] = slot;
});
{
  const sw = enemyId(WAVES.swarm.type);
  const at = WAVES.swarm.firstWave - 1;
  if (UNLOCK_SLOT[sw] < 0 || UNLOCK_SLOT[sw] > at) UNLOCK_SLOT[sw] = at;
}

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
export const HORNETS_WEAPON = weaponId('hornets');
export const BLACK_HOLE_WEAPON = weaponId('black_holes');
export const VAMPIRE_FIELD_WEAPON = weaponId('vampire_field');
export const BOT_FAVORITE_PASSIVES = ['vitality', 'might', 'armor'].map(passiveId);
