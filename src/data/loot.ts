/**
 * Objets ramassables.
 * - instantané : effet immédiat (soin) ;
 * - temporaire : bonus actif quelques secondes (rage, frénésie, turbo, bouclier) ;
 * - activable : rangé dans l'unique emplacement d'objet, déclenché avec Espace. Un nouveau remplace l'ancien ;
 * - relique : gardée à part et déclenchée toute seule (Totem).
 * L'ordre de PICKUPS donne les codes PK_* de la simulation (ne pas réordonner sans incrémenter SIM_VERSION).
 */

export type PickupKind = 'instant' | 'timed' | 'active' | 'relic' | 'chest';

export interface PickupDef {
  id: string;
  name: string;
  kind: PickupKind;
  desc: string;
  color: string;
  /** durée (s) des bonus temporaires */
  duration?: number;
  /** poids de tirage dans sa famille */
  weight: number;
}

export const PICKUPS: PickupDef[] = [
  { id: 'heal', name: 'Soin', kind: 'instant', desc: 'Rend 30 % de tes PV.', color: '#39ff7a', weight: 3 },
  { id: 'rage', name: 'Rage', kind: 'timed', duration: 8, desc: 'Dégâts ×2 pendant 8 s.', color: '#ff3d6e', weight: 2 },
  { id: 'frenzy', name: 'Frénésie', kind: 'timed', duration: 8, desc: 'Tes armes se rechargent 2× plus vite pendant 8 s.', color: '#ffe14d', weight: 2 },
  { id: 'turbo', name: 'Turbo', kind: 'timed', duration: 8, desc: 'Vitesse +50 % pendant 8 s.', color: '#38f6ff', weight: 2 },
  { id: 'shield', name: 'Bouclier', kind: 'timed', duration: 5, desc: 'Invulnérable pendant 5 s.', color: '#a0b4ff', weight: 1 },
  { id: 'fever', name: 'Fièvre d’XP', kind: 'timed', duration: 15, desc: 'XP doublée et rayon de collecte doublé pendant 15 s.', color: '#b8ff3d', weight: 1.5 },
  { id: 'totem', name: 'Totem', kind: 'relic', desc: 'Très rare. La prochaine fois que tu tombes à 0 PV, tu reviens avec la moitié de tes PV et une onde repousse tout autour de toi.', color: '#ffb347', weight: 0.25 },
  { id: 'vacuum', name: 'Aspirateur', kind: 'active', desc: 'Attire toute l’XP et tous les objets au sol.', color: '#ff5a5a', weight: 8 },
  { id: 'freeze', name: 'Gel', kind: 'active', desc: 'Fige les ennemis autour de toi pendant 5 s. Gelés, ils prennent +50 % de dégâts et éclatent en blessant leurs voisins : de quoi briser un groupe entier.', color: '#9feaff', weight: 3 },
  { id: 'bomb', name: 'Bombe', kind: 'active', desc: 'Grosse explosion autour de toi (300 dégâts).', color: '#ffd23a', weight: 3 },
  { id: 'clock', name: 'Horloge', kind: 'active', desc: 'Ralentit tout le reste du monde pendant 8 s : ennemis, boss et tirs vont 3× moins vite. Toi, non.', color: '#7f9cff', weight: 2 },
  { id: 'clone', name: 'Clone', kind: 'active', desc: 'Un double de toi apparaît 10 s : il reste sur place, tire avec tes armes et attire les ennemis proches.', color: '#5cf2d6', weight: 2 },
  { id: 'eradicate', name: 'Éradication', kind: 'active', desc: 'Détruit tous les ennemis présents. Le boss perd 20 % de ses PV.', color: '#ff3df5', weight: 1 },
  { id: 'chest', name: 'Coffre', kind: 'chest', desc: 'Laissé par le boss : une évolution si possible, sinon 3 améliorations.', color: '#ffd23a', weight: 0 },
];

export const LOOT = {
  /** chance par ennemi tué de lâcher un bonus (soin ou temporaire), multipliée par la Chance */
  bonusChance: 0.006,
  /** chance par ennemi tué de lâcher un activable */
  activeChance: 0.002,
  /** les Essaims lâchent moins (ils sont très nombreux) */
  swarmMul: 0.3,
  swarmGemChance: 0.6,
  healAmount: 0.3,
  bombDamage: 300,
  bombRadius: 460,
  /** Gel : rayon, durée, dégâts subis ×fragile ; un gelé qui meurt éclate (dégâts de base + part de ses PV max) */
  freezeRadius: 420,
  freezeSeconds: 5,
  freezeFragile: 1.5,
  shatterRadius: 70,
  shatterDamage: 18,
  shatterHp: 0.25,
  /** Horloge : durée et vitesse du reste du monde */
  clockSeconds: 8,
  clockFactor: 0.33,
  /** Clone : durée, rayon dans lequel il attire les ennemis */
  cloneSeconds: 10,
  cloneLure: 450,
  /** Totem : PV rendus, invulnérabilité, onde de recul */
  totemHeal: 0.5,
  totemInvuln: 2,
  totemRadius: 300,
  /** Fièvre d'XP */
  feverXp: 2,
  feverMagnet: 2,
  /** part des PV max retirée au boss par l'Éradication */
  eradicateBoss: 0.2,
  /**
   * Objets qui apparaissent seuls dans l'arène, près du joueur (toutes les `every` s, même pendant un boss) :
   * le plus souvent un Aspirateur, sinon un activable ou un bonus au hasard. Au plus `maxVacuums` Aspirateurs au sol.
   */
  mapItems: { every: 28, minDist: 320, maxDist: 620, vacuumChance: 0.6, activeChance: 0.5, maxVacuums: 2 },
  /** Échange d'arme au level-up : charges au départ, gagnées par boss vaincu, maximum */
  swaps: { start: 1, perBoss: 1, max: 3 },
  /** caisse bonus : probabilité d'un activable (sinon un bonus) */
  propActiveChance: 0.4,
  /** coffre de boss : évolution si possible, sinon N améliorations + soin */
  chestUpgrades: 3,
  chestHeal: 0.3,
  bossGems: { count: 12, value: 12 },
};
