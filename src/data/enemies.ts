/** Ennemis. Les PV / dégâts / vitesses sont multipliés par les courbes de difficulté de waves.ts. */

export type EnemyBehavior = 'chaser' | 'shooter' | 'kamikaze' | 'swarm' | 'prop' | 'boss' | 'leader' | 'blinker' | 'orbiter';
export type EnemyShape = 'triangle' | 'diamond' | 'square' | 'pentagon' | 'circle' | 'dot' | 'box' | 'trapeze' | 'rock' | 'sun' | 'ring' | 'dart';

export interface EnemyDef {
  id: string;
  name: string;
  desc: string;
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

export const ENEMIES: EnemyDef[] = [
  {
    id: 'triangle', name: 'Chasseur', desc: 'Fonce droit sur toi.',
    behavior: 'chaser', shape: 'triangle', color: '#ff3366',
    hp: 9, speed: 72, damage: 6, radius: 12, xp: 1, kbResist: 0,
  },
  {
    id: 'losange', name: 'Fonceur', desc: 'Plus rapide que les Chasseurs, mais fragile.',
    behavior: 'chaser', shape: 'diamond', color: '#ffe14d',
    hp: 6, speed: 112, damage: 4, radius: 10, xp: 1, kbResist: 0,
  },
  {
    id: 'carre', name: 'Bloc', desc: 'Lent mais très résistant, presque insensible au recul.',
    behavior: 'chaser', shape: 'square', color: '#ff8a1f',
    hp: 55, speed: 46, damage: 12, radius: 21, xp: 4, kbResist: 0.75,
  },
  {
    id: 'pentagone', name: 'Tireur', desc: 'Garde ses distances et tire des boules violettes. Tes armes peuvent les casser.',
    behavior: 'shooter', shape: 'pentagon', color: '#c46bff',
    hp: 20, speed: 62, damage: 6, radius: 14, xp: 3, kbResist: 0.2,
    keepMin: 240, keepMax: 340, shootEvery: 2.6, bulletSpeed: 190, bulletDamage: 7,
  },
  {
    id: 'orbiteur', name: 'Orbiteur', desc: 'Tourne autour de toi en spirale de plus en plus serrée, puis plonge.',
    behavior: 'orbiter', shape: 'dart', color: '#3dffb4',
    hp: 12, speed: 128, damage: 5, radius: 11, xp: 2, kbResist: 0,
  },
  {
    id: 'golem', name: 'Golem', desc: 'Énorme, très lent, encaisse beaucoup. À sa mort il se coupe en 2 Golems moyens, qui se coupent chacun en 2 petits.',
    behavior: 'chaser', shape: 'rock', color: '#c8ff3d',
    hp: 110, speed: 30, damage: 12, radius: 30, xp: 6, kbResist: 0.95,
    splitInto: 'golem2', splitCount: 2, capStart: 1, capPerMinute: 1, capMax: 10,
  },
  {
    id: 'golem2', name: 'Golem moyen', desc: 'Moitié de Golem.',
    behavior: 'chaser', shape: 'rock', color: '#c8ff3d', hidden: true,
    hp: 36, speed: 44, damage: 8, radius: 20, xp: 3, kbResist: 0.7,
    splitInto: 'golem3', splitCount: 2,
  },
  {
    id: 'golem3', name: 'Petit golem', desc: 'Quart de Golem.',
    behavior: 'chaser', shape: 'rock', color: '#c8ff3d', hidden: true,
    hp: 12, speed: 62, damage: 5, radius: 12, xp: 1, kbResist: 0.3,
  },
  {
    id: 'meneur', name: 'Meneur', desc: 'Ne se bat pas vraiment : il reste en retrait et rend les ennemis autour de lui plus rapides. Abats-le en premier.',
    behavior: 'leader', shape: 'sun', color: '#3d9bff',
    hp: 30, speed: 58, damage: 5, radius: 15, xp: 5, kbResist: 0.4,
    keepMin: 200, keepMax: 300, auraRadius: 170, auraSpeed: 0.3,
  },
  {
    id: 'teleporteur', name: 'Téléporteur', desc: 'Marque le sol sous tes pieds puis s’y téléporte : sors du cercle avant qu’il arrive.',
    behavior: 'blinker', shape: 'ring', color: '#8f5bff',
    hp: 24, speed: 50, damage: 6, radius: 14, xp: 3, kbResist: 0.2,
    blinkEvery: 3.5, fuse: 1.0, blastRadius: 52, blastDamage: 11,
  },
  {
    id: 'cercle', name: 'Bombe', desc: 'Explose près de toi : sors du cercle rouge pointillé.',
    behavior: 'kamikaze', shape: 'circle', color: '#ff2b2b',
    hp: 12, speed: 94, damage: 0, radius: 13, xp: 2, kbResist: 0.1,
    fuse: 0.8, triggerRange: 56, blastRadius: 75, blastDamage: 14,
  },
  {
    id: 'points', name: 'Essaim', desc: 'Minuscules, rapides, toujours en groupe.',
    behavior: 'swarm', shape: 'dot', color: '#ff9ecf',
    hp: 3, speed: 106, damage: 3, radius: 6, xp: 1, kbResist: 0,
  },
  {
    id: 'distributeur', name: 'Caisse bonus', desc: 'Immobile. Casse-la pour obtenir un objet.',
    behavior: 'prop', shape: 'box', color: '#f4f4ff',
    hp: 40, speed: 0, damage: 0, radius: 18, xp: 0, kbResist: 1,
  },
  {
    id: 'boss', name: 'Trapèze', desc: 'Boss toutes les 3 minutes : spirales de tirs, charges, renforts.',
    behavior: 'boss', shape: 'trapeze', color: '#ff3df5',
    hp: 1800, speed: 58, damage: 18, radius: 46, xp: 0, kbResist: 1,
  },
];

/** Comportement du boss : une séquence de phases qui boucle. */
export const BOSS = {
  names: [
    'Trapèze',
    'Trapèze Mk II',
    'Trapèze Mk III',
    'Trapèze Mk IV',
    'Trapèze Mk V',
  ],
  /** multiplicateur de PV par apparition supplémentaire */
  hpGrowth: 1.4,
  pattern: [
    { kind: 'chase', duration: 2.5 },
    { kind: 'spiral', duration: 3.0 },
    { kind: 'chase', duration: 1.5 },
    { kind: 'charge', duration: 1.6 },
    { kind: 'charge', duration: 1.6 },
    { kind: 'summon', duration: 1.0 },
  ] as { kind: 'chase' | 'spiral' | 'charge' | 'summon'; duration: number }[],
  spiralEvery: 0.1,
  spiralArms: 4,
  spiralTurn: 0.23,
  bulletSpeed: 170,
  bulletDamage: 10,
  /** part du temps de charge passée à prévenir (ligne d'avertissement) */
  chargeTelegraph: 0.9,
  chargeSpeed: 540,
  summonType: 'triangle',
  summonCount: 8,
};
