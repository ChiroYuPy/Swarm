/**
 * Neon Canvas 2D rendering.
 * Performance:
 * - numerous entities (enemies, gems, bullets, particles) are sprites pre-rendered with their glow
 *   (ImageBitmap), drawn batched by texture: ~6x cheaper for the GPU than thick strokes;
 * - rare elements (walls, bosses, rings, lightning, orbits) stay vector, glow = wide translucent
 *   stroke in additive mode (never shadowBlur);
 * - only visible entities are drawn.
 */
import type { GameState } from '../sim';
import { COLORS } from './palette';
import type { Effects } from './effects';
import { drawHud, type HudOptions } from './hud';
import { RenderView, lerp } from './view';
import { drawMap, drawGems, drawPickups } from './draw-world';
import { drawEnemies } from './draw-enemies';
import { drawProjectiles } from './draw-projectiles';
import { drawWeaponFx } from './draw-weapon-fx';
import { drawPlayer, drawDrop } from './draw-player';
import { drawFx, drawTexts, drawIndicators } from './draw-fx';
import { drawGameOver, drawSpeedLines } from './draw-screen';

export interface RenderOptions extends HudOptions {
  quality: 'high' | 'low';
  /** real time in seconds (decorative animations) */
  time: number;
  /** HUD shown (hidden during the menu demo) */
  hud: boolean;
  /** < 1: camera pulled back (menu demo, hero's fall at run start) */
  zoom?: number;
  /** 0 → 1: progress of the hero's fall at the start of a run */
  drop?: number;
  /** 0..1: progress of the death animation (darkening + GAME OVER) */
  deathFade: number;
}

/** Dynamic resolution: floor, step, and thresholds (ms per frame, moving average). */
const RES_MIN = 0.55;
const RES_STEP = 0.15;
const RES_SLOW_MS = 20;
const RES_FAST_MS = 17.5;

/** Owns the canvas and camera state (see RenderView) and orchestrates the draw order of a frame. */
export class Renderer extends RenderView {
  /** scale without the camera zoom */
  private baseScale = 1;
  private resScale = 1;
  private frameAvg = 1000 / 60;
  private slowMs = 0;
  private fastMs = 0;
  /** smooth time required before raising the resolution again (doubled on each relapse) */
  private raiseAfterMs = 4000;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.resize();
  }

  setQuality(q: 'high' | 'low'): void {
    this.quality = q;
    this.sprites.setEnemyHalo(q === 'high');
    this.resize();
  }

  /** Fraction of the native resolution in use (dynamic resolution), between RES_MIN and 1. */
  get resolution(): number {
    return this.resScale;
  }

  /**
   * Dynamic resolution: when frames slow down for a second (often the GPU, overwhelmed by the
   * hundreds of enemies to blend), draw with slightly fewer pixels; go back up once everything
   * is smooth again, more and more cautiously if it keeps relapsing.
   */
  adaptResolution(dtMs: number): void {
    if (dtMs <= 0 || dtMs > 100) return; // pause, hidden tab, isolated hitch: ignored
    this.frameAvg += (dtMs - this.frameAvg) * 0.1;
    if (this.frameAvg > RES_SLOW_MS) {
      this.slowMs += dtMs;
      this.fastMs = 0;
    } else if (this.frameAvg < RES_FAST_MS) {
      this.fastMs += dtMs;
      this.slowMs = 0;
    } else {
      this.slowMs = this.fastMs = 0;
    }
    if (this.slowMs > 1000 && this.resScale > RES_MIN) {
      this.setResScale(this.resScale - RES_STEP);
      this.raiseAfterMs = Math.min(60000, this.raiseAfterMs * 2);
    } else if (this.fastMs > this.raiseAfterMs && this.resScale < 1) {
      this.setResScale(this.resScale + RES_STEP);
    }
  }

  private setResScale(k: number): void {
    this.resScale = Math.max(RES_MIN, Math.min(1, Math.round(k * 100) / 100));
    this.slowMs = this.fastMs = 0;
    this.frameAvg = 1000 / 60;
    this.resize();
  }

  resize(): void {
    const maxDpr = this.quality === 'low' ? 1 : 2;
    this.dpr = Math.min(maxDpr, window.devicePixelRatio || 1) * this.resScale;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.cw = Math.floor(w * this.dpr);
    this.ch = Math.floor(h * this.dpr);
    this.canvas.width = this.cw;
    this.canvas.height = this.ch;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // Roughly constant visible world area, whatever the resolution.
    this.scale = this.baseScale = Math.min(this.cw / 1400, this.ch / 860);
  }

  render(s: GameState, alpha: number, fx: Effects, opt: RenderOptions): void {
    const ctx = this.ctx;
    const p = s.players[0];
    const shake = fx.shakeOffset();
    this.scale = this.baseScale * (opt.zoom ?? 1);
    this.camX = lerp(p.px, p.x, alpha) + shake.x;
    this.camY = lerp(p.py, p.y, alpha) + shake.y;
    const sc = this.scale;
    const halfW = this.cw / 2 / sc;
    const halfH = this.ch / 2 / sc;
    this.viewX0 = this.camX - halfW - 40;
    this.viewX1 = this.camX + halfW + 40;
    this.viewY0 = this.camY - halfH - 40;
    this.viewY1 = this.camY + halfH + 40;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.cw, this.ch);
    ctx.setTransform(sc, 0, 0, sc, this.cw / 2 - this.camX * sc, this.ch / 2 - this.camY * sc);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    drawMap(this, s);
    ctx.globalCompositeOperation = 'lighter';
    drawPickups(this, s, opt.time);
    drawGems(this, s, alpha);
    const falling = opt.drop !== undefined;
    if (!falling) drawWeaponFx(this, s, alpha, true);
    drawProjectiles(this, s, alpha);
    drawEnemies(this, s, alpha, opt.time);
    if (!falling) drawWeaponFx(this, s, alpha, false);
    if (falling) drawDrop(this, s, opt.drop!, opt.zoom ?? 1, opt.time);
    else drawPlayer(this, s, alpha, opt.time);
    drawFx(this, fx);
    ctx.globalCompositeOperation = 'source-over';
    drawTexts(this, fx);
    drawIndicators(this, s);

    // Screen
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.cw / this.dpr;
    const H = this.ch / this.dpr;
    const hpRatio = p.hp / p.stats.maxHp;
    if (p.alive && (hpRatio < 0.3 || fx.hurtFlash > 0)) {
      const k = Math.max(fx.hurtFlash * 2.4, hpRatio < 0.3 ? (0.3 - hpRatio) * 2 * (0.75 + 0.25 * Math.sin(opt.time * 6)) : 0);
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(255,0,60,0)');
      g.addColorStop(1, `rgba(255,0,60,${Math.min(0.4, k)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (s.clockUntil > s.tick) {
      // Clock: bluish veil and dark edges, fading out over the last half second.
      const k = Math.min(1, (s.clockUntil - s.tick) / 30);
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, `rgba(110, 140, 255, ${0.05 * k})`);
      g.addColorStop(1, `rgba(60, 80, 220, ${0.32 * k})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (fx.flash > 0) {
      ctx.globalAlpha = Math.min(0.5, fx.flash);
      ctx.fillStyle = fx.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (opt.drop !== undefined) drawSpeedLines(this, W, H, opt.drop, opt.time);
    if (opt.hud) drawHud(ctx, s, W, H, opt);
    if (opt.deathFade > 0) drawGameOver(this, s, W, H, opt.deathFade, opt.time);
  }
}
