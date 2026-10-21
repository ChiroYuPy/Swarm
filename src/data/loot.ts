/**
 * Objets ramassables.
 * - instantané : effet immédiat (soin) ;
 * - temporaire : bonus actif quelques secondes (rage, frénésie, turbo, bouclier) ;
 * - activable : rangé dans l'unique emplacement d'objet, déclenché avec Espace. Un nouveau remplace l'ancien.
 * L'ordre de PICKUPS donne les codes PK_* de la simulation (ne pas réordonner sans incrémenter SIM_VERSION).
 */

export type PickupKind = 'instant' | 'timed' | 'active' | 'chest';

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
  { id: 'vacuum', name: 'Aspirateur', kind: 'active', desc: 'Attire toute l’XP et tous les objets au sol.', color: '#ff5a5a', weight: 4 },
  { id: 'freeze', name: 'Gel', kind: 'active', desc: 'Fige tous les ennemis pendant 6 s.', color: '#9feaff', weight: 3 },
  { id: 'bomb', name: 'Bombe', kind: 'active', desc: 'Grosse explosion autour de toi (300 dégâts).', color: '#ffd23a', weight: 3 },
  { id: 'eradicate', name: 'Éradication', kind: 'active', desc: 'Détruit tous les ennemis présents. Le boss perd 20 % de ses PV.', color: '#ff3df5', weight: 1 },
  { id: 'chest', name: 'Coffre', kind: 'chest', desc: 'Laissé par le boss : une fusion si possible, sinon 3 améliorations.', color: '#ffd23a', weight: 0 },
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
  freezeSeconds: 6,
  /** part des PV max retirée au boss par l'Éradication */
  eradicateBoss: 0.2,
  /** caisse bonus : probabilité d'un activable (sinon un bonus) */
  propActiveChance: 0.4,
  /** coffre de boss : fusion si possible, sinon N améliorations + soin */
  chestUpgrades: 3,
  chestHeal: 0.3,
  bossGems: { count: 12, value: 12 },
};
