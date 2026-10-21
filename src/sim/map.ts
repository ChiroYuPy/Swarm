/**
 * Monde ouvert infini : obstacles géométriques (cercles, hexagones, rectangles orientés) générés
 * à la demande, morceau par morceau, depuis la seed (flux MAP). La génération d'un morceau ne dépend
 * que de (seed, cx, cy) : le cache n'est qu'une optimisation, il ne fait pas partie de l'état.
 */
import { MAP_GEN } from '../data/map';
import { CHUNK } from './constants';
import { PI, dcos, dsin } from './dmath';
import { Rng, STREAM, deriveSeed } from './rng';

export const OB_CIRCLE = 0;
export const OB_HEX = 1;
export const OB_RECT = 2;

export interface Obstacle {
  kind: number;
  x: number;
  y: number;
  /** rayon englobant (cercle : rayon exact ; hexagone : rayon du sommet) */
  r: number;
  /** demi-largeur / demi-hauteur (rectangle) */
  hw: number;
  hh: number;
  /** orientation (rectangle et hexagone) */
  ca: number;
  sa: number;
  /** variante de couleur (rendu uniquement) */
  tint: number;
}

/** Rayon approché d'un hexagone pour l'évitement (entre l'apothème et le rayon du sommet). */
const HEX_COLLIDE = 0.92;
const SQ3_2 = 0.8660254037844386;
/** Normales des 6 arêtes de l'hexagone (30° + k·60°), dans son repère. */
const HEX_NC = [SQ3_2, 0, -SQ3_2, -SQ3_2, 0, SQ3_2];
const HEX_NS = [0.5, 1, 0.5, -0.5, -1, -0.5];

export class WorldMap {
  private cache = new Map<number, Obstacle[]>();
  constructor(readonly seed: number) {}

  /** Obstacles du morceau (cx, cy). */
  chunk(cx: number, cy: number): Obstacle[] {
    const key = cx * 65536 + cy;
    let c = this.cache.get(key);
    if (!c) {
      if (this.cache.size > 900) this.cache.clear();
      c = generateChunk(this.seed, cx, cy);
      this.cache.set(key, c);
    }
    return c;
  }
}

export function generateChunk(seed: number, cx: number, cy: number): Obstacle[] {
  const g = MAP_GEN;
  const rng = new Rng(deriveSeed(seed, STREAM.MAP, cx, cy));
  const n = rng.weighted(g.countWeights);
  const out: Obstacle[] = [];
  const span = g.chunk - 2 * g.margin;
  for (let i = 0; i < n; i++) {
    // Toujours le même nombre de tirages par obstacle, qu'il soit gardé ou non.
    const kind = rng.int(3);
    const x = cx * g.chunk + g.margin + rng.next() * span;
    const y = cy * g.chunk + g.margin + rng.next() * span;
    const a = rng.next();
    const b = rng.next();
    const rot = rng.int(8);
    const o: Obstacle = { kind, x, y, r: 0, hw: 0, hh: 0, ca: 1, sa: 0, tint: rng.int(3) };
    const ang = (rot * PI) / 8;
    o.ca = dcos(ang);
    o.sa = dsin(ang);
    if (kind === OB_CIRCLE) {
      o.r = g.circle.min + a * (g.circle.max - g.circle.min);
    } else if (kind === OB_HEX) {
      o.r = g.hexagon.min + a * (g.hexagon.max - g.hexagon.min);
    } else {
      // Rectangles : parfois de longs murets fins, parfois des blocs.
      o.hw = g.rect.min + a * (g.rect.max - g.rect.min);
      o.hh = b < 0.5 ? g.rect.thinMin + b * 30 : g.rect.min + b * (g.rect.max - g.rect.min) * 0.6;
      o.r = Math.sqrt(o.hw * o.hw + o.hh * o.hh);
    }
    if (o.r > g.margin) {
      const k = g.margin / o.r;
      o.r *= k;
      o.hw *= k;
      o.hh *= k;
    }
    const d0 = Math.sqrt(x * x + y * y);
    if (d0 < g.clearRadius + o.r) continue;
    let ok = true;
    for (const p of out) {
      const dx = p.x - x;
      const dy = p.y - y;
      const rr = p.r + o.r + g.gap;
      if (dx * dx + dy * dy < rr * rr) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(o);
  }
  return out;
}

// Résultat de `penetration` (pas d'allocation) : normale de sortie et profondeur.
let PNX = 0;
let PNY = 0;

/** Profondeur de pénétration du cercle (x, y, r) dans l'obstacle (0 si aucun contact). Écrit la normale dans PNX/PNY. */
function penetration(o: Obstacle, x: number, y: number, r: number): number {
  const dx = x - o.x;
  const dy = y - o.y;
  if (o.kind === OB_CIRCLE) {
    const R = o.r;
    const d2 = dx * dx + dy * dy;
    const rr = R + r;
    if (d2 >= rr * rr) return 0;
    const d = Math.sqrt(d2);
    if (d < 1e-6) {
      PNX = 1;
      PNY = 0;
      return rr;
    }
    PNX = dx / d;
    PNY = dy / d;
    return rr - d;
  }
  if (o.kind === OB_HEX) {
    // Hexagone exact (sommets à k·60° dans le repère de l'obstacle), comme au rendu.
    const d2 = dx * dx + dy * dy;
    const rr = o.r + r;
    if (d2 >= rr * rr) return 0;
    const lx = dx * o.ca + dy * o.sa;
    const ly = -dx * o.sa + dy * o.ca;
    const A = o.r * SQ3_2;
    let best = -Infinity;
    let bk = 0;
    for (let k = 0; k < 6; k++) {
      const d = lx * HEX_NC[k] + ly * HEX_NS[k] - A;
      if (d > best) {
        best = d;
        bk = k;
      }
    }
    if (best >= r) return 0;
    const nc = HEX_NC[bk];
    const ns = HEX_NS[bk];
    let nx: number;
    let ny: number;
    let depth: number;
    if (best <= 0) {
      nx = nc;
      ny = ns;
      depth = r - best;
    } else {
      // Point le plus proche sur l'arête (ou son sommet).
      const half = o.r * 0.5;
      let u = -lx * ns + ly * nc;
      u = u < -half ? -half : u > half ? half : u;
      const ex = lx - (nc * A - ns * u);
      const ey = ly - (ns * A + nc * u);
      const e2 = ex * ex + ey * ey;
      if (e2 >= r * r) return 0;
      const e = Math.sqrt(e2);
      if (e < 1e-6) {
        nx = nc;
        ny = ns;
      } else {
        nx = ex / e;
        ny = ey / e;
      }
      depth = r - e;
    }
    PNX = nx * o.ca - ny * o.sa;
    PNY = nx * o.sa + ny * o.ca;
    return depth;
  }
  // Rectangle orienté : repère local
  const lx = dx * o.ca + dy * o.sa;
  const ly = -dx * o.sa + dy * o.ca;
  const qx = lx < -o.hw ? -o.hw : lx > o.hw ? o.hw : lx;
  const qy = ly < -o.hh ? -o.hh : ly > o.hh ? o.hh : ly;
  const ex = lx - qx;
  const ey = ly - qy;
  const e2 = ex * ex + ey * ey;
  let nx: number;
  let ny: number;
  let depth: number;
  if (e2 > 1e-12) {
    if (e2 >= r * r) return 0;
    const e = Math.sqrt(e2);
    nx = ex / e;
    ny = ey / e;
    depth = r - e;
  } else {
    // Centre à l'intérieur : on sort par la face la plus proche.
    const px = o.hw - Math.abs(lx);
    const py = o.hh - Math.abs(ly);
    if (px < py) {
      nx = lx < 0 ? -1 : 1;
      ny = 0;
      depth = px + r;
    } else {
      nx = 0;
      ny = ly < 0 ? -1 : 1;
      depth = py + r;
    }
  }
  PNX = nx * o.ca - ny * o.sa;
  PNY = nx * o.sa + ny * o.ca;
  return depth;
}

// Morceaux touchés par une requête (tampon réutilisé, aucune allocation).
const NEAR: Obstacle[][] = [];
for (let i = 0; i < 25; i++) NEAR.push([]);
let nearN = 0;
function gather(m: WorldMap, x0: number, y0: number, x1: number, y1: number): void {
  nearN = 0;
  const cx0 = Math.floor(x0 / CHUNK);
  const cy0 = Math.floor(y0 / CHUNK);
  const cx1 = Math.floor(x1 / CHUNK);
  const cy1 = Math.floor(y1 / CHUNK);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) if (nearN < NEAR.length) NEAR[nearN++] = m.chunk(cx, cy);
}

/** Le cercle touche-t-il un obstacle ? */
export function circleHitsObstacle(m: WorldMap, x: number, y: number, r: number): boolean {
  gather(m, x - r, y - r, x + r, y + r);
  for (let c = 0; c < nearN; c++) {
    const list = NEAR[c];
    for (let i = 0; i < list.length; i++) if (penetration(list[i], x, y, r) > 0) return true;
  }
  return false;
}

/**
 * Déplace un cercle puis le repousse hors des obstacles : on glisse naturellement le long des bords.
 * Renvoie true s'il y a eu contact.
 */
export function moveCircle(m: WorldMap, o: { x: number; y: number }, dx: number, dy: number, r: number): boolean {
  o.x += dx;
  o.y += dy;
  gather(m, o.x - r - 2, o.y - r - 2, o.x + r + 2, o.y + r + 2);
  let touched = false;
  for (let iter = 0; iter < 2; iter++) {
    let any = false;
    for (let c = 0; c < nearN; c++) {
      const list = NEAR[c];
      for (let i = 0; i < list.length; i++) {
        const d = penetration(list[i], o.x, o.y, r);
        if (d > 0) {
          o.x += PNX * d;
          o.y += PNY * d;
          any = true;
        }
      }
    }
    if (!any) break;
    touched = true;
  }
  return touched;
}

/** Direction d'esquive conseillée quand un obstacle barre la route (évitement des ennemis). */
export const AVOID = { x: 0, y: 0 };
export function avoidance(m: WorldMap, x: number, y: number, r: number, ux: number, uy: number, look: number): boolean {
  let best = Infinity;
  AVOID.x = 0;
  AVOID.y = 0;
  gather(m, x - look, y - look, x + look, y + look);
  for (let c = 0; c < nearN; c++) {
    const list = NEAR[c];
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      const cx = o.x - x;
      const cy = o.y - y;
      const along = cx * ux + cy * uy;
      if (along < 0 || along > look + o.r) continue;
      const side = cx * uy - cy * ux;
      const R = (o.kind === OB_HEX ? o.r * HEX_COLLIDE : o.kind === OB_RECT ? Math.max(o.hw, o.hh) : o.r) + r + 6;
      if (Math.abs(side) > R) continue;
      if (along < best) {
        best = along;
        // On contourne par le côté où l'on est déjà décalé.
        const sgn = side > 0 ? -1 : 1;
        AVOID.x = -uy * sgn;
        AVOID.y = ux * sgn;
      }
    }
  }
  return best < Infinity;
}

/** Le cercle (x, y, r) touche-t-il cet obstacle précis ? */
export function obstacleTouches(o: Obstacle, x: number, y: number, r: number): boolean {
  return penetration(o, x, y, r) > 0;
}

/**
 * Ligne de vue : un cercle de rayon r peut-il glisser en ligne droite de (x0, y0) à (x1, y1)
 * sans heurter d'obstacle ? (hexagones approchés par un cercle, rectangles exacts)
 */
export function segmentClear(m: WorldMap, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  gather(m, Math.min(x0, x1) - r, Math.min(y0, y1) - r, Math.max(x0, x1) + r, Math.max(y0, y1) + r);
  const sx = x1 - x0;
  const sy = y1 - y0;
  const len2 = sx * sx + sy * sy;
  for (let c = 0; c < nearN; c++) {
    const list = NEAR[c];
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      // Distance du centre au segment (rejet rapide par le cercle englobant).
      const cx = o.x - x0;
      const cy = o.y - y0;
      let t = len2 > 0 ? (cx * sx + cy * sy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = cx - sx * t;
      const ey = cy - sy * t;
      const d2 = ex * ex + ey * ey;
      const bound = o.r + r;
      if (d2 >= bound * bound) continue;
      if (o.kind === OB_CIRCLE) return false;
      if (o.kind === OB_HEX) {
        const R = o.r * HEX_COLLIDE + r;
        if (d2 < R * R) return false;
        continue;
      }
      // Rectangle orienté : test des dalles dans son repère, boîte élargie de r.
      const ax = x0 - o.x;
      const ay = y0 - o.y;
      const lx0 = ax * o.ca + ay * o.sa;
      const ly0 = -ax * o.sa + ay * o.ca;
      const ldx = sx * o.ca + sy * o.sa;
      const ldy = -sx * o.sa + sy * o.ca;
      const hw = o.hw + r;
      const hh = o.hh + r;
      let t0 = 0;
      let t1 = 1;
      if (Math.abs(ldx) < 1e-9) {
        if (lx0 < -hw || lx0 > hw) continue;
      } else {
        let a = (-hw - lx0) / ldx;
        let b = (hw - lx0) / ldx;
        if (a > b) {
          const tmp = a;
          a = b;
          b = tmp;
        }
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
        if (t0 > t1) continue;
      }
      if (Math.abs(ldy) < 1e-9) {
        if (ly0 < -hh || ly0 > hh) continue;
      } else {
        let a = (-hh - ly0) / ldy;
        let b = (hh - ly0) / ldy;
        if (a > b) {
          const tmp = a;
          a = b;
          b = tmp;
        }
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
        if (t0 > t1) continue;
      }
      return false;
    }
  }
  return true;
}

/** Point dans un obstacle ? (projectiles) */
export function pointInObstacle(m: WorldMap, x: number, y: number): boolean {
  return circleHitsObstacle(m, x, y, 0.5);
}
