/**
 * Waves and difficulty curves. Everything is driven by the wave clock (s.clock), which advances
 * except during a boss: wave composition never depends on what the player does
 * (that is what makes a seed identical for everyone).
 */

export interface RatePoint {
  /** time in seconds (× the difficulty's "pace") */
  at: number;
  /** spawns per second (linearly interpolated toward the next point) */
  rate: number;
}

export const WAVES = {
  spawnRadius: 900,
  spawnJitter: 120,
  /**
   * Caps on living enemies (performance): the continuous stream stops at `fluxCap`, highlights
   * (swarm, horde, encirclement) can go up to `enemyCap`. Crates and bosses ignore them.
   */
  fluxCap: 340,
  enemyCap: 440,
  /** beyond this (far from every player), a lost enemy disappears, dropping nothing */
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
  /** spawns/s added every second after the last point */
  lateGrowth: 0.04,
  /**
   * Time (s, × pace) from which each type can appear. The arrival takes effect at the start
   * of the next mix, which features it (and announces it).
   */
  unlocks: { hunter: 0, rusher: 90, shooter: 210, block: 270, orbiter: 330, bomber: 390, golem: 450, leader: 540, teleporter: 630 } as Record<string, number>,
  /**
   * Rhythm: a wave of `waveLength` s, then `pause` s of calm. Every `wavesPerBoss` waves,
   * a boss: no more waves while it lives (the clock stops), then `afterBoss` s of calm.
   */
  waveLength: 37,
  pause: 8,
  wavesPerBoss: 4,
  afterBoss: 6,
  /**
   * To stay readable, only 2-3 types come out at the same time: one "mix" per wave. The draw is among
   * the mixes whose types have all arrived, favouring the most recent ones; the first mix containing a new type is used for its arrival.
   * The "featured" type stays a minority (20-30%): the bulk of the stream is simple enemies.
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
  /** enemy HP × (1 + a·minutes + b·minutes²) */
  hpScalePerMinute: 0.3,
  hpScalePerMinute2: 0.12,
  dmgScalePerMinute: 0.12,
  speedScalePerMinute: 0.025,
  speedScaleMax: 1.3,
  /** highlights of a wave, `at` s after its start (from `firstAt` s of clock on) */
  swarm: { type: 'swarm', firstAt: 60, at: 14, count: 14, countPerMinute: 3 },
  /** hordes (even waves): a big pack of older enemies (alternating) arriving from a single side */
  horde: { types: ['hunter', 'rusher'], firstAt: 240, at: 24, count: 16, countPerMinute: 2.5 },
  /** encirclements (odd waves) */
  ring: { type: 'hunter', firstAt: 130, at: 24, count: 22, countPerMinute: 3, radius: 640 },
  /** bonus crates: one every `every` seconds near the player, at most `max` at the same time */
  props: { every: 22, max: 4, minDist: 380, maxDist: 650, despawn: 2200 },
};
