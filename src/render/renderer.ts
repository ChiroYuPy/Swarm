/**
 * Rendu Canvas 2D néon.
 * Performances :
 * - les entités nombreuses (ennemis, gemmes, balles, particules) sont des sprites pré-rendus avec leur
 *   lueur (ImageBitmap), dessinés groupés par texture : ~6x moins cher pour le GPU que des tracés épais ;
 * - les éléments rares (murs, boss, ondes, éclairs, orbites) restent vectoriels, lueur = trait large
 *   translucide en mode additif (jamais de shadowBlur) ;
 * - seules les entités visibles sont dessinées.
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
  /** temps réel en secondes (animations décoratives) */
  time: number;
  /** HUD affiché (masqué pendant la démo du menu) */
  hud: boolean;
  /** < 1 : caméra reculée (démo du menu, chute du héros au lancement) */
  zoom?: number;
  /** 0 → 1 : avancement de la chute du héros au lancement d'une partie */
  drop?: number;
  /** 0..1 : progression de l'animation de mort (assombrissement + GAME OVER) */
  deathFade: number;
}

/** Résolution dynamique : plancher, pas, et seuils (ms par image, moyenne glissante). */
const RES_MIN = 0.55;
const RES_STEP = 0.15;
const RES_SLOW_MS = 20;
const RES_FAST_MS = 17.5;

/** Owns the canvas and camera state (see RenderView) and orchestrates the draw order of a frame. */
export class Renderer extends RenderView {
  /** échelle sans le zoom de la caméra */
  private baseScale = 1;
  private resScale = 1;
  private frameAvg = 1000 / 60;
  private slowMs = 0;
  private fastMs = 0;
  /** temps fluide requis avant de remonter la résolution (doublé à chaque rechute) */
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

  /** Part de la résolution native utilisée (résolution dynamique), entre RES_MIN et 1. */
  get resolution(): number {
    return this.resScale;
  }

  /**
   * Résolution dynamique : quand les images ralentissent pendant une seconde (souvent la carte graphique,
   * débordée par les centaines d'ennemis à mélanger), on dessine en un peu moins de pixels ; on remonte
   * quand tout est redevenu fluide, de plus en plus prudemment si ça rechute.
   */
  adaptResolution(dtMs: number): void {
    if (dtMs <= 0 || dtMs > 100) return; // pause, onglet caché, saccade isolée : on ignore
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
    // Surface monde visible à peu près constante, quelle que soit la résolution.
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

    // Écran
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
      // Horloge : voile bleuté et bords sombres, qui s'estompent sur la dernière demi-seconde.
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
