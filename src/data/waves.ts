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
  /** Spawns per second (a pack of Marbles counts as its size), over the wave clock: calm, slowly rising. */
  rates: [
    { at: 0, rate: 1.0 },
    { at: 45, rate: 1.4 },
    { at: 90, rate: 1.9 },
    { at: 135, rate: 2.4 },
    { at: 180, rate: 2.8 },
    { at: 270, rate: 3.6 },
    { at: 360, rate: 4.4 },
    { at: 450, rate: 5.2 },
    { at: 540, rate: 6.0 },
    { at: 630, rate: 6.8 },
    { at: 720, rate: 7.6 },
    { at: 900, rate: 9.2 },
  ] as RatePoint[],
  /** spawns/s added every second after the last point (endless mode) */
  lateGrowth: 0.04,
  /**
   * Rhythm: a wave of `waveLength` s, then `pause` s of calm. Every `wavesPerBoss` waves,
   * a boss: no more waves while it lives (the clock stops), then `afterBoss` s of calm.
   */
  waveLength: 37,
  pause: 8,
  wavesPerBoss: 4,
  afterBoss: 6,
  /**
   * The run, wave by wave: blocks of `wavesPerBoss` waves, each block bringing two new types (one
   * "featured" strong or skilled type per wave at most, the rest simple enemies; per-type caps in
   * data/enemies.ts). A type arrives with the first wave that contains it, which announces it. After the
   * last boss of the plan, the game is won; it can go on (endless) with `mixes`.
   * Weights are shares of the stream (a pack of Marbles weighs as much as one other spawn).
   */
  plan: [
    // block 1
    { marble: 1 },
    { marble: 1 },
    { marble: 3, rusher: 1 },
    { marble: 2, rusher: 2 },
    // block 2
    { hunter: 1, marble: 3 },
    { hunter: 2, rusher: 1 },
    { block: 1, marble: 3 },
    { block: 1, hunter: 2 },
    // block 3 (the Swarm comes as a highlight, from `swarm.firstWave`)
    { shooter: 1, marble: 3 },
    { shooter: 1, hunter: 2 },
    { marble: 2, rusher: 2 },
    { shooter: 1, rusher: 2 },
    // block 4 (the Orbiters arrive in an almost empty wave)
    { orbiter: 2, marble: 1 },
    { orbiter: 1, marble: 3 },
    { bomber: 1, rusher: 3 },
    { bomber: 1, hunter: 2, marble: 1 },
    // block 5
    { hexagon: 1, marble: 3 },
    { hexagon: 1, rusher: 2 },
    { jumper: 1, marble: 3 },
    { jumper: 1, hunter: 2 },
  ] as Record<string, number>[],
  /**
   * Endless mode (after the plan): one of these per wave, drawn from the seed, never the same twice in a row.
   * Still 2-3 types at once; the featured type stays a minority.
   */
  mixes: [
    { marble: 2, hunter: 2, block: 1 },
    { rusher: 3, shooter: 1 },
    { hunter: 3, shooter: 1, marble: 1 },
    { orbiter: 1, marble: 3 },
    { orbiter: 1, rusher: 2, block: 1 },
    { bomber: 1, rusher: 3, hunter: 2 },
    { bomber: 1, block: 1, marble: 2 },
    { hexagon: 1, rusher: 3 },
    { hexagon: 1, shooter: 1, hunter: 2 },
    { jumper: 1, marble: 3 },
    { jumper: 1, block: 1, rusher: 2 },
  ] as Record<string, number>[],
  /** enemy HP × (1 + a·minutes + b·minutes²) */
  hpScalePerMinute: 0.3,
  hpScalePerMinute2: 0.12,
  dmgScalePerMinute: 0.12,
  speedScalePerMinute: 0.025,
  speedScaleMax: 1.3,
  /** highlights of a wave, `at` s after its start, from wave `firstWave` on (1 = the first) */
  swarm: { type: 'swarm', firstWave: 11, at: 14, count: 14, countPerMinute: 3 },
  /** hordes (odd-numbered waves): a big pack of older enemies (alternating) arriving from a single side */
  horde: { types: ['marble', 'rusher'], firstWave: 7, at: 24, count: 16, countPerMinute: 2.5 },
  /** encirclements (even-numbered waves) */
  ring: { type: 'hunter', firstWave: 6, at: 24, count: 22, countPerMinute: 3, radius: 640 },
  /** boss arena: a ring of this radius around the player closes when a boss arrives, until it dies */
  arena: { radius: 620, bossDistance: 420 },
  /** bonus crates: one every `every` seconds near the player, at most `max` at the same time */
  props: { every: 22, max: 4, minDist: 380, maxDist: 650, despawn: 2200 },
};
