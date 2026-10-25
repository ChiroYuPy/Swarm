/** Heroes: body, eyes, aim notch, dash trail, shield and rage rings, magnet ring; clones; the drop-in intro. */
import { INPUT_DIRS, type GameState, type Player } from '../sim';
import { COLORS } from './palette';
import { neon } from './icons';
import { lerp, type RenderView } from './view';

/** `glow` (0..1): extra outline brightness, when the hero lights up at the landing. */
export function drawPlayer(view: RenderView, s: GameState, alpha: number, time: number, glow = 0): void {
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
    const dashing = s.tick <= p.dashUntil + 6;
    // No blinking for the dash's own invulnerability.
    const inv = !dashing && s.tick < p.invulnUntil && (s.tick >> 1) & 1;
    const r = p.r * 1.15;
    // Dash: fading copies of the body behind the hero.
    if (dashing) {
      const f = 1 - Math.max(0, s.tick - p.dashUntil) / 7;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 2;
      for (let n = 1; n <= 3; n++) {
        octagon(ctx, x - p.dashX * n * 13, y - p.dashY * n * 13, r);
        ctx.globalAlpha = 0.3 * f * (1 - n / 4);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
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
    neon(ctx, hurt ? '#ff3d6e' : p.rageUntil > s.tick ? '#ff6a3d' : COLORS.player, 3.2 * (1 + glow));
    // Eyes look where the player aims (manual aim), otherwise where they are going
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
    if (p.aim >= 0) drawNotch(ctx, x, y, r * 1.55, aimA);
    // Temporary buffs shown on the hero
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
    // Very faint magnet ring
    ctx.beginPath();
    ctx.arc(x, y, p.stats.magnet, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.player;
    ctx.globalAlpha = 0.05;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function octagon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + (k * Math.PI) / 4;
    if (k === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

/** Small chevron outside the hero pointing where the manual aim goes (also shows that manual aim is on). */
function drawNotch(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, a: number): void {
  const c = Math.cos(a);
  const s = Math.sin(a);
  ctx.beginPath();
  ctx.moveTo(x + c * (R + 10), y + s * (R + 10));
  ctx.lineTo(x + c * R - s * 5.5, y + s * R + c * 5.5);
  ctx.lineTo(x + c * (R + 3), y + s * (R + 3));
  ctx.lineTo(x + c * R + s * 5.5, y + s * R - c * 5.5);
  ctx.closePath();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = COLORS.player;
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 1;
  neon(ctx, COLORS.player, 1.6);
}

/** How open the hero's eyes are during the fall (`k` 0 → 1): they open in the dark, blink once, then stay open. */
function eyesInDark(k: number): number {
  if (k < 0.15) return 0;
  if (k < 0.3) return 1 - Math.pow(1 - (k - 0.15) / 0.15, 3);
  if (k < 0.5) return 1;
  if (k < 0.56) return 1 - (k - 0.5) / 0.06;
  if (k < 0.62) return (k - 0.56) / 0.06;
  return 1;
}

/**
 * Hero's fall at run start: a target closes in on the ground while the hero, seen from above,
 * comes down towards it (bigger on screen at first, back to normal size when touching the ground).
 * The body stays dark: only the eyes light up, the outline comes on at the landing (drawPlayer's `glow`).
 */
export function drawDrop(view: RenderView, s: GameState, k: number, zoom: number, time: number): void {
  const ctx = view.ctx;
  const p = s.players[0];
  const r = p.r * 1.15;
  // Ground target, rotating dashes, sharper and sharper.
  ctx.beginPath();
  ctx.arc(p.x, p.y, (r * (1.6 + 3 * (1 - k))) / zoom, 0, Math.PI * 2);
  // Sizes divided by the zoom: the target keeps the same on-screen look during the whole dive.
  ctx.setLineDash([12 / zoom, 10 / zoom]);
  ctx.lineDashOffset = (-time * 60) / zoom;
  ctx.globalAlpha = 0.15 + 0.5 * k;
  view.glow(COLORS.player, 2 / zoom);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  // The hero: on-screen size 1.8x at the start, 1x on landing.
  const h = (1 + 0.8 * (1 - k)) / zoom;
  octagon(ctx, p.x, p.y, r * h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#062a33';
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  const e = eyesInDark(k);
  if (e <= 0.01) return;
  // The eyes glance left, then right, before the landing.
  const look = k < 0.66 ? 0 : k < 0.8 ? -1 : k < 0.93 ? 1 : 0;
  const er = 3 * h;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    const ex = p.x + (side * 0.3 + look * 0.22) * r * h;
    const ey = p.y - r * 0.2 * h;
    ctx.moveTo(ex + er, ey);
    ctx.ellipse(ex, ey, er, Math.max(0.3, er * e), 0, 0, Math.PI * 2);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

/** Clone: the hero's silhouette as a turquoise hologram that flickers before vanishing. */
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
  // hologram scanlines
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
