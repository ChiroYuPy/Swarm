/**
 * Deterministic PRNG (mulberry32) + derivation of independent streams from the seed.
 * No Math.random call here: everything is bit-for-bit reproducible.
 */

/** Stream ids. Each stream has its own sequence; they do not influence each other. */
export const STREAM = {
  MAP: 1,
  WAVES: 2,
  LOOT: 3,
  LEVELUP: 4,
  /** Reserved for rendering (particles...). Must NEVER be read by the simulation. */
  COSMETIC: 5,
} as const;

/** murmur3 finalizer: 32-bit mix. */
export function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** FNV-1a hash of a string, then mixed. Turns a text seed into a 32-bit integer. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mix32(h >>> 0);
}

/** Derives a sub-seed from the main seed and a list of integers (stream, level, index...). */
export function deriveSeed(seed: number, ...parts: number[]): number {
  let h = mix32((seed ^ 0x9e3779b9) >>> 0);
  for (let i = 0; i < parts.length; i++) {
    h = mix32((h ^ Math.imul((parts[i] | 0) + 0x632be5ab, 0x9e3779b1)) >>> 0);
  }
  return h;
}

export class Rng {
  s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  /** Float in [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Weighted draw: returns the chosen index. */
  weighted(weights: ArrayLike<number>, total?: number): number {
    let sum = total ?? 0;
    if (total === undefined) for (let i = 0; i < weights.length; i++) sum += weights[i];
    let r = this.next() * sum;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }
}
