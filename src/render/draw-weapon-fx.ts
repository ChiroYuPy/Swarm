/**
 * Weapon effects around the player: force field / vampire field bubble, saws and black holes, blade sweep,
 * flame jets, electric arc lock; plus the shockwave shape drawn for its projectiles.
 */
import { DT, BLACK_HOLE_WEAPON, VAMPIRE_FIELD_WEAPON, weaponDef, weaponLevel, type GameState, type Player, type WeaponInst } from '../sim';
import { BLADE_FADE_TICKS } from '../sim/weapons';
import { sawPath } from './icons';
import { hash01, lerp, type RenderView } from './view';

const TAU = Math.PI * 2;

/** "rgba(...)" of a "#rrggbb" color with this opacity. */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * Flame jet: puffs leaving the player, growing, going from yellowish white
 * to the weapon color, then dying out. Purely decorative (no simulation randomness).
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
    // Puffs grow as they move away, go from yellowish white to the color then to red, and die out.
    const R = (5 + 15 * t) * scale;
    ctx.globalAlpha = Math.min(1, (1 - t) * 1.4) * 0.75;
    ctx.drawImage(t < 0.25 ? core : t < 0.65 ? mid : end, fx - R, fy - R, R * 2, R * 2);
  }
  ctx.globalAlpha = 1;
}

/**
 * Shockwave: a sharp front with a short gradient behind it (clear centre). Once its damage is done it keeps
 * growing while it fades. `f` = progress over its damage time (0..1, then beyond while fading). `quake`
 * (Earthquake: big, slowing waves in a row): only a thin front over a faint tint, and a few cracks in the
 * ground, so the enemies stay readable under it. `seed` must stay the same for the whole life of the wave.
 */
export function drawShockwave(view: RenderView, x: number, y: number, maxR: number, f: number, color: string, quake: boolean, seed: number): void {
  const ctx = view.ctx;
  const R = Math.max(2, f <= 1 ? maxR * f : maxR * (1 + (quake ? 0.25 : 0.85) * (f - 1)));
  const fade = f <= 1 ? 1 : Math.max(0, 1 - (R - maxR) / (maxR * (quake ? 0.12 : 0.6)));
  if (fade <= 0) return;
  if (quake) {
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.fillStyle = rgba(color, 0.05 * fade);
    ctx.fill();
    ctx.globalAlpha = 0.75 * fade;
    view.glow(color, 1.6);
    // A few zigzag cracks behind the front, the same for the whole wave.
    ctx.beginPath();
    for (let c = 0; c < 5; c++) {
      let a = ((c + hash01(seed * 13 + c)) / 5) * TAU;
      let px = x + Math.cos(a) * R * 0.15;
      let py = y + Math.sin(a) * R * 0.15;
      ctx.moveTo(px, py);
      for (let k = 2; k <= 5; k++) {
        a += (hash01(seed * 17 + c * 5 + k) - 0.5) * 0.5;
        const r = (R * 0.9 * k) / 5;
        px = x + Math.cos(a) * r;
        py = y + Math.sin(a) * r;
        ctx.lineTo(px, py);
      }
    }
    ctx.globalAlpha = 0.35 * fade;
    view.glow(color, 1);
    ctx.globalAlpha = 1;
    return;
  }
  const inner = R * 0.72;
  const g = ctx.createRadialGradient(x, y, inner, x, y, R);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(1, rgba(color, 0.38 * fade));
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.globalAlpha = fade;
  view.glow(color, 2.2);
  ctx.globalAlpha = 1;
}

/** Black hole: black centre fading to a violet halo, with debris falling in. */
function drawBlackHole(view: RenderView, x: number, y: number, r: number, t: number, color: string): void {
  const ctx = view.ctx;
  const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.6);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.45, 'rgba(40,10,70,0.9)');
  g.addColorStop(0.75, rgba(color, 0.35));
  g.addColorStop(1, rgba(color, 0));
  ctx.beginPath();
  ctx.arc(x, y, r * 1.6, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.45, 0, TAU);
  ctx.fillStyle = '#000000';
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#e6d4ff';
  for (let k = 0; k < 5; k++) {
    const p = (((t * 1.2 + k / 5) % 1) + 1) % 1;
    const a = k * 1.9 + p * 2;
    const d = r * 1.5 * (1 - p);
    ctx.globalAlpha = 1 - p;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** Force field / vampire field: a bubble, clear in the middle and bright at the rim, flashing on each hit. */
function drawBubble(view: RenderView, x: number, y: number, R: number, flash: number, color: string, tint: string): void {
  const ctx = view.ctx;
  const g = ctx.createRadialGradient(x, y, R * 0.2, x, y, R);
  g.addColorStop(0, rgba(tint, 0));
  g.addColorStop(0.7, rgba(tint, 0.06 + flash * 0.08));
  g.addColorStop(1, rgba(tint, 0.3 + flash * 0.2));
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.globalAlpha = 0.9;
  view.glow(color, 2.2);
  ctx.globalAlpha = 1;
}

/** Vampire field: red drops flying back from the enemies hit by the last tick to the player. */
function drawDrops(view: RenderView, s: GameState, w: WeaponInst, x: number, y: number, R: number, period: number, alpha: number): void {
  const since = period - w.tickTimer + alpha;
  if (w.vS !== 1 || since > period) return;
  const k = Math.min(1, since / Math.min(period, 30));
  if (k >= 1) return;
  const e2 = 1 - (1 - k) * (1 - k);
  const ctx = view.ctx;
  ctx.fillStyle = '#ff3b5c';
  let n = 0;
  for (let i = 0; i < s.enemyCount && n < 16; i++) {
    const e = s.enemies[i];
    if (!e.alive || hash01(e.id) > 0.35) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    if (dx * dx + dy * dy > R * R) continue;
    n++;
    ctx.globalAlpha = 1 - k * 0.4;
    ctx.beginPath();
    ctx.arc(lerp(e.x, x, e2), lerp(e.y, y, e2), 4, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * Blade: the sword and the fading wedge it leaves behind. Scythe (w.angles[3] = tip share): a long handle
 * with a curved blade at its end, and a brighter band in the trail where the tip hits twice as hard.
 */
function drawBlade(view: RenderView, w: WeaponInst, x: number, y: number, color: string, alpha: number): void {
  const ctx = view.ctx;
  const from = w.angles[0];
  const sweep = w.angles[1];
  const R = w.angles[4];
  const sweeping = w.tickTimer < w.vN;
  const at = (ticks: number) => {
    const k = Math.max(0, Math.min(1, ticks / w.vN));
    return from + sweep * (1 - (1 - k) * (1 - k));
  };
  const now = sweeping ? w.tickTimer + alpha : w.vN;
  const fade = sweeping ? 1 : Math.max(0, (w.activeTicks - alpha) / BLADE_FADE_TICKS);
  const dir = sweep >= 0;
  const tip = w.angles[3];
  // Trail: the angles of the last ticks, fading with age.
  const TRAIL = 10;
  ctx.fillStyle = color;
  for (let j = 0; j < TRAIL; j++) {
    const a1 = at(now - j);
    const a0 = at(now - j - 1);
    if (Math.abs(a1 - a0) < 1e-4) continue;
    ctx.beginPath();
    ctx.arc(x, y, R, a0, a1, !dir);
    ctx.arc(x, y, R * 0.35, a1, a0, dir);
    ctx.closePath();
    ctx.globalAlpha = (tip > 0 ? 0.06 : 0.35) * (1 - j / TRAIL) * fade;
    ctx.fill();
    if (tip > 0) {
      ctx.beginPath();
      ctx.arc(x, y, R, a0, a1, !dir);
      ctx.arc(x, y, R * (1 - tip), a1, a0, dir);
      ctx.closePath();
      ctx.globalAlpha = 0.3 * (1 - j / TRAIL) * fade;
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  if (!sweeping) return;
  const a = at(now);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  if (tip > 0) {
    drawScythe(view, x, y, a, R, dir ? 1 : -1, color);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + ux * 18, y + uy * 18);
  ctx.lineTo(x + ux * R, y + uy * R);
  view.glow('#ffffff', 3.5);
  ctx.beginPath();
  ctx.moveTo(x + ux * 12, y + uy * 12);
  ctx.lineTo(x + ux * 22, y + uy * 22);
  view.glow(color, 5);
}

/** Scythe at angle `a`: handle out to `R`, blade curving back from its end on the side it sweeps toward (f = ±1). */
function drawScythe(view: RenderView, x: number, y: number, a: number, R: number, f: number, color: string): void {
  const ctx = view.ctx;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(R, 0);
  view.glow(color, 1.8);
  // Crescent: the sharp inner edge faces the way it sweeps.
  ctx.beginPath();
  ctx.moveTo(R + 4, 0);
  ctx.quadraticCurveTo(R * 1.02, f * R * 0.34, R * 0.66, f * R * 0.46);
  ctx.quadraticCurveTo(R * 0.9, f * R * 0.22, R - 6, 0);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.45;
  ctx.fill();
  ctx.globalAlpha = 1;
  view.glow('#ffffff', 2.5);
  ctx.restore();
}

/** Electric arc: a crackling bolt from the player to the locked target, and a ring around it. */
function drawArcLock(view: RenderView, s: GameState, w: WeaponInst, x: number, y: number, color: string): void {
  if (w.activeTicks <= 0 || w.lockIdx < 0 || w.lockIdx >= s.enemyCount) return;
  const e = s.enemies[w.lockIdx];
  if (!e.alive || e.id !== w.lockId) return;
  const ctx = view.ctx;
  const dx = e.x - x;
  const dy = e.y - y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const seed = s.tick >> 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  const segs = 8;
  for (let k = 1; k < segs; k++) {
    const off = (hash01(seed * 7 + k) - 0.5) * Math.min(36, len * 0.25);
    ctx.lineTo(x + (dx * k) / segs + nx * off, y + (dy * k) / segs + ny * off);
  }
  ctx.lineTo(e.x, e.y);
  ctx.globalAlpha = 0.9;
  view.glow(color, 2.5);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r + 6, 0, TAU);
  ctx.globalAlpha = 0.7;
  view.glow('#9fd0ff', 1.5);
  ctx.globalAlpha = 1;
}

export function drawWeaponFx(view: RenderView, s: GameState, alpha: number, under: boolean): void {
  for (const p of s.players) if (p.alive) drawPlayerWeaponFx(view, s, p, alpha, under);
}

function drawPlayerWeaponFx(view: RenderView, s: GameState, p: Player, alpha: number, under: boolean): void {
  const ctx = view.ctx;
  const x = lerp(p.px, p.x, alpha);
  const y = lerp(p.py, p.y, alpha);
  const time = (s.tick + alpha) * DT;
  for (const w of p.weapons) {
    const def = weaponDef(w.def);
    const L = weaponLevel(w.def, w.level);
    if (def.behavior === 'aura') {
      const R = w.vR || (L.radius ?? 80);
      const vampire = w.def === VAMPIRE_FIELD_WEAPON;
      if (under) drawBubble(view, x, y, R, w.activeTicks > 0 ? w.activeTicks / 8 : 0, def.color, vampire ? '#ff5a8c' : def.color);
      else if (vampire) drawDrops(view, s, w, x, y, R, Math.max(1, Math.round((L.tick ?? 0.5) / DT)), alpha);
      continue;
    }
    if (under) continue;
    switch (def.behavior) {
      case 'orbit': {
        const n = w.vN;
        const ang = w.angle + (L.rotSpeed ?? 3) * DT * alpha;
        const hole = w.def === BLACK_HOLE_WEAPON;
        if (hole) ctx.globalCompositeOperation = 'source-over';
        for (let k = 0; k < n; k++) {
          const a = ang + (k * TAU) / n;
          const ox = x + Math.cos(a) * w.vR;
          const oy = y + Math.sin(a) * w.vR;
          if (hole) {
            drawBlackHole(view, ox, oy, w.vS, time + k * 0.37, def.color);
            continue;
          }
          ctx.beginPath();
          sawPath(ctx, ox, oy, w.vS * 0.62, w.vS, 7, -time * 9);
          ctx.fillStyle = def.color;
          ctx.globalAlpha = 0.28;
          ctx.fill();
          ctx.globalAlpha = 1;
          view.glow(def.color, 2.2);
          ctx.beginPath();
          ctx.arc(ox, oy, w.vS * 0.2, 0, TAU);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
        if (hole) ctx.globalCompositeOperation = 'lighter';
        break;
      }
      case 'blade':
        if (w.activeTicks > 0) drawBlade(view, w, x, y, def.color, alpha);
        break;
      case 'flame':
        if (w.activeTicks > 0) for (let b = 0; b < w.vN; b++) drawFlameJet(view, x, y, w.angles[b], w.vLen, w.vW, def.color, s.tick + alpha, b);
        break;
      case 'arc':
        drawArcLock(view, s, w, x, y, def.color);
        break;
      default:
        break;
    }
  }
}
