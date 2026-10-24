/** Heroes: body, eyes, shield and rage rings, magnet ring; clones; the drop-in intro. */
import { INPUT_DIRS, type GameState, type Player } from '../sim';
import { COLORS } from './palette';
import { neon } from './icons';
import { lerp, type RenderView } from './view';

export function drawPlayer(view: RenderView, s: GameState, alpha: number, time: number): void {
  const ctx = view.ctx;
  for (const p of s.players) {
    if (!p.alive) continue;
    const x = lerp(p.px, p.x, alpha);
    const y = lerp(p.py, p.y, alpha);
    if (p.master >= 0) {
      drawClone(view, s, p, x, y, time);
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
    // Yeux qui regardent où l'on vise (visée manuelle), sinon où l'on va
    ctx.beginPath();
    const aimA = (p.aim * Math.PI * 2) / INPUT_DIRS;
    const ex = (p.aim >= 0 ? Math.cos(aimA) : p.faceX) * r * 0.22;
    const ey = (p.aim >= 0 ? Math.sin(aimA) : p.faceY) * r * 0.22 - r * 0.2;
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
      view.glow('#a0b4ff', 2.5);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    if (p.rageUntil > s.tick) {
      ctx.beginPath();
      ctx.arc(x, y, r * 1.6 + Math.sin(time * 14) * 2, 0, Math.PI * 2);
      ctx.globalAlpha = 0.5;
      view.glow('#ff3d6e', 2);
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

/**
 * Chute du héros au lancement : une cible se resserre au sol pendant que le héros, vu de haut,
 * descend vers elle (plus gros à l'écran au début, il retrouve sa taille en touchant le sol).
 */
export function drawDrop(view: RenderView, s: GameState, k: number, zoom: number, time: number): void {
  const ctx = view.ctx;
  const p = s.players[0];
  const r = p.r * 1.15;
  // Cible au sol, en pointillés qui tournent, de plus en plus nette.
  ctx.beginPath();
  ctx.arc(p.x, p.y, (r * (1.6 + 3 * (1 - k))) / zoom, 0, Math.PI * 2);
  // Tailles divisées par le zoom : la cible garde la même allure à l'écran pendant toute la plongée.
  ctx.setLineDash([12 / zoom, 10 / zoom]);
  ctx.lineDashOffset = (-time * 60) / zoom;
  ctx.globalAlpha = 0.25 + 0.6 * k;
  view.glow(COLORS.player, 2.5 / zoom);
  ctx.setLineDash([]);
  // Le héros : taille à l'écran 1,8× au départ, 1× à l'atterrissage.
  const h = (1 + 0.8 * (1 - k)) / zoom;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    const px = p.x + Math.cos(a) * r * h;
    const py = p.y + Math.sin(a) * r * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#062a33';
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  neon(ctx, COLORS.player, 3.2 * h);
  ctx.beginPath();
  for (const side of [-1, 1]) {
    const ex = p.x + side * r * 0.3 * h;
    const ey = p.y - r * 0.2 * h;
    ctx.moveTo(ex + 3 * h, ey);
    ctx.arc(ex, ey, 3 * h, 0, Math.PI * 2);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

/** Clone : silhouette du héros en hologramme turquoise, qui grésille avant de disparaître. */
function drawClone(view: RenderView, s: GameState, p: Player, x: number, y: number, time: number): void {
  const ctx = view.ctx;
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
