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
  /**
   * Plafonds d'ennemis en vie (performances) : le flux continu s'arrête à `fluxCap`, les temps forts
   * (essaim, horde, encerclement) peuvent monter jusqu'à `enemyCap`. Caisses et boss n'en tiennent pas compte.
   */
  fluxCap: 340,
  enemyCap: 440,
  /** au-delà (loin de tous les joueurs), un ennemi semé disparaît, sans rien lâcher */
  lostDistance: 1500,
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
  unlocks: { hunter: 0, rusher: 90, shooter: 210, block: 270, orbiter: 330, bomber: 390, golem: 450, leader: 540, teleporter: 630 } as Record<string, number>,
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
    { hunter: 1 },
    { hunter: 3, rusher: 2 },
    { rusher: 3, shooter: 0.6 },
    { hunter: 3, shooter: 0.6 },
    { hunter: 2, block: 1 },
    { rusher: 2, block: 1, shooter: 0.5 },
    { orbiter: 1, hunter: 3 },
    { orbiter: 1, block: 1, rusher: 2 },
    { bomber: 0.5, rusher: 3, hunter: 2 },
    { bomber: 0.5, block: 1, hunter: 3 },
    { golem: 1, rusher: 3 },
    { golem: 1, shooter: 1, hunter: 2 },
    { leader: 0.5, hunter: 3, rusher: 2 },
    { leader: 0.5, block: 2, orbiter: 1 },
    { teleporter: 0.8, hunter: 3 },
    { teleporter: 0.8, block: 1, rusher: 2 },
  ] as Record<string, number>[],
  /** PV des ennemis × (1 + a·minutes + b·minutes²) */
  hpScalePerMinute: 0.3,
  hpScalePerMinute2: 0.12,
  dmgScalePerMinute: 0.12,
  speedScalePerMinute: 0.025,
  speedScaleMax: 1.3,
  /** temps forts d'une vague, `at` s après son début (à partir de `firstAt` s d'horloge) */
  swarm: { type: 'swarm', firstAt: 60, at: 14, count: 14, countPerMinute: 3 },
  /** hordes (vagues paires) : un gros paquet d'anciens ennemis (en alternance) qui arrive d'un seul côté */
  horde: { types: ['hunter', 'rusher'], firstAt: 240, at: 24, count: 16, countPerMinute: 2.5 },
  /** encerclements (vagues impaires) */
  ring: { type: 'hunter', firstAt: 130, at: 24, count: 22, countPerMinute: 3, radius: 640 },
  /** caisses bonus : une toutes les `every` secondes près du joueur, au plus `max` en même temps */
  props: { every: 22, max: 4, minDist: 380, maxDist: 650, despawn: 2200 },
};
