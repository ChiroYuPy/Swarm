/**
 * Champ de navigation des ennemis : une grille locale centrée sur le joueur d'ancrage, où chaque case
 * connaît sa distance (en contournant les obstacles) jusqu'au joueur. Un ennemi qui ne voit pas le
 * joueur en ligne droite descend ce champ : il contourne les obstacles au lieu de s'y coller.
 *
 * Cache dérivé (non sérialisé) : il ne dépend que de la carte et de la case du joueur, il est donc
 * recalculé à l'identique après une restauration.
 */
import { CHUNK } from './constants';
import { obstacleTouches, type WorldMap } from './map';

const CELL = 32;
const HALF = 48;
const SIZE = HALF * 2 + 1;
const N = SIZE * SIZE;
/** marge autour des obstacles : les chemins passent au large */
const INFLATE = 10;
const SQRT2 = 1.4142135623730951;
const FAR = 1e9;

// 8 voisins : orthogonaux d'abord.
const NX = [1, -1, 0, 0, 1, 1, -1, -1];
const NY = [0, 0, 1, -1, 1, -1, 1, -1];
const NCOST = [1, 1, 1, 1, SQRT2, SQRT2, SQRT2, SQRT2];

export class NavField {
  /** case (monde) du joueur au dernier calcul ; NaN = jamais calculé */
  private kx = NaN;
  private ky = NaN;
  private map: WorldMap | null = null;
  private ox = 0;
  private oy = 0;
  readonly blocked = new Uint8Array(N);
  readonly dist = new Float64Array(N);
  private heapIdx = new Int32Array(N * 8 + 8);
  private heapKey = new Float64Array(N * 8 + 8);
  private heapN = 0;
  /** direction conseillée (sortie de `dir`) */
  x = 0;
  y = 0;

  /** Recalcule le champ si le joueur a changé de case. */
  update(m: WorldMap, px: number, py: number): void {
    const kx = Math.floor(px / CELL);
    const ky = Math.floor(py / CELL);
    if (kx === this.kx && ky === this.ky && m === this.map) return;
    this.kx = kx;
    this.ky = ky;
    this.map = m;
    this.ox = (kx - HALF) * CELL;
    this.oy = (ky - HALF) * CELL;
    this.rasterize(m);
    this.solve(HALF, HALF);
  }

  private rasterize(m: WorldMap): void {
    const b = this.blocked;
    b.fill(0);
    const x0 = this.ox;
    const y0 = this.oy;
    const x1 = x0 + SIZE * CELL;
    const y1 = y0 + SIZE * CELL;
    const cx0 = Math.floor(x0 / CHUNK);
    const cy0 = Math.floor(y0 / CHUNK);
    const cx1 = Math.floor(x1 / CHUNK);
    const cy1 = Math.floor(y1 / CHUNK);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const list = m.chunk(cx, cy);
        for (let i = 0; i < list.length; i++) {
          const o = list[i];
          const R = o.r + INFLATE;
          const ix0 = Math.max(0, Math.floor((o.x - R - x0) / CELL));
          const iy0 = Math.max(0, Math.floor((o.y - R - y0) / CELL));
          const ix1 = Math.min(SIZE - 1, Math.floor((o.x + R - x0) / CELL));
          const iy1 = Math.min(SIZE - 1, Math.floor((o.y + R - y0) / CELL));
          for (let iy = iy0; iy <= iy1; iy++) {
            const wy = y0 + (iy + 0.5) * CELL;
            for (let ix = ix0; ix <= ix1; ix++) {
              const k = iy * SIZE + ix;
              if (b[k]) continue;
              if (obstacleTouches(o, x0 + (ix + 0.5) * CELL, wy, INFLATE)) b[k] = 1;
            }
          }
        }
      }
    }
  }

  /** Dijkstra 8-connexe depuis la case du joueur. */
  private solve(sx: number, sy: number): void {
    const d = this.dist;
    const b = this.blocked;
    d.fill(FAR);
    this.heapN = 0;
    const s = sy * SIZE + sx;
    d[s] = 0;
    this.push(s, 0);
    while (this.heapN > 0) {
      const cur = this.heapIdx[0];
      const cd = this.heapKey[0];
      this.pop();
      if (cd > d[cur]) continue;
      const cx = cur % SIZE;
      const cy = (cur - cx) / SIZE;
      for (let k = 0; k < 8; k++) {
        const nx = cx + NX[k];
        const ny = cy + NY[k];
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const ni = ny * SIZE + nx;
        if (b[ni]) continue;
        // Diagonale : pas à travers un coin bouché des deux côtés.
        if (k >= 4 && b[cy * SIZE + nx] && b[ny * SIZE + cx]) continue;
        const nd = cd + NCOST[k];
        if (nd < d[ni]) {
          d[ni] = nd;
          this.push(ni, nd);
        }
      }
    }
  }

  private push(i: number, key: number): void {
    const hi = this.heapIdx;
    const hk = this.heapKey;
    let n = this.heapN++;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (hk[p] <= key) break;
      hi[n] = hi[p];
      hk[n] = hk[p];
      n = p;
    }
    hi[n] = i;
    hk[n] = key;
  }

  private pop(): void {
    const hi = this.heapIdx;
    const hk = this.heapKey;
    const n = --this.heapN;
    if (n <= 0) return;
    const li = hi[n];
    const lk = hk[n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && hk[c + 1] < hk[c]) c++;
      if (hk[c] >= lk) break;
      hi[i] = hi[c];
      hk[i] = hk[c];
      i = c;
    }
    hi[i] = li;
    hk[i] = lk;
  }

  private best(ix: number, iy: number): number {
    const d = this.dist;
    let bi = -1;
    let bd = d[iy * SIZE + ix];
    for (let k = 0; k < 8; k++) {
      const nx = ix + NX[k];
      const ny = iy + NY[k];
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const ni = ny * SIZE + nx;
      if (d[ni] < bd) {
        bd = d[ni];
        bi = ni;
      }
    }
    return bi;
  }

  /**
   * Direction de descente depuis (x, y), visée deux cases plus loin pour lisser la trajectoire.
   * Écrit dans this.x / this.y ; false si le point est hors du champ ou sans chemin.
   */
  dir(x: number, y: number): boolean {
    const ix = Math.floor((x - this.ox) / CELL);
    const iy = Math.floor((y - this.oy) / CELL);
    if (ix < 0 || iy < 0 || ix >= SIZE || iy >= SIZE) return false;
    let a = this.best(ix, iy);
    if (a < 0) return false;
    if (this.dist[a] >= FAR) return false;
    const ax = a % SIZE;
    const b = this.best(ax, (a - ax) / SIZE);
    if (b >= 0) a = b;
    const tx = a % SIZE;
    const ty = (a - tx) / SIZE;
    const dx = this.ox + (tx + 0.5) * CELL - x;
    const dy = this.oy + (ty + 0.5) * CELL - y;
    const l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1e-6) return false;
    this.x = dx / l;
    this.y = dy / l;
    return true;
  }
}
