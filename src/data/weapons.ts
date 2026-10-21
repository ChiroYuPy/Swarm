/**
 * Armes de base et armes fusionnées.
 *
 * Chaque arme a un `behavior` (le code qui l'anime dans src/sim/weapons.ts) et une liste de niveaux.
 * Les niveaux sont CUMULATIFS : `prog(base, d2, d3, ...)` part de la base et applique chaque delta
 * par-dessus le précédent. Les durées sont en secondes, les distances en unités monde.
 */

export type Behavior = 'projectile' | 'spiral' | 'orbit' | 'aura' | 'beam' | 'mine' | 'boomerang' | 'chain' | 'pulse';

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
}

export interface WeaponDef {
  id: string;
  name: string;
  desc: string;
  behavior: Behavior;
  color: string;
  /** Texte affiché pour chaque niveau (index 0 = obtention). */
  levelText: string[];
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
    id: 'confetti',
    name: 'Blaster',
    desc: 'Arme de départ. Tire sur l’ennemi le plus proche.',
    behavior: 'projectile',
    color: '#7df9ff',
    levelText: [
      '1 projectile vers l’ennemi le plus proche.',
      '2 projectiles',
      '3 projectiles, dégâts +10 %',
      '4 projectiles, dégâts +10 %',
      '5 projectiles, dégâts +10 %, perce 1 ennemi',
    ],
    levels: prog(
      { damage: 10, cooldown: 1.0, count: 1, speed: 480, pierce: 0, life: 1.2, size: 6, spread: 0.16 },
      { count: 2 },
      { count: 3, damage: 11 },
      { count: 4, damage: 12 },
      { count: 5, damage: 13, pierce: 1 },
    ),
  },
  {
    id: 'petitspois',
    name: 'Orbes',
    desc: 'Des orbes tournent autour de toi et repoussent ce qui approche.',
    behavior: 'orbit',
    color: '#9dff6a',
    levelText: ['1 orbe tourne autour de toi.', '2 orbes', '3 orbes, orbite plus large', '4 orbes, dégâts +20 %', '5 orbes, orbes plus gros'],
    levels: prog(
      { damage: 9, count: 1, radius: 72, rotSpeed: 3.0, size: 10, hitCd: 0.45, knockback: 70 },
      { count: 2 },
      { count: 3, radius: 82 },
      { count: 4, damage: 11 },
      { count: 5, radius: 90, size: 13 },
    ),
  },
  {
    id: 'aura',
    name: 'Champ de force',
    desc: 'Blesse en continu tout ce qui est près de toi. Grandit à chaque niveau.',
    behavior: 'aura',
    color: '#ff6ad5',
    levelText: [
      'Champ de 60 de rayon autour de toi.',
      'Rayon 75',
      'Rayon 90, dégâts +20 %',
      'Rayon 105, ralentit les ennemis de 15 %',
      'Rayon 120, dégâts +15 %, ralentit de 25 %',
    ],
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
    name: 'Laser',
    desc: 'Rayons perçants qui traversent toute une file d’ennemis.',
    behavior: 'beam',
    color: '#ff3b3b',
    levelText: ['1 rayon vers l’ennemi le plus proche.', '2 rayons', '3 rayons, portée +15 %', '4 rayons', '4 rayons épais, dégâts +30 %, portée +15 %'],
    levels: prog(
      { damage: 7, cooldown: 2.4, duration: 0.45, tick: 0.1, length: 380, width: 8, count: 1 },
      { count: 2 },
      { count: 3, length: 440 },
      { count: 4 },
      { damage: 9, width: 12, length: 500 },
    ),
  },
  {
    id: 'crepes',
    name: 'Mines',
    desc: 'Pose des mines qui explosent au contact. Idéal en fuyant.',
    behavior: 'mine',
    color: '#ffb347',
    levelText: ['Pose 1 mine.', 'Pose 2 mines', 'Pose 3 mines', 'Pose 4 mines', 'Pose 5 mines, explosion +20 %'],
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
    name: 'Boomerang',
    desc: 'Traverse tout à l’aller comme au retour.',
    behavior: 'boomerang',
    color: '#3dffb5',
    levelText: ['1 boomerang.', '2 boomerangs', '3 boomerangs, dégâts +10 %', '4 boomerangs', '5 boomerangs, plus gros, dégâts +10 %'],
    levels: prog(
      { damage: 14, cooldown: 1.8, speed: 400, range: 260, count: 1, size: 11, knockback: 90 },
      { count: 2 },
      { count: 3, damage: 15 },
      { count: 4 },
      { count: 5, damage: 17, size: 13 },
    ),
  },
  {
    id: 'rallonge',
    name: 'Arc électrique',
    desc: 'Éclairs qui sautent d’un ennemi à l’autre.',
    behavior: 'chain',
    color: '#5fa8ff',
    levelText: ['1 éclair, 3 rebonds.', '2 éclairs', '3 éclairs', '4 éclairs, 4 rebonds', '5 éclairs, dégâts +20 %'],
    levels: prog(
      { damage: 11, cooldown: 1.5, range: 290, jumps: 3, jumpRange: 150, count: 1 },
      { count: 2 },
      { count: 3 },
      { count: 4, jumps: 4 },
      { count: 5, damage: 13 },
    ),
  },
  {
    id: 'klaxon',
    name: 'Onde de choc',
    desc: 'Ondes qui blessent et repoussent tout autour de toi.',
    behavior: 'pulse',
    color: '#fff36a',
    levelText: ['1 onde.', '2 ondes successives', '3 ondes, rayon +10 %', '4 ondes', '5 ondes, rayon +10 %, dégâts +20 %'],
    levels: prog(
      { damage: 10, cooldown: 3.0, radius: 150, duration: 0.35, knockback: 260, count: 1, delay: 0.2 },
      { count: 2 },
      { count: 3, radius: 165 },
      { count: 4 },
      { count: 5, radius: 180, damage: 12 },
    ),
  },
];

export const FUSED_WEAPONS: WeaponDef[] = [
  {
    id: 'cotillons',
    name: 'Spirale',
    desc: 'Fusion de Blaster et Surcadence.',
    behavior: 'spiral',
    color: '#c6fbff',
    fusion: true,
    levelText: ['Tir continu en spirale et rafales ciblées.'],
    levels: [
      {
        damage: 15, cooldown: 0.075, count: 3, speed: 480, pierce: 3, life: 1.2, size: 6,
        spread: 0.15, rotStep: 0.42, burstEvery: 8, burstCount: 5,
      },
    ],
  },
  {
    id: 'trounoir',
    name: 'Trous noirs',
    desc: 'Fusion d’Orbes et Aimant.',
    behavior: 'orbit',
    color: '#b98cff',
    fusion: true,
    levelText: ['Trois trous noirs en orbite qui aspirent et broient.'],
    levels: [{ damage: 22, count: 3, radius: 118, rotSpeed: 1.4, size: 24, hitCd: 0.3, pull: 150, pullRadius: 140, knockback: 0 }],
  },
  {
    id: 'malaise',
    name: 'Champ vampire',
    desc: 'Fusion de Champ de force et Vitalité.',
    behavior: 'aura',
    color: '#ff9af0',
    fusion: true,
    levelText: ['Champ immense qui ralentit fort et te soigne.'],
    levels: [{ damage: 16, radius: 178, tick: 0.35, slow: 0.45, lifesteal: 0.03 }],
  },
  {
    id: 'multiprise',
    name: 'Tempête électrique',
    desc: 'Fusion d’Arc électrique et Laser.',
    behavior: 'chain',
    color: '#9fd0ff',
    fusion: true,
    levelText: ['Éclairs qui se divisent à chaque rebond et paralysent.'],
    levels: [{ damage: 34, cooldown: 0.85, range: 340, jumps: 4, jumpRange: 180, branch: 2, count: 1, stun: 0.35 }],
  },
  {
    id: 'creperang',
    name: 'Boomerang miné',
    desc: 'Fusion de Boomerang et Mines.',
    behavior: 'boomerang',
    color: '#ffd36a',
    fusion: true,
    levelText: ['Trois boomerangs qui sèment des mines sur leur trajet.'],
    levels: [
      { damage: 30, cooldown: 1.3, speed: 460, range: 330, count: 3, size: 15, knockback: 110, dropEvery: 0.14, mineDamage: 28, mineRadius: 62 },
    ],
  },
  {
    id: 'periph',
    name: 'Séisme',
    desc: 'Fusion d’Onde de choc et Propulseurs.',
    behavior: 'pulse',
    color: '#fffaa0',
    fusion: true,
    levelText: ['Triple onde géante qui étourdit les ennemis.'],
    levels: [{ damage: 28, cooldown: 1.5, radius: 265, duration: 0.4, knockback: 400, count: 3, delay: 0.18, stun: 0.5 }],
  },
];

export const ALL_WEAPONS: WeaponDef[] = [...BASE_WEAPONS, ...FUSED_WEAPONS];
