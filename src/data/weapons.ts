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
      { damage: 14, count: 1, radius: 85, rotSpeed: 3.0, size: 15, hitCd: 0.35, knockback: 80 },
      { count: 2 },
      { count: 3, radius: 96 },
      { count: 4, damage: 17 },
      { count: 5, radius: 106, size: 19 },
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
    desc: 'Ondes qui blessent, repoussent et ralentissent un peu tout autour de toi.',
    behavior: 'pulse',
    color: '#fff36a',
    levelText: ['1 onde.', '2 ondes successives', '3 ondes, rayon +10 %', '4 ondes', '5 ondes, rayon +10 %, dégâts +20 %'],
    levels: prog(
      { damage: 10, cooldown: 3.0, radius: 150, duration: 0.35, knockback: 260, count: 1, delay: 0.2, slow: 0.25, slowTime: 1.2 },
      { count: 2 },
      { count: 3, radius: 165 },
      { count: 4 },
      { count: 5, radius: 180, damage: 12 },
    ),
  },
  {
    id: 'fouet',
    name: 'Fouet',
    desc: 'Des lanières qui claquent en éventail devant toi, blessent et envoient valser les ennemis.',
    behavior: 'whip',
    color: '#ff8c69',
    levelText: [
      '1 fouet devant toi : blesse et repousse loin.',
      '2 fouets en éventail',
      '3 fouets, plus longs, dégâts +25 %, repoussent plus loin',
      '4 fouets, plus larges, étourdissent 0,3 s',
      '5 fouets, encore plus longs, dégâts +20 %, étourdissent 0,5 s',
    ],
    levels: prog(
      { damage: 12, cooldown: 1.4, length: 160, width: 26, count: 1, knockback: 420 },
      { count: 2 },
      { count: 3, damage: 15, length: 185, knockback: 480 },
      { count: 4, width: 34, stun: 0.3 },
      { count: 5, damage: 18, length: 215, knockback: 560, stun: 0.5 },
    ),
  },
  {
    id: 'flammes',
    name: 'Lance-flammes',
    desc: 'Des jets de flammes côte à côte, là où tu vises. Chaque jet couvre 1/10 de tour : au niveau max, un demi-cercle de feu.',
    behavior: 'flame',
    color: '#ff6a1a',
    levelText: [
      '1 jet de flammes vers l’ennemi le plus proche.',
      '2 jets côte à côte',
      '3 jets, dégâts +30 %',
      '4 jets, brûlent plus longtemps',
      '5 jets (un demi-cercle), portée +15 %, dégâts +25 %',
    ],
    levels: prog(
      { damage: 7, cooldown: 2.6, duration: 1.4, tick: 0.12, length: 135, arc: Math.PI / 10, count: 1 },
      { count: 2 },
      { count: 3, damage: 9 },
      { count: 4, duration: 2.0 },
      { count: 5, length: 155, damage: 11 },
    ),
  },
  {
    id: 'tourelle',
    name: 'Tourelle',
    desc: 'Pose une tourelle qui tire seule sur ce qui passe à portée. Bats-toi autour d’elle.',
    behavior: 'turret',
    color: '#c8ff5a',
    levelText: [
      'Pose 1 tourelle qui tire seule pendant 12 s.',
      '2 tourelles',
      '3 tourelles, tirent plus vite',
      '4 tourelles, dégâts +20 %, tirs perçants',
      '5 tourelles, durent 16 s',
    ],
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
    name: 'Drone',
    desc: 'Des drones autonomes partent chasser les ennemis gênants (Tireurs, Meneurs, Téléporteurs, Bombes). Abattus, ils réapparaissent près de toi.',
    behavior: 'drone',
    color: '#d6dcff',
    levelText: [
      '1 drone chasseur.',
      '2 drones',
      '3 drones, dégâts +30 %, plus résistants',
      '4 drones',
      '5 drones, tirent plus vite, reviennent plus vite',
    ],
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
    name: 'Ricochet',
    desc: 'Un disque qui s’oriente un peu vers les ennemis, rebondit sur eux et sur les obstacles.',
    behavior: 'ricochet',
    color: '#ff4f9a',
    levelText: [
      '1 disque chercheur, 1 rebond.',
      '2 disques',
      '3 disques, 2 rebonds, dégâts +15 %',
      '4 disques',
      '5 disques, 3 rebonds, plus gros, dégâts +15 %',
    ],
    levels: prog(
      { damage: 11, cooldown: 1.5, speed: 440, bounces: 1, count: 1, size: 10, life: 2.5, range: 480 },
      { count: 2 },
      { count: 3, bounces: 2, damage: 13 },
      { count: 4 },
      { count: 5, bounces: 3, size: 12, damage: 15 },
    ),
  },
  {
    id: 'mortier',
    name: 'Mortier',
    desc: 'Lance des obus au loin, sur les groupes d’ennemis. Le point d’impact s’affiche au sol.',
    behavior: 'mortar',
    color: '#ffe08a',
    levelText: [
      'Lance 1 obus au loin, sur un groupe.',
      '2 obus',
      '3 obus, dégâts +20 %, explosion plus large',
      '4 obus',
      '5 obus, explosion encore plus large, dégâts +20 %',
    ],
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
    id: 'cotillons',
    name: 'Spirale',
    desc: 'Évolution de Blaster avec Surcadence.',
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
    desc: 'Évolution d’Orbes avec Aimant.',
    behavior: 'orbit',
    color: '#b98cff',
    fusion: true,
    levelText: ['Trois trous noirs en orbite qui aspirent et broient.'],
    levels: [{ damage: 22, count: 3, radius: 118, rotSpeed: 1.4, size: 24, hitCd: 0.3, pull: 150, pullRadius: 140, knockback: 0 }],
  },
  {
    id: 'malaise',
    name: 'Champ vampire',
    desc: 'Évolution de Champ de force avec Vitalité.',
    behavior: 'aura',
    color: '#ff9af0',
    fusion: true,
    levelText: ['Champ immense qui ralentit fort et te soigne.'],
    levels: [{ damage: 16, radius: 178, tick: 0.35, slow: 0.45, lifesteal: 0.03 }],
  },
  {
    id: 'multiprise',
    name: 'Tempête électrique',
    desc: 'Évolution d’Arc électrique avec Surcadence.',
    behavior: 'chain',
    color: '#9fd0ff',
    fusion: true,
    levelText: ['Éclairs qui se divisent à chaque rebond et paralysent.'],
    levels: [{ damage: 34, cooldown: 0.85, range: 340, jumps: 4, jumpRange: 180, branch: 2, count: 1, stun: 0.35 }],
  },
  {
    id: 'creperang',
    name: 'Boomerang miné',
    desc: 'Évolution de Boomerang avec Amplificateur.',
    behavior: 'boomerang',
    color: '#ffd36a',
    fusion: true,
    levelText: ['Trois boomerangs qui sèment des mines sur leur trajet.'],
    levels: [
      { damage: 26, cooldown: 1.5, speed: 460, range: 330, count: 3, size: 15, knockback: 110, dropEvery: 0.3, mineDamage: 20, mineRadius: 52 },
    ],
  },
  {
    id: 'periph',
    name: 'Séisme',
    desc: 'Évolution d’Onde de choc avec Propulseurs.',
    behavior: 'pulse',
    color: '#fffaa0',
    fusion: true,
    levelText: ['Triple onde géante qui fissure le sol et ralentit fortement les ennemis, sans les repousser.'],
    levels: [{ damage: 16, cooldown: 1.5, radius: 265, duration: 0.45, knockback: 0, count: 3, delay: 0.18, slow: 0.6, slowTime: 2.5 }],
  },
  {
    id: 'faux',
    name: 'Faux',
    desc: 'Évolution de Fouet avec Puissance.',
    behavior: 'scythe',
    color: '#ffb39c',
    fusion: true,
    levelText: ['Fauche tout autour de toi toutes les 2 s : chaque coup enlève 15 % des PV max (1,5 % sur les boss), et achève sous 12 %. Redoutable contre les gros. Ne repousse pas.'],
    levels: [{ damage: 0, pctHp: 0.15, bossPct: 0.015, cooldown: 2, length: 200, arc: Math.PI, count: 1, knockback: 0, execute: 0.12 }],
  },
  {
    id: 'tornade',
    name: 'Tornade de feu',
    desc: 'Évolution de Lance-flammes avec Amplificateur.',
    behavior: 'flame',
    color: '#ff7a2e',
    fusion: true,
    levelText: ['Quatre jets de flammes tournent sans arrêt autour de toi.'],
    levels: [{ damage: 10, tick: 0.12, length: 200, arc: 0.3, count: 4, spin: 2.4 }],
  },
  {
    id: 'phenix',
    name: 'Phénix',
    desc: 'Évolution de Lance-flammes avec Vitalité.',
    behavior: 'phoenix',
    color: '#ffb03a',
    fusion: true,
    levelText: ['Un grand oiseau de feu file tout droit vers le plus gros groupe ou le plus gros ennemi (boss compris) : il balaie les petits sur une large bande et la laisse en flammes. Quand il s’éteint, il renaît près de toi.'],
    levels: [
      {
        damage: 55, count: 1, speed: 470, life: 2.2, respawn: 0.6, size: 46, hitCd: 0.4, knockback: 40,
        blazeDamage: 22, blazeRadius: 46, blazeLife: 1.8,
      },
    ],
  },
  {
    id: 'bastion',
    name: 'Bastion',
    desc: 'Évolution de Tourelle avec Blindage.',
    behavior: 'turret',
    color: '#e4ff9a',
    fusion: true,
    levelText: ['Deux tourelles lourdes : tirs triples perçants et onde de recul.'],
    levels: [
      {
        damage: 14, cooldown: 14, life: 14, fireEvery: 0.4, range: 380, count: 2, speed: 560, pierce: 2, size: 6,
        spread: 0.18, burstCount: 3, ringEvery: 2.0, radius: 130, knockback: 260,
      },
    ],
  },
  {
    id: 'escadrille',
    name: 'Escadrille',
    desc: 'Évolution de Ricochet avec Blindage.',
    behavior: 'drone',
    color: '#ff9ccd',
    fusion: true,
    levelText: ['Quatre drones tournent autour de leur cible, à distance, et lancent de gros disques ricochets (5 rebonds). Abattus, ils reviennent presque aussitôt.'],
    levels: [
      {
        damage: 30, cooldown: 0.9, count: 4, speed: 300, range: 600, hp: 140, respawn: 0.4, attackRange: 280,
        shotSpeed: 480, size: 12, bounces: 5, life: 4.5, turn: 3.4, orbit: 1,
      },
    ],
  },
  {
    id: 'kamikazes',
    name: 'Kamikazes',
    desc: 'Évolution de Drone avec Puissance.',
    behavior: 'drone',
    color: '#ff9a5c',
    fusion: true,
    levelText: ['Quatre drones foncent dans les groupes et explosent comme des bombes, puis réapparaissent près de toi.'],
    levels: [{ damage: 75, count: 4, speed: 430, range: 520, radius: 150, knockback: 260, respawn: 0.3, dive: 1, hp: 1, turn: 4 }],
  },
  {
    id: 'meteores',
    name: 'Météores',
    desc: 'Évolution de Mortier avec Chance.',
    behavior: 'mortar',
    color: '#ff5a24',
    fusion: true,
    levelText: ['Une pluie de météores s’abat sur les groupes et laisse des cratères en feu.'],
    levels: [
      {
        damage: 90, cooldown: 0.6, count: 1, radius: 125, range: 540, duration: 0.6, knockback: 220, meteor: 1,
        blazeDamage: 22, blazeRadius: 80, blazeLife: 2.5,
      },
    ],
  },
];

export const ALL_WEAPONS: WeaponDef[] = [...BASE_WEAPONS, ...FUSED_WEAPONS];
