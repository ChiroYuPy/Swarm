/**
 * PRNG déterministe (mulberry32) + dérivation de flux indépendants depuis la seed.
 * Aucun appel à Math.random ici : tout est reproductible bit à bit.
 */

/** Identifiants de flux. Chaque flux a sa propre suite, ils ne s'influencent pas. */
export const STREAM = {
  MAP: 1,
  WAVES: 2,
  LOOT: 3,
  LEVELUP: 4,
  /** Réservé au rendu (particules...). Ne doit JAMAIS être lu par la simulation. */
  COSMETIC: 5,
} as const;

/** Finaliseur murmur3 : mélange 32 bits. */
export function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash FNV-1a d'une chaîne, puis mélange. Sert à transformer une seed texte en entier 32 bits. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mix32(h >>> 0);
}

/** Dérive une sous-seed depuis la seed principale et une liste d'entiers (flux, niveau, index...). */
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
  /** Flottant dans [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  /** Entier dans [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Tirage pondéré : renvoie l'index choisi. */
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
