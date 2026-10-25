/** World layer: background dots, neon obstacles of the visible chunks, the boss arena, XP gems and pickups. */
import { PICKUPS } from '../data/loot';
import { ENEMIES } from '../data/enemies';
import { CHUNK, EF_BOSS, OB_CIRCLE, OB_HEX, PK_CHEST, type GameState, type Obstacle } from '../sim';
import { COLORS, OBSTACLE_TINTS } from './palette';
import { lerp, type RenderView } from './view';

/** Background (faint dots, no grid cells) + neon obstacles of the visible chunks. */
export function drawMap(view: RenderView, s: GameState): void {
  const ctx = view.ctx;
  const step = 96;
  const x0 = Math.floor(view.viewX0 / step) * step;
  const y0 = Math.floor(view.viewY0 / step) * step;
  ctx.fillStyle = COLORS.grid;
  for (let y = y0; y <= view.viewY1; y += step) for (let x = x0; x <= view.viewX1; x += step) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);

  const cx0 = Math.floor(view.viewX0 / CHUNK);
  const cy0 = Math.floor(view.viewY0 / CHUNK);
  const cx1 = Math.floor(view.viewX1 / CHUNK);
  const cy1 = Math.floor(view.viewY1 / CHUNK);
  // Passes: dark fills first, then neon outlines grouped by tint (one pass per tint).
  for (let pass = 0; pass < 4; pass++) {
    ctx.beginPath();
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const list = s.map.chunk(cx, cy);
        for (const o of list) {
          if (pass > 0 && o.tint !== pass - 1) continue;
          if (!view.visible(o.x, o.y, o.r + 10)) continue;
          obstaclePath(view, o);
        }
      }
    }
    if (pass === 0) {
      ctx.fillStyle = COLORS.wallFill;
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
    } else {
      view.glow(OBSTACLE_TINTS[pass - 1], 2.5);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

function obstaclePath(view: RenderView, o: Obstacle): void {
  const ctx = view.ctx;
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

export function drawGems(view: RenderView, s: GameState, alpha: number): void {
  for (let tier = 0; tier < 4; tier++) {
    const sp = view.sprites.gem[tier];
    for (let i = 0; i < s.gemCount; i++) {
      const g = s.gems[i];
      if (g.tier !== tier) continue;
      const x = lerp(g.px, g.x, alpha);
      const y = lerp(g.py, g.y, alpha);
      if (!view.visible(x, y, 10)) continue;
      view.spriteAt(sp, x, y);
    }
  }
}

export function drawPickups(view: RenderView, s: GameState, time: number): void {
  const ctx = view.ctx;
  const sp = view.sprites.pickup;
  for (let i = 0; i < s.pickupCount; i++) {
    const it = s.pickups[i];
    if (!view.visible(it.x, it.y, 60)) continue;
    // Blinks during its last 5 seconds.
    if (it.life > 0 && it.life < 300 && Math.floor(time * 8) % 2 === 0) continue;
    const def = PICKUPS[it.kind];
    const chest = it.kind === PK_CHEST;
    const y = it.y + Math.sin(time * 3 + i) * 3;
    // Pulsing ground halo: items can be spotted at a glance.
    const R = (chest ? 34 : 22) + Math.sin(time * 4 + i) * 3;
    ctx.beginPath();
    ctx.arc(it.x, it.y, R, 0, Math.PI * 2);
    ctx.globalAlpha = chest ? 0.35 : 0.25;
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    view.spriteAt(sp[it.kind], it.x, y, chest ? 1 + Math.sin(time * 5) * 0.06 : 1);
  }
}

/**
 * Boss arena: the outside is dimmed and a neon wall in the boss's colour rings the fight (dashes that
 * crawl along it), until the boss dies.
 */
export function drawArena(view: RenderView, s: GameState, time: number): void {
  const R = s.arenaR;
  if (R <= 0) return;
  const ctx = view.ctx;
  let color = '#ff3df5';
  for (let i = 0; i < s.enemyCount; i++) {
    const e = s.enemies[i];
    if (e.alive && e.flags & EF_BOSS) {
      color = ENEMIES[e.type].color;
      break;
    }
  }
  const x = s.arenaX;
  const y = s.arenaY;
  ctx.beginPath();
  ctx.rect(view.viewX0, view.viewY0, view.viewX1 - view.viewX0, view.viewY1 - view.viewY0);
  ctx.moveTo(x + R, y);
  ctx.arc(x, y, R, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(4, 0, 14, 0.55)';
  ctx.fill('evenodd');
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.globalAlpha = 0.9;
  view.glow(color, 3);
  ctx.beginPath();
  ctx.arc(x, y, R + 9, 0, Math.PI * 2);
  ctx.setLineDash([18, 22]);
  ctx.lineDashOffset = -time * 40;
  ctx.globalAlpha = 0.45 + 0.15 * Math.sin(time * 3);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.globalAlpha = 1;
}
