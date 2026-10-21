/**
 * Sprites pré-rendus (lueur néon comprise) pour les entités nombreuses.
 * Dessiner une image est bien plus rapide pour le GPU que de tesseler des centaines de tracés épais.
 * Chaque sprite est rendu à SPRITE_RES pixels par unité monde puis converti en ImageBitmap.
 */
import { ENEMIES, type EnemyDef } from '../data/enemies';
import { ALL_WEAPONS } from '../data/weapons';
import { PICKUPS } from '../data/loot';
import { COLORS, FX_COLORS } from './palette';
import { drawPickupIcon, makeCanvas, mineShape, neon, type PickupIcon } from './icons';

export const SPRITE_RES = 2;

export interface Sprite {
  img: CanvasImageSource;
  /** taille en unités monde */
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

/** Crée un sprite centré de demi-taille `half` (unités monde). */
function make(half: number, paint: Painter): Sprite {
  const size = Math.ceil(half * 2 * SPRITE_RES);
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.scale(SPRITE_RES, SPRITE_RES);
  ctx.translate(half, half);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  paint(ctx);
  const sp: Sprite = { img: cv, w: half * 2, h: half * 2 };
  // Conversion asynchrone en ImageBitmap (texture immuable, la plus rapide à dessiner).
  if (typeof createImageBitmap === 'function') {
    createImageBitmap(cv).then(
      (bmp) => (sp.img = bmp),
      () => {},
    );
  }
  return sp;
}

/** Forme d'ennemi orientée vers +x (rotation appliquée au dessin). */
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
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      break;
    case 'box':
      ctx.rect(-r * 0.9, -r * 0.9, r * 1.8, r * 1.8);
      break;
    case 'trapeze':
      ctx.moveTo(-r * 1.1, r * 0.7);
      ctx.lineTo(r * 1.1, r * 0.7);
      ctx.lineTo(r * 0.6, -r * 0.8);
      ctx.lineTo(-r * 0.6, -r * 0.8);
      ctx.closePath();
      break;
  }
}

/** Dessine un ennemi (orienté vers +x) au style tube néon. */
export function paintEnemy(ctx: CanvasRenderingContext2D, d: EnemyDef, color: string): void {
  const r = d.radius;
  const lw = d.radius > 15 ? 2.6 : 2;
  {
    enemyShape(ctx, d);
    neon(ctx, color, lw, d.shape === 'dot' ? 0.45 : 0.14);
    if (d.behavior === 'prop') {
      // Caisse bonus : point d'interrogation façon bloc d'arcade
      ctx.beginPath();
      ctx.arc(0, -r * 0.25, r * 0.32, Math.PI, Math.PI * 0.35, false);
      ctx.quadraticCurveTo(0, r * 0.05, 0, r * 0.25);
      ctx.moveTo(0, r * 0.55);
      ctx.lineTo(0, r * 0.56);
      neon(ctx, color === '#ffffff' ? color : '#ffd23a', 2.4);
    }
    // Yeux, tournés vers l'avant
    if (r >= 9 && d.behavior !== 'prop') {
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

function enemySprite(d: EnemyDef, color: string): Sprite {
  return make(d.radius * 1.5 + 8, (ctx) => paintEnemy(ctx, d, color));
}

/** Petit canvas d'aperçu d'un ennemi pour l'interface (aide, bestiaire). */
export function enemyPreview(id: string, size: number): HTMLCanvasElement {
  const d = ENEMIES.find((e) => e.id === id)!;
  const [cv, ctx] = makeCanvas(size);
  const k = (size * 0.36) / (d.radius * 1.3);
  ctx.translate(size / 2, size / 2);
  ctx.scale(k, k);
  ctx.rotate(d.behavior === 'prop' ? 0 : -Math.PI / 2);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  paintEnemy(ctx, d, d.color);
  return cv;
}

export class SpriteBank {
  readonly enemy: Sprite[] = [];
  readonly enemyFlash: Sprite[] = [];
  readonly gem: Sprite[] = [];
  /** balle du joueur par arme, dessinée pour un rayon 6 (mise à l'échelle) */
  readonly bullet: Sprite[] = [];
  readonly enemyBullet: Sprite;
  readonly mine: Sprite;
  readonly miniMine: Sprite;
  readonly mineLight: Sprite;
  readonly boomerang: Sprite[] = [];
  /** objets ramassables, indexés par code PK_* */
  readonly pickup: Sprite[];
  /** particule ronde par couleur de FX_COLORS */
  readonly particle: Sprite[] = [];

  constructor() {
    for (const d of ENEMIES) {
      this.enemy.push(enemySprite(d, d.color));
      this.enemyFlash.push(enemySprite(d, '#ffffff'));
    }
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
    // Un sprite par objet, dans l'ordre des codes PK_* (data/loot.ts).
    this.pickup = PICKUPS.map((d) => {
      const size = d.kind === 'chest' ? 38 : 30;
      return make(size * 0.9, (ctx) => drawPickupIcon(ctx, d.id as PickupIcon, 0, 0, size));
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
    const crepe = (r: number): Painter => (ctx) => {
      ctx.beginPath();
      mineShape(ctx, 0, 0, r * 1.15);
      neon(ctx, '#ffb347', 2, 0.25);
    };
    this.mine = make(18, crepe(10));
    this.miniMine = make(14, crepe(7));
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
}
