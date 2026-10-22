/**
 * Rendu Canvas 2D néon.
 * Performances :
 * - les entités nombreuses (ennemis, gemmes, balles, particules) sont des sprites pré-rendus avec leur
 *   lueur (ImageBitmap), dessinés groupés par texture : ~6x moins cher pour le GPU que des tracés épais ;
 * - les éléments rares (murs, boss, ondes, éclairs, orbites) restent vectoriels, lueur = trait large
 *   translucide en mode additif (jamais de shadowBlur) ;
 * - seules les entités visibles sont dessinées.
 */
import { ENEMIES, BOSS } from '../data/enemies';
import { ALL_WEAPONS } from '../data/weapons';
import { PICKUPS } from '../data/loot';
import {
  CHUNK,
  DT,
  OB_CIRCLE,
  OB_HEX,
  EF_BOSS,
  PJ_BULLET,
  PJ_EBULLET,
  PJ_MINE,
  PJ_BOOMERANG,
  PJ_RING,
  PK_CHEST,
  MAX_ENEMIES,
  TICK_RATE,
  weaponDef,
  weaponLevel,
  type GameState,
  type Enemy,
  type Obstacle,
  type Player,
} from '../sim';
import { COLORS, FX_COLORS, OBSTACLE_TINTS } from './palette';
import type { Effects } from './effects';
import { drawHud, formatTime, glowText, FONT, type HudOptions } from './hud';
import { neon } from './icons';
import { SpriteBank, type Sprite } from './sprites';

export interface RenderOptions extends HudOptions {
  quality: 'high' | 'low';
  /** temps réel en secondes (animations décoratives) */
  time: number;
  /** HUD affiché (masqué pendant la démo du menu) */
  hud: boolean;
  /** 0..1 : progression de l'animation de mort (assombrissement + GAME OVER) */
  deathFade: number;
}

const ENEMY_KAMIKAZE = ENEMIES.findIndex((e) => e.behavior === 'kamikaze');
const KAMIKAZE_BLAST = ENEMIES[ENEMY_KAMIKAZE]?.blastRadius ?? 80;
const NUM_TYPES = ENEMIES.length;
const ENEMY_BLINKER = ENEMIES.findIndex((e) => e.behavior === 'blinker');
const ENEMY_LEADER = ENEMIES.findIndex((e) => e.behavior === 'leader');
const BLINK_DEF = ENEMIES[ENEMY_BLINKER];
const BLINK_FUSE = Math.round((BLINK_DEF?.fuse ?? 1) * TICK_RATE);
const LEADER_DEF = ENEMIES[ENEMY_LEADER];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  dpr = 1;
  cw = 0;
  ch = 0;
  scale = 1;
  camX = 0;
  camY = 0;
  private quality: 'high' | 'low' = 'high';
  private readonly buckets: Int32Array[] = [];
  private readonly bucketN = new Int32Array(NUM_TYPES);
  private readonly weaponSeen = new Uint8Array(ALL_WEAPONS.length);
  private viewX0 = 0;
  private viewX1 = 0;
  private viewY0 = 0;
  private viewY1 = 0;
  private readonly sprites = new SpriteBank();

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D indisponible');
    this.ctx = ctx;
    for (let t = 0; t < NUM_TYPES; t++) this.buckets.push(new Int32Array(MAX_ENEMIES));
    this.resize();
  }

  /** Transformation monde -> écran (caméra). */
  private worldTransform(): void {
    const sc = this.scale;
    this.ctx.setTransform(sc, 0, 0, sc, this.cw / 2 - this.camX * sc, this.ch / 2 - this.camY * sc);
  }

  /** Sprite non orienté : réutilise la transformation monde courante (pas de setTransform). */
  private spriteAt(sp: Sprite, x: number, y: number, scale = 1): void {
    const w = sp.w * scale;
    const h = sp.h * scale;
    this.ctx.drawImage(sp.img, x - w / 2, y - h / 2, w, h);
  }

  /** Dessine un sprite centré en (x, y), orienté selon le vecteur unitaire (dx, dy). */
  private sprite(sp: Sprite, x: number, y: number, dx: number, dy: number, scale = 1): void {
    const sc = this.scale;
    const X = this.cw / 2 + (x - this.camX) * sc;
    const Y = this.ch / 2 + (y - this.camY) * sc;
    this.ctx.setTransform(sc * dx, sc * dy, -sc * dy, sc * dx, X, Y);
    const w = sp.w * scale;
    const h = sp.h * scale;
    this.ctx.drawImage(sp.img, -w / 2, -h / 2, w, h);
  }

  setQuality(q: 'high' | 'low'): void {
    this.quality = q;
    this.resize();
  }

  resize(): void {
    const maxDpr = this.quality === 'low' ? 1 : 2;
    this.dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.cw = Math.floor(w * this.dpr);
    this.ch = Math.floor(h * this.dpr);
    this.canvas.width = this.cw;
    this.canvas.height = this.ch;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // Surface monde visible à peu près constante, quelle que soit la résolution.
    this.scale = Math.min(this.cw / 1400, this.ch / 860);
  }

  /** Lueur néon : trait large translucide puis trait fin. */
  private glow(color: string, width: number): void {
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

  private visible(x: number, y: number, r: number): boolean {
    return x + r > this.viewX0 && x - r < this.viewX1 && y + r > this.viewY0 && y - r < this.viewY1;
  }

  render(s: GameState, alpha: number, fx: Effects, opt: RenderOptions): void {
    const ctx = this.ctx;
    const p = s.players[0];
    const shake = fx.shakeOffset();
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

    this.drawMap(s);
    ctx.globalCompositeOperation = 'lighter';
    this.drawPickups(s, opt.time);
    this.drawGems(s, alpha);
    this.drawWeaponFx(s, alpha, true);
    this.drawProjectiles(s, alpha);
    this.drawEnemies(s, alpha, opt.time);
    this.drawWeaponFx(s, alpha, false);
    this.drawPlayer(s, alpha, opt.time);
    this.drawFx(fx);
    ctx.globalCompositeOperation = 'source-over';
    this.drawTexts(fx);
    this.drawIndicators(s);

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
    if (opt.hud) drawHud(ctx, s, W, H, opt);
    if (opt.deathFade > 0) this.drawGameOver(s, W, H, opt.deathFade, opt.time);
  }

  /** Fin de partie : l'écran s'assombrit proprement et un GAME OVER s'allume. */
  private drawGameOver(s: GameState, W: number, H: number, f: number, time: number): void {
    const ctx = this.ctx;
    const e = f * f * (3 - 2 * f);
    ctx.fillStyle = `rgba(7,6,15,${0.8 * e})`;
    ctx.fillRect(0, 0, W, H);
    // Lignes de balayage CRT
    const t = Math.max(0, (f - 0.25) / 0.75);
    if (t <= 0) return;
    // Allumage façon néon : quelques clignotements avant de rester allumé.
    const on = t > 0.45 || Math.floor(time * 18) % 3 !== 0;
    if (!on) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = Math.round(Math.min(88, W / 9));
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.globalAlpha = Math.min(1, t * 2);
    glowText(ctx, 'GAME OVER', W / 2, H / 2 - 10, COLORS.hp, '#ffe3ec');
    ctx.font = `600 20px ${FONT}`;
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`Tenu ${formatTime(s.tick / 60)}`, W / 2, H / 2 + size * 0.75 + 10);
    ctx.globalAlpha = 1;
  }

  /** Fond (points discrets, pas de cases) + obstacles néon des morceaux visibles. */
  private drawMap(s: GameState): void {
    const ctx = this.ctx;
    const step = 96;
    const x0 = Math.floor(this.viewX0 / step) * step;
    const y0 = Math.floor(this.viewY0 / step) * step;
    ctx.fillStyle = COLORS.grid;
    for (let y = y0; y <= this.viewY1; y += step) for (let x = x0; x <= this.viewX1; x += step) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);

    const cx0 = Math.floor(this.viewX0 / CHUNK);
    const cy0 = Math.floor(this.viewY0 / CHUNK);
    const cx1 = Math.floor(this.viewX1 / CHUNK);
    const cy1 = Math.floor(this.viewY1 / CHUNK);
    // Deux passes : remplissages sombres, puis contours néon groupés par teinte.
    for (let pass = 0; pass < 4; pass++) {
      ctx.beginPath();
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const list = s.map.chunk(cx, cy);
          for (const o of list) {
            if (pass > 0 && o.tint !== pass - 1) continue;
            if (!this.visible(o.x, o.y, o.r + 10)) continue;
            this.obstaclePath(o);
          }
        }
      }
      if (pass === 0) {
        ctx.fillStyle = COLORS.wallFill;
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
      } else {
        this.glow(OBSTACLE_TINTS[pass - 1], 2.5);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private obstaclePath(o: Obstacle): void {
    const ctx = this.ctx;
    if (o.kind === OB_CIRCLE) {
      ctx.moveTo(o.x + o.r, o.y);
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    } else if (o.kind === OB_HEX) {
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        const ca = Math.cos(a) * o.ca - Math.sin(a) * o.sa;
        const sa = Math.sin(a) * o.ca + Math.cos(a) * o.sa;
        if (k === 0) ctx.moveTo(o.x + ca * o.r, o.y + sa * o.r);
        else ctx.lineTo(o.x + ca * o.r, o.y + sa * o.r);
      }
      ctx.closePath();
    } else {
      const ax = o.ca * o.hw;
      const ay = o.sa * o.hw;
      const bx = -o.sa * o.hh;
      const by = o.ca * o.hh;
      ctx.moveTo(o.x + ax + bx, o.y + ay + by);
      ctx.lineTo(o.x - ax + bx, o.y - ay + by);
      ctx.lineTo(o.x - ax - bx, o.y - ay - by);
      ctx.lineTo(o.x + ax - bx, o.y + ay - by);
      ctx.closePath();
    }
  }

  private drawGems(s: GameState, alpha: number): void {
    for (let tier = 0; tier < 4; tier++) {
      const sp = this.sprites.gem[tier];
      for (let i = 0; i < s.gemCount; i++) {
        const g = s.gems[i];
        if (g.tier !== tier) continue;
        const x = lerp(g.px, g.x, alpha);
        const y = lerp(g.py, g.y, alpha);
        if (!this.visible(x, y, 10)) continue;
        this.spriteAt(sp, x, y);
      }
    }
  }

  private drawPickups(s: GameState, time: number): void {
    const ctx = this.ctx;
    const sp = this.sprites.pickup;
    for (let i = 0; i < s.pickupCount; i++) {
      const it = s.pickups[i];
      if (!this.visible(it.x, it.y, 60)) continue;
      // Clignote pendant ses 5 dernières secondes.
      if (it.life > 0 && it.life < 300 && Math.floor(time * 8) % 2 === 0) continue;
      const def = PICKUPS[it.kind];
      const chest = it.kind === PK_CHEST;
      const y = it.y + Math.sin(time * 3 + i) * 3;
      // Halo au sol qui pulse : les objets se repèrent d'un coup d'œil.
      const R = (chest ? 34 : 22) + Math.sin(time * 4 + i) * 3;
      ctx.beginPath();
      ctx.arc(it.x, it.y, R, 0, Math.PI * 2);
      ctx.globalAlpha = chest ? 0.35 : 0.25;
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      this.spriteAt(sp[it.kind], it.x, y, chest ? 1 + Math.sin(time * 5) * 0.06 : 1);
    }
  }

  private enemyPath(e: Enemy, type: number, x: number, y: number, time: number): void {
    const ctx = this.ctx;
    const r = e.r;
    const fx = e.vx || 1;
    const fy = e.vy || 0;
    switch (ENEMIES[type].shape) {
      case 'triangle': {
        const ax = fx * r * 1.25;
        const ay = fy * r * 1.25;
        const bx = -fx * r * 0.8;
        const by = -fy * r * 0.8;
        ctx.moveTo(x + ax, y + ay);
        ctx.lineTo(x + bx - fy * r, y + by + fx * r);
        ctx.lineTo(x + bx + fy * r, y + by - fx * r);
        ctx.closePath();
        break;
      }
      case 'diamond': {
        ctx.moveTo(x + fx * r * 1.4, y + fy * r * 1.4);
        ctx.lineTo(x - fy * r * 0.8, y + fx * r * 0.8);
        ctx.lineTo(x - fx * r * 1.1, y - fy * r * 1.1);
        ctx.lineTo(x + fy * r * 0.8, y - fx * r * 0.8);
        ctx.closePath();
        break;
      }
      case 'square': {
        const h = r * 0.88;
        const c = fx * h;
        const sn = fy * h;
        ctx.moveTo(x + c - sn, y + sn + c);
        ctx.lineTo(x - c - sn, y - sn + c);
        ctx.lineTo(x - c + sn, y - sn - c);
        ctx.lineTo(x + c + sn, y + sn - c);
        ctx.closePath();
        break;
      }
      case 'pentagon': {
        const a0 = time * 1.5 + e.id;
        for (let k = 0; k < 5; k++) {
          const a = a0 + (k * Math.PI * 2) / 5;
          const px = x + Math.cos(a) * r;
          const py = y + Math.sin(a) * r;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;
      }
      case 'circle':
      case 'dot':
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
        break;
      case 'box':
        ctx.rect(x - r * 0.75, y - r, r * 1.5, r * 2);
        ctx.rect(x - r * 0.5, y - r * 0.75, r, r * 0.8);
        ctx.moveTo(x + r * 0.2, y + r * 0.4);
        ctx.lineTo(x + r * 0.45, y + r * 0.4);
        break;
      case 'trapeze': {
        ctx.moveTo(x - r * 1.1, y + r * 0.7);
        ctx.lineTo(x + r * 1.1, y + r * 0.7);
        ctx.lineTo(x + r * 0.6, y - r * 0.8);
        ctx.lineTo(x - r * 0.6, y - r * 0.8);
        ctx.closePath();
        // moustache de tonton
        ctx.moveTo(x - r * 0.5, y + r * 0.2);
        ctx.quadraticCurveTo(x - r * 0.25, y + r * 0.05, x, y + r * 0.2);
        ctx.quadraticCurveTo(x + r * 0.25, y + r * 0.05, x + r * 0.5, y + r * 0.2);
        break;
      }
    }
  }

  /** Meneurs : leur zone (pointillés), et une traînée derrière chaque ennemi qu'ils accélèrent. */
  private drawLeaders(s: GameState, alpha: number, time: number): void {
    if (ENEMY_LEADER < 0) return;
    const ctx = this.ctx;
    const tick = s.tick;
    const color = LEADER_DEF.color;
    const R = LEADER_DEF.auraRadius ?? 170;
    let zones = false;
    let trails = false;
    ctx.beginPath();
    for (let i = 0; i < s.enemyCount; i++) {
      const e = s.enemies[i];
      if (!e.alive || e.type !== ENEMY_LEADER || e.frozenUntil > tick) continue;
      const x = lerp(e.px, e.x, alpha);
      const y = lerp(e.py, e.y, alpha);
      if (!this.visible(x, y, R)) continue;
      ctx.moveTo(x + R, y);
      ctx.arc(x, y, R, 0, Math.PI * 2);
      zones = true;
    }
    if (zones) {
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 10]);
      ctx.lineDashOffset = -time * 20;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    for (let i = 0; i < s.enemyCount; i++) {
      const e = s.enemies[i];
      if (!e.alive || e.boostUntil <= tick) continue;
      const x = lerp(e.px, e.x, alpha);
      const y = lerp(e.py, e.y, alpha);
      if (!this.visible(x, y, e.r * 3)) continue;
      // Deux traits de vitesse derrière lui.
      const fx = e.vx || 1;
      const fy = e.vy || 0;
      const nx = -fy * e.r * 0.5;
      const ny = fx * e.r * 0.5;
      const bx = x - fx * e.r * 1.2;
      const by = y - fy * e.r * 1.2;
      const L = e.r * 1.3;
      ctx.moveTo(bx + nx, by + ny);
      ctx.lineTo(bx + nx - fx * L, by + ny - fy * L);
      ctx.moveTo(bx - nx, by - ny);
      ctx.lineTo(bx - nx - fx * L, by - ny - fy * L);
      trails = true;
    }
    if (trails) {
      ctx.globalAlpha = 0.75;
      this.glow(color, 1.6);
      ctx.globalAlpha = 1;
    }
  }

  /** Téléporteurs : cercle d'impact au sol qui se remplit, relié au téléporteur. */
  private drawBlinks(s: GameState, alpha: number): void {
    if (ENEMY_BLINKER < 0) return;
    const ctx = this.ctx;
    const color = BLINK_DEF.color;
    const R = BLINK_DEF.blastRadius ?? 52;
    for (let i = 0; i < s.enemyCount; i++) {
      const e = s.enemies[i];
      if (!e.alive || e.type !== ENEMY_BLINKER || e.ai !== 1) continue;
      const tx = e.aux;
      const ty = e.aux2;
      if (!this.visible(tx, ty, R)) continue;
      const prog = Math.min(1, Math.max(0, 1 - e.timer / BLINK_FUSE));
      const x = lerp(e.px, e.x, alpha);
      const y = lerp(e.py, e.y, alpha);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(tx, ty);
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 9]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(tx, ty, R * prog, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.18 + 0.12 * prog;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tx, ty, R, 0, Math.PI * 2);
      ctx.globalAlpha = 0.5 + 0.4 * prog;
      this.glow(color, 2);
      ctx.globalAlpha = 1;
    }
  }

  private drawEnemies(s: GameState, alpha: number, time: number): void {
    const ctx = this.ctx;
    const n = this.bucketN;
    n.fill(0);
    const tick = s.tick;
    let boss: Enemy | null = null;
    let frozenCount = 0;
    for (let i = 0; i < s.enemyCount; i++) {
      const e = s.enemies[i];
      if (!e.alive) continue;
      const x = lerp(e.px, e.x, alpha);
      const y = lerp(e.py, e.y, alpha);
      if (!this.visible(x, y, e.r * 1.5)) continue;
      if (e.flags & EF_BOSS) {
        boss = e;
        continue;
      }
      if (e.frozenUntil > tick) frozenCount++;
      this.buckets[e.type][n[e.type]++] = i;
    }
    // Sprites, groupés par type puis par variante (normal / flash) pour limiter les changements de texture.
    for (let t = 0; t < NUM_TYPES; t++) {
      const cnt = n[t];
      if (!cnt) continue;
      const list = this.buckets[t];
      const rotates = ENEMIES[t].shape !== 'box' && ENEMIES[t].shape !== 'dot';
      for (let pass = 0; pass < 2; pass++) {
        const sp = pass === 0 ? this.sprites.enemy[t] : this.sprites.enemyFlash[t];
        if (!rotates) this.worldTransform();
        for (let k = 0; k < cnt; k++) {
          const e = s.enemies[list[k]];
          const flash =
            e.frozenUntil > tick || tick - e.hitTick < 5 || ((t === ENEMY_KAMIKAZE || t === ENEMY_BLINKER) && e.ai === 1 && ((tick >> 2) & 1) === 1);
          if (flash !== (pass === 1)) continue;
          const x = lerp(e.px, e.x, alpha);
          const y = lerp(e.py, e.y, alpha);
          if (rotates) this.sprite(sp, x, y, e.vx || 1, e.vy || 0);
          else this.spriteAt(sp, x, y);
        }
      }
    }
    this.worldTransform();

    // Gelés : une coque de glace autour du sprite blanc, qui clignote juste avant de fondre.
    if (frozenCount > 0) {
      ctx.beginPath();
      for (let i = 0; i < s.enemyCount; i++) {
        const e = s.enemies[i];
        if (!e.alive || e.frozenUntil <= tick || (e.frozenUntil - tick < 40 && (tick >> 2) & 1)) continue;
        if (!this.visible(e.x, e.y, e.r * 1.5)) continue;
        const r = e.r * 1.3;
        ctx.moveTo(e.x + r, e.y);
        for (let k = 1; k <= 6; k++) ctx.lineTo(e.x + Math.cos((k * Math.PI) / 3) * r, e.y + Math.sin((k * Math.PI) / 3) * r);
      }
      ctx.globalAlpha = 0.8;
      this.glow('#9feaff', 1.6);
      ctx.globalAlpha = 1;
    }

    this.drawLeaders(s, alpha, time);
    this.drawBlinks(s, alpha);

    // Zone d'explosion des bulles prêtes à éclater
    if (ENEMY_KAMIKAZE >= 0 && n[ENEMY_KAMIKAZE] > 0) {
      ctx.beginPath();
      let fusing = false;
      const list = this.buckets[ENEMY_KAMIKAZE];
      for (let k = 0; k < n[ENEMY_KAMIKAZE]; k++) {
        const e = s.enemies[list[k]];
        if (e.ai !== 1) continue;
        const x = lerp(e.px, e.x, alpha);
        const y = lerp(e.py, e.y, alpha);
        ctx.moveTo(x + KAMIKAZE_BLAST, y);
        ctx.arc(x, y, KAMIKAZE_BLAST, 0, Math.PI * 2);
        fusing = true;
      }
      if (fusing) {
        ctx.globalAlpha = 0.35 + 0.25 * ((tick >> 2) & 1);
        ctx.strokeStyle = '#ff2b2b';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    }

    // Boss : vectoriel (un seul), avec moustache, yeux et ligne d'avertissement de charge.
    if (boss) {
      const x = lerp(boss.px, boss.x, alpha);
      const y = lerp(boss.py, boss.y, alpha);
      ctx.beginPath();
      this.enemyPath(boss, boss.type, x, y, time);
      this.glow(tick - boss.hitTick < 4 ? '#ffffff' : ENEMIES[boss.type].color, 3.5);
      ctx.beginPath();
      const fx = boss.vx || 1;
      const fy = boss.vy || 0;
      const er = boss.r * 0.12;
      for (const side of [-1, 1]) {
        const ex = x + side * boss.r * 0.3 + fx * boss.r * 0.08;
        const ey = y - boss.r * 0.3 + fy * boss.r * 0.08;
        ctx.moveTo(ex + er, ey);
        ctx.arc(ex, ey, er, 0, Math.PI * 2);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      const ph = BOSS.pattern[boss.ai];
      if (ph && ph.kind === 'charge') {
        const total = Math.round(ph.duration * 60);
        const elapsed = total - boss.timer;
        if (elapsed < BOSS.chargeTelegraph * 60) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(boss.aux) * 1100, y + Math.sin(boss.aux) * 1100);
          ctx.setLineDash([24, 14]);
          ctx.strokeStyle = '#ff2b2b';
          ctx.lineWidth = boss.r * 1.6;
          ctx.globalAlpha = 0.12 + 0.1 * Math.sin(time * 30);
          ctx.stroke();
          ctx.globalAlpha = 0.9;
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  private drawProjectiles(s: GameState, alpha: number): void {
    const ctx = this.ctx;
    const sp = this.sprites;
    // Balles du joueur : groupées par arme (une texture par arme).
    const seen = this.weaponSeen;
    seen.fill(0);
    for (let i = 0; i < s.projCount; i++) {
      const b = s.projectiles[i];
      if (b.kind === PJ_BULLET) seen[b.weapon] = 1;
    }
    for (let w = 0; w < seen.length; w++) {
      if (!seen[w]) continue;
      const img = sp.bullet[w];
      for (let i = 0; i < s.projCount; i++) {
        const b = s.projectiles[i];
        if (b.kind !== PJ_BULLET || b.weapon !== w) continue;
        const x = lerp(b.px, b.x, alpha);
        const y = lerp(b.py, b.y, alpha);
        if (!this.visible(x, y, 20)) continue;
        const v = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
        this.sprite(img, x, y, b.vx / v, b.vy / v, Math.max(0.8, b.r / 6));
      }
    }
    // Boomerangs (rotation continue)
    for (let i = 0; i < s.projCount; i++) {
      const b = s.projectiles[i];
      if (b.kind !== PJ_BOOMERANG) continue;
      const x = lerp(b.px, b.x, alpha);
      const y = lerp(b.py, b.y, alpha);
      if (!this.visible(x, y, 30)) continue;
      const a = (b.age + alpha) * 0.45;
      this.sprite(sp.boomerang[b.weapon], x, y, Math.cos(a), Math.sin(a), b.r / 10);
    }
    this.worldTransform();
    // Crêpes (mines) + voyant quand elles sont armées
    for (let i = 0; i < s.projCount; i++) {
      const b = s.projectiles[i];
      if (b.kind !== PJ_MINE || !this.visible(b.x, b.y, 20)) continue;
      this.spriteAt(b.b < 65 ? sp.miniMine : sp.mine, b.x, b.y);
    }
    for (let i = 0; i < s.projCount; i++) {
      const b = s.projectiles[i];
      if (b.kind !== PJ_MINE || b.age < b.a || (b.age >> 3) & 1 || !this.visible(b.x, b.y, 20)) continue;
      this.spriteAt(sp.mineLight, b.x, b.y);
    }
    // Balles ennemies : pleines, rouges à cœur blanc (distinctes de tout le reste). Celles des Tireurs,
    // cassables, sont violettes cerclées de pointillés.
    for (let i = 0; i < s.projCount; i++) {
      const b = s.projectiles[i];
      if (b.kind !== PJ_EBULLET || b.life <= 0) continue;
      const x = lerp(b.px, b.x, alpha);
      const y = lerp(b.py, b.y, alpha);
      if (!this.visible(x, y, 10)) continue;
      this.spriteAt(b.a === 1 ? sp.breakableBullet : sp.enemyBullet, x, y);
    }

    // Ondes (klaxon) : peu nombreuses, vectorielles
    for (let i = 0; i < s.projCount; i++) {
      const b = s.projectiles[i];
      if (b.kind !== PJ_RING) continue;
      const f = Math.min(1, (b.age + alpha) / b.b);
      ctx.beginPath();
      ctx.arc(b.x, b.y, Math.max(1, b.a * f), 0, Math.PI * 2);
      ctx.globalAlpha = 1 - f * 0.7;
      this.glow(ALL_WEAPONS[b.weapon].color, 4);
      ctx.globalAlpha = 1;
    }
  }

  private drawWeaponFx(s: GameState, alpha: number, under: boolean): void {
    for (const p of s.players) if (p.alive) this.drawPlayerWeaponFx(s, p, alpha, under);
  }

  private drawPlayerWeaponFx(s: GameState, p: Player, alpha: number, under: boolean): void {
    const ctx = this.ctx;
    const x = lerp(p.px, p.x, alpha);
    const y = lerp(p.py, p.y, alpha);
    for (const w of p.weapons) {
      const def = weaponDef(w.def);
      const L = weaponLevel(w.def, w.level);
      if (under && def.behavior === 'aura') {
        const R = w.vR || (L.radius ?? 80);
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.fillStyle = def.color;
        ctx.globalAlpha = 0.05 + (w.activeTicks > 0 ? 0.05 * (w.activeTicks / 8) : 0);
        ctx.fill();
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 10]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (under) continue;
      if (def.behavior === 'orbit') {
        const n = w.vN;
        const ang = w.angle + (L.rotSpeed ?? 3) * DT * alpha;
        ctx.beginPath();
        for (let k = 0; k < n; k++) {
          const a = ang + (k * Math.PI * 2) / n;
          const ox = x + Math.cos(a) * w.vR;
          const oy = y + Math.sin(a) * w.vR;
          ctx.moveTo(ox + w.vS, oy);
          ctx.arc(ox, oy, w.vS, 0, Math.PI * 2);
        }
        if (def.id === 'trounoir') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#000000';
          ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
        }
        this.glow(def.color, def.id === 'trounoir' ? 3 : 2.5);
        if (def.id === 'trounoir') {
          ctx.beginPath();
          for (let k = 0; k < n; k++) {
            const a = ang + (k * Math.PI * 2) / n;
            const ox = x + Math.cos(a) * w.vR;
            const oy = y + Math.sin(a) * w.vR;
            for (let j = 0; j < 3; j++) {
              const sa = -ang * 3 + (j * Math.PI * 2) / 3;
              ctx.moveTo(ox + Math.cos(sa) * w.vS, oy + Math.sin(sa) * w.vS);
              ctx.quadraticCurveTo(
                ox + Math.cos(sa + 1) * w.vS * 1.7,
                oy + Math.sin(sa + 1) * w.vS * 1.7,
                ox + Math.cos(sa + 1.8) * w.vS * 1.9,
                oy + Math.sin(sa + 1.8) * w.vS * 1.9,
              );
            }
          }
          ctx.globalAlpha = 0.6;
          this.glow(def.color, 1.5);
          ctx.globalAlpha = 1;
        }
      } else if (def.behavior === 'beam' && w.activeTicks > 0) {
        ctx.beginPath();
        for (let b = 0; b < w.vN; b++) {
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(w.angles[b]) * w.vLen, y + Math.sin(w.angles[b]) * w.vLen);
        }
        const flick = 0.75 + 0.25 * ((s.tick >> 1) & 1);
        ctx.globalAlpha = flick;
        this.glow(def.color, w.vW * 1.4);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.5, w.vW * 0.35);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawPlayer(s: GameState, alpha: number, time: number): void {
    const ctx = this.ctx;
    for (const p of s.players) {
      if (!p.alive) continue;
      const x = lerp(p.px, p.x, alpha);
      const y = lerp(p.py, p.y, alpha);
      if (p.master >= 0) {
        this.drawClone(s, p, x, y, time);
        continue;
      }
      const hurt = s.tick - p.hurtTick < 12;
      const inv = s.tick < p.invulnUntil && (s.tick >> 1) & 1;
      const r = p.r * 1.15;
      const wob = 1 + Math.sin(time * 10) * 0.03 * (p.moveX || p.moveY ? 1 : 0);
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = Math.PI / 8 + (k * Math.PI) / 4;
        const px = x + Math.cos(a) * r * wob;
        const py = y + Math.sin(a) * r / wob;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = hurt ? '#4a0014' : '#062a33';
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = inv ? 0.45 : 1;
      neon(ctx, hurt ? '#ff3d6e' : p.rageUntil > s.tick ? '#ff6a3d' : COLORS.player, 3.2);
      // Yeux qui regardent où l'on va
      ctx.beginPath();
      const ex = p.faceX * r * 0.22;
      const ey = p.faceY * r * 0.22 - r * 0.2;
      ctx.moveTo(x - r * 0.3 + ex + 3, y + ey);
      ctx.arc(x - r * 0.3 + ex, y + ey, 3, 0, Math.PI * 2);
      ctx.moveTo(x + r * 0.3 + ex + 3, y + ey);
      ctx.arc(x + r * 0.3 + ex, y + ey, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.globalAlpha = 1;
      // Bonus temporaires visibles sur le héros
      if (p.shieldUntil > s.tick) {
        ctx.beginPath();
        ctx.arc(x, y, r * 2, 0, Math.PI * 2);
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -time * 40;
        ctx.globalAlpha = p.shieldUntil - s.tick < 90 && Math.floor(time * 8) % 2 ? 0.3 : 0.9;
        this.glow('#a0b4ff', 2.5);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (p.rageUntil > s.tick) {
        ctx.beginPath();
        ctx.arc(x, y, r * 1.6 + Math.sin(time * 14) * 2, 0, Math.PI * 2);
        ctx.globalAlpha = 0.5;
        this.glow('#ff3d6e', 2);
        ctx.globalAlpha = 1;
      }
      // Anneau d'aimant très discret
      ctx.beginPath();
      ctx.arc(x, y, p.stats.magnet, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.player;
      ctx.globalAlpha = 0.05;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** Clone : silhouette du héros en hologramme turquoise, qui grésille avant de disparaître. */
  private drawClone(s: GameState, p: Player, x: number, y: number, time: number): void {
    const ctx = this.ctx;
    const left = p.expires - s.tick;
    if (left < 120 && Math.floor(time * (left < 50 ? 16 : 8)) % 2) return;
    const r = p.r * 1.15;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 8 + (k * Math.PI) / 4;
      if (k === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.7;
    neon(ctx, '#5cf2d6', 2.6);
    // lignes de balayage d'hologramme
    ctx.beginPath();
    const off = (time * 30) % 6;
    for (let yy = -r + off; yy < r; yy += 6) {
      const w = Math.sqrt(Math.max(0, r * r - yy * yy)) * 0.9;
      ctx.moveTo(x - w, y + yy);
      ctx.lineTo(x + w, y + yy);
    }
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#5cf2d6';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawFx(fx: Effects): void {
    const ctx = this.ctx;
    // Éclairs en zigzag
    for (let i = 0; i < fx.lCount; i++) {
      let seed = fx.lseed[i];
      const x1 = fx.lx1[i];
      const y1 = fx.ly1[i];
      const x2 = fx.lx2[i];
      const y2 = fx.ly2[i];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      const segs = 6;
      for (let k = 1; k < segs; k++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const off = ((seed / 4294967296) - 0.5) * Math.min(40, len * 0.3);
        ctx.lineTo(x1 + (dx * k) / segs + nx * off, y1 + (dy * k) / segs + ny * off);
      }
      ctx.lineTo(x2, y2);
      ctx.globalAlpha = Math.min(1, fx.llife[i] / 0.12);
      this.glow(FX_COLORS[fx.lcol[i]], 2.5);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Ondes
    for (let i = 0; i < fx.rCount; i++) {
      const f = 1 - fx.rlife[i] / fx.rmax[i];
      ctx.beginPath();
      ctx.arc(fx.rx[i], fx.ry[i], Math.max(1, fx.rr[i] * (0.25 + 0.75 * f)), 0, Math.PI * 2);
      ctx.globalAlpha = 1 - f;
      this.glow(FX_COLORS[fx.rcol[i]], 3);
      ctx.globalAlpha = 1;
    }
    // Particules : sprites groupés par couleur
    for (let c = 0; c < FX_COLORS.length; c++) {
      const sp = this.sprites.particle[c];
      for (let i = 0; i < fx.pCount; i++) {
        if (fx.pcol[i] !== c) continue;
        const x = fx.px[i];
        const y = fx.py[i];
        if (!this.visible(x, y, 10)) continue;
        this.spriteAt(sp, x, y, (fx.psize[i] / 3) * (0.4 + 0.6 * (fx.plife[i] / fx.pmax[i])));
      }
    }
  }

  private drawTexts(fx: Effects): void {
    if (fx.tCount === 0) return;
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < fx.tCount; i++) {
      const big = fx.tbig[i] === 1;
      const a = Math.min(1, fx.tlife[i] / 0.25);
      ctx.globalAlpha = a * (big ? 1 : 0.75);
      ctx.font = big ? 'bold 19px "Trebuchet MS", sans-serif' : 'bold 12px "Trebuchet MS", sans-serif';
      ctx.fillStyle = big ? '#ffe14d' : '#ffffff';
      ctx.fillText(String(Math.round(fx.tval[i])), fx.tx[i], fx.ty[i]);
    }
    ctx.globalAlpha = 1;
  }

  /** Flèches en bord d'écran vers le coffre et le boss hors champ. */
  private drawIndicators(s: GameState): void {
    const ctx = this.ctx;
    const targets: [number, number, string][] = [];
    for (let i = 0; i < s.pickupCount; i++) {
      const it = s.pickups[i];
      if (it.kind === PK_CHEST) targets.push([it.x, it.y, COLORS.gold]);
    }
    for (let i = 0; i < s.enemyCount; i++) {
      const e = s.enemies[i];
      if (e.alive && e.flags & EF_BOSS) targets.push([e.x, e.y, COLORS.boss]);
    }
    const sc = this.scale;
    const halfW = this.cw / 2 / sc - 30;
    const halfH = this.ch / 2 / sc - 30;
    for (const [tx, ty, col] of targets) {
      const dx = tx - this.camX;
      const dy = ty - this.camY;
      if (Math.abs(dx) < halfW && Math.abs(dy) < halfH) continue;
      const k = Math.min(halfW / Math.abs(dx || 1), halfH / Math.abs(dy || 1));
      const ax = this.camX + dx * k;
      const ay = this.camY + dy * k;
      const a = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(ax + Math.cos(a) * 16, ay + Math.sin(a) * 16);
      ctx.lineTo(ax + Math.cos(a + 2.5) * 12, ay + Math.sin(a + 2.5) * 12);
      ctx.lineTo(ax + Math.cos(a - 2.5) * 12, ay + Math.sin(a - 2.5) * 12);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}
