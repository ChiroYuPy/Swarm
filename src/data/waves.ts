/**
 * Vagues et courbes de difficulté. Tout est piloté par le temps : la composition des vagues
 * ne dépend jamais de ce que fait le joueur (c'est ce qui rend une seed identique pour tous).
 */

export interface WavePhase {
  /** début de la phase en secondes */
  at: number;
  /** apparitions par seconde (interpolé linéairement vers la phase suivante) */
  rate: number;
  weights: Record<string, number>;
}

export const WAVES = {
  spawnRadius: 900,
  spawnJitter: 120,
  enemyCap: 950,
  /** au-delà, un ennemi est replacé de l'autre côté du joueur */
  relocateDistance: 1500,
  // Les types d'ennemis arrivent un par un (dates × « pace » de la difficulté). Chaque arrivée est annoncée.
  phases: [
    { at: 0, rate: 1.0, weights: { triangle: 1 } },
    { at: 45, rate: 1.6, weights: { triangle: 1 } },
    { at: 90, rate: 2.2, weights: { triangle: 4, losange: 2 } },
    { at: 150, rate: 3.0, weights: { triangle: 4, losange: 3 } },
    { at: 210, rate: 3.6, weights: { triangle: 4, losange: 3, pentagone: 1 } },
    { at: 270, rate: 4.4, weights: { triangle: 4, losange: 3, pentagone: 1, carre: 1 } },
    { at: 360, rate: 6.4, weights: { triangle: 4, losange: 3, pentagone: 1.5, carre: 2, cercle: 1 } },
    { at: 480, rate: 9.5, weights: { triangle: 3, losange: 3, pentagone: 2, carre: 3, cercle: 1.5 } },
    { at: 600, rate: 13, weights: { triangle: 2, losange: 3, pentagone: 3, carre: 4, cercle: 3 } },
  ] as WavePhase[],
  /** apparitions/s ajoutées chaque seconde après la dernière phase */
  lateGrowth: 0.06,
  /** pendant qu'un boss est en vie, le flux normal est réduit */
  bossRateMul: 0.55,
  /** PV des ennemis × (1 + a·minutes + b·minutes²) */
  hpScalePerMinute: 0.3,
  hpScalePerMinute2: 0.1,
  dmgScalePerMinute: 0.12,
  speedScalePerMinute: 0.025,
  speedScaleMax: 1.3,
  swarm: { type: 'points', firstAt: 60, every: 45, count: 14, countPerMinute: 3 },
  ring: { type: 'triangle', firstAt: 130, every: 80, count: 22, countPerMinute: 3, radius: 640 },
  /** caisses bonus : une toutes les `every` secondes près du joueur, au plus `max` en même temps */
  props: { every: 22, max: 4, minDist: 380, maxDist: 650, despawn: 2200 },
  bossEvery: 180,
};
