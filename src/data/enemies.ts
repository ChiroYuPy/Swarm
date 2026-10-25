/** Enemies. HP / damage / speeds are multiplied by the difficulty curves of waves.ts. */

export type EnemyBehavior = 'chaser' | 'shooter' | 'kamikaze' | 'swarm' | 'prop' | 'boss' | 'orbiter' | 'jumper' | 'wall' | 'egg';
export type EnemyShape =
  | 'triangle'
  | 'diamond'
  | 'square'
  | 'pentagon'
  | 'circle'
  | 'dot'
  | 'box'
  | 'trapezoid'
  | 'dart'
  | 'bomb'
  | 'octagon'
  | 'hexagon'
  | 'star'
  | 'eye'
  | 'queen'
  | 'block'
  | 'egg';

/** A boss must carry its config (pattern, summons…); no other enemy may. */
export type EnemyDef = EnemyBase & ({ behavior: 'boss'; boss: BossConfig } | { behavior: Exclude<EnemyBehavior, 'boss'>; boss?: undefined });

interface EnemyBase {
  /** Name and description live in src/i18n/locales, keyed by this id. */
  id: string;
  behavior: EnemyBehavior;
  shape: EnemyShape;
  color: string;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  xp: number;
  /** 0 = takes full knockback, 1 = immune */
  kbResist: number;
  /** absent from the codex and the sandbox (only appears through another enemy) */
  hidden?: boolean;
  /** on death, bursts into `splitCount` `splitInto` enemies (and shows cracks as it loses HP) */
  splitInto?: string;
  splitCount?: number;
  /** the wave stream spawns it in packs of this many, close together (counted as that many spawns) */
  pack?: number;
  /** most of this type alive at once from the wave stream (boss reinforcements ignore it) */
  cap?: number;
  /** how fast it reaches the speed it wants (units/s²); default: 3 × its speed, at least 170 */
  accel?: number;
  /** orbiter: physical flight around the player, then a dive */
  fly?: EnemyFlight;
  /** jumper: hops onto the player's spot, hurting only on landing (`blastRadius`, `blastDamage`) */
  hop?: EnemyHop;
  // shooter
  keepMin?: number;
  keepMax?: number;
  shootEvery?: number;
  bulletSpeed?: number;
  bulletDamage?: number;
  // kamikaze (`blastRadius` and `blastDamage` are also the jumper's landing)
  fuse?: number;
  triggerRange?: number;
  blastRadius?: number;
  blastDamage?: number;
  // wall (built by a 'build' boss phase): rises out of the ground for `rise` s, not solid yet
  rise?: number;
  // egg (laid by a 'lay' boss phase): hatches into `hatchCount` `hatchInto` enemies with `hatchHp` × their normal HP
  hatchInto?: string;
  hatchCount?: number;
  hatchHp?: number;
}

/**
 * Orbiter flight: a heading that turns at a limited rate and a speed that accelerates. It circles the
 * player, tightening, until its own timer runs out, then dives (it cannot turn sharply: dodgeable), hits or
 * misses, carries on past and swings back out to the circle.
 */
export interface EnemyFlight {
  /** circle radius around the player (each one varies it a little) */
  orbit: number;
  /** how fast the circle tightens (units/s), down to 60% of `orbit` */
  tighten: number;
  /** time circling before a dive (s), drawn between these two */
  waitMin: number;
  waitMax: number;
  /** turn rate (radians/s) */
  turn: number;
  /** speed change rate (units/s²) */
  accel: number;
  /** dive speed */
  dive: number;
}

/**
 * Jumper: keeps its distance, crouches (the landing circle fills), jumps onto where the player was, lands
 * (the only moment it hurts), rests, then hops away to a side and starts again.
 */
export interface EnemyHop {
  /** crouch before the jump at the player, and before the hop away (s) */
  crouch: number;
  crouchBack: number;
  /** flight time (s) */
  air: number;
  /** rest after landing (s) */
  rest: number;
  /** time before the next attack (s) */
  every: number;
  /** it jumps at the player from this distance */
  range: number;
  /** length of the hop away */
  away: number;
}

export type BossPhaseKind =
  | 'chase'
  | 'spiral'
  | 'charge'
  | 'summon'
  | 'build'
  | 'volley'
  | 'aim'
  | 'dash'
  | 'burst'
  | 'watch'
  | 'focus'
  | 'sweep'
  | 'flee'
  | 'lay';

export interface BossPhase<K extends BossPhaseKind = BossPhaseKind> {
  kind: K;
  duration: number;
}

/** Bullets of the shooting phases ('spiral', 'volley', 'burst', 'watch', 'lay'). */
export interface BossBullets {
  speed: number;
  damage: number;
}

/** 'spiral': rings of bullets fired along rotating arms. */
export interface BossSpiral {
  /** one ring every `every` s */
  every: number;
  arms: number;
  /** extra arms per boss already spawned */
  armsPerBoss?: number;
  /** rotation between two rings (radians) */
  turn: number;
}

/** 'charge': a warning line, then a rush to its end. */
export interface BossCharge {
  /** duration of the warning line (s); then it charges to the end of the line */
  telegraph: number;
  speed: number;
  /** charge range (= length of the warning line) */
  length: number;
  /** contact damage × damage while it charges */
  damage: number;
}

/**
 * A boss's reinforcements ('summon' phase): a big pack of a single type, around the boss or in a circle
 * around the player. Nothing if `maxAlive` enemies are already left: there must always be a window to hit it.
 */
export interface BossSummon {
  type: string;
  count: number;
  /** extra enemies per boss already spawned */
  perBoss: number;
  around: 'self' | 'player';
  radius: number;
  maxAlive: number;
  /** reinforcement HP × hp (1 by default) */
  hp?: number;
}

/** 'build': a hexagonal cage of breakable walls around the player. How long a wall rises is the wall type's `rise`. */
export interface BossCage {
  /** cage (hexagon) radius and gap between two walls */
  radius: number;
  wallSpacing: number;
  /** a cage only every N cycles */
  every: number;
  /** walls missing in the middle of two opposite sides (the exits) */
  gapWalls: number;
  /** lifetime of a wall, including its rise (not solid yet) */
  wallLife: number;
}

/** 'volley': a fan of bullets toward the player, every `every` s. */
export interface BossVolley {
  every: number;
  count: number;
  /** angle between two bullets (radians) */
  spread: number;
}

/** 'aim' (direction and bounce box) then 'dash' (bounces inside the box, leaves flames). */
export interface BossDash {
  speed: number;
  /** half-side of the bounce box, centred where the player was when it aimed */
  box: number;
  /** contact damage × damage while it dashes */
  damage: number;
  /** one flame every `fireEvery` frames */
  fireEvery: number;
  fireRadius: number;
  fireLife: number;
  /** damage per second spent in the flames */
  fireDps: number;
}

/** 'burst': two rings of `arms` bullets, the second one offset by half a step. */
export interface BossBurst {
  arms: number;
}

/** 'watch': keeps its distance and shoots at the player every `shootEvery` s. */
export interface BossWatch {
  keepMin: number;
  keepMax: number;
  shootEvery: number;
}

/** 'focus' (telegraphed cone) then 'sweep' (the beam crosses it). */
export interface BossLaser {
  /** beam length and width */
  length: number;
  width: number;
  /** sweep aperture (radians) */
  arc: number;
  damage: number;
}

/** 'flee': keeps its distance. */
export interface BossFlee {
  keepMin: number;
  keepMax: number;
}

/** 'lay': eggs where it stands (what hatches is the egg type's `hatchInto`), plus a volley toward the player. */
export interface BossLay {
  /** one laying out of `bigEvery` is triple */
  bigEvery: number;
  /** time before an egg hatches (s) */
  hatchAfter: number;
  maxEggs: number;
  volleyCount: number;
  /** angle between two bullets of the volley (radians) */
  volleySpread: number;
}

/** Every parameter group a boss phase can read. A boss declares only the groups its phases use. */
export interface BossParams {
  bullets: BossBullets;
  spiral: BossSpiral;
  charge: BossCharge;
  summon: BossSummon;
  cage: BossCage;
  volley: BossVolley;
  dash: BossDash;
  burst: BossBurst;
  watch: BossWatch;
  laser: BossLaser;
  flee: BossFlee;
  lay: BossLay;
}

/**
 * Parameter groups each phase reads (in the sim, the telegraphs and the bot). `bossConfig()` requires them
 * at compile time; src/sim/registry.ts checks them again at load.
 */
export const PHASE_PARAMS = {
  chase: [],
  spiral: ['spiral', 'bullets'],
  charge: ['charge'],
  summon: ['summon'],
  build: ['cage'],
  volley: ['volley', 'bullets'],
  aim: ['dash'],
  dash: ['dash'],
  burst: ['burst', 'bullets'],
  watch: ['watch', 'bullets'],
  focus: ['laser'],
  sweep: ['laser'],
  flee: ['flee'],
  lay: ['lay', 'bullets'],
} as const satisfies Record<BossPhaseKind, readonly (keyof BossParams)[]>;

/** The parameter groups needed by a set of phase kinds. */
export type ParamsFor<K extends BossPhaseKind> = (typeof PHASE_PARAMS)[K][number];

/**
 * What a boss carries: a looping pattern and the parameter groups of its phases. Every phase reads the
 * groups of the boss running it (BOSS_CONFIGS in src/sim/registry.ts).
 */
export interface BossConfig extends Partial<BossParams> {
  pattern: BossPhase[];
}

/**
 * Builds a boss config. The phase kinds of `pattern` decide which groups are required (PHASE_PARAMS):
 * a missing group, or a group none of its phases reads, is a type error.
 */
export function bossConfig<K extends BossPhaseKind>(
  cfg: { pattern: BossPhase<K>[] } & Pick<BossParams, ParamsFor<K>>,
): BossConfig & Pick<BossParams, ParamsFor<K>> {
  return cfg as BossConfig & Pick<BossParams, ParamsFor<K>>;
}

/** Trapezoid: a looping sequence of phases. */
export const TRAPEZOID_BOSS = bossConfig({
  pattern: [
    { kind: 'chase', duration: 2.5 },
    { kind: 'spiral', duration: 3.0 },
    { kind: 'chase', duration: 1.5 },
    { kind: 'charge', duration: 1.9 },
    { kind: 'charge', duration: 1.9 },
    { kind: 'summon', duration: 1.2 },
  ],
  bullets: { speed: 175, damage: 10 },
  spiral: { every: 0.1, arms: 4, armsPerBoss: 1, turn: 0.23 },
  charge: { telegraph: 0.9, speed: 700, length: 560, damage: 1.8 },
  summon: { type: 'marble', count: 12, perBoss: 2, around: 'self', radius: 90, maxAlive: 24 },
});

/** Builder hexagon: cage of breakable walls around the player, then shots through it. */
export const BUILDER_HEXAGON_BOSS = bossConfig({
  pattern: [
    { kind: 'chase', duration: 2.0 },
    { kind: 'build', duration: 1.0 },
    { kind: 'spiral', duration: 3.4 },
    { kind: 'volley', duration: 2.0 },
    { kind: 'chase', duration: 2.0 },
    { kind: 'summon', duration: 1.0 },
  ],
  cage: { radius: 210, wallSpacing: 27, every: 2, gapWalls: 3, wallLife: 6.5 },
  bullets: { speed: 185, damage: 10 },
  spiral: { every: 0.2, arms: 5, turn: 0.1 },
  volley: { every: 0.5, count: 5, spread: 0.14 },
  summon: { type: 'block', count: 5, perBoss: 1, around: 'player', radius: 400, maxAlive: 12 },
});

/** Ricochet star: aims (line), dashes bouncing inside a box around the player, leaves fire behind. */
export const RICOCHET_STAR_BOSS = bossConfig({
  pattern: [
    { kind: 'chase', duration: 1.4 },
    { kind: 'aim', duration: 0.9 },
    { kind: 'dash', duration: 4.2 },
    { kind: 'aim', duration: 0.7 },
    { kind: 'dash', duration: 3.4 },
    { kind: 'burst', duration: 1.4 },
    { kind: 'summon', duration: 0.8 },
  ],
  /** speed and box size: 3 to 4 bounces per dash */
  dash: { speed: 620, box: 340, damage: 1.6, fireEvery: 3, fireRadius: 20, fireLife: 3.2, fireDps: 22 },
  burst: { arms: 10 },
  bullets: { speed: 180, damage: 10 },
  summon: { type: 'rusher', count: 12, perBoss: 2, around: 'self', radius: 80, maxAlive: 20 },
});

/** Laser eye: keeps its distance, telegraphs a cone then sweeps it with a beam. */
export const LASER_EYE_BOSS = bossConfig({
  pattern: [
    { kind: 'watch', duration: 2.0 },
    { kind: 'focus', duration: 1.1 },
    { kind: 'sweep', duration: 1.0 },
    { kind: 'focus', duration: 0.9 },
    { kind: 'sweep', duration: 1.0 },
    { kind: 'watch', duration: 1.6 },
    { kind: 'summon', duration: 0.8 },
  ],
  watch: { keepMin: 240, keepMax: 330, shootEvery: 0.45 },
  bullets: { speed: 210, damage: 9 },
  laser: { length: 520, width: 16, arc: 1.6, damage: 28 },
  summon: { type: 'orbiter', count: 6, perBoss: 2, around: 'player', radius: 480, maxAlive: 12 },
});

/** Swarm queen: flees (slower than you) and lays eggs that hatch into Swarm. */
export const SWARM_QUEEN_BOSS = bossConfig({
  pattern: [
    { kind: 'flee', duration: 0.9 },
    { kind: 'lay', duration: 0.3 },
    { kind: 'flee', duration: 0.9 },
    { kind: 'lay', duration: 0.3 },
    { kind: 'spiral', duration: 2.2 },
    { kind: 'flee', duration: 0.9 },
    { kind: 'summon', duration: 0.6 },
  ],
  flee: { keepMin: 260, keepMax: 400 },
  /** on each laying, a volley toward the player */
  lay: { bigEvery: 2, hatchAfter: 2.6, maxEggs: 14, volleyCount: 3, volleySpread: 0.22 },
  /** spiral spray of darts */
  spiral: { every: 0.12, arms: 3, turn: 0.38 },
  bullets: { speed: 190, damage: 10 },
  summon: { type: 'swarm', count: 18, perBoss: 4, around: 'self', radius: 70, maxAlive: 70, hp: 1.5 },
});

export const ENEMIES: EnemyDef[] = [
  {
    id: 'marble',
    behavior: 'chaser', shape: 'circle', color: '#ff3366',
    hp: 9, speed: 58, damage: 4, radius: 9, xp: 1, kbResist: 0,
    pack: 6,
  },
  {
    id: 'rusher',
    behavior: 'chaser', shape: 'diamond', color: '#ffe14d',
    hp: 6, speed: 112, damage: 4, radius: 10, xp: 1, kbResist: 0,
  },
  {
    id: 'hunter',
    behavior: 'chaser', shape: 'triangle', color: '#ff5a3d',
    hp: 9, speed: 64, damage: 5, radius: 12, xp: 1, kbResist: 0,
  },
  {
    id: 'block',
    behavior: 'chaser', shape: 'square', color: '#ff8a1f',
    hp: 55, speed: 46, damage: 12, radius: 21, xp: 4, kbResist: 0.75,
    cap: 4,
  },
  {
    id: 'shooter',
    behavior: 'shooter', shape: 'pentagon', color: '#c46bff',
    hp: 20, speed: 62, damage: 6, radius: 14, xp: 3, kbResist: 0.2,
    cap: 5, keepMin: 240, keepMax: 340, shootEvery: 2.6, bulletSpeed: 190, bulletDamage: 7,
  },
  {
    id: 'swarm',
    behavior: 'swarm', shape: 'dot', color: '#ff9ecf',
    hp: 3, speed: 106, damage: 3, radius: 6, xp: 1, kbResist: 0,
  },
  {
    id: 'orbiter',
    behavior: 'orbiter', shape: 'dart', color: '#3dffb4',
    hp: 18, speed: 100, damage: 8, radius: 11, xp: 2, kbResist: 0,
    cap: 8, fly: { orbit: 170, tighten: 6, waitMin: 4, waitMax: 7.5, turn: 1.7, accel: 200, dive: 360 },
  },
  {
    id: 'bomber',
    behavior: 'kamikaze', shape: 'bomb', color: '#ff2b2b',
    hp: 12, speed: 90, damage: 0, radius: 13, xp: 2, kbResist: 0.1,
    cap: 4, fuse: 0.8, triggerRange: 56, blastRadius: 75, blastDamage: 14,
  },
  {
    id: 'hexagon',
    behavior: 'chaser', shape: 'hexagon', color: '#c8ff3d',
    hp: 100, speed: 30, damage: 10, radius: 24, xp: 6, kbResist: 0.9,
    cap: 2, splitInto: 'shard', splitCount: 6,
  },
  {
    id: 'shard',
    behavior: 'chaser', shape: 'triangle', color: '#c8ff3d', hidden: true,
    hp: 10, speed: 92, damage: 4, radius: 9, xp: 1, kbResist: 0,
  },
  {
    id: 'jumper',
    behavior: 'jumper', shape: 'octagon', color: '#9dff3d',
    hp: 30, speed: 50, damage: 0, radius: 14, xp: 3, kbResist: 0.3,
    cap: 3, blastRadius: 40, blastDamage: 12,
    hop: { crouch: 1.0, crouchBack: 0.5, air: 0.75, rest: 0.6, every: 2.4, range: 240, away: 150 },
  },
  {
    id: 'bonus_crate',
    behavior: 'prop', shape: 'box', color: '#f4f4ff',
    hp: 40, speed: 0, damage: 0, radius: 18, xp: 0, kbResist: 1,
  },
  {
    id: 'trapezoid',
    behavior: 'boss', boss: TRAPEZOID_BOSS, shape: 'trapezoid', color: '#ff3df5',
    hp: 2000, speed: 68, damage: 20, radius: 46, xp: 0, kbResist: 1,
  },
  {
    id: 'builder_hexagon',
    behavior: 'boss', boss: BUILDER_HEXAGON_BOSS, shape: 'hexagon', color: '#3dffe0',
    hp: 2100, speed: 54, damage: 22, radius: 44, xp: 0, kbResist: 1,
  },
  {
    id: 'ricochet_star',
    behavior: 'boss', boss: RICOCHET_STAR_BOSS, shape: 'star', color: '#ffd23a',
    hp: 1900, speed: 74, damage: 24, radius: 40, xp: 0, kbResist: 1,
  },
  {
    id: 'laser_eye',
    behavior: 'boss', boss: LASER_EYE_BOSS, shape: 'eye', color: '#ff4d6d',
    hp: 2100, speed: 66, damage: 20, radius: 42, xp: 0, kbResist: 1,
  },
  {
    id: 'swarm_queen',
    behavior: 'boss', boss: SWARM_QUEEN_BOSS, shape: 'queen', color: '#ff9ecf',
    hp: 3400, speed: 100, damage: 18, radius: 40, xp: 0, kbResist: 1,
  },
  {
    id: 'wall',
    behavior: 'wall', shape: 'block', color: '#3dffe0', hidden: true,
    hp: 26, speed: 0, damage: 0, radius: 15, xp: 0, kbResist: 1,
    rise: 0.6,
  },
  {
    id: 'egg',
    behavior: 'egg', shape: 'egg', color: '#ff9ecf', hidden: true,
    hp: 10, speed: 0, damage: 0, radius: 11, xp: 1, kbResist: 1,
    // the hatched Swarm are a bit sturdier than ordinary ones
    hatchInto: 'swarm', hatchCount: 7, hatchHp: 1.5,
  },
];

/** Bosses always come in this order, then loop around as "Mk II", "Mk III"... (their names: bossName in src/i18n/content.ts). */
export const BOSS_ORDER = ['trapezoid', 'builder_hexagon', 'ricochet_star', 'laser_eye', 'swarm_queen'];

/** HP of the k-th boss × (1 + BOSS_HP_GROWTH × k) */
export const BOSS_HP_GROWTH = 0.9;
