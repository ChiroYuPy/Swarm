/**
 * Structures de l'état de jeu. Tout est préalloué (pools) pour ne rien allouer dans la boucle chaude.
 * Les tableaux actifs sont compacts : les entités vivantes occupent [0, count).
 */
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
  /** direction de déplacement (pour l'orientation au rendu) */
  vx = 0;
  vy = 0;
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
  /** gelé (objet Gel) jusqu'à ce tick : immobile, fragile, éclate à sa mort */
  frozenUntil = 0;
  /** galvanisé par un Meneur jusqu'à ce tick (plus rapide) */
  boostUntil = 0;
  hitTick = -1000;
  attackReady = 0;
  /** état d'IA (phase), minuteur et variables auxiliaires */
  ai = 0;
  timer = 0;
  aux = 0;
  aux2 = 0;
  /** joueur ciblé (pour le multi) */
  target = 0;
  immune = new Int32Array(IMMUNE_SLOTS);
}

export const PJ_BULLET = 0;
export const PJ_EBULLET = 1;
export const PJ_MINE = 2;
export const PJ_BOOMERANG = 3;
export const PJ_RING = 4;

export class Projectile {
  kind = 0;
  owner = 0;
  slot = 0;
  /** index de la définition d'arme (couleur au rendu) */
  weapon = 0;
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  r = 4;
  damage = 0;
  /** ticks restants */
  life = 0;
  age = 0;
  /** ennemis traversables restants (-1 = infini) */
  pierce = 0;
  knock = 0;
  hitIds = new Int32Array(8);
  hitCount = 0;
  /** données propres au type de projectile */
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

/** Codes d'objets : index dans data/loot.ts PICKUPS. */
export const PK_HEAL = 0;
export const PK_RAGE = 1;
export const PK_FRENZY = 2;
export const PK_TURBO = 3;
export const PK_SHIELD = 4;
export const PK_FEVER = 5;
export const PK_TOTEM = 6;
export const PK_VACUUM = 7;
export const PK_FREEZE = 8;
export const PK_BOMB = 9;
export const PK_CLOCK = 10;
export const PK_CLONE = 11;
export const PK_ERADICATE = 12;
export const PK_CHEST = 13;
export const PK_FIRST_ACTIVE = PK_VACUUM;
export const PK_LAST_ACTIVE = PK_ERADICATE;

export class Pickup {
  x = 0;
  y = 0;
  kind = 0;
  /** ticks restants avant disparition (-1 = permanent) */
  life = 0;
  /** attiré vers le joueur (Aspirateur) */
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
  // Valeurs calculées pour le rendu (orbites, aura, rayons).
  vR = 0;
  vS = 0;
  vN = 0;
  vLen = 0;
  vW = 0;
  angles = new Float64Array(4);
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
  /** réduction des dégâts subis (0..0.6) */
  armor: number;
  /** multiplicateur de chance d'obtenir des objets */
  luck: number;
}

export function baseStats(): PlayerStats {
  return { maxHp: 100, speed: 150, magnet: 72, regen: 0, might: 1, area: 1, cooldownMul: 1, armor: 0, luck: 1 };
}

/** Proposition de level-up. */
export const OFFER_WEAPON = 0;
export const OFFER_PASSIVE = 1;
export const OFFER_FUSION = 2;
export const OFFER_PIZZA = 3;

export interface Offer {
  kind: number;
  /** index d'arme / passif / fusion */
  id: number;
  /** niveau atteint si on choisit cette offre (0 = nouvel objet niveau 1) */
  toLevel: number;
}

export class Player {
  index = 0;
  alive = true;
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  r = 14;
  hp = 100;
  level = 1;
  xp = 0;
  xpNext = 5;
  kills = 0;
  bossKills = 0;
  damageDealt = 0;
  weapons: WeaponInst[] = [];
  passives: PassiveInst[] = [];
  /** armes de base consommées par une fusion (ne peuvent plus être proposées) */
  banned: number[] = [];
  pendingLevels = 0;
  offers: Offer[] = [];
  offerLevel = 0;
  /** stats issues des bonus passifs */
  base: PlayerStats = baseStats();
  /** stats effectives (passifs + bonus temporaires), recalculées à chaque pas */
  stats: PlayerStats = baseStats();
  /** fins des bonus temporaires (tick) */
  rageUntil = 0;
  frenzyUntil = 0;
  turboUntil = 0;
  shieldUntil = 0;
  feverUntil = 0;
  /** Totem en réserve (0 ou 1) : se déclenche tout seul à la mort */
  totem = 0;
  /** clone : index du joueur copié (-1 = vrai joueur) et tick de disparition */
  master = -1;
  expires = 0;
  /** objet activable en réserve (code PK_*, -1 = aucun) */
  activable = -1;
  /** dernière direction regardée */
  faceX = 1;
  faceY = 0;
  moveX = 0;
  moveY = 0;
  hurtTick = -1000;
  invulnUntil = 0;
  deathTick = -1;
  /** multiplicateur de dégâts fixe (réglage du bac à sable, 1 sinon) */
  mightMul = 1;
}

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
/** nouveau type d'ennemi annoncé (k = type) */
export const EV_NEW_ENEMY = 25;
/** objet activable utilisé (k = code PK_*) */
export const EV_ACTIVATE = 26;
/** caisse bonus apparue */
export const EV_PROP = 27;
/** balle de Tireur détruite par une arme */
export const EV_SHOT_DOWN = 28;
/** ennemi gelé qui éclate (v = rayon) */
export const EV_SHATTER = 29;
/** le Totem ramène le joueur */
export const EV_REVIVE = 30;
/** le clone disparaît */
export const EV_CLONE_END = 31;
/** Téléporteur : x, y = arrivée, v = rayon de l'impact */
export const EV_BLINK = 32;

/** Événement émis par la sim pour le rendu et l'audio. Purement informatif : la sim ne les relit jamais. */
export class SimEvent {
  type = 0;
  x = 0;
  y = 0;
  x2 = 0;
  y2 = 0;
  v = 0;
  k = 0;
  p = 0;
}

/** Règles du bac à sable appliquées pendant la partie (voir sandbox.ts). */
export interface SandboxRules {
  invincible: boolean;
  /** multiplicateur du nombre d'ennemis (0 = aucun) */
  enemyMul: number;
  /** types d'ennemis autorisés (index), null = progression normale */
  enemies: number[] | null;
  bosses: boolean;
  /** multiplicateur de l'XP ramassée */
  xp: number;
}

export interface GameState {
  version: number;
  seed: number;
  seedLabel: string;
  /** index dans data/difficulty.ts */
  difficulty: number;
  tick: number;
  over: boolean;
  /** champ d'obstacles infini (dérivé de la seed, non sérialisé) */
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
  /** id de l'ennemi boss vivant, -1 sinon */
  bossId: number;
  chestCount: number;
  totalKills: number;
  /** monde ralenti (Horloge) jusqu'à ce tick */
  clockUntil: number;
  /** règles du bac à sable (null = partie normale) */
  sandbox: SandboxRules | null;
  // Caches dérivés (non sérialisés, reconstruits à la volée).
  grid: SpatialGrid;
  nav: NavField;
  /** éclats de Gel en attente (x, y, dégâts, joueur crédité), vidée dans le même pas */
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
  type: number,
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
