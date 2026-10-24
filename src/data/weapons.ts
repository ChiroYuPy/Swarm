/**
 * Armes de base et leurs évolutions (arme + passif).
 *
 * Chaque arme a un `behavior` (le code qui l'anime dans src/sim/weapons/) et une liste de niveaux.
 * Les niveaux sont CUMULATIFS : `prog(base, d2, d3, ...)` part de la base et applique chaque delta
 * par-dessus le précédent. Les durées sont en secondes, les distances en unités monde.
 */

export type Behavior =
  | 'projectile'
  | 'spiral'
  | 'orbit'
  | 'aura'
  | 'beam'
  | 'mine'
  | 'boomerang'
  | 'chain'
  | 'pulse'
  | 'whip'
  | 'scythe'
  | 'flame'
  | 'turret'
  | 'drone'
  | 'ricochet'
  | 'mortar'
  | 'phoenix';

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
  jumps?: number;
  jumpRange?: number;
  range?: number;
  knockback?: number;
  slow?: number;
  /** durée du ralentissement laissé par une onde (s) */
  slowTime?: number;
  trigger?: number;
  branch?: number;
  stun?: number;
  pull?: number;
  pullRadius?: number;
  lifesteal?: number;
  dropEvery?: number;
  mineDamage?: number;
  mineRadius?: number;
  delay?: number;
  burstEvery?: number;
  burstCount?: number;
  rotStep?: number;
  /** demi-angle d'un cône ou d'un coup de fouet (radians) */
  arc?: number;
  /** achève les ennemis (hors boss) tombés sous cette part de leurs PV */
  execute?: number;
  /** dégâts en part des PV max de la cible (× Puissance) au lieu de `damage`, et cette part sur les boss */
  pctHp?: number;
  bossPct?: number;
  /** cadence de tir d'une tourelle (s) */
  fireEvery?: number;
  /** tourelle : onde de recul toutes les `ringEvery` s (rayon `radius`) */
  ringEvery?: number;
  /** rebonds d'un disque ricochet */
  bounces?: number;
  /** cratère en feu (Météores) : dégâts par seconde, rayon, durée (s) */
  blazeDamage?: number;
  blazeRadius?: number;
  blazeLife?: number;
  /** jets de flammes qui tournent en continu (rad/s) au lieu de viser */
  spin?: number;
  /** drones : PV, délai de réapparition (s), portée d'attaque, vitesse des tirs */
  hp?: number;
  respawn?: number;
  attackRange?: number;
  shotSpeed?: number;
  /** drones kamikazes : foncent et explosent (1) */
  dive?: number;
  /** obus qui tombent du ciel (Météores) : 1 */
  meteor?: number;
  /** virage max (radians par seconde) des drones et du Phénix : ils tournent en avançant */
  turn?: number;
  /** drones qui tournent autour de leur cible à bonne distance (Escadrille) : 1 */
  orbit?: number;
}

export interface WeaponDef {
  /** Name, description and per-level lines live in src/i18n/locales, keyed by this id. */
  id: string;
  behavior: Behavior;
  color: string;
  levels: WeaponLevel[];
  fusion?: boolean;
  /** Poids dans le tirage des propositions de level-up. */
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

export const BASE_WEAPONS: WeaponDef[] = [
  {
    id: 'blaster',
    behavior: 'projectile',
    color: '#7df9ff',
    levels: prog(
      { damage: 10, cooldown: 1.0, count: 1, speed: 480, pierce: 0, life: 1.2, size: 6, spread: 0.16 },
      { count: 2 },
      { count: 3, damage: 11 },
      { count: 4, damage: 12 },
      { count: 5, damage: 13, pierce: 1 },
    ),
  },
  {
    id: 'orbs',
    behavior: 'orbit',
    color: '#9dff6a',
    levels: prog(
      { damage: 14, count: 1, radius: 85, rotSpeed: 3.0, size: 15, hitCd: 0.35, knockback: 80 },
      { count: 2 },
      { count: 3, radius: 96 },
      { count: 4, damage: 17 },
      { count: 5, radius: 106, size: 19 },
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
    id: 'laser',
    behavior: 'beam',
    color: '#ff3b3b',
    levels: prog(
      { damage: 7, cooldown: 2.4, duration: 0.45, tick: 0.1, length: 380, width: 8, count: 1 },
      { count: 2 },
      { count: 3, length: 440 },
      { count: 4 },
      { damage: 9, width: 12, length: 500 },
    ),
  },
  {
    id: 'mines',
    behavior: 'mine',
    color: '#ffb347',
    levels: prog(
      { damage: 30, cooldown: 2.2, radius: 70, trigger: 34, life: 9, count: 1, knockback: 220 },
      { count: 2 },
      { count: 3 },
      { count: 4 },
      { count: 5, radius: 84 },
    ),
  },
  {
    id: 'boomerang',
    behavior: 'boomerang',
    color: '#3dffb5',
    levels: prog(
      { damage: 14, cooldown: 1.8, speed: 400, range: 260, count: 1, size: 11, knockback: 90 },
      { count: 2 },
      { count: 3, damage: 15 },
      { count: 4 },
      { count: 5, damage: 17, size: 13 },
    ),
  },
  {
    id: 'electric_arc',
    behavior: 'chain',
    color: '#5fa8ff',
    levels: prog(
      { damage: 11, cooldown: 1.5, range: 290, jumps: 3, jumpRange: 150, count: 1 },
      { count: 2 },
      { count: 3 },
      { count: 4, jumps: 4 },
      { count: 5, damage: 13 },
    ),
  },
  {
    id: 'shockwave',
    behavior: 'pulse',
    color: '#fff36a',
    levels: prog(
      { damage: 10, cooldown: 3.0, radius: 150, duration: 0.35, knockback: 260, count: 1, delay: 0.2, slow: 0.25, slowTime: 1.2 },
      { count: 2 },
      { count: 3, radius: 165 },
      { count: 4 },
      { count: 5, radius: 180, damage: 12 },
    ),
  },
  {
    id: 'whip',
    behavior: 'whip',
    color: '#ff8c69',
    levels: prog(
      { damage: 12, cooldown: 1.4, length: 160, width: 26, count: 1, knockback: 420 },
      { count: 2 },
      { count: 3, damage: 15, length: 185, knockback: 480 },
      { count: 4, width: 34, stun: 0.3 },
      { count: 5, damage: 18, length: 215, knockback: 560, stun: 0.5 },
    ),
  },
  {
    id: 'flamethrower',
    behavior: 'flame',
    color: '#ff6a1a',
    levels: prog(
      { damage: 7, cooldown: 2.6, duration: 1.4, tick: 0.12, length: 135, arc: Math.PI / 10, count: 1 },
      { count: 2 },
      { count: 3, damage: 9 },
      { count: 4, duration: 2.0 },
      { count: 5, length: 155, damage: 11 },
    ),
  },
  {
    id: 'turret',
    behavior: 'turret',
    color: '#c8ff5a',
    levels: prog(
      { damage: 9, cooldown: 12, life: 12, fireEvery: 0.6, range: 330, count: 1, speed: 520, pierce: 0, size: 5 },
      { count: 2 },
      { count: 3, fireEvery: 0.5 },
      { count: 4, damage: 11, pierce: 1 },
      { count: 5, life: 16, cooldown: 16 },
    ),
  },
  {
    id: 'drone',
    behavior: 'drone',
    color: '#d6dcff',
    levels: prog(
      { damage: 7, cooldown: 0.7, count: 1, speed: 260, range: 520, hp: 50, respawn: 3, attackRange: 180, shotSpeed: 600, size: 4, turn: 3.2 },
      { count: 2 },
      { count: 3, damage: 9, hp: 70 },
      { count: 4 },
      { count: 5, cooldown: 0.55, respawn: 2 },
    ),
  },
  {
    id: 'ricochet',
    behavior: 'ricochet',
    color: '#ff4f9a',
    levels: prog(
      { damage: 11, cooldown: 1.5, speed: 440, bounces: 1, count: 1, size: 10, life: 2.5, range: 480 },
      { count: 2 },
      { count: 3, bounces: 2, damage: 13 },
      { count: 4 },
      { count: 5, bounces: 3, size: 12, damage: 15 },
    ),
  },
  {
    id: 'mortar',
    behavior: 'mortar',
    color: '#ffe08a',
    levels: prog(
      { damage: 28, cooldown: 2.2, count: 1, radius: 70, range: 420, duration: 0.7, knockback: 160 },
      { count: 2 },
      { count: 3, damage: 34, radius: 80 },
      { count: 4 },
      { count: 5, radius: 95, damage: 40 },
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
    id: 'black_holes',
    behavior: 'orbit',
    color: '#b98cff',
    fusion: true,
    levels: [{ damage: 22, count: 3, radius: 118, rotSpeed: 1.4, size: 24, hitCd: 0.3, pull: 150, pullRadius: 140, knockback: 0 }],
  },
  {
    id: 'vampire_field',
    behavior: 'aura',
    color: '#ff9af0',
    fusion: true,
    levels: [{ damage: 16, radius: 178, tick: 0.35, slow: 0.45, lifesteal: 0.03 }],
  },
  {
    id: 'electric_storm',
    behavior: 'chain',
    color: '#9fd0ff',
    fusion: true,
    levels: [{ damage: 34, cooldown: 0.85, range: 340, jumps: 4, jumpRange: 180, branch: 2, count: 1, stun: 0.35 }],
  },
  {
    id: 'mine_boomerang',
    behavior: 'boomerang',
    color: '#ffd36a',
    fusion: true,
    levels: [
      { damage: 26, cooldown: 1.5, speed: 460, range: 330, count: 3, size: 15, knockback: 110, dropEvery: 0.3, mineDamage: 20, mineRadius: 52 },
    ],
  },
  {
    id: 'earthquake',
    behavior: 'pulse',
    color: '#fffaa0',
    fusion: true,
    levels: [{ damage: 16, cooldown: 1.5, radius: 265, duration: 0.45, knockback: 0, count: 3, delay: 0.18, slow: 0.6, slowTime: 2.5 }],
  },
  {
    id: 'scythe',
    behavior: 'scythe',
    color: '#ffb39c',
    fusion: true,
    levels: [{ damage: 0, pctHp: 0.15, bossPct: 0.015, cooldown: 2, length: 200, arc: Math.PI, count: 1, knockback: 0, execute: 0.12 }],
  },
  {
    id: 'fire_tornado',
    behavior: 'flame',
    color: '#ff7a2e',
    fusion: true,
    levels: [{ damage: 10, tick: 0.12, length: 200, arc: 0.3, count: 4, spin: 2.4 }],
  },
  {
    id: 'phoenix',
    behavior: 'phoenix',
    color: '#ffb03a',
    fusion: true,
    levels: [
      {
        damage: 55, count: 1, speed: 470, life: 2.2, respawn: 0.6, size: 46, hitCd: 0.4, knockback: 40,
        blazeDamage: 22, blazeRadius: 46, blazeLife: 1.8,
      },
    ],
  },
  {
    id: 'bastion',
    behavior: 'turret',
    color: '#e4ff9a',
    fusion: true,
    levels: [
      {
        damage: 14, cooldown: 14, life: 14, fireEvery: 0.4, range: 380, count: 2, speed: 560, pierce: 2, size: 6,
        spread: 0.18, burstCount: 3, ringEvery: 2.0, radius: 130, knockback: 260,
      },
    ],
  },
  {
    id: 'squadron',
    behavior: 'drone',
    color: '#ff9ccd',
    fusion: true,
    levels: [
      {
        damage: 30, cooldown: 0.9, count: 4, speed: 300, range: 600, hp: 140, respawn: 0.4, attackRange: 280,
        shotSpeed: 480, size: 12, bounces: 5, life: 4.5, turn: 3.4, orbit: 1,
      },
    ],
  },
  {
    id: 'kamikaze_drones',
    behavior: 'drone',
    color: '#ff9a5c',
    fusion: true,
    levels: [{ damage: 75, count: 4, speed: 430, range: 520, radius: 150, knockback: 260, respawn: 0.3, dive: 1, hp: 1, turn: 4 }],
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
];

export const ALL_WEAPONS: WeaponDef[] = [...BASE_WEAPONS, ...FUSED_WEAPONS];
