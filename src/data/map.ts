/**
 * Infinite open world: a field of geometric obstacles generated in chunks from the seed.
 * No special tiles: bonuses are pickups (see loot.ts).
 */
export const MAP_GEN = {
  /** size of a world chunk (units) */
  chunk: 768,
  /** inner margin: an obstacle never spills out of its chunk (avoids trap corners) */
  margin: 170,
  /** odds of having 0, 1, 2 or 3 obstacles in a chunk */
  countWeights: [3, 5, 3, 1],
  /** clear area around the starting point */
  clearRadius: 420,
  /** minimum gap between two obstacles of the same chunk (guaranteed passage) */
  gap: 90,
  circle: { min: 34, max: 95 },
  hexagon: { min: 45, max: 110 },
  rect: { min: 30, max: 150, thinMin: 26 },
};
