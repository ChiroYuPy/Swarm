/** Le héros et la courbe d'XP. Valeurs librement modifiables. */
export const HERO = {
  name: 'Octo',
  title: 'Octogone néon',
  maxHp: 100,
  /** unités monde / seconde (une case = 64 unités) */
  speed: 150,
  /** rayon d'attraction des gemmes */
  magnet: 72,
  /** PV / seconde */
  regen: 0.2,
  radius: 14,
  /** invulnérabilité après un coup (secondes) */
  iframes: 0.2,
  startWeapon: 'blaster',
};

/** XP nécessaire pour passer du niveau `level` au suivant. */
export function xpForLevel(level: number): number {
  const n = level - 1;
  return Math.floor(5 + n * 2.5 + n * n * 0.15);
}

/** Score = secondes survécues × 10 + kills + bonus par boss vaincu. */
export const SCORE = {
  perSecond: 10,
  perKill: 1,
  perBoss: 250,
};
