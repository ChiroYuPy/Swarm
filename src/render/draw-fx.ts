/** Cosmetic effects (lightning, rings, particles), damage numbers and off-screen arrows. */
import { PICKUPS } from '../data/loot';
import { EF_BOSS, PK_CHEST, PK_VACUUM, type GameState } from '../sim';
import { COLORS, FX_COLORS } from './palette';
import type { Effects } from './effects';
import type { RenderView } from './view';

export function drawFx(view: RenderView, fx: Effects): void {
  const ctx = view.ctx;
  // Zigzag lightning
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
    view.glow(FX_COLORS[fx.lcol[i]], 2.5);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Rings
  for (let i = 0; i < fx.rCount; i++) {
    const f = 1 - fx.rlife[i] / fx.rmax[i];
    ctx.beginPath();
    ctx.arc(fx.rx[i], fx.ry[i], Math.max(1, fx.rr[i] * (0.25 + 0.75 * f)), 0, Math.PI * 2);
    ctx.globalAlpha = 1 - f;
    view.glow(FX_COLORS[fx.rcol[i]], 3);
    ctx.globalAlpha = 1;
  }
  // Particles: sprites batched by color
  for (let c = 0; c < FX_COLORS.length; c++) {
    const sp = view.sprites.particle[c];
    for (let i = 0; i < fx.pCount; i++) {
      if (fx.pcol[i] !== c) continue;
      const x = fx.px[i];
      const y = fx.py[i];
      if (!view.visible(x, y, 10)) continue;
      view.spriteAt(sp, x, y, (fx.psize[i] / 3) * (0.4 + 0.6 * (fx.plife[i] / fx.pmax[i])));
    }
  }
}

export function drawTexts(view: RenderView, fx: Effects): void {
  if (fx.tCount === 0) return;
  const ctx = view.ctx;
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

/** Screen-edge arrows towards the off-screen chest and boss. */
export function drawIndicators(view: RenderView, s: GameState): void {
  const ctx = view.ctx;
  const targets: [number, number, string][] = [];
  for (let i = 0; i < s.pickupCount; i++) {
    const it = s.pickups[i];
    if (it.kind === PK_CHEST) targets.push([it.x, it.y, COLORS.gold]);
    else if (it.kind === PK_VACUUM) targets.push([it.x, it.y, PICKUPS[PK_VACUUM].color]);
  }
  for (let i = 0; i < s.enemyCount; i++) {
    const e = s.enemies[i];
    if (e.alive && e.flags & EF_BOSS) targets.push([e.x, e.y, COLORS.boss]);
  }
  const sc = view.scale;
  const halfW = view.cw / 2 / sc - 30;
  const halfH = view.ch / 2 / sc - 30;
  for (const [tx, ty, col] of targets) {
    const dx = tx - view.camX;
    const dy = ty - view.camY;
    if (Math.abs(dx) < halfW && Math.abs(dy) < halfH) continue;
    const k = Math.min(halfW / Math.abs(dx || 1), halfH / Math.abs(dy || 1));
    const ax = view.camX + dx * k;
    const ay = view.camY + dy * k;
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
