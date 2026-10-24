/** Bosses: vector body (enemy shape outline), eyes or pupil, and their attack telegraphs. */
import { ENEMIES, BOSS, ETOILE, OEIL } from '../data/enemies';
import { BOSS_PATTERNS, TICK_RATE, type GameState, type Enemy } from '../sim';
import { eyePath, queenPath } from './sprites';
import type { RenderView } from './view';

function enemyPath(view: RenderView, e: Enemy, type: number, x: number, y: number, time: number): void {
  const ctx = view.ctx;
  const r = e.r;
  const fx = e.vx || 1;
  const fy = e.vy || 0;
  const shape = ENEMIES[type].shape;
  switch (shape) {
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
    case 'hexagon':
      // Deux hexagones qui tournent en sens contraire.
      view.polygon(x, y, 6, r, time * 0.5);
      view.polygon(x, y, 6, r * 0.5, -time * 0.9);
      break;
    case 'star': {
      // Elle tourbillonne quand elle fonce.
      const spin = BOSS_PATTERNS[e.type][e.ai]?.kind === 'dash' ? time * 9 : time * 1.2;
      for (let k = 0; k < 10; k++) {
        const a = spin + (k * Math.PI) / 5;
        const rr = k & 1 ? r * 0.45 : r * 1.1;
        if (k === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      break;
    }
    case 'eye':
      eyePath(ctx, x, y, r, 1, 0);
      break;
    case 'queen':
      queenPath(ctx, x, y, r);
      break;
    case 'rock':
    case 'sun':
    case 'ring':
    case 'dart':
    case 'block':
    case 'egg':
      // only bosses are drawn as paths; these shapes exist as sprites only
      break;
    default: {
      const unhandled: never = shape;
      throw new Error(`Unhandled enemy shape ${unhandled}`);
    }
  }
}

export function drawBoss(view: RenderView, s: GameState, boss: Enemy, x: number, y: number, time: number): void {
  const ctx = view.ctx;
  const color = ENEMIES[boss.type].color;
  const ph = BOSS_PATTERNS[boss.type][boss.ai];
  const total = ph ? Math.round(ph.duration * TICK_RATE) : 1;
  const elapsed = total - boss.timer;

  // Avertissements, sous le boss.
  if (ph?.kind === 'charge' && elapsed < BOSS.chargeTelegraph * TICK_RATE) {
    dangerLine(view, x, y, boss.aux, BOSS.chargeLength, boss.r * 1.6, time);
  }
  if (ph?.kind === 'aim' || ph?.kind === 'dash') {
    // Étoile : la boîte de rebond, et sa direction pendant qu'elle vise.
    const H = ETOILE.box;
    ctx.beginPath();
    ctx.rect(boss.ax - H, boss.ay - H, H * 2, H * 2);
    ctx.setLineDash([10, 12]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.3;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (ph.kind === 'aim') dangerLine(view, x, y, boss.aux, 700, boss.r * 1.4, time);
  }
  if (ph?.kind === 'focus' || ph?.kind === 'sweep') {
    // Œil : le cône que le rayon va balayer, puis le rayon.
    const L = OEIL.beamLength;
    const a0 = Math.min(boss.ax, boss.ay);
    const a1 = Math.max(boss.ax, boss.ay);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, L, a0, a1);
    ctx.closePath();
    ctx.fillStyle = '#ff2b2b';
    ctx.globalAlpha = ph.kind === 'focus' ? 0.08 + 0.05 * Math.sin(time * 25) : 0.05;
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.setLineDash([12, 10]);
    ctx.strokeStyle = '#ff2b2b';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (ph.kind === 'sweep') {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(boss.aux) * L, y + Math.sin(boss.aux) * L);
      ctx.strokeStyle = '#ff2b2b';
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = OEIL.beamWidth * 2.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = OEIL.beamWidth * 0.8;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = OEIL.beamWidth * 0.3;
      ctx.stroke();
    }
  }

  ctx.beginPath();
  enemyPath(view, boss, boss.type, x, y, time);
  view.glow(s.tick - boss.hitTick < 4 ? '#ffffff' : color, 3.5);

  // Regard : l'Œil a une pupille (vers le joueur, ou le long du rayon), les autres deux petits yeux.
  ctx.beginPath();
  if (ENEMIES[boss.type].shape === 'eye') {
    let fx = 1;
    let fy = 0;
    const target = s.players[boss.target];
    if (ph?.kind === 'focus' || ph?.kind === 'sweep') {
      const a = ph.kind === 'focus' ? (boss.ax + boss.ay) / 2 : boss.aux;
      fx = Math.cos(a);
      fy = Math.sin(a);
    } else if (target) {
      const dx = target.x - x;
      const dy = target.y - y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      fx = dx / d;
      fy = dy / d;
    }
    const pr = boss.r * 0.38;
    const px = x + fx * boss.r * 0.4;
    const py = y + fy * boss.r * 0.4;
    ctx.moveTo(px + pr, py);
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    view.glow(color, 2.5);
    ctx.beginPath();
    ctx.arc(px + fx * pr * 0.3, py + fy * pr * 0.3, pr * 0.45, 0, Math.PI * 2);
  } else {
    const fx = boss.vx || 1;
    const fy = boss.vy || 0;
    const er = boss.r * 0.12;
    for (const side of [-1, 1]) {
      const ex = x + side * boss.r * 0.3 + fx * boss.r * 0.08;
      const ey = y - boss.r * 0.3 + fy * boss.r * 0.08;
      ctx.moveTo(ex + er, ey);
      ctx.arc(ex, ey, er, 0, Math.PI * 2);
    }
  }
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

/** Ligne d'avertissement rouge en pointillés (charge, ruée). */
function dangerLine(view: RenderView, x: number, y: number, a: number, len: number, width: number, time: number): void {
  const ctx = view.ctx;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
  ctx.setLineDash([24, 14]);
  ctx.strokeStyle = '#ff2b2b';
  ctx.lineWidth = width;
  ctx.globalAlpha = 0.12 + 0.1 * Math.sin(time * 30);
  ctx.stroke();
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}
