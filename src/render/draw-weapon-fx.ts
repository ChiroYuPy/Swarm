/**
 * Weapon effects around the player: aura, orbits (black hole), whip, scythe, flame jet, beam;
 * plus the shockwave and phoenix shapes drawn for their projectiles.
 */
import { DT, BLACK_HOLE_WEAPON, weaponDef, weaponLevel, type GameState, type Player } from '../sim';
import { SCYTHE_FX_TICKS, WHIP_FX_TICKS } from '../sim/weapons';
import { hash01, lerp, type RenderView } from './view';

/**
 * Fouet : la lanière se déroule en ondulant (t de 0 à 0,45), claque au bout (étincelle), puis s'efface.
 * Tracée comme une courbe qui s'affine vers la pointe.
 */
function drawWhip(view: RenderView, x: number, y: number, angles: Float64Array, n: number, len: number, width: number, t: number, color: string): void {
  const ctx = view.ctx;
  const ext = Math.min(1, t / 0.45);
  const e = 1 - (1 - ext) * (1 - ext);
  const fade = t < 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 0.55);
  const SEG = 18;
  for (let b = 0; b < n; b++) {
    const ux = Math.cos(angles[b]);
    const uy = Math.sin(angles[b]);
    const side = b % 2 === 0 ? 1 : -1;
    // Trois traits de plus en plus fins vers la pointe.
    for (let part = 0; part < 3; part++) {
      ctx.beginPath();
      for (let k = (part * SEG) / 3; k <= ((part + 1) * SEG) / 3; k++) {
        const u = k / SEG;
        const along = len * e * u;
        const wave = Math.sin(u * Math.PI * 2.2 - t * 14) * width * 0.9 * (1 - e * 0.85) * u * side;
        const px = x + ux * along - uy * wave;
        const py = y + uy * along + ux * wave;
        if (k === (part * SEG) / 3) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.globalAlpha = fade;
      view.glow(color, 3.2 - part * 0.9);
    }
    // Claquement : une étincelle au bout, au moment où la lanière se tend.
    if (t > 0.35 && t < 0.7) {
      const k = 1 - Math.abs(t - 0.5) / 0.2;
      const tx = x + ux * len;
      const ty = y + uy * len;
      ctx.beginPath();
      for (let r = 0; r < 6; r++) {
        const a = angles[b] + (r * Math.PI) / 3 + 0.3;
        ctx.moveTo(tx + Math.cos(a) * 6, ty + Math.sin(a) * 6);
        ctx.lineTo(tx + Math.cos(a) * (10 + 12 * k), ty + Math.sin(a) * (10 + 12 * k));
      }
      ctx.globalAlpha = Math.max(0, k);
      view.glow('#ffffff', 1.6);
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Jet de flammes : des bouffées qui partent du joueur, grossissent, passent du blanc-jaune
 * à la couleur de l'arme puis s'éteignent. Purement décoratif (aucun aléa de la simulation).
 */
function drawFlameJet(view: RenderView, x: number, y: number, a: number, len: number, arc: number, color: string, time: number, seed: number): void {
  const ctx = view.ctx;
  const N = 34;
  const scale = len / 135;
  const core = view.softPuff('#fff3c4');
  const mid = view.softPuff(color);
  const end = view.softPuff('#ff3d1a');
  for (let k = 0; k < N; k++) {
    const h = hash01(k * 31 + seed * 97);
    const t = (((time / 26 + h) % 1) + 1) % 1;
    const off = (hash01(k * 17 + seed * 5) * 2 - 1) * arc * 0.8 * Math.min(1, t * 3);
    const wob = Math.sin(time * 0.3 + k) * 0.05;
    const d = len * t;
    const fx = x + Math.cos(a + off + wob) * d;
    const fy = y + Math.sin(a + off + wob) * d;
    // Les bouffées grossissent en s'éloignant, passent du blanc-jaune à la couleur puis au rouge, et s'éteignent.
    const R = (5 + 15 * t) * scale;
    ctx.globalAlpha = Math.min(1, (1 - t) * 1.4) * 0.75;
    ctx.drawImage(t < 0.25 ? core : t < 0.65 ? mid : end, fx - R, fy - R, R * 2, R * 2);
  }
  ctx.globalAlpha = 1;
}

/**
 * Onde de choc : un front épais qui file (rapide puis freiné), une bande d'air comprimé derrière lui,
 * deux échos plus fins et des stries de poussière soufflées vers l'extérieur. `quake` (Séisme, qui ralentit
 * fort) : le sol se fissure en étoile sous l'onde. `f` = avancement (0..1).
 */
export function drawShockwave(view: RenderView, x: number, y: number, maxR: number, f: number, color: string, quake: boolean, seed: number): void {
  const ctx = view.ctx;
  const e = 1 - (1 - f) * (1 - f);
  const R = Math.max(2, maxR * e);
  const fade = 1 - f;
  // Bande d'air comprimé, plus dense contre le front.
  for (let k = 0; k < 3; k++) {
    const r0 = R * (1 - 0.1 * (k + 1));
    const r1 = R * (1 - 0.1 * k);
    ctx.beginPath();
    ctx.arc(x, y, r1, 0, Math.PI * 2);
    ctx.arc(x, y, r0, Math.PI * 2, 0, true);
    ctx.fillStyle = color;
    ctx.globalAlpha = (0.2 - k * 0.06) * fade;
    ctx.fill();
  }
  // Échos
  for (const [k, w] of [
    [0.84, 1.5],
    [0.7, 1],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, R * k, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.globalAlpha = 0.45 * fade;
    ctx.stroke();
  }
  // Front
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.globalAlpha = 0.4 + 0.6 * fade;
  view.glow(color, 2 + 4 * fade);
  // Stries de poussière juste devant le front.
  ctx.beginPath();
  const N = 18;
  for (let k = 0; k < N; k++) {
    const a = ((k + hash01(seed * 31 + k) * 0.6) / N) * Math.PI * 2;
    const r0 = R * (1.02 + 0.04 * hash01(k * 7 + seed));
    const r1 = r0 + 6 + 14 * fade;
    ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.6 * fade;
  ctx.stroke();
  if (quake) {
    // Fissures en zigzag, du centre jusqu'au front.
    ctx.beginPath();
    for (let c = 0; c < 7; c++) {
      let a = ((c + hash01(seed * 13 + c)) / 7) * Math.PI * 2;
      let px = x;
      let py = y;
      ctx.moveTo(px, py);
      const steps = 5;
      for (let k = 1; k <= steps; k++) {
        a += (hash01(seed * 17 + c * 5 + k) - 0.5) * 0.7;
        const r = (R * k) / steps;
        px = x + Math.cos(a) * r;
        py = y + Math.sin(a) * r;
        ctx.lineTo(px, py);
      }
    }
    ctx.globalAlpha = 0.85 * fade;
    view.glow(color, 2);
  }
  ctx.globalAlpha = 1;
}

/**
 * Faux : la lame fait un tour complet autour de toi (rapide puis freinée), suivie d'une traînée
 * en éventail qui s'efface. `t` = avancement de l'animation (0..1).
 */
function drawScythe(view: RenderView, x: number, y: number, angles: Float64Array, n: number, R: number, t: number, color: string): void {
  const ctx = view.ctx;
  const ease = 1 - (1 - t) * (1 - t) * (1 - t);
  const fade = t < 0.7 ? 1 : (1 - t) / 0.3;
  for (let b = 0; b < n; b++) {
    const a = angles[b] + ease * Math.PI * 2;
    // Traînée : des tranches d'anneau de plus en plus pâles derrière la lame.
    const trail = Math.min(ease * Math.PI * 2, 2.4);
    const SEG = 12;
    ctx.fillStyle = color;
    for (let k = 0; k < SEG; k++) {
      const a1 = a - (trail * k) / SEG;
      const a0 = a - (trail * (k + 1)) / SEG;
      ctx.beginPath();
      ctx.arc(x, y, R, a0, a1);
      ctx.arc(x, y, R * 0.45, a1, a0, true);
      ctx.closePath();
      ctx.globalAlpha = 0.28 * (1 - k / SEG) * (1 - k / SEG) * fade;
      ctx.fill();
    }
    // Bord tranchant de la traînée
    ctx.beginPath();
    ctx.arc(x, y, R, a - trail * 0.8, a);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6 * fade;
    ctx.stroke();
    // Manche, puis la lame en croissant qui se recourbe vers l'avant.
    const P = (r: number, ang: number): [number, number] => [x + Math.cos(ang) * r, y + Math.sin(ang) * r];
    ctx.beginPath();
    ctx.moveTo(...P(R * 0.15, a));
    ctx.lineTo(...P(R * 0.98, a));
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff4ec';
    ctx.globalAlpha = 0.8 * fade;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(...P(R * 1.02, a - 0.04));
    ctx.quadraticCurveTo(...P(R * 1.08, a + 0.4), ...P(R * 0.72, a + 0.78));
    ctx.quadraticCurveTo(...P(R * 0.9, a + 0.36), ...P(R * 0.84, a - 0.02));
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.85 * fade;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.globalAlpha = 0.35 * fade;
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.globalAlpha = fade;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Phénix : corps, ailes qui battent, queue de flammes. (vx, vy) = sens du vol. */
export function drawPhoenix(view: RenderView, x: number, y: number, vx: number, vy: number, r: number, color: string, time: number): void {
  const ctx = view.ctx;
  const n = Math.hypot(vx, vy) || 1;
  const ux = vx / n;
  const uy = vy / n;
  const nx = -uy;
  const ny = ux;
  const flap = Math.sin(time * 0.45);
  r *= 0.9;
  const P = (f: number, s: number): [number, number] => [x + ux * f * r + nx * s * r, y + uy * f * r + ny * s * r];
  // Traînée de feu derrière lui.
  const core = view.softPuff('#fff3c4');
  const mid = view.softPuff(color);
  const end = view.softPuff('#ff3d1a');
  for (let k = 0; k < 6; k++) {
    const t = (((time / 12 + k / 6) % 1) + 1) % 1;
    const [px, py] = P(-0.5 - t * 1.6, Math.sin(time * 0.4 + k * 1.7) * 0.25 * t);
    const R = r * (0.42 - 0.22 * t);
    ctx.globalAlpha = (1 - t) * 0.4;
    ctx.drawImage(t < 0.2 ? core : t < 0.55 ? mid : end, px - R, py - R, R * 2, R * 2);
  }
  ctx.globalAlpha = 1;
  // Ailes
  ctx.beginPath();
  for (const side of [-1, 1]) {
    const [ax, ay] = P(0.1, 0);
    const [cx, cy] = P(-0.2, side * (0.9 + 0.35 * flap));
    const [tx, ty] = P(-0.75, side * (1.25 + 0.5 * flap));
    const [bx, by] = P(-0.45, side * 0.35);
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(cx, cy, tx, ty);
    ctx.quadraticCurveTo(bx + (tx - bx) * 0.2, by + (ty - by) * 0.2, bx, by);
    ctx.closePath();
  }
  ctx.globalAlpha = 0.3;
  ctx.fill();
  ctx.globalAlpha = 1;
  view.glow(color, 1.6);
  // Corps et tête
  ctx.beginPath();
  const [hx, hy] = P(0.55, 0);
  const [tx, ty] = P(-0.55, 0);
  ctx.moveTo(hx, hy);
  ctx.quadraticCurveTo(...P(0, 0.32), tx, ty);
  ctx.quadraticCurveTo(...P(0, -0.32), hx, hy);
  ctx.fillStyle = '#fff1b8';
  ctx.globalAlpha = 0.45;
  ctx.fill();
  ctx.globalAlpha = 1;
  view.glow(color, 1.4);
}

export function drawWeaponFx(view: RenderView, s: GameState, alpha: number, under: boolean): void {
  for (const p of s.players) if (p.alive) drawPlayerWeaponFx(view, s, p, alpha, under);
}

function drawPlayerWeaponFx(view: RenderView, s: GameState, p: Player, alpha: number, under: boolean): void {
  const ctx = view.ctx;
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
      if (w.def === BLACK_HOLE_WEAPON) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#000000';
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
      }
      view.glow(def.color, w.def === BLACK_HOLE_WEAPON ? 3 : 2.5);
      if (w.def === BLACK_HOLE_WEAPON) {
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
        view.glow(def.color, 1.5);
        ctx.globalAlpha = 1;
      }
    } else if (def.behavior === 'whip' && w.activeTicks > 0) {
      drawWhip(view, x, y, w.angles, w.vN, w.vLen, w.vW, 1 - (w.activeTicks - alpha) / WHIP_FX_TICKS, def.color);
    } else if (def.behavior === 'scythe' && w.activeTicks > 0) {
      drawScythe(view, x, y, w.angles, w.vN, w.vLen, Math.min(1, 1 - (w.activeTicks - alpha) / SCYTHE_FX_TICKS), def.color);
    } else if (def.behavior === 'flame' && w.activeTicks > 0) {
      for (let b = 0; b < w.vN; b++) drawFlameJet(view, x, y, w.angles[b], w.vLen, w.vW, def.color, s.tick + alpha, b);
    } else if (def.behavior === 'beam' && w.activeTicks > 0) {
      ctx.beginPath();
      for (let b = 0; b < w.vN; b++) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(w.angles[b]) * w.vLen, y + Math.sin(w.angles[b]) * w.vLen);
      }
      const flick = 0.75 + 0.25 * ((s.tick >> 1) & 1);
      ctx.globalAlpha = flick;
      view.glow(def.color, w.vW * 1.4);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, w.vW * 0.35);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}
