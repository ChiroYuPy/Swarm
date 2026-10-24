/** Ennemis. Les PV / dégâts / vitesses sont multipliés par les courbes de difficulté de waves.ts. */

export type EnemyBehavior = 'chaser' | 'shooter' | 'kamikaze' | 'swarm' | 'prop' | 'boss' | 'leader' | 'blinker' | 'orbiter' | 'wall' | 'egg';
export type EnemyShape =
  | 'triangle'
  | 'diamond'
  | 'square'
  | 'pentagon'
  | 'circle'
  | 'dot'
  | 'box'
  | 'trapeze'
  | 'rock'
  | 'sun'
  | 'ring'
  | 'dart'
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
  /** 0 = subit tout le recul, 1 = insensible */
  kbResist: number;
  /** absent du codex et du bac à sable (n'apparaît que via un autre ennemi) */
  hidden?: boolean;
  /** à sa mort, se coupe en `splitCount` ennemis `splitInto` */
  splitInto?: string;
  splitCount?: number;
  /** nombre maximal en vie : `capStart` à son arrivée, + `capPerMinute` par minute ensuite, au plus `capMax` */
  capStart?: number;
  capPerMinute?: number;
  capMax?: number;
  // meneur : les autres ennemis à moins de `auraRadius` vont `auraSpeed` plus vite
  auraRadius?: number;
  auraSpeed?: number;
  // téléporteur : marque le sol sous le joueur, s'y téléporte après `fuse` s (dégâts de zone), toutes les `blinkEvery` s
  blinkEvery?: number;
  // shooter
  keepMin?: number;
  keepMax?: number;
  shootEvery?: number;
  bulletSpeed?: number;
  bulletDamage?: number;
  // kamikaze
  fuse?: number;
  triggerRange?: number;
  blastRadius?: number;
  blastDamage?: number;
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

export interface BossPhase {
  kind: BossPhaseKind;
  duration: number;
}

/**
 * Renforts d'un boss (phase 'summon') : un gros paquet d'un seul type, autour du boss ou en cercle
 * autour du joueur. Rien s'il reste déjà `maxAlive` ennemis : il faut toujours une fenêtre pour le taper.
 */
export interface BossSummon {
  type: string;
  count: number;
  /** ennemis en plus par boss déjà apparu */
  perBoss: number;
  around: 'self' | 'player';
  radius: number;
  maxAlive: number;
  /** PV des renforts × hp (1 par défaut) */
  hp?: number;
}

/** 'spiral' phase params. */
export interface BossSpiral {
  spiralEvery: number;
  spiralArms: number;
  /** extra arms per boss already spawned */
  spiralArmsPerBoss?: number;
  spiralTurn: number;
  bulletSpeed: number;
  bulletDamage: number;
}

/**
 * What the registry compiles for every boss. A boss whose pattern has a 'spiral' phase must also
 * carry the BossSpiral fields (checked by tests/registry.test.ts); the other params are read by name.
 */
export interface BossConfig extends Partial<BossSpiral> {
  pattern: BossPhase[];
  summon?: BossSummon;
}

/** Trapèze : une séquence de phases qui boucle. */
export const TRAPEZOID_BOSS = {
  pattern: [
    { kind: 'chase', duration: 2.5 },
    { kind: 'spiral', duration: 3.0 },
    { kind: 'chase', duration: 1.5 },
    { kind: 'charge', duration: 1.9 },
    { kind: 'charge', duration: 1.9 },
    { kind: 'summon', duration: 1.2 },
  ] as BossPhase[],
  spiralEvery: 0.1,
  spiralArms: 4,
  spiralArmsPerBoss: 1,
  spiralTurn: 0.23,
  bulletSpeed: 175,
  bulletDamage: 10,
  /** durée de la ligne d'avertissement (s) ; ensuite il fonce jusqu'au bout de la ligne */
  chargeTelegraph: 0.9,
  chargeSpeed: 700,
  /** portée de la charge (= longueur de la ligne d'avertissement) */
  chargeLength: 560,
  /** dégâts de contact × chargeDamage pendant qu'il fonce */
  chargeDamage: 1.8,
  summon: { type: 'hunter', count: 10, perBoss: 2, around: 'self', radius: 90, maxAlive: 20 } as BossSummon,
};

/** Hexagone bâtisseur : cage de murs cassables autour du joueur, puis tirs à travers. */
export const BUILDER_HEXAGON_BOSS = {
  pattern: [
    { kind: 'chase', duration: 2.0 },
    { kind: 'build', duration: 1.0 },
    { kind: 'spiral', duration: 3.4 },
    { kind: 'volley', duration: 2.0 },
    { kind: 'chase', duration: 2.0 },
    { kind: 'summon', duration: 1.0 },
  ] as BossPhase[],
  /** rayon de la cage (hexagone) et écart entre deux murs */
  cageRadius: 210,
  wallSpacing: 27,
  /** une cage seulement tous les N cycles */
  cageEvery: 2,
  /** murs manquants au milieu de deux côtés opposés (les sorties) */
  gapWalls: 3,
  /** durée de vie d'un mur, dont la montée (pas encore solide) */
  wallLife: 6.5,
  wallRise: 0.6,
  spiralEvery: 0.2,
  spiralArms: 5,
  spiralTurn: 0.1,
  volleyEvery: 0.5,
  volleyCount: 5,
  volleySpread: 0.14,
  bulletSpeed: 185,
  bulletDamage: 10,
  summon: { type: 'block', count: 5, perBoss: 1, around: 'player', radius: 420, maxAlive: 12 } as BossSummon,
};

/** Étoile ricochet : vise (ligne), fonce en rebondissant dans une boîte autour du joueur, laisse du feu. */
export const RICOCHET_STAR_BOSS = {
  pattern: [
    { kind: 'chase', duration: 1.4 },
    { kind: 'aim', duration: 0.9 },
    { kind: 'dash', duration: 4.2 },
    { kind: 'aim', duration: 0.7 },
    { kind: 'dash', duration: 3.4 },
    { kind: 'burst', duration: 1.4 },
    { kind: 'summon', duration: 0.8 },
  ] as BossPhase[],
  /** vitesse et durée des ruées : 3 à 4 rebonds par ruée dans la boîte */
  dashSpeed: 620,
  /** demi-côté de la boîte de rebond, centrée là où était le joueur quand elle a visé */
  box: 340,
  /** dégâts de contact × dashDamage pendant qu'elle fonce */
  dashDamage: 1.6,
  /** une flamme toutes les `fireEvery` images */
  fireEvery: 3,
  fireRadius: 20,
  fireLife: 3.2,
  /** dégâts par seconde passée dans les flammes */
  fireDps: 22,
  burstArms: 10,
  bulletSpeed: 180,
  bulletDamage: 10,
  summon: { type: 'rusher', count: 12, perBoss: 2, around: 'self', radius: 80, maxAlive: 20 } as BossSummon,
};

/** Œil laser : garde ses distances, annonce un cône puis le balaie avec un rayon. */
export const LASER_EYE_BOSS = {
  pattern: [
    { kind: 'watch', duration: 2.0 },
    { kind: 'focus', duration: 1.1 },
    { kind: 'sweep', duration: 1.0 },
    { kind: 'focus', duration: 0.9 },
    { kind: 'sweep', duration: 1.0 },
    { kind: 'watch', duration: 1.6 },
    { kind: 'summon', duration: 0.8 },
  ] as BossPhase[],
  keepMin: 240,
  keepMax: 330,
  shootEvery: 0.45,
  bulletSpeed: 210,
  bulletDamage: 9,
  beamLength: 520,
  beamWidth: 16,
  /** ouverture du balayage (radians) */
  arc: 1.6,
  beamDamage: 28,
  summon: { type: 'orbiter', count: 8, perBoss: 2, around: 'player', radius: 520, maxAlive: 14 } as BossSummon,
};

/** Reine de l'essaim : fuit (plus lente que toi) et pond des œufs qui éclosent en Essaim. */
export const SWARM_QUEEN_BOSS = {
  pattern: [
    { kind: 'flee', duration: 0.9 },
    { kind: 'lay', duration: 0.3 },
    { kind: 'flee', duration: 0.9 },
    { kind: 'lay', duration: 0.3 },
    { kind: 'spiral', duration: 2.2 },
    { kind: 'flee', duration: 0.9 },
    { kind: 'summon', duration: 0.6 },
  ] as BossPhase[],
  keepMin: 260,
  keepMax: 400,
  /** une ponte sur `bigEvery` est triple */
  bigEvery: 2,
  hatchAfter: 2.6,
  hatchCount: 7,
  maxEggs: 14,
  /** PV de l'Essaim qui éclot (× les PV normaux) : un peu plus solide qu'un Essaim ordinaire */
  broodHp: 1.5,
  /** gerbe de dards en spirale */
  spiralEvery: 0.12,
  spiralArms: 3,
  spiralTurn: 0.38,
  /** à chaque ponte, une salve vers le joueur */
  volleyCount: 3,
  volleySpread: 0.22,
  bulletSpeed: 190,
  bulletDamage: 10,
  summon: { type: 'swarm', count: 18, perBoss: 4, around: 'self', radius: 70, maxAlive: 70, hp: 1.5 } as BossSummon,
};

export const ENEMIES: EnemyDef[] = [
  {
    id: 'hunter',
    behavior: 'chaser', shape: 'triangle', color: '#ff3366',
    hp: 9, speed: 72, damage: 6, radius: 12, xp: 1, kbResist: 0,
  },
  {
    id: 'rusher',
    behavior: 'chaser', shape: 'diamond', color: '#ffe14d',
    hp: 6, speed: 112, damage: 4, radius: 10, xp: 1, kbResist: 0,
  },
  {
    id: 'block',
    behavior: 'chaser', shape: 'square', color: '#ff8a1f',
    hp: 55, speed: 46, damage: 12, radius: 21, xp: 4, kbResist: 0.75,
  },
  {
    id: 'shooter',
    behavior: 'shooter', shape: 'pentagon', color: '#c46bff',
    hp: 20, speed: 62, damage: 6, radius: 14, xp: 3, kbResist: 0.2,
    keepMin: 240, keepMax: 340, shootEvery: 2.6, bulletSpeed: 190, bulletDamage: 7,
  },
  {
    id: 'orbiter',
    behavior: 'orbiter', shape: 'dart', color: '#3dffb4',
    hp: 12, speed: 128, damage: 5, radius: 11, xp: 2, kbResist: 0,
  },
  {
    id: 'golem',
    behavior: 'chaser', shape: 'rock', color: '#c8ff3d',
    hp: 110, speed: 30, damage: 12, radius: 30, xp: 6, kbResist: 0.95,
    splitInto: 'golem_medium', splitCount: 2, capStart: 1, capPerMinute: 1, capMax: 10,
  },
  {
    id: 'golem_medium',
    behavior: 'chaser', shape: 'rock', color: '#c8ff3d', hidden: true,
    hp: 36, speed: 44, damage: 8, radius: 20, xp: 3, kbResist: 0.7,
    splitInto: 'golem_small', splitCount: 2,
  },
  {
    id: 'golem_small',
    behavior: 'chaser', shape: 'rock', color: '#c8ff3d', hidden: true,
    hp: 12, speed: 62, damage: 5, radius: 12, xp: 1, kbResist: 0.3,
  },
  {
    id: 'leader',
    behavior: 'leader', shape: 'sun', color: '#3d9bff',
    hp: 30, speed: 58, damage: 5, radius: 15, xp: 5, kbResist: 0.4,
    keepMin: 200, keepMax: 300, auraRadius: 170, auraSpeed: 0.3,
  },
  {
    id: 'teleporter',
    behavior: 'blinker', shape: 'ring', color: '#8f5bff',
    hp: 24, speed: 50, damage: 6, radius: 14, xp: 3, kbResist: 0.2,
    blinkEvery: 3.5, fuse: 1.0, blastRadius: 52, blastDamage: 11,
  },
  {
    id: 'bomber',
    behavior: 'kamikaze', shape: 'circle', color: '#ff2b2b',
    hp: 12, speed: 94, damage: 0, radius: 13, xp: 2, kbResist: 0.1,
    fuse: 0.8, triggerRange: 56, blastRadius: 75, blastDamage: 14,
  },
  {
    id: 'swarm',
    behavior: 'swarm', shape: 'dot', color: '#ff9ecf',
    hp: 3, speed: 106, damage: 3, radius: 6, xp: 1, kbResist: 0,
  },
  {
    id: 'bonus_crate',
    behavior: 'prop', shape: 'box', color: '#f4f4ff',
    hp: 40, speed: 0, damage: 0, radius: 18, xp: 0, kbResist: 1,
  },
  {
    id: 'trapezoid',
    behavior: 'boss', boss: TRAPEZOID_BOSS, shape: 'trapeze', color: '#ff3df5',
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
  },
  {
    id: 'egg',
    behavior: 'egg', shape: 'egg', color: '#ff9ecf', hidden: true,
    hp: 10, speed: 0, damage: 0, radius: 11, xp: 1, kbResist: 1,
  },
];

/** Bosses always come in this order, then loop around as "Mk II", "Mk III"... (their names: bossName in src/i18n/content.ts). */
export const BOSS_ORDER = ['trapezoid', 'builder_hexagon', 'ricochet_star', 'laser_eye', 'swarm_queen'];

/** PV du k-ième boss × (1 + BOSS_HP_GROWTH × k) */
export const BOSS_HP_GROWTH = 0.9;

