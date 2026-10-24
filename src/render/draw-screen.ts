/** Screen-space overlays: game over band and the speed lines of the drop-in intro. */
import type { GameState } from '../sim';
import { COLORS } from './palette';
import { formatTime, glowText, FONT } from './hud';
import type { RenderView } from './view';

/** Fin de partie : l'écran s'assombrit proprement et un GAME OVER s'allume. */
export function drawGameOver(view: RenderView, s: GameState, W: number, H: number, f: number, time: number): void {
  const ctx = view.ctx;
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

/** Lignes de vitesse pendant la plongée de la caméra (repère écran), de plus en plus marquées. */
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
