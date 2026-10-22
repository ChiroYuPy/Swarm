/**
 * Vagues et courbes de difficulté. Tout est piloté par l'horloge des vagues (s.clock), qui avance
 * sauf pendant un boss : la composition des vagues ne dépend jamais de ce que fait le joueur
 * (c'est ce qui rend une seed identique pour tous).
 */

export interface RatePoint {
  /** date en secondes (× « pace » de la difficulté) */
  at: number;
  /** apparitions par seconde (interpolé linéairement vers le point suivant) */
  rate: number;
}

export const WAVES = {
  spawnRadius: 900,
  spawnJitter: 120,
  enemyCap: 700,
  /** au-delà, un ennemi est replacé de l'autre côté du joueur */
  relocateDistance: 1500,
  rates: [
    { at: 0, rate: 1.0 },
    { at: 45, rate: 1.6 },
    { at: 90, rate: 2.2 },
    { at: 150, rate: 3.0 },
    { at: 210, rate: 3.6 },
    { at: 270, rate: 4.4 },
    { at: 360, rate: 6.2 },
    { at: 480, rate: 8.2 },
    { at: 600, rate: 10.5 },
  ] as RatePoint[],
  /** apparitions/s ajoutées chaque seconde après le dernier point */
  lateGrowth: 0.04,
  /**
   * Date (s, × pace) à partir de laquelle chaque type peut apparaître. L'arrivée prend effet au début
   * du mélange suivant, qui le met en vedette (et l'annonce).
   */
  unlocks: { triangle: 0, losange: 90, pentagone: 210, carre: 270, orbiteur: 330, cercle: 390, golem: 450, meneur: 540, teleporteur: 630 } as Record<string, number>,
  /**
   * Rythme : une vague de `waveLength` s, puis `pause` s de calme. Toutes les `wavesPerBoss` vagues,
   * un boss : plus aucune vague tant qu'il vit (l'horloge s'arrête), puis `afterBoss` s de calme.
   */
  waveLength: 37,
  pause: 8,
  wavesPerBoss: 4,
  afterBoss: 6,
  /**
   * Pour rester lisible, seuls 2-3 types sortent en même temps : un « mélange » par vague. On tire parmi
   * les mélanges dont tous les types sont arrivés, en favorisant les plus récents ; le premier mélange qui contient un nouveau type sert à son arrivée.
   * Le type « vedette » reste minoritaire (20-30 %) : le gros du flux, ce sont des ennemis simples.
   */
  mixes: [
    { triangle: 1 },
    { triangle: 3, losange: 2 },
    { losange: 3, pentagone: 0.6 },
    { triangle: 3, pentagone: 0.6 },
    { triangle: 2, carre: 1 },
    { losange: 2, carre: 1, pentagone: 0.5 },
    { orbiteur: 1, triangle: 3 },
    { orbiteur: 1, carre: 1, losange: 2 },
    { cercle: 0.5, losange: 3, triangle: 2 },
    { cercle: 0.5, carre: 1, triangle: 3 },
    { golem: 1, losange: 3 },
    { golem: 1, pentagone: 1, triangle: 2 },
    { meneur: 0.5, triangle: 3, losange: 2 },
    { meneur: 0.5, carre: 2, orbiteur: 1 },
    { teleporteur: 0.8, triangle: 3 },
    { teleporteur: 0.8, carre: 1, losange: 2 },
  ] as Record<string, number>[],
  /** PV des ennemis × (1 + a·minutes + b·minutes²) */
  hpScalePerMinute: 0.3,
  hpScalePerMinute2: 0.12,
  dmgScalePerMinute: 0.12,
  speedScalePerMinute: 0.025,
  speedScaleMax: 1.3,
  /** temps forts d'une vague, `at` s après son début (à partir de `firstAt` s d'horloge) */
  swarm: { type: 'points', firstAt: 60, at: 14, count: 14, countPerMinute: 3 },
  /** hordes (vagues paires) : un gros paquet d'anciens ennemis (en alternance) qui arrive d'un seul côté */
  horde: { types: ['triangle', 'losange'], firstAt: 240, at: 24, count: 16, countPerMinute: 2.5 },
  /** encerclements (vagues impaires) */
  ring: { type: 'triangle', firstAt: 130, at: 24, count: 22, countPerMinute: 3, radius: 640 },
  /** caisses bonus : une toutes les `every` secondes près du joueur, au plus `max` en même temps */
  props: { every: 22, max: 4, minDist: 380, maxDist: 650, despawn: 2200 },
};
