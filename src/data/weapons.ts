/**
 * Base weapons and their evolutions (a max-level weapon evolves, see fusions.ts).
 *
 * Each weapon has a `behavior` (the code that drives it in src/sim/weapons/) and a list of levels.
 * Levels are CUMULATIVE: `prog(base, d2, d3, ...)` starts from the base and applies each delta
 * on top of the previous one. Durations are in seconds, distances in world units.
 */

export type Behavior =
  | 'projectile'
  | 'spiral'
  | 'orbit'
  | 'aura'
  | 'rail'
  | 'mine'
  | 'boomerang'
  | 'arc'
  | 'pulse'
  | 'blade'
  | 'flame'
  | 'swarm'
  | 'shuriken'
  | 'mortar';

export interface WeaponLevel {
  damage: number;
  cooldown?: number;
  count?: number;
  speed?: number;
  pierce?: number;
  life?: number;
  size?: number;
  spread?: number;
  radius?: number;
  rotSpeed?: number;
  hitCd?: number;
  tick?: number;
  duration?: number;
  length?: number;
  width?: number;
  /** Electric arc: neighbours of the main target shocked on each tick, within `jumpRange` */
  jumps?: number;
  jumpRange?: number;
  range?: number;
  knockback?: number;
  slow?: number;
  /** duration of the slow left by a wave (s) */
  slowTime?: number;
  trigger?: number;
  stun?: number;
  /** Electric arc: stun of the neighbours (s) */
  sideStun?: number;
  pull?: number;
  pullRadius?: number;
  lifesteal?: number;
  /** Mine boomerang: the mine dropped where it turns back */
  mineDamage?: number;
  mineRadius?: number;
  /** gap between two shots of a burst (s) */
  delay?: number;
  burstEvery?: number;
  burstCount?: number;
  rotStep?: number;
  /** half-angle of a flame cone or of a blade sweep (radians); a blade with a half turn or more spins all around */
  arc?: number;
  /** Scythe: outer share of the reach that deals double damage */
  tip?: number;
  /** burn left on the enemies hit: damage per second and duration (s) */
  burn?: number;
  burnTime?: number;
  /** max turn rate (radians per second) of a flame jet or of a bee */
  turn?: number;
  /** bounces off the screen edges of a shuriken */
  bounces?: number;
  /** burning crater (Meteors): damage per second, radius, duration (s) */
  blazeDamage?: number;
  blazeRadius?: number;
  blazeLife?: number;
  /** flame jets spinning continuously (rad/s) instead of aiming */
  spin?: number;
  /** bees: respawn delay (s), time planted in the target (s) */
  respawn?: number;
  stay?: number;
  /** hornets: charge in and explode (1) */
  dive?: number;
  /** shells falling from the sky (Meteors): 1 */
  meteor?: number;
}

export interface WeaponDef {
  /** Name, description and per-level lines live in src/i18n/locales, keyed by this id. */
  id: string;
  behavior: Behavior;
  color: string;
  levels: WeaponLevel[];
  fusion?: boolean;
  /** Weight in the level-up offer draw. */
  weight?: number;
}

function prog(base: WeaponLevel, ...deltas: Partial<WeaponLevel>[]): WeaponLevel[] {
  const out: WeaponLevel[] = [base];
  let cur = base;
  for (const d of deltas) {
    cur = { ...cur, ...d };
    out.push(cur);
  }
  return out;
}

const deg = (d: number) => (d * Math.PI) / 180;

export const BASE_WEAPONS: WeaponDef[] = [
  {
    id: 'blaster',
    behavior: 'projectile',
    color: '#7df9ff',
    levels: prog(
      { damage: 10, cooldown: 1.0, count: 1, delay: 0.075, speed: 480, pierce: 0, life: 1.2, size: 6 },
      { count: 2 },
      { count: 3, damage: 11 },
      { count: 4, damage: 12 },
      { count: 5, damage: 13, pierce: 1 },
    ),
  },
  {
    id: 'shuriken',
    behavior: 'shuriken',
    color: '#ff4f9a',
    levels: prog(
      { damage: 10, count: 1, speed: 620, life: 4, size: 15, hitCd: 0.3 },
      { count: 2 },
      { damage: 12, life: 5 },
      { count: 3 },
      { damage: 14, life: 6, size: 18 },
    ),
  },
  {
    id: 'boomerang',
    behavior: 'boomerang',
    color: '#3dffb5',
    levels: prog(
      { damage: 30, cooldown: 1.6, range: 230, duration: 1.3, count: 1, size: 11, knockback: 80 },
      { count: 2, damage: 33 },
      { count: 3, damage: 36 },
      { count: 4, damage: 40 },
      { count: 5, damage: 45, size: 13 },
    ),
  },
  {
    id: 'railgun',
    behavior: 'rail',
    color: '#ff3b3b',
    levels: prog(
      { damage: 40, cooldown: 1.4, length: 900, width: 6, knockback: 100 },
      { damage: 55, cooldown: 1.3 },
      { damage: 70, cooldown: 1.2 },
      { damage: 85, cooldown: 1.05 },
      { damage: 100, cooldown: 0.9, width: 8, burn: 10, burnTime: 2.5 },
    ),
  },
  {
    id: 'mortar',
    behavior: 'mortar',
    color: '#ffe08a',
    levels: prog(
      { damage: 22, cooldown: 2.0, count: 1, radius: 88, range: 520, duration: 0.9, knockback: 100 },
      { damage: 26, radius: 92, knockback: 110 },
      { damage: 30, radius: 97, knockback: 120 },
      { damage: 35, radius: 101, knockback: 130 },
      { damage: 42, radius: 105, knockback: 140 },
    ),
  },
  {
    id: 'saws',
    behavior: 'orbit',
    color: '#9dff6a',
    levels: prog(
      { damage: 12, count: 2, radius: 85, rotSpeed: 3.0, size: 14, hitCd: 0.35, knockback: 60 },
      { count: 3 },
      { count: 4, damage: 14, radius: 92 },
      { count: 5 },
      { count: 6, damage: 16, radius: 100, size: 16 },
    ),
  },
  {
    id: 'blade',
    behavior: 'blade',
    color: '#ffb39c',
    levels: prog(
      { damage: 14, cooldown: 0.8, arc: deg(45), length: 95, knockback: 60 },
      { damage: 15, cooldown: 0.74, arc: deg(55), length: 98 },
      { damage: 17, cooldown: 0.68, arc: deg(65), length: 101 },
      { damage: 18, cooldown: 0.62, arc: deg(75), length: 105 },
      { damage: 20, cooldown: 0.56, arc: deg(90), length: 110 },
    ),
  },
  {
    id: 'force_field',
    behavior: 'aura',
    color: '#ff6ad5',
    levels: prog(
      { damage: 5, radius: 60, tick: 0.5, slow: 0 },
      { radius: 75 },
      { radius: 90, damage: 6 },
      { radius: 105, slow: 0.15 },
      { radius: 120, damage: 7, slow: 0.25 },
    ),
  },
  {
    id: 'shockwave',
    behavior: 'pulse',
    color: '#fff36a',
    levels: prog(
      { damage: 16, cooldown: 2.6, radius: 100, duration: 0.35, knockback: 300, count: 1 },
      { damage: 20, cooldown: 2.4, radius: 108 },
      { damage: 24, cooldown: 2.2, radius: 115, knockback: 330 },
      { damage: 28, cooldown: 2.0, radius: 123, knockback: 360 },
      { damage: 34, cooldown: 1.8, radius: 132, knockback: 400 },
    ),
  },
  {
    id: 'flamethrower',
    behavior: 'flame',
    color: '#ff6a1a',
    levels: prog(
      { damage: 5, cooldown: 1.3, duration: 1.0, tick: 0.12, length: 140, arc: 0.2, count: 1, turn: 2, burn: 8, burnTime: 2.5 },
      { damage: 6, duration: 1.1, length: 150, arc: 0.27, burn: 9 },
      { damage: 7, duration: 1.2, length: 158, arc: 0.34, burn: 11 },
      { damage: 8, duration: 1.4, length: 167, arc: 0.42, burn: 12 },
      { damage: 10, duration: 1.6, length: 185, arc: 0.52, burn: 14 },
    ),
  },
  {
    id: 'electric_arc',
    behavior: 'arc',
    color: '#5fa8ff',
    levels: prog(
      { damage: 5, cooldown: 2.5, duration: 0.6, tick: 0.2, range: 230, jumps: 1, jumpRange: 110, stun: 0.15 },
      { damage: 7, duration: 0.8, jumps: 2 },
      { damage: 9, duration: 1.0, stun: 0.2 },
      { damage: 11, duration: 1.3, jumps: 3 },
      { damage: 14, duration: 1.6, stun: 0.25 },
    ),
  },
  {
    id: 'mines',
    behavior: 'mine',
    color: '#ffb347',
    levels: prog(
      { damage: 45, cooldown: 1.2, radius: 48, trigger: 20, life: 8, knockback: 150 },
      { damage: 55, radius: 52 },
      { damage: 70, radius: 56 },
      { damage: 85, radius: 61 },
      { damage: 100, radius: 66, knockback: 180 },
    ),
  },
  {
    id: 'swarm',
    behavior: 'swarm',
    color: '#d6dcff',
    levels: prog(
      { damage: 20, count: 3, speed: 275, turn: 11, range: 300, stay: 1.5, respawn: 0.8, tick: 0.3 },
      { count: 4, damage: 24 },
      { count: 5, damage: 28 },
      { count: 6, damage: 33 },
      { count: 8, damage: 40 },
    ),
  },
];

export const FUSED_WEAPONS: WeaponDef[] = [
  {
    id: 'spiral',
    behavior: 'spiral',
    color: '#c6fbff',
    fusion: true,
    levels: [
      {
        damage: 15, cooldown: 0.075, count: 3, speed: 480, pierce: 3, life: 1.2, size: 6,
        spread: 0.15, rotStep: 0.42, burstEvery: 8, burstCount: 5,
      },
    ],
  },
  {
    id: 'mine_boomerang',
    behavior: 'boomerang',
    color: '#ffd36a',
    fusion: true,
    levels: [
      { damage: 50, cooldown: 1.4, range: 300, duration: 1.5, count: 5, size: 15, knockback: 100, mineDamage: 45, mineRadius: 60 },
    ],
  },
  {
    id: 'meteors',
    behavior: 'mortar',
    color: '#ff5a24',
    fusion: true,
    levels: [
      {
        damage: 90, cooldown: 0.6, count: 1, radius: 125, range: 540, duration: 0.6, knockback: 220, meteor: 1,
        blazeDamage: 22, blazeRadius: 80, blazeLife: 2.5,
      },
    ],
  },
  {
    id: 'black_holes',
    behavior: 'orbit',
    color: '#b98cff',
    fusion: true,
    levels: [{ damage: 30, count: 6, radius: 118, rotSpeed: 2.4, size: 22, hitCd: 0.3, pull: 150, pullRadius: 120, knockback: 0 }],
  },
  {
    id: 'vampire_field',
    behavior: 'aura',
    color: '#ff9af0',
    fusion: true,
    levels: [{ damage: 7, radius: 120, tick: 0.5, slow: 0.4, lifesteal: 0.05 }],
  },
  {
    id: 'earthquake',
    behavior: 'pulse',
    color: '#fffaa0',
    fusion: true,
    levels: [{ damage: 16, cooldown: 1.5, radius: 265, duration: 0.45, knockback: 0, count: 3, delay: 0.18, slow: 0.6, slowTime: 2.5 }],
  },
  {
    id: 'fire_tornado',
    behavior: 'flame',
    color: '#ff7a2e',
    fusion: true,
    levels: [{ damage: 10, tick: 0.12, length: 200, arc: 0.3, count: 4, spin: 2.4, burn: 16, burnTime: 2.5 }],
  },
  {
    id: 'electric_storm',
    behavior: 'arc',
    color: '#9fd0ff',
    fusion: true,
    levels: [{ damage: 20, cooldown: 1.4, duration: 1.6, tick: 0.2, range: 300, jumps: 6, jumpRange: 150, stun: 0.3, sideStun: 0.2 }],
  },
  {
    id: 'hornets',
    behavior: 'swarm',
    color: '#ff9a5c',
    fusion: true,
    levels: [{ damage: 75, count: 6, speed: 330, turn: 9, range: 320, radius: 110, knockback: 220, respawn: 0.4, dive: 1 }],
  },
  {
    id: 'scythe',
    behavior: 'blade',
    color: '#d9a8ff',
    fusion: true,
    levels: [{ damage: 20, cooldown: 0.7, arc: deg(180), length: 150, knockback: 80, tip: 0.35 }],
  },
];

export const ALL_WEAPONS: WeaponDef[] = [...BASE_WEAPONS, ...FUSED_WEAPONS];
