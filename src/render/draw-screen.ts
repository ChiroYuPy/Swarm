/** Screen-space overlays: game over band, and the spotlight and speed lines of the drop-in intro. */
import type { GameState } from '../sim';
import { COLORS } from './palette';
import { formatTime, glowText, FONT } from './hud';
import type { RenderView } from './view';
import { t } from '../i18n';

/** End of run: the screen darkens smoothly and a GAME OVER lights up. */
export function drawGameOver(view: RenderView, s: GameState, W: number, H: number, f: number, time: number): void {
  const ctx = view.ctx;
  const e = f * f * (3 - 2 * f);
  ctx.fillStyle = `rgba(7,6,15,${0.8 * e})`;
  ctx.fillRect(0, 0, W, H);
  // The text only shows once the screen is a quarter dark.
  const k = Math.max(0, (f - 0.25) / 0.75);
  if (k <= 0) return;
  // Neon-style power-on: a few flickers before staying lit.
  const on = k > 0.45 || Math.floor(time * 18) % 3 !== 0;
  if (!on) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = Math.round(Math.min(88, W / 9));
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.globalAlpha = Math.min(1, k * 2);
  glowText(ctx, t('hud.gameOver'), W / 2, H / 2 - 10, COLORS.hp, '#ffe3ec');
  ctx.font = `600 20px ${FONT}`;
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(t('hud.held', { time: formatTime(s.tick / 60) }), W / 2, H / 2 + size * 0.75 + 10);
  ctx.globalAlpha = 1;
}

/** Seconds the visible zone takes to open up to the screen edges after the landing. */
export const REVEAL_SECONDS = 0.8;

/**
 * Drop-in intro: only a circle around the hero is visible, growing as the camera dives (`drop` 0 → 1);
 * after the landing (`landed` seconds) it opens up to the screen edges behind a fading cyan ring.
 */
export function drawSpotlight(view: RenderView, W: number, H: number, drop: number | undefined, landed: number | undefined): void {
  const start = H * 0.23;
  const end = H * 0.73;
  let R: number;
  if (drop !== undefined) R = start + (end - start) * drop * drop;
  else if (landed !== undefined && landed < REVEAL_SECONDS) {
    const f = landed / REVEAL_SECONDS;
    R = end + (Math.hypot(W, H) / 2 + 30 - end) * (1 - Math.pow(1 - f, 3));
  } else return;
  const ctx = view.ctx;
  const cx = W / 2;
  const cy = H / 2;
  // Darkness outside the circle (even-odd: the screen minus the circle).
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.bg;
  ctx.fill('evenodd');
  if (drop !== undefined) {
    // Soft edge while diving.
    const g = ctx.createRadialGradient(cx, cy, R * 0.75, cx, cy, R);
    g.addColorStop(0, 'rgba(7,6,15,0)');
    g.addColorStop(1, COLORS.bg);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Opening: a cyan ring on the edge, fading out.
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1 - landed! / REVEAL_SECONDS;
    view.glow(COLORS.player, 3);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** Speed lines during the camera dive (screen space), stronger and stronger. */
export function drawSpeedLines(view: RenderView, W: number, H: number, k: number, time: number): void {
  const f = Math.max(0, (k - 0.35) / 0.65);
  if (f <= 0) return;
  const ctx = view.ctx;
  const R = Math.hypot(W, H) / 2;
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = COLORS.player;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 36; i++) {
    const a = i * 2.39996;
    const d = R * (0.25 + ((time * (0.6 + f * 1.8) + i * 0.137) % 1) * 0.85);
    const len = R * 0.12 * f;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    ctx.moveTo(W / 2 + c * d, H / 2 + sn * d);
    ctx.lineTo(W / 2 + c * (d + len), H / 2 + sn * (d + len));
  }
  ctx.globalAlpha = 0.35 * f;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
