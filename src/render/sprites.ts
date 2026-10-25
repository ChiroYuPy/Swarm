/**
 * Pre-rendered sprites (neon glow included) for the numerous entities.
 * Drawing an image is much faster for the GPU than tessellating hundreds of thick strokes.
 * Each sprite is rendered at SPRITE_RES pixels per world unit, then converted to an ImageBitmap.
 */
import { ENEMIES, type EnemyDef } from '../data/enemies';
import { ALL_WEAPONS } from '../data/weapons';
import { PICKUPS } from '../data/loot';
import { COLORS, FX_COLORS } from './palette';
import { drawPickupIcon, makeCanvas, mineShape, neon, type PickupIcon } from './icons';

export const SPRITE_RES = 2;

export interface Sprite {
  img: CanvasImageSource;
  /** size in world units */
  w: number;
  h: number;
}

type Painter = (ctx: CanvasRenderingContext2D) => void;

function glowStroke(ctx: CanvasRenderingContext2D, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = width * 3.2;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = width;
  ctx.stroke();
}

/**
 * Creates a centered sprite of half-size `half` (world units), then trims it to its visible pixels
 * (staying centered, so rotation stays exact): fewer pixels for the GPU to blend.
 */
function make(half: number, paint: Painter): Sprite {
  const size = Math.ceil(half * 2 * SPRITE_RES);
  let cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.scale(SPRITE_RES, SPRITE_RES);
  ctx.translate(half, half);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  paint(ctx);
  let hx = half;
  let hy = half;
  const trim = visibleHalfExtents(ctx, size);
  if (trim) {
    // +1 px margin for bilinear filtering
    const px = Math.min(size / 2, trim[0] + 1);
    const py = Math.min(size / 2, trim[1] + 1);
    if (px < size / 2 || py < size / 2) {
      const out = document.createElement('canvas');
      out.width = Math.ceil(px * 2);
      out.height = Math.ceil(py * 2);
      out.getContext('2d')!.drawImage(cv, out.width / 2 - size / 2, out.height / 2 - size / 2);
      cv = out;
      hx = out.width / 2 / SPRITE_RES;
      hy = out.height / 2 / SPRITE_RES;
    }
  }
  const sp: Sprite = { img: cv, w: hx * 2, h: hy * 2 };
  // Async conversion to ImageBitmap (immutable texture, the fastest to draw).
  if (typeof createImageBitmap === 'function') {
    createImageBitmap(cv).then(
      (bmp) => (sp.img = bmp),
      () => {},
    );
  }
  return sp;
}

/** Half-width and half-height (pixels, from the center) of what is actually visible. */
function visibleHalfExtents(ctx: CanvasRenderingContext2D, size: number): [number, number] | null {
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null;
  }
  const c = size / 2;
  let mx = 0;
  let my = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[(y * size + x) * 4 + 3] < 3) continue;
      const dx = Math.abs(x + 0.5 - c);
      const dy = Math.abs(y + 0.5 - c);
      if (dx > mx) mx = dx;
      if (dy > my) my = dy;
    }
  }
  return mx > 0 || my > 0 ? [Math.ceil(mx + 0.5), Math.ceil(my + 0.5)] : null;
}

/** Enemy shape facing +x (rotation is applied when drawing). */
function enemyShape(ctx: CanvasRenderingContext2D, d: EnemyDef): void {
  const r = d.radius;
  ctx.beginPath();
  switch (d.shape) {
    case 'triangle':
      ctx.moveTo(r * 1.25, 0);
      ctx.lineTo(-r * 0.8, r);
      ctx.lineTo(-r * 0.8, -r);
      ctx.closePath();
      break;
    case 'diamond':
      ctx.moveTo(r * 1.4, 0);
      ctx.lineTo(0, r * 0.8);
      ctx.lineTo(-r * 1.1, 0);
      ctx.lineTo(0, -r * 0.8);
      ctx.closePath();
      break;
    case 'square':
      ctx.rect(-r * 0.88, -r * 0.88, r * 1.76, r * 1.76);
      break;
    case 'pentagon':
      for (let k = 0; k < 5; k++) {
        const a = (k * Math.PI * 2) / 5;
        if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      break;
    case 'circle':
    case 'dot':
    case 'bomb':
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      break;
    case 'box':
      ctx.rect(-r * 0.9, -r * 0.9, r * 1.8, r * 1.8);
      break;
    case 'trapezoid':
      ctx.moveTo(-r * 1.1, r * 0.7);
      ctx.lineTo(r * 1.1, r * 0.7);
      ctx.lineTo(r * 0.6, -r * 0.8);
      ctx.lineTo(-r * 0.6, -r * 0.8);
      ctx.closePath();
      break;
    case 'octagon':
      polygon(ctx, 8, r, Math.PI / 8);
      break;
    case 'dart':
      ctx.moveTo(r * 1.3, 0);
      ctx.lineTo(-r * 0.9, r);
      ctx.lineTo(-r * 0.35, 0);
      ctx.lineTo(-r * 0.9, -r);
      ctx.closePath();
      break;
    case 'hexagon':
    case 'block':
      // Hexagon (the boss: a second, smaller one in the center; the wall: flat, to tile as a honeycomb).
      polygon(ctx, 6, r, d.shape === 'block' ? 0 : Math.PI / 6);
      if (d.shape === 'hexagon' && d.behavior === 'boss') polygon(ctx, 6, r * 0.5, 0);
      break;
    case 'star':
      for (let k = 0; k < 10; k++) {
        const a = (k * Math.PI) / 5 - Math.PI / 2;
        const rr = k & 1 ? r * 0.45 : r * 1.1;
        if (k === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      break;
    case 'eye':
      eyePath(ctx, 0, 0, r, 1, 0);
      ctx.moveTo(r * 0.75, 0);
      ctx.arc(r * 0.3, 0, r * 0.45, 0, Math.PI * 2);
      break;
    case 'queen':
      queenPath(ctx, 0, 0, r);
      break;
    case 'egg':
      ctx.ellipse(0, 0, r, r * 0.78, 0, 0, Math.PI * 2);
      break;
    default: {
      const unhandled: never = d.shape;
      throw new Error(`Unhandled enemy shape ${unhandled}`);
    }
  }
}

function polygon(ctx: CanvasRenderingContext2D, n: number, r: number, a0: number): void {
  for (let k = 0; k < n; k++) {
    const a = a0 + (k * Math.PI * 2) / n;
    if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

/** Almond-shaped eye oriented towards (fx, fy). */
export function eyePath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fx: number, fy: number): void {
  const ax = fx * r * 1.25;
  const ay = fy * r * 1.25;
  const nx = -fy * r * 1.1;
  const ny = fx * r * 1.1;
  ctx.moveTo(x - ax, y - ay);
  ctx.quadraticCurveTo(x + nx, y + ny, x + ax, y + ay);
  ctx.quadraticCurveTo(x - nx, y - ny, x - ax, y - ay);
  ctx.closePath();
}

/** Queen: a round body and a three-pointed crown (always upright). */
export function queenPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.moveTo(x + r * 0.85, y + r * 0.2);
  ctx.arc(x, y + r * 0.2, r * 0.85, 0, Math.PI * 2);
  ctx.moveTo(x - r * 0.7, y - r * 0.45);
  ctx.lineTo(x - r * 0.75, y - r * 1.2);
  ctx.lineTo(x - r * 0.35, y - r * 0.8);
  ctx.lineTo(x, y - r * 1.35);
  ctx.lineTo(x + r * 0.35, y - r * 0.8);
  ctx.lineTo(x + r * 0.75, y - r * 1.2);
  ctx.lineTo(x + r * 0.7, y - r * 0.45);
}

/** Always drawn upright, without eyes: crate, walls, eggs, Queen. */
const UPRIGHT = (d: EnemyDef) => d.behavior === 'prop' || d.behavior === 'wall' || d.behavior === 'egg' || d.shape === 'queen';

/** Draws an enemy (facing +x) in neon tube style. */
export function paintEnemy(ctx: CanvasRenderingContext2D, d: EnemyDef, color: string, halo = true): void {
  const r = d.radius;
  const lw = d.radius > 15 ? 2.6 : 2;
  {
    enemyShape(ctx, d);
    neon(ctx, color, lw, d.shape === 'dot' ? 0.45 : 0.14, halo);
    if (d.shape === 'bomb') {
      // Bomb: a cap and a fuse at the back (the spark is animated in draw-enemies.ts)
      ctx.beginPath();
      ctx.rect(-r * 1.22, -r * 0.28, r * 0.26, r * 0.56);
      ctx.moveTo(-r * 1.22, 0);
      ctx.quadraticCurveTo(-r * 1.6, r * 0.5, -r * 1.85, r * 0.2);
      neon(ctx, color === '#ffffff' ? color : '#ffd9a0', 1.6, 0, halo);
    }
    if (d.behavior === 'prop') {
      // Bonus crate: arcade-block style question mark
      ctx.beginPath();
      ctx.arc(0, -r * 0.25, r * 0.32, Math.PI, Math.PI * 0.35, false);
      ctx.quadraticCurveTo(0, r * 0.05, 0, r * 0.25);
      ctx.moveTo(0, r * 0.55);
      ctx.lineTo(0, r * 0.56);
      neon(ctx, color === '#ffffff' ? color : '#ffd23a', 2.4, 0, halo);
    }
    // Eyes, facing forward
    if (r >= 9 && !UPRIGHT(d) && d.shape !== 'eye') {
      ctx.beginPath();
      const er = r * 0.16;
      ctx.arc(r * 0.3, r * 0.32, er, 0, Math.PI * 2);
      ctx.moveTo(r * 0.3 + er, -r * 0.32);
      ctx.arc(r * 0.3, -r * 0.32, er, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function enemySprite(d: EnemyDef, color: string, halo: boolean): Sprite {
  return make(d.radius * 1.5 + 8, (ctx) => paintEnemy(ctx, d, color, halo));
}

/** Small enemy preview canvas for the UI (help, codex). */
export function enemyPreview(id: string, size: number): HTMLCanvasElement {
  const d = ENEMIES.find((e) => e.id === id)!;
  const [cv, ctx] = makeCanvas(size);
  const k = (size * 0.36) / (d.radius * 1.3);
  ctx.translate(size / 2, size / 2);
  ctx.scale(k, k);
  ctx.rotate(UPRIGHT(d) ? 0 : -Math.PI / 2);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  paintEnemy(ctx, d, d.color);
  return cv;
}

export class SpriteBank {
  enemy: Sprite[] = [];
  enemyFlash: Sprite[] = [];
  readonly gem: Sprite[] = [];
  /** player bullet per weapon, drawn for radius 6 (scaled) */
  readonly bullet: Sprite[] = [];
  readonly enemyBullet: Sprite;
  /** Shooter bullet, destructible */
  readonly breakableBullet: Sprite;
  readonly mine: Sprite;
  readonly miniMine: Sprite;
  readonly mineLight: Sprite;
  readonly boomerang: Sprite[] = [];
  /** pickups, indexed by PK_* code */
  readonly pickup: Sprite[];
  /** round particle per FX_COLORS color */
  readonly particle: Sprite[] = [];

  private enemyHalo = true;

  constructor() {
    this.buildEnemies();
    const sizes = [4.5, 5.5, 7, 9];
    for (let t = 0; t < 4; t++) {
      const r = sizes[t];
      this.gem.push(
        make(r + 6, (ctx) => {
          ctx.beginPath();
          ctx.moveTo(0, -r);
          ctx.lineTo(r * 0.7, 0);
          ctx.lineTo(0, r);
          ctx.lineTo(-r * 0.7, 0);
          ctx.closePath();
          ctx.fillStyle = COLORS.gem[t];
          ctx.globalAlpha = 0.9;
          ctx.fill();
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = COLORS.gem[t];
          ctx.lineWidth = 4;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }),
      );
    }
    for (const w of ALL_WEAPONS) {
      this.bullet.push(
        make(16, (ctx) => {
          ctx.beginPath();
          ctx.moveTo(-9, 0);
          ctx.lineTo(4, 0);
          glowStroke(ctx, w.color, 5);
          ctx.beginPath();
          ctx.moveTo(-5, 0);
          ctx.lineTo(4, 0);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }),
      );
      this.boomerang.push(
        make(22, (ctx) => {
          ctx.beginPath();
          ctx.moveTo(12, -3);
          ctx.lineTo(0, 0);
          ctx.lineTo(-4, 12);
          glowStroke(ctx, w.color, 3);
        }),
      );
    }
    // One sprite per pickup, in PK_* code order (data/loot.ts).
    this.pickup = PICKUPS.map((d) => {
      const size = d.kind === 'chest' ? 38 : 30;
      return make(size * 0.9, (ctx) => drawPickupIcon(ctx, d.id as PickupIcon, 0, 0, size));
    });
    this.breakableBullet = make(14, (ctx) => {
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#c46bff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#e2b8ff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    });
    this.enemyBullet = make(12, (ctx) => {
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.enemyBullet;
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = COLORS.enemyBullet;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    });
    const minePainter = (r: number): Painter => (ctx) => {
      ctx.beginPath();
      mineShape(ctx, 0, 0, r * 1.15);
      neon(ctx, '#ffb347', 2, 0.25);
    };
    this.mine = make(18, minePainter(10));
    this.miniMine = make(14, minePainter(7));
    this.mineLight = make(6, (ctx) => {
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff3b3b';
      ctx.fill();
    });
    for (const c of FX_COLORS) {
      this.particle.push(
        make(6, (ctx) => {
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fillStyle = c;
          ctx.globalAlpha = 0.3;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
          ctx.globalAlpha = 1;
          ctx.fill();
        }),
      );
    }
  }

  /** Without halo (low quality): enemies, very numerous, cost far fewer pixels. */
  setEnemyHalo(halo: boolean): void {
    if (halo === this.enemyHalo) return;
    this.enemyHalo = halo;
    this.buildEnemies();
  }

  private buildEnemies(): void {
    this.enemy = ENEMIES.map((d) => enemySprite(d, d.color, this.enemyHalo));
    this.enemyFlash = ENEMIES.map((d) => enemySprite(d, '#ffffff', this.enemyHalo));
  }
}
