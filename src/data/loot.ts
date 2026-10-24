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
  /** Name and description live in src/i18n/locales, keyed by this id. */
  id: string;
  kind: PickupKind;
  color: string;
  /** durée (s) des bonus temporaires */
  duration?: number;
  /** poids de tirage dans sa famille */
  weight: number;
}

export const PICKUPS: PickupDef[] = [
  { id: 'heal', kind: 'instant', color: '#39ff7a', weight: 3 },
  { id: 'rage', kind: 'timed', duration: 8, color: '#ff3d6e', weight: 2 },
  { id: 'frenzy', kind: 'timed', duration: 8, color: '#ffe14d', weight: 2 },
  { id: 'turbo', kind: 'timed', duration: 8, color: '#38f6ff', weight: 2 },
  { id: 'shield', kind: 'timed', duration: 5, color: '#a0b4ff', weight: 1 },
  { id: 'fever', kind: 'timed', duration: 15, color: '#b8ff3d', weight: 1.5 },
  { id: 'totem', kind: 'relic', color: '#ffb347', weight: 0.25 },
  { id: 'vacuum', kind: 'active', color: '#ff5a5a', weight: 8 },
  { id: 'freeze', kind: 'active', color: '#9feaff', weight: 3 },
  { id: 'bomb', kind: 'active', color: '#ffd23a', weight: 3 },
  { id: 'clock', kind: 'active', color: '#7f9cff', weight: 2 },
  { id: 'clone', kind: 'active', color: '#5cf2d6', weight: 2 },
  { id: 'eradicate', kind: 'active', color: '#ff3df5', weight: 1 },
  { id: 'chest', kind: 'chest', color: '#ffd23a', weight: 0 },
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
