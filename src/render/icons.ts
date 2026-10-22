/**
 * Icônes procédurales (armes, bonus, objets) au style « tube néon » :
 * un halo large translucide, un trait de couleur, puis un fin cœur blanc qui les rend lisibles même petites.
 * Chaque icône est un pictogramme simple et unique, dessiné dans un carré de côté `size` centré en (cx, cy).
 */
import { ALL_WEAPONS } from '../data/weapons';
import { PASSIVES } from '../data/passives';

type Ctx = CanvasRenderingContext2D;

const TAU = Math.PI * 2;

/** Trace le chemin courant façon tube néon. `fill` : opacité du remplissage coloré (0 = aucun). */
export function neon(ctx: Ctx, color: string, lw: number, fill = 0, halo = true): void {
  if (fill > 0) {
    ctx.fillStyle = color;
    ctx.globalAlpha = fill;
    ctx.fill();
  }
  ctx.strokeStyle = color;
  if (halo) {
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = lw * 3;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = Math.max(0.8, lw * 0.35);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Remplissage plein lumineux (cœur blanc + halo de couleur). */
function solid(ctx: Ctx, color: string, lw: number): void {
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = lw * 2.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function bolt(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.moveTo(x + s * 0.15, y - s);
  ctx.lineTo(x - s * 0.45, y + s * 0.1);
  ctx.lineTo(x - s * 0.02, y + s * 0.1);
  ctx.lineTo(x - s * 0.2, y + s);
  ctx.lineTo(x + s * 0.45, y - s * 0.15);
  ctx.lineTo(x + s * 0.02, y - s * 0.15);
  ctx.closePath();
}

export function mineShape(ctx: Ctx, x: number, y: number, r: number): void {
  for (let k = 0; k < 8; k++) {
    const a = (k * TAU) / 8;
    ctx.moveTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.moveTo(x + r * 0.62, y);
  ctx.arc(x, y, r * 0.62, 0, TAU);
}

function boomerangShape(ctx: Ctx, r: number): void {
  ctx.moveTo(-r * 0.8, -r * 0.35);
  ctx.quadraticCurveTo(-r * 0.2, -r * 0.2, 0, r * 0.55);
  ctx.quadraticCurveTo(r * 0.2, -r * 0.2, r * 0.8, -r * 0.35);
}

function arcs(ctx: Ctx, n: number, r: number, spread: number): void {
  for (let i = 0; i < n; i++) {
    const rr = r * (0.42 + i * 0.24);
    ctx.moveTo(Math.cos(-spread) * rr, Math.sin(-spread) * rr);
    ctx.arc(0, 0, rr, -spread, spread);
    ctx.moveTo(Math.cos(Math.PI - spread) * rr, Math.sin(Math.PI - spread) * rr);
    ctx.arc(0, 0, rr, Math.PI - spread, Math.PI + spread);
  }
}

export function drawWeaponIcon(ctx: Ctx, id: string, cx: number, cy: number, size: number): void {
  const def = ALL_WEAPONS.find((w) => w.id === id);
  const c = def?.color ?? '#ffffff';
  const r = size / 2;
  const lw = Math.max(1.6, size / 15);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (id) {
    case 'confetti': {
      // Projectile en capsule + traînées de vitesse
      ctx.moveTo(-r * 0.05, -r * 0.22);
      ctx.lineTo(r * 0.5, -r * 0.22);
      ctx.arc(r * 0.5, 0, r * 0.22, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(-r * 0.05, r * 0.22);
      ctx.closePath();
      neon(ctx, c, lw, 0.35);
      ctx.beginPath();
      ctx.moveTo(-r * 0.85, -r * 0.42);
      ctx.lineTo(-r * 0.3, -r * 0.42);
      ctx.moveTo(-r * 0.95, 0);
      ctx.lineTo(-r * 0.32, 0);
      ctx.moveTo(-r * 0.85, r * 0.42);
      ctx.lineTo(-r * 0.3, r * 0.42);
      neon(ctx, c, lw * 0.7);
      break;
    }
    case 'cotillons': {
      // Spirale + trois projectiles
      for (let t = 0; t <= 1.001; t += 0.04) {
        const a = t * TAU * 1.6;
        const d = r * (0.08 + 0.7 * t);
        if (t === 0) ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d);
        else ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
      }
      neon(ctx, c, lw * 0.8);
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = 0.4 + (i * TAU) / 3;
        ctx.moveTo(Math.cos(a) * r * 0.85 + r * 0.12, Math.sin(a) * r * 0.85);
        ctx.arc(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85, r * 0.12, 0, TAU);
      }
      solid(ctx, '#ffffff', lw);
      break;
    }
    case 'petitspois':
    case 'trounoir': {
      const black = id === 'trounoir';
      ctx.arc(0, 0, r * 0.68, 0, TAU);
      ctx.setLineDash([lw * 1.5, lw * 2]);
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = c;
      ctx.lineWidth = lw * 0.6;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.14, 0, TAU);
      solid(ctx, '#ffffff', lw * 0.6);
      const n = black ? 3 : 3;
      const orb = black ? r * 0.27 : r * 0.2;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i * TAU) / n;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.68, Math.sin(a) * r * 0.68, orb, 0, TAU);
        if (black) {
          ctx.fillStyle = '#000';
          ctx.fill();
          neon(ctx, c, lw * 0.8);
        } else neon(ctx, c, lw * 0.8, 0.8);
      }
      break;
    }
    case 'aura':
    case 'malaise': {
      ctx.arc(0, 0, r * 0.85, 0, TAU);
      ctx.setLineDash([lw * 1.4, lw * 1.6]);
      neon(ctx, c, lw * 0.6);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, TAU);
      neon(ctx, c, lw * 0.8, 0.18);
      ctx.beginPath();
      if (id === 'malaise') {
        // Croix de soin au centre
        const k = r * 0.13;
        ctx.rect(-k, -k * 2.6, k * 2, k * 5.2);
        ctx.rect(-k * 2.6, -k, k * 5.2, k * 2);
        solid(ctx, '#8dff8d', lw * 0.6);
      } else {
        ctx.arc(0, 0, r * 0.2, 0, TAU);
        solid(ctx, '#ffffff', lw * 0.6);
      }
      break;
    }
    case 'laser':
      ctx.moveTo(-r * 0.55, r * 0.55);
      ctx.lineTo(r * 0.9, -r * 0.9);
      neon(ctx, c, lw * 1.5);
      ctx.beginPath();
      ctx.rect(-r * 0.9, r * 0.35, r * 0.55, r * 0.55);
      neon(ctx, c, lw * 0.8, 0.5);
      break;
    case 'crepes':
      mineShape(ctx, 0, 0, r * 0.9);
      neon(ctx, c, lw, 0.25);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.2, 0, TAU);
      solid(ctx, '#ff3b3b', lw * 0.6);
      break;
    case 'boomerang':
    case 'creperang':
      ctx.translate(0, id === 'creperang' ? -r * 0.15 : 0);
      boomerangShape(ctx, r);
      neon(ctx, c, lw * 1.6);
      if (id === 'creperang') {
        ctx.beginPath();
        mineShape(ctx, -r * 0.55, r * 0.7, r * 0.3);
        mineShape(ctx, r * 0.55, r * 0.7, r * 0.3);
        neon(ctx, '#ffb347', lw * 0.6, 0.3);
      }
      break;
    case 'rallonge':
      bolt(ctx, 0, 0, r * 0.95);
      neon(ctx, c, lw * 0.8, 0.45);
      break;
    case 'multiprise':
      bolt(ctx, -r * 0.35, -r * 0.1, r * 0.75);
      bolt(ctx, r * 0.4, r * 0.15, r * 0.75);
      neon(ctx, c, lw * 0.7, 0.45);
      break;
    case 'klaxon':
    case 'periph': {
      ctx.arc(0, 0, r * 0.18, 0, TAU);
      solid(ctx, '#ffffff', lw * 0.6);
      ctx.beginPath();
      arcs(ctx, id === 'periph' ? 3 : 2, r * (id === 'periph' ? 1 : 1.25), 0.75);
      neon(ctx, c, lw * 0.9);
      if (id === 'periph') {
        ctx.beginPath();
        ctx.moveTo(-r * 0.3, -r * 0.9);
        ctx.lineTo(-r * 0.05, -r * 0.5);
        ctx.lineTo(-r * 0.2, -r * 0.35);
        ctx.moveTo(r * 0.2, r * 0.9);
        ctx.lineTo(r * 0.02, r * 0.5);
        ctx.lineTo(r * 0.18, r * 0.35);
        neon(ctx, c, lw * 0.6);
      }
      break;
    }
    default:
      ctx.arc(0, 0, r * 0.6, 0, TAU);
      neon(ctx, c, lw);
  }
  ctx.restore();
}

export function drawPassiveIcon(ctx: Ctx, id: string, cx: number, cy: number, size: number): void {
  const def = PASSIVES.find((p) => p.id === id);
  const c = def?.color ?? '#ffffff';
  const r = size / 2;
  const lw = Math.max(1.6, size / 15);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (id) {
    case 'cafe': {
      // Chronomètre : recharge plus rapide
      ctx.arc(0, r * 0.1, r * 0.7, 0, TAU);
      neon(ctx, c, lw, 0.15);
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.82);
      ctx.lineTo(r * 0.2, -r * 0.82);
      ctx.moveTo(0, -r * 0.82);
      ctx.lineTo(0, -r * 0.6);
      ctx.moveTo(0, r * 0.1);
      ctx.lineTo(r * 0.32, -r * 0.2);
      neon(ctx, c, lw * 0.8);
      break;
    }
    case 'chaussettes':
      // Double chevron : vitesse
      for (const ox of [-0.38, 0.22]) {
        ctx.moveTo(r * (ox - 0.25), -r * 0.6);
        ctx.lineTo(r * (ox + 0.3), 0);
        ctx.lineTo(r * (ox - 0.25), r * 0.6);
      }
      neon(ctx, c, lw * 1.3);
      break;
    case 'aimant':
      ctx.arc(0, -r * 0.05, r * 0.5, Math.PI, 0, true);
      ctx.lineTo(r * 0.5, -r * 0.7);
      ctx.moveTo(-r * 0.5, -r * 0.05);
      ctx.lineTo(-r * 0.5, -r * 0.7);
      neon(ctx, c, lw * 1.6);
      ctx.beginPath();
      ctx.rect(-r * 0.66, -r * 0.88, r * 0.32, r * 0.24);
      ctx.rect(r * 0.34, -r * 0.88, r * 0.32, r * 0.24);
      solid(ctx, '#ffffff', lw * 0.5);
      break;
    case 'biceps':
      // Épée : dégâts
      ctx.moveTo(r * 0.75, -r * 0.75);
      ctx.lineTo(-r * 0.25, r * 0.25);
      neon(ctx, c, lw * 1.4);
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, 0);
      ctx.lineTo(0, r * 0.5);
      ctx.moveTo(-r * 0.3, r * 0.3);
      ctx.lineTo(-r * 0.7, r * 0.7);
      neon(ctx, c, lw);
      break;
    case 'lunettes': {
      // Quatre flèches vers l'extérieur : zone
      ctx.rect(-r * 0.18, -r * 0.18, r * 0.36, r * 0.36);
      neon(ctx, c, lw * 0.7, 0.4);
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        ctx.moveTo(ca * r * 0.35, sa * r * 0.35);
        ctx.lineTo(ca * r * 0.85, sa * r * 0.85);
        ctx.moveTo(ca * r * 0.85 - ca * r * 0.32, sa * r * 0.85);
        ctx.lineTo(ca * r * 0.85, sa * r * 0.85);
        ctx.lineTo(ca * r * 0.85, sa * r * 0.85 - sa * r * 0.32);
      }
      neon(ctx, c, lw * 0.9);
      break;
    }
    case 'soupe':
      // Cœur : vitalité
      ctx.moveTo(0, r * 0.75);
      ctx.bezierCurveTo(-r * 1.05, 0, -r * 0.55, -r * 0.85, 0, -r * 0.35);
      ctx.bezierCurveTo(r * 0.55, -r * 0.85, r * 1.05, 0, 0, r * 0.75);
      ctx.closePath();
      neon(ctx, c, lw, 0.35);
      break;
    case 'blindage':
      shieldPath(ctx, r * 0.85);
      neon(ctx, c, lw, 0.2);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.45);
      ctx.lineTo(0, r * 0.45);
      neon(ctx, c, lw * 0.6);
      break;
    case 'chance':
      // Trèfle à quatre feuilles
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        const x = Math.cos(a) * r * 0.32;
        const y = Math.sin(a) * r * 0.32 - r * 0.08;
        ctx.moveTo(x + r * 0.27, y);
        ctx.arc(x, y, r * 0.27, 0, TAU);
      }
      neon(ctx, c, lw * 0.8, 0.3);
      ctx.beginPath();
      ctx.moveTo(0, r * 0.2);
      ctx.quadraticCurveTo(r * 0.1, r * 0.6, r * 0.35, r * 0.85);
      neon(ctx, c, lw * 0.7);
      break;
    default:
      ctx.rect(-r * 0.5, -r * 0.5, r, r);
      neon(ctx, c, lw);
  }
  ctx.restore();
}

function shieldPath(ctx: Ctx, r: number): void {
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.8, -r * 0.65);
  ctx.quadraticCurveTo(r * 0.8, r * 0.45, 0, r);
  ctx.quadraticCurveTo(-r * 0.8, r * 0.45, -r * 0.8, -r * 0.65);
  ctx.closePath();
}

function flakePath(ctx: Ctx, r: number): void {
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    ctx.moveTo(0, 0);
    ctx.lineTo(ca * r, sa * r);
    const bx = ca * r * 0.6;
    const by = sa * r * 0.6;
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.cos(a + 0.7) * r * 0.3, by + Math.sin(a + 0.7) * r * 0.3);
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.cos(a - 0.7) * r * 0.3, by + Math.sin(a - 0.7) * r * 0.3);
  }
}

export type PickupIcon =
  | 'heal'
  | 'rage'
  | 'frenzy'
  | 'turbo'
  | 'shield'
  | 'fever'
  | 'totem'
  | 'vacuum'
  | 'freeze'
  | 'bomb'
  | 'clock'
  | 'clone'
  | 'eradicate'
  | 'chest';

/** Familles d'objets : un cadre différent les rend reconnaissables d'un coup d'œil. */
const FAMILY: Record<PickupIcon, 'bonus' | 'active' | 'relic' | 'chest'> = {
  heal: 'bonus',
  rage: 'bonus',
  frenzy: 'bonus',
  turbo: 'bonus',
  shield: 'bonus',
  fever: 'bonus',
  totem: 'relic',
  vacuum: 'active',
  freeze: 'active',
  bomb: 'active',
  clock: 'active',
  clone: 'active',
  eradicate: 'active',
  chest: 'chest',
};

export const PICKUP_COLORS: Record<PickupIcon, string> = {
  heal: '#39ff7a',
  rage: '#ff3d6e',
  frenzy: '#ffe14d',
  turbo: '#38f6ff',
  shield: '#a0b4ff',
  fever: '#b8ff3d',
  totem: '#ffb347',
  vacuum: '#ff5a5a',
  freeze: '#9feaff',
  bomb: '#ffd23a',
  clock: '#7f9cff',
  clone: '#5cf2d6',
  eradicate: '#ff3df5',
  chest: '#ffd23a',
};

/**
 * Objets ramassables (monde, HUD, codex).
 * Bonus (soin et temporaires) dans un cercle, activables dans un losange, coffre sans cadre.
 * `framed = false` : pictogramme seul (HUD).
 */
export function drawPickupIcon(ctx: Ctx, kind: PickupIcon, cx: number, cy: number, size: number, framed = true): void {
  const r = size / 2;
  const lw = Math.max(1.6, size / 14);
  const c = PICKUP_COLORS[kind];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const fam = FAMILY[kind];
  if (framed && fam !== 'chest') {
    ctx.beginPath();
    if (fam === 'bonus') ctx.arc(0, 0, r * 0.95, 0, TAU);
    else if (fam === 'relic') {
      // Relique : hexagone (ni cercle de bonus, ni losange d'activable)
      for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 3;
        if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
    } else {
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
    }
    neon(ctx, c, lw * 0.6, 0.12);
  }
  const k = framed && fam !== 'chest' ? (fam === 'active' ? 0.5 : fam === 'relic' ? 0.58 : 0.62) : 1;
  const q = r * k;
  ctx.beginPath();
  switch (kind) {
    case 'heal': {
      const t = q * 0.26;
      ctx.moveTo(-t, -t * 3);
      ctx.lineTo(t, -t * 3);
      ctx.lineTo(t, -t);
      ctx.lineTo(t * 3, -t);
      ctx.lineTo(t * 3, t);
      ctx.lineTo(t, t);
      ctx.lineTo(t, t * 3);
      ctx.lineTo(-t, t * 3);
      ctx.lineTo(-t, t);
      ctx.lineTo(-t * 3, t);
      ctx.lineTo(-t * 3, -t);
      ctx.lineTo(-t, -t);
      ctx.closePath();
      neon(ctx, c, lw * 0.8, 0.6);
      break;
    }
    case 'rage':
      // Flamme
      ctx.moveTo(0, -q);
      ctx.quadraticCurveTo(q * 0.9, -q * 0.1, q * 0.55, q * 0.55);
      ctx.quadraticCurveTo(q * 0.3, q * 0.95, 0, q * 0.9);
      ctx.quadraticCurveTo(-q * 0.3, q * 0.95, -q * 0.55, q * 0.55);
      ctx.quadraticCurveTo(-q * 0.8, q * 0.05, -q * 0.25, -q * 0.35);
      ctx.quadraticCurveTo(-q * 0.1, -q * 0.1, 0, -q);
      neon(ctx, c, lw * 0.8, 0.4);
      break;
    case 'frenzy':
      // Flèches circulaires : recharge accélérée
      ctx.arc(0, 0, q * 0.7, -2.6, 0.2);
      ctx.moveTo(q * 0.7 + q * 0.3, -q * 0.05);
      ctx.lineTo(q * 0.69, q * 0.15);
      ctx.lineTo(q * 0.45, -q * 0.12);
      ctx.moveTo(Math.cos(0.55) * -q * 0.7, Math.sin(0.55) * -q * 0.7);
      ctx.arc(0, 0, q * 0.7, Math.PI - 2.6 + 0.55, Math.PI + 0.2);
      neon(ctx, c, lw * 0.9);
      break;
    case 'turbo':
      for (const ox of [-0.55, -0.05, 0.45]) {
        ctx.moveTo(q * (ox - 0.2), -q * 0.55);
        ctx.lineTo(q * (ox + 0.2), 0);
        ctx.lineTo(q * (ox - 0.2), q * 0.55);
      }
      neon(ctx, c, lw);
      break;
    case 'shield':
      shieldPath(ctx, q * 0.9);
      neon(ctx, c, lw * 0.9, 0.3);
      break;
    case 'fever': {
      // Gemme d'XP surmontée d'une flèche montante
      ctx.moveTo(0, -q * 0.15);
      ctx.lineTo(q * 0.5, q * 0.35);
      ctx.lineTo(0, q * 0.85);
      ctx.lineTo(-q * 0.5, q * 0.35);
      ctx.closePath();
      neon(ctx, c, lw * 0.8, 0.35);
      ctx.beginPath();
      ctx.moveTo(0, -q * 0.35);
      ctx.lineTo(0, -q * 0.95);
      ctx.moveTo(-q * 0.28, -q * 0.68);
      ctx.lineTo(0, -q * 0.95);
      ctx.lineTo(q * 0.28, -q * 0.68);
      neon(ctx, c, lw * 0.8);
      break;
    }
    case 'totem':
      // Ankh : boucle, tige et barre, le symbole de la vie qui revient
      ctx.ellipse(0, -q * 0.48, q * 0.3, q * 0.4, 0, 0, TAU);
      ctx.moveTo(0, -q * 0.08);
      ctx.lineTo(0, q * 0.95);
      ctx.moveTo(-q * 0.55, q * 0.12);
      ctx.lineTo(q * 0.55, q * 0.12);
      neon(ctx, c, lw * 0.9);
      break;
    case 'clock':
      ctx.arc(0, 0, q * 0.82, 0, TAU);
      neon(ctx, c, lw * 0.8, 0.2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -q * 0.55);
      ctx.moveTo(0, 0);
      ctx.lineTo(q * 0.38, q * 0.2);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        ctx.moveTo(Math.cos(a) * q * 0.62, Math.sin(a) * q * 0.62);
        ctx.lineTo(Math.cos(a) * q * 0.78, Math.sin(a) * q * 0.78);
      }
      neon(ctx, c, lw * 0.8);
      break;
    case 'clone':
      // Deux octogones décalés : le héros et son double
      for (const [ox, oy] of [
        [-q * 0.25, -q * 0.2],
        [q * 0.25, q * 0.2],
      ]) {
        for (let k = 0; k < 8; k++) {
          const a = Math.PI / 8 + (k * Math.PI) / 4;
          const px = ox + Math.cos(a) * q * 0.55;
          const py = oy + Math.sin(a) * q * 0.55;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
      neon(ctx, c, lw * 0.8, 0.2);
      break;
    case 'vacuum':
      ctx.arc(0, -q * 0.05, q * 0.6, Math.PI, 0, true);
      ctx.lineTo(q * 0.6, -q * 0.8);
      ctx.moveTo(-q * 0.6, -q * 0.05);
      ctx.lineTo(-q * 0.6, -q * 0.8);
      neon(ctx, c, lw * 1.4);
      break;
    case 'freeze':
      flakePath(ctx, q * 0.95);
      neon(ctx, c, lw * 0.8);
      break;
    case 'bomb':
      ctx.arc(-q * 0.1, q * 0.15, q * 0.62, 0, TAU);
      neon(ctx, c, lw, 0.25);
      ctx.beginPath();
      ctx.moveTo(q * 0.3, -q * 0.32);
      ctx.quadraticCurveTo(q * 0.5, -q * 0.8, q * 0.8, -q * 0.7);
      neon(ctx, '#ffffff', lw * 0.6);
      break;
    case 'eradicate':
      // Éclat d'explosion à 8 branches
      for (let i = 0; i < 16; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 8;
        const d = i % 2 ? q * 0.38 : q * 0.95;
        if (i === 0) ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d);
        else ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
      }
      ctx.closePath();
      neon(ctx, c, lw * 0.8, 0.35);
      break;
    case 'chest':
      ctx.rect(-r * 0.85, -r * 0.45, r * 1.7, r * 1.15);
      ctx.moveTo(-r * 0.85, -r * 0.05);
      ctx.lineTo(r * 0.85, -r * 0.05);
      neon(ctx, c, lw, 0.2);
      ctx.beginPath();
      ctx.rect(-r * 0.14, -r * 0.2, r * 0.28, r * 0.36);
      solid(ctx, '#ffffff', lw * 0.5);
      break;
  }
  ctx.restore();
}

function makeCanvas(size: number): [HTMLCanvasElement, Ctx] {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = Math.round(size * dpr);
  cv.height = Math.round(size * dpr);
  cv.style.width = `${size}px`;
  cv.style.height = `${size}px`;
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return [cv, ctx];
}

/** Crée un petit canvas d'icône pour l'interface DOM. */
export function iconCanvas(kind: 'weapon' | 'passive' | 'pickup', id: string, size: number): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(size);
  if (kind === 'weapon') drawWeaponIcon(ctx, id, size / 2, size / 2, size * 0.78);
  else if (kind === 'passive') drawPassiveIcon(ctx, id, size / 2, size / 2, size * 0.78);
  else drawPickupIcon(ctx, id as PickupIcon, size / 2, size / 2, size * 0.86);
  return cv;
}

export { makeCanvas };
