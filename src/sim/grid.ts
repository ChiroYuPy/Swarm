/**
 * Uniform spatial grid for enemy collisions. Rebuilt with a counting sort
 * (deterministic order, no allocation). Very big enemies (bosses) go into a separate list.
 * Infinite world: the grid is recentred on the player at each rebuild; whatever falls outside the
 * window is stored in the edge cells (the filter stays correct, just coarser).
 */
import { GRID_CELL, GRID_SIZE, MAX_ENEMIES, NORMAL_MAX_RADIUS } from './constants';
import type { Enemy } from './state';

export class SpatialGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cellStart: Int32Array;
  private readonly cellFill: Int32Array;
  private readonly cellOf: Int32Array;
  readonly items: Int32Array;
  readonly big: Int32Array;
  bigCount = 0;
  /** reusable result buffer */
  readonly out: Int32Array;
  /** window origin (world units) */
  ox = 0;
  oy = 0;

  constructor() {
    this.cols = GRID_SIZE;
    this.rows = GRID_SIZE;
    const n = this.cols * this.rows;
    this.cellStart = new Int32Array(n + 1);
    this.cellFill = new Int32Array(n);
    this.cellOf = new Int32Array(MAX_ENEMIES);
    this.items = new Int32Array(MAX_ENEMIES);
    this.big = new Int32Array(64);
    this.out = new Int32Array(MAX_ENEMIES);
  }

  cellIndex(x: number, y: number): number {
    let cx = Math.floor((x - this.ox) / GRID_CELL);
    let cy = Math.floor((y - this.oy) / GRID_CELL);
    if (cx < 0) cx = 0;
    else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  build(enemies: Enemy[], count: number, cx: number, cy: number): void {
    this.ox = (Math.floor(cx / GRID_CELL) - (this.cols >> 1)) * GRID_CELL;
    this.oy = (Math.floor(cy / GRID_CELL) - (this.rows >> 1)) * GRID_CELL;
    const n = this.cols * this.rows;
    const start = this.cellStart;
    start.fill(0);
    this.bigCount = 0;
    for (let i = 0; i < count; i++) {
      const e = enemies[i];
      if (!e.alive) {
        this.cellOf[i] = -1;
        continue;
      }
      if (e.r > NORMAL_MAX_RADIUS) {
        if (this.bigCount < this.big.length) this.big[this.bigCount++] = i;
        this.cellOf[i] = -1;
        continue;
      }
      const c = this.cellIndex(e.x, e.y);
      this.cellOf[i] = c;
      start[c + 1]++;
    }
    for (let c = 0; c < n; c++) start[c + 1] += start[c];
    this.cellFill.set(start.subarray(0, n));
    for (let i = 0; i < count; i++) {
      const c = this.cellOf[i];
      if (c < 0) continue;
      this.items[this.cellFill[c]++] = i;
    }
  }

  /**
   * Fills `this.out` with the indices of enemies that may touch the disc (x, y, r).
   * Broad filter (cells + big enemies): the caller does the exact distance test.
   */
  query(enemies: Enemy[], x: number, y: number, r: number): number {
    const reach = r + NORMAL_MAX_RADIUS;
    let cx0 = Math.floor((x - reach - this.ox) / GRID_CELL);
    let cy0 = Math.floor((y - reach - this.oy) / GRID_CELL);
    let cx1 = Math.floor((x + reach - this.ox) / GRID_CELL);
    let cy1 = Math.floor((y + reach - this.oy) / GRID_CELL);
    if (cx0 < 0) cx0 = 0;
    if (cy0 < 0) cy0 = 0;
    if (cx1 >= this.cols) cx1 = this.cols - 1;
    if (cy1 >= this.rows) cy1 = this.rows - 1;
    let n = 0;
    const out = this.out;
    for (let cy = cy0; cy <= cy1; cy++) {
      let c = cy * this.cols + cx0;
      for (let cx = cx0; cx <= cx1; cx++, c++) {
        const s = this.cellStart[c];
        const e = this.cellStart[c + 1];
        for (let k = s; k < e; k++) out[n++] = this.items[k];
      }
    }
    for (let b = 0; b < this.bigCount; b++) {
      const i = this.big[b];
      const en = enemies[i];
      const dx = en.x - x;
      const dy = en.y - y;
      const rr = r + en.r;
      if (dx * dx + dy * dy <= rr * rr) out[n++] = i;
    }
    return n;
  }

  /** Nearest living enemy within a radius, skipping excluded ids. Returns the index or -1. */
  nearest(
    enemies: Enemy[],
    x: number,
    y: number,
    maxR: number,
    exclude?: Int32Array,
    excludeCount = 0,
    skipProps = false,
  ): number {
    let best = -1;
    let bestD = maxR * maxR;
    const ccx = Math.floor((x - this.ox) / GRID_CELL);
    const ccy = Math.floor((y - this.oy) / GRID_CELL);
    const maxRing = Math.ceil(maxR / GRID_CELL) + 1;
    for (let ring = 0; ring <= maxRing; ring++) {
      // Every cell of this ring is at least (ring - 1) * GRID_CELL away from the point.
      if (best >= 0) {
        const minD = (ring - 1) * GRID_CELL;
        if (minD > 0 && minD * minD > bestD) break;
      }
      for (let cy = ccy - ring; cy <= ccy + ring; cy++) {
        if (cy < 0 || cy >= this.rows) continue;
        const edgeRow = cy === ccy - ring || cy === ccy + ring;
        const step = edgeRow ? 1 : ring * 2;
        for (let cx = ccx - ring; cx <= ccx + ring; cx += step === 0 ? 1 : step) {
          if (cx < 0 || cx >= this.cols) continue;
          const c = cy * this.cols + cx;
          const s = this.cellStart[c];
          const e = this.cellStart[c + 1];
          for (let k = s; k < e; k++) {
            const i = this.items[k];
            const en = enemies[i];
            if (!en.alive) continue;
            if (skipProps && en.speed === 0) continue;
            const dx = en.x - x;
            const dy = en.y - y;
            const d = dx * dx + dy * dy;
            if (d < bestD && !isExcluded(en.id, exclude, excludeCount)) {
              bestD = d;
              best = i;
            }
          }
        }
      }
    }
    for (let b = 0; b < this.bigCount; b++) {
      const i = this.big[b];
      const en = enemies[i];
      if (!en.alive) continue;
      const dx = en.x - x;
      const dy = en.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD && !isExcluded(en.id, exclude, excludeCount)) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }
}

function isExcluded(id: number, list: Int32Array | undefined, n: number): boolean {
  if (!list) return false;
  for (let i = 0; i < n; i++) if (list[i] === id) return true;
  return false;
}
