/**
 * Shared render state (canvas, camera, visible area, sprites, quality) and the low-level draw helpers
 * every draw-*.ts module uses: world transform, sprites, neon glow, culling, polygons, soft puffs.
 */
import { SpriteBank, type Sprite } from './sprites';

/** Pseudo-aléa décoratif stable (0..1) pour les flammes et braises. */
export function hash01(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class RenderView {
  readonly ctx: CanvasRenderingContext2D;
  dpr = 1;
  cw = 0;
  ch = 0;
  scale = 1;
  camX = 0;
  camY = 0;
  quality: 'high' | 'low' = 'high';
  /** visible world area (camera view plus a margin), updated each frame */
  viewX0 = 0;
  viewX1 = 0;
  viewY0 = 0;
  viewY1 = 0;
  readonly sprites = new SpriteBank();
  private readonly puffs = new Map<string, CanvasImageSource>();

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D indisponible');
    this.ctx = ctx;
  }

  /** Transformation monde -> écran (caméra). */
  worldTransform(): void {
    const sc = this.scale;
    this.ctx.setTransform(sc, 0, 0, sc, this.cw / 2 - this.camX * sc, this.ch / 2 - this.camY * sc);
  }

  /** Sprite non orienté : réutilise la transformation monde courante (pas de setTransform). */
  spriteAt(sp: Sprite, x: number, y: number, scale = 1): void {
    const w = sp.w * scale;
    const h = sp.h * scale;
    this.ctx.drawImage(sp.img, x - w / 2, y - h / 2, w, h);
  }

  /** Dessine un sprite centré en (x, y), orienté selon le vecteur unitaire (dx, dy). */
  sprite(sp: Sprite, x: number, y: number, dx: number, dy: number, scale = 1): void {
    const sc = this.scale;
    const X = this.cw / 2 + (x - this.camX) * sc;
    const Y = this.ch / 2 + (y - this.camY) * sc;
    this.ctx.setTransform(sc * dx, sc * dy, -sc * dy, sc * dx, X, Y);
    const w = sp.w * scale;
    const h = sp.h * scale;
    this.ctx.drawImage(sp.img, -w / 2, -h / 2, w, h);
  }

  /** Lueur néon : trait large translucide puis trait fin. */
  glow(color: string, width: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    if (this.quality === 'high') {
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = width * 3.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.lineWidth = width;
    ctx.stroke();
  }

  visible(x: number, y: number, r: number): boolean {
    return x + r > this.viewX0 && x - r < this.viewX1 && y + r > this.viewY0 && y - r < this.viewY1;
  }

  polygon(x: number, y: number, n: number, r: number, a0: number): void {
    const ctx = this.ctx;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k * Math.PI * 2) / n;
      if (k === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  /** Disque flou d'une couleur (dégradé radial), mis en cache : brique des flammes. */
  softPuff(color: string): CanvasImageSource {
    let img = this.puffs.get(color);
    if (!img) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 32;
      const g = cv.getContext('2d')!;
      const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, color);
      grad.addColorStop(0.45, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 32, 32);
      img = cv;
      this.puffs.set(color, img);
      // Comme les sprites : une texture ImageBitmap se dessine bien plus vite qu'un canvas.
      if (typeof createImageBitmap === 'function') createImageBitmap(cv).then((bmp) => this.puffs.set(color, bmp), () => {});
    }
    return img;
  }
}
