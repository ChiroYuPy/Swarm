/**
 * Game state structures. Everything is preallocated (pools) so nothing is allocated in the hot loop.
 * Active arrays are compact: living entities occupy [0, count).
 */
import { HERO } from '../data/hero';
import { PICKUPS, type PickupId, type PickupKind } from '../data/loot';
import {
  IMMUNE_SLOTS,
  MAX_ENEMIES,
  MAX_EVENTS,
  MAX_GEMS,
  MAX_PICKUPS,
  MAX_PROJECTILES,
} from './constants';
import type { WorldMap } from './map';
import type { Rng } from './rng';
import type { SpatialGrid } from './grid';
import type { NavField } from './navfield';

export const EF_PROP = 1;
export const EF_BOSS = 2;

export class Enemy {
  id = 0;
  type = 0;
  alive = false;
  flags = 0;
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  /** facing (unit vector, for orientation when rendering): turns progressively toward where it goes */
  vx = 0;
  vy = 0;
  /** current velocity (units/s, knockback excluded): it steers toward the one it wants, with limited acceleration */
  mvx = 0;
  mvy = 0;
  hp = 0;
  maxHp = 0;
  r = 10;
  speed = 0;
  dmg = 0;
  xp = 0;
  kbx = 0;
  kby = 0;
  kbResist = 0;
  slowUntil = 0;
  slowFactor = 0;
  stunUntil = 0;
  /** frozen (Freeze item) until this tick: motionless, fragile, shatters on death */
  frozenUntil = 0;
  /** burning until this tick: `burnDps` fire damage, dealt every BURN_TICKS from `burnNext`, credited to `burnOwner` */
  burnUntil = 0;
  burnDps = 0;
  burnNext = 0;
  burnOwner = -1;
  hitTick = -1000;
  attackReady = 0;
  /** AI state (phase), timer and auxiliary variables */
  ai = 0;
  timer = 0;
  aux = 0;
  aux2 = 0;
  /** boss: anchor point (Ricochet star: centre of the bounce box) or angles (Laser eye: start and end of the sweep) */
  ax = 0;
  ay = 0;
  /** targeted player (for multiplayer) */
  target = 0;
  immune = new Int32Array(IMMUNE_SLOTS);
}

export const PJ_BULLET = 0;
export const PJ_EBULLET = 1;
export const PJ_MINE = 2;
export const PJ_BOOMERANG = 3;
export const PJ_RING = 4;
/** ground flame left by the Ricochet star: a = damage per second */
export const PJ_FIRE = 5;
/** shuriken flying straight and bouncing off the screen edges: a = bounces left (unused: it lives `life`) */
export const PJ_SHURIKEN = 6;
/** player's ground flame (burns enemies): a = damage per second */
export const PJ_BLAZE = 7;
/**
 * bee of the Swarm: a = state (BEE_*), b = state timer (ticks), c = index of its target (-1 = none, ty = its id),
 * d = slot in the ring, tx = heading (radians); planted: (vx, vy) = offset from the target
 */
export const PJ_BEE = 8;
/** shell flying from (vx, vy) to (tx, ty): a = flight duration, b = radius, c = meteor (1) */
export const PJ_SHELL = 9;
/**
 * Every projectile kind. `Projectile.kind` has this type, so a new PJ_* constant cannot be spawned until it
 * is listed here, and then `updateProjectiles` (sim/projectiles.ts) and `drawProjectiles`
 * (render/draw-projectiles.ts) fail to typecheck until they handle it.
 */
export type ProjectileKind =
  | typeof PJ_BULLET
  | typeof PJ_EBULLET
  | typeof PJ_MINE
  | typeof PJ_BOOMERANG
  | typeof PJ_RING
  | typeof PJ_FIRE
  | typeof PJ_SHURIKEN
  | typeof PJ_BLAZE
  | typeof PJ_BEE
  | typeof PJ_SHELL;

export class Projectile {
  kind: ProjectileKind = PJ_BULLET;
  owner = 0;
  slot = 0;
  /** weapon definition index (colour when rendering) */
  weapon = 0;
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  r = 4;
  damage = 0;
  /** ticks left */
  life = 0;
  age = 0;
  /** enemies it can still pierce (-1 = infinite) */
  pierce = 0;
  knock = 0;
  hitIds = new Int32Array(8);
  hitCount = 0;
  /** target: landing point of a shell, or id of the targeted enemy (bees) */
  tx = 0;
  ty = 0;
  /** data specific to the projectile kind */
  a = 0;
  b = 0;
  c = 0;
  d = 0;
}

export class Gem {
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  value = 0;
  tier = 0;
  magnet = false;
  speed = 0;
}

/** Pickup code of a pickup id: its index in data/loot.ts PICKUPS. */
export function pickupCode(id: PickupId): number {
  const i = PICKUPS.findIndex((d) => d.id === id);
  if (i < 0) throw new Error(`unknown pickup: ${id}`);
  return i;
}

/** Pickup codes the engine refers to by name (derived from the ids, so they cannot drift from PICKUPS). */
export const PK_HEAL = pickupCode('heal');
export const PK_RAGE = pickupCode('rage');
export const PK_FRENZY = pickupCode('frenzy');
export const PK_TURBO = pickupCode('turbo');
export const PK_SHIELD = pickupCode('shield');
export const PK_FEVER = pickupCode('fever');
export const PK_TOTEM = pickupCode('totem');
export const PK_VACUUM = pickupCode('vacuum');
export const PK_FREEZE = pickupCode('freeze');
export const PK_BOMB = pickupCode('bomb');
export const PK_CLOCK = pickupCode('clock');
export const PK_CLONE = pickupCode('clone');
export const PK_ERADICATE = pickupCode('eradicate');
export const PK_CHEST = pickupCode('chest');

/** Kind of each pickup code. */
export const PICKUP_KIND: readonly PickupKind[] = PICKUPS.map((d) => d.kind);
/** Active item codes, in PICKUPS order. */
export const ACTIVE_PICKUPS: readonly number[] = PICKUPS.flatMap((d, i) => (d.kind === 'active' ? [i] : []));
/** Is this pickup code an active item (stored, used with Space)? */
export function isActiveItem(code: number): boolean {
  return PICKUP_KIND[code] === 'active';
}

export class Pickup {
  x = 0;
  y = 0;
  kind = 0;
  /** ticks left before it disappears (-1 = permanent) */
  life = 0;
  /** pulled toward the player (Vacuum) */
  magnet = false;
  speed = 0;
}

export class WeaponInst {
  def = 0;
  level = 1;
  timer = 0;
  angle = 0;
  shots = 0;
  burstLeft = 0;
  burstTimer = 0;
  activeTicks = 0;
  tickTimer = 0;
  /** target locked by the Electric arc: index and id (-1 = none) */
  lockIdx = -1;
  lockId = -1;
  // Values computed for rendering (orbits, aura, sweeps).
  vR = 0;
  vS = 0;
  vN = 0;
  vLen = 0;
  vW = 0;
  angles = new Float64Array(8);
}

export class PassiveInst {
  def = 0;
  level = 1;
}

export interface PlayerStats {
  maxHp: number;
  speed: number;
  magnet: number;
  regen: number;
  might: number;
  area: number;
  cooldownMul: number;
  /** damage taken reduction (0..0.6) */
  armor: number;
  /** item drop chance multiplier */
  luck: number;
}

export function baseStats(): PlayerStats {
  return {
    maxHp: HERO.maxHp,
    speed: HERO.speed,
    magnet: HERO.magnet,
    regen: HERO.regen,
    might: 1,
    area: 1,
    cooldownMul: 1,
    armor: 0,
    luck: 1,
  };
}

/** Level-up offer. */
export const OFFER_WEAPON = 0;
export const OFFER_PASSIVE = 1;
export const OFFER_FUSION = 2;
export const OFFER_HEAL = 3;
/** swaps the weapon being swapped (Player.swapSlot) for weapon `id`, at level `toLevel` */
export const OFFER_SWAP = 4;
export type OfferKind = typeof OFFER_WEAPON | typeof OFFER_PASSIVE | typeof OFFER_FUSION | typeof OFFER_HEAL | typeof OFFER_SWAP;

export interface Offer {
  kind: OfferKind;
  /** weapon / passive / evolution index */
  id: number;
  /** level reached if this offer is picked (0 = new item at level 1) */
  toLevel: number;
}

export class Player {
  index = 0;
  alive = true;
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  r = HERO.radius;
  hp = HERO.maxHp;
  level = 1;
  xp = 0;
  xpNext = 5;
  kills = 0;
  bossKills = 0;
  damageDealt = 0;
  weapons: WeaponInst[] = [];
  passives: PassiveInst[] = [];
  /** base weapons consumed by an evolution (can no longer be offered) */
  banned: number[] = [];
  pendingLevels = 0;
  offers: Offer[] = [];
  offerLevel = 0;
  /** weapon swap charges (one more per boss defeated) */
  swaps = 0;
  /** weapon slot being swapped at level-up (-1 = none) */
  swapSlot = -1;
  /** stats from passive bonuses */
  base: PlayerStats = baseStats();
  /** effective stats (passives + timed buffs), recomputed every step */
  stats: PlayerStats = baseStats();
  /** timed buff end times (tick) */
  rageUntil = 0;
  frenzyUntil = 0;
  turboUntil = 0;
  shieldUntil = 0;
  feverUntil = 0;
  /** Totem held (0 or 1): triggers on its own at death */
  totem = 0;
  /** clone: index of the copied player (-1 = real player) and expiry tick */
  master = -1;
  expires = 0;
  /** held active item (PK_* code, -1 = none) */
  activeItem = -1;
  /** manual aim: direction 0..63 (see INPUT_AIM_BASE), -1 = auto aim */
  aim = -1;
  /** last facing direction */
  faceX = 1;
  faceY = 0;
  moveX = 0;
  moveY = 0;
  hurtTick = -1000;
  invulnUntil = 0;
  deathTick = -1;
  /** fixed damage multiplier (sandbox setting, 1 otherwise) */
  mightMul = 1;
}

/** Damage types: the colour of the damage numbers (EV_HIT y2). */
export const DMG_PHYS = 0;
export const DMG_FIRE = 1;
export const DMG_COLD = 2;
export const DMG_ELEC = 3;
export type DamageType = typeof DMG_PHYS | typeof DMG_FIRE | typeof DMG_COLD | typeof DMG_ELEC;

/** enemy hit: v = damage, k = enemy type, x2 = 1 for a quiet hit (burn: no sound), y2 = DamageType */
export const EV_HIT = 1;
export const EV_KILL = 2;
export const EV_GEM = 3;
export const EV_HURT = 4;
export const EV_LEVELUP = 5;
export const EV_SHOOT = 6;
export const EV_EXPLOSION = 7;
export const EV_LINE = 8;
export const EV_RING = 9;
export const EV_BOSS_SPAWN = 10;
export const EV_BOSS_DEAD = 11;
export const EV_CHEST = 12;
export const EV_HEAL = 13;
export const EV_PICKUP = 14;
export const EV_DEATH = 15;
export const EV_ENEMY_SHOT = 16;
export const EV_FUSION = 17;
export const EV_CHOICE = 18;
export const EV_BOMB = 19;
export const EV_MAGNET = 20;
export const EV_WALL_HIT = 21;
export const EV_SWARM = 22;
export const EV_RING_WAVE = 23;
export const EV_FUSE = 24;
/** new enemy type announced (k = type) */
export const EV_NEW_ENEMY = 25;
/** active item used (k = PK_* code) */
export const EV_ACTIVATE = 26;
/** bonus crate appeared */
export const EV_PROP = 27;
/** Shooter bullet destroyed by a weapon */
export const EV_SHOT_DOWN = 28;
/** frozen enemy shattering (v = radius) */
export const EV_SHATTER = 29;
/** the Totem brings the player back */
export const EV_REVIVE = 30;
/** the clone disappears */
export const EV_CLONE_END = 31;
/** Jumper landing: x, y = where, v = impact radius, k = type */
export const EV_LAND = 32;
/** enemy driven off by a boss arrival: x, y, v = radius, k = type */
export const EV_FLEE = 33;
/** wave start: v = number (1 = the first) */
export const EV_WAVE = 34;
/** egg hatched: x, y, v = number of Swarm */
export const EV_HATCH = 35;
/** the Laser eye starts sweeping: x, y = the eye */
export const EV_LASER = 36;
/** the Builder hexagon sets its cage: x, y = centre, v = radius */
export const EV_CAGE = 37;
/** an item appears on its own in the arena: x, y, k = PK_* code */
export const EV_MAP_ITEM = 38;
/** the last boss of the run is down: the game is won (it can go on, endless) */
export const EV_VICTORY = 39;
/** the boss arena closes (x, y = centre, v = radius) or opens again (v = 0) */
export const EV_ARENA = 40;
/**
 * Every event code. `emit()` only takes these, so a new EV_* constant must be listed here, and then
 * `Effects.consume` (render/effects.ts) fails to typecheck until it handles it (or lists it as ignored).
 */
export type EventType =
  | typeof EV_HIT
  | typeof EV_KILL
  | typeof EV_GEM
  | typeof EV_HURT
  | typeof EV_LEVELUP
  | typeof EV_SHOOT
  | typeof EV_EXPLOSION
  | typeof EV_LINE
  | typeof EV_RING
  | typeof EV_BOSS_SPAWN
  | typeof EV_BOSS_DEAD
  | typeof EV_CHEST
  | typeof EV_HEAL
  | typeof EV_PICKUP
  | typeof EV_DEATH
  | typeof EV_ENEMY_SHOT
  | typeof EV_FUSION
  | typeof EV_CHOICE
  | typeof EV_BOMB
  | typeof EV_MAGNET
  | typeof EV_WALL_HIT
  | typeof EV_SWARM
  | typeof EV_RING_WAVE
  | typeof EV_FUSE
  | typeof EV_NEW_ENEMY
  | typeof EV_ACTIVATE
  | typeof EV_PROP
  | typeof EV_SHOT_DOWN
  | typeof EV_SHATTER
  | typeof EV_REVIVE
  | typeof EV_CLONE_END
  | typeof EV_LAND
  | typeof EV_FLEE
  | typeof EV_WAVE
  | typeof EV_HATCH
  | typeof EV_LASER
  | typeof EV_CAGE
  | typeof EV_MAP_ITEM
  | typeof EV_VICTORY
  | typeof EV_ARENA;

/** Event emitted by the sim for rendering and audio. Purely informative: the sim never reads them back. */
export class SimEvent {
  /** EV_* code, set by emit() (the pool's initial value is never read) */
  type: EventType = EV_HIT;
  x = 0;
  y = 0;
  x2 = 0;
  y2 = 0;
  v = 0;
  k = 0;
  p = 0;
}

/** Sandbox rules applied during the game (see sandbox.ts). */
export interface SandboxRules {
  invincible: boolean;
  /** enemy count multiplier (0 = none) */
  enemyMul: number;
  /** allowed enemy types (indices), null = normal progression */
  enemies: number[] | null;
  bosses: boolean;
  /** do bosses call their reinforcements (and does the Queen lay eggs)? */
  summons: boolean;
  /** duel: rank of the boss to bring in on the first step (like a game's k-th boss), -1 = none */
  duel: number;
  /** collected XP multiplier */
  xp: number;
}

export interface GameState {
  version: number;
  seed: number;
  seedLabel: string;
  /** index into data/difficulty.ts */
  difficulty: number;
  tick: number;
  over: boolean;
  /** infinite obstacle field (derived from the seed, not serialized) */
  map: WorldMap;
  players: Player[];
  enemies: Enemy[];
  enemyCount: number;
  nextEnemyId: number;
  projectiles: Projectile[];
  projCount: number;
  gems: Gem[];
  gemCount: number;
  gemMergeCursor: number;
  pickups: Pickup[];
  pickupCount: number;
  rngWaves: Rng;
  rngLoot: Rng;
  spawnBudget: number;
  bossSpawned: number;
  /** id of the living boss enemy, -1 otherwise */
  bossId: number;
  /** wave clock (ticks): advances except during a boss and the calm that follows */
  clock: number;
  /** calm after a boss until this tick (no wave, no clock) */
  calmUntil: number;
  /** boss arena (players and enemies kept inside): centre and radius, 0 = open */
  arenaX: number;
  arenaY: number;
  arenaR: number;
  /** the run is won (last boss of the plan down); it can go on, endless */
  won: boolean;
  /** half-size of the box around a player that shurikens bounce in: the screen at normal zoom (the codex preview sets its own view) */
  boxX: number;
  boxY: number;
  chestCount: number;
  totalKills: number;
  /** world slowed down (Clock) until this tick */
  clockUntil: number;
  /** sandbox rules (null = normal game) */
  sandbox: SandboxRules | null;
  // Derived caches (not serialized, rebuilt on the fly).
  grid: SpatialGrid;
  nav: NavField;
  /** pending Freeze shatters (x, y, damage, credited player), emptied within the same step */
  shatters: number[];
  events: SimEvent[];
  eventCount: number;
}

export function makePools() {
  const enemies: Enemy[] = new Array(MAX_ENEMIES);
  for (let i = 0; i < MAX_ENEMIES; i++) enemies[i] = new Enemy();
  const projectiles: Projectile[] = new Array(MAX_PROJECTILES);
  for (let i = 0; i < MAX_PROJECTILES; i++) projectiles[i] = new Projectile();
  const gems: Gem[] = new Array(MAX_GEMS);
  for (let i = 0; i < MAX_GEMS; i++) gems[i] = new Gem();
  const pickups: Pickup[] = new Array(MAX_PICKUPS);
  for (let i = 0; i < MAX_PICKUPS; i++) pickups[i] = new Pickup();
  const events: SimEvent[] = new Array(MAX_EVENTS);
  for (let i = 0; i < MAX_EVENTS; i++) events[i] = new SimEvent();
  return { enemies, projectiles, gems, pickups, events };
}

export function emit(
  s: GameState,
  type: EventType,
  x: number,
  y: number,
  v = 0,
  k = 0,
  x2 = 0,
  y2 = 0,
  p = 0,
): void {
  if (s.eventCount >= MAX_EVENTS) return;
  const e = s.events[s.eventCount++];
  e.type = type;
  e.x = x;
  e.y = y;
  e.v = v;
  e.k = k;
  e.x2 = x2;
  e.y2 = y2;
  e.p = p;
}
