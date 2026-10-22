/** Ennemis. Les PV / dégâts / vitesses sont multipliés par les courbes de difficulté de waves.ts. */

export type EnemyBehavior = 'chaser' | 'shooter' | 'kamikaze' | 'swarm' | 'prop' | 'boss';
export type EnemyShape = 'triangle' | 'diamond' | 'square' | 'pentagon' | 'circle' | 'dot' | 'box' | 'trapeze';

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
