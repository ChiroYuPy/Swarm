/** Bonus passifs. Chaque niveau ajoute `perLevel` aux stats du héros (max 5 niveaux). */

export interface PassiveDef {
  id: string;
  name: string;
  desc: string;
  /** effet d'un niveau, en clair */
  effect: string;
  color: string;
  perLevel: {
    /** réduction de recharge (0.06 = -6 %) */
    cooldown?: number;
    /** bonus de vitesse (0.06 = +6 %) */
    speed?: number;
    /** bonus de rayon de collecte (0.25 = +25 %) */
    magnet?: number;
    /** bonus de dégâts */
    might?: number;
    /** bonus de zone (rayons, tailles) */
    area?: number;
    /** PV max en plus */
    maxHp?: number;
    /** PV / seconde en plus */
    regen?: number;
    /** réduction des dégâts subis (0.05 = -5 %) */
    armor?: number;
    /** bonus de chance d'obtenir des objets (0.2 = +20 %) */
    luck?: number;
  };
  weight?: number;
}

export const PASSIVES: PassiveDef[] = [
  {
    id: 'biceps',
    name: 'Puissance',
    desc: 'Toutes tes armes font plus mal.',
    effect: 'Dégâts +8 %',
    color: '#ff9a3d',
    perLevel: { might: 0.08 },
  },
  {
    id: 'cafe',
    name: 'Surcadence',
    desc: 'Toutes tes armes se rechargent plus vite.',
    effect: 'Recharge −6 %',
    color: '#c08457',
    perLevel: { cooldown: 0.06 },
  },
  {
    id: 'lunettes',
    name: 'Amplificateur',
    desc: 'Zones, explosions, orbes et projectiles plus grands.',
    effect: 'Zone +8 %',
    color: '#d0d0ff',
    perLevel: { area: 0.08 },
  },
  {
    id: 'chaussettes',
    name: 'Propulseurs',
    desc: 'Tu te déplaces plus vite.',
    effect: 'Vitesse +6 %',
    color: '#4dd2ff',
    perLevel: { speed: 0.06 },
  },
  {
    id: 'aimant',
    name: 'Aimant',
    desc: 'Tu ramasses l’XP de plus loin.',
    effect: 'Rayon de collecte +25 %',
    color: '#ff5a5a',
    perLevel: { magnet: 0.25 },
  },
  {
    id: 'soupe',
    name: 'Vitalité',
    desc: 'Plus de vie et une régénération continue.',
    effect: 'PV max +15, régén. +0,15 PV/s',
    color: '#8dff8d',
    perLevel: { maxHp: 15, regen: 0.15 },
  },
  {
    id: 'blindage',
    name: 'Blindage',
    desc: 'Tu encaisses mieux les coups.',
    effect: 'Dégâts subis −5 %',
    color: '#a0b4ff',
    perLevel: { armor: 0.05 },
  },
  {
    id: 'chance',
    name: 'Chance',
    desc: 'Les ennemis lâchent plus souvent des bonus et des objets.',
    effect: 'Objets +20 %',
    color: '#ffd23a',
    perLevel: { luck: 0.2 },
  },
];
