/**
 * Procedural icons (weapons, passives, pickups) in "neon tube" style:
 * a wide translucent halo, a colored stroke, then a thin white core that keeps them readable even when small.
 * Each icon is a simple, unique pictogram, drawn in a square of side `size` centered on (cx, cy).
 */
import { ALL_WEAPONS } from '../data/weapons';
import { PASSIVES } from '../data/passives';
import { PICKUPS, type PickupDef, type PickupKind } from '../data/loot';

type Ctx = CanvasRenderingContext2D;

/** What an icon painter gets: path already begun, origin at the icon center. */
interface IconArgs {
  ctx: Ctx;
  /** half size */
  r: number;
  c: string;
  lw: number;
  id: string;
}
type IconPainter = (a: IconArgs) => void;

interface PickupArgs {
  ctx: Ctx;
  r: number;
  /** half size inside the frame */
  q: number;
  c: string;
  lw: number;
}
type PickupPainter = (a: PickupArgs) => void;

const TAU = Math.PI * 2;

/** Strokes the current path as a neon tube. `fill`: opacity of the colored fill (0 = none). */
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

/** Bright solid fill (white core + colored halo). */
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

const paintOrbs: IconPainter = ({ ctx, r, c, lw, id }) => {
  const black = id === 'black_holes';
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
};
const paintAura: IconPainter = ({ ctx, r, c, lw, id }) => {
  ctx.arc(0, 0, r * 0.85, 0, TAU);
  ctx.setLineDash([lw * 1.4, lw * 1.6]);
  neon(ctx, c, lw * 0.6);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.55, 0, TAU);
  neon(ctx, c, lw * 0.8, 0.18);
  ctx.beginPath();
  if (id === 'vampire_field') {
    // Heal cross in the center
    const k = r * 0.13;
    ctx.rect(-k, -k * 2.6, k * 2, k * 5.2);
    ctx.rect(-k * 2.6, -k, k * 5.2, k * 2);
    solid(ctx, '#8dff8d', lw * 0.6);
  } else {
    ctx.arc(0, 0, r * 0.2, 0, TAU);
    solid(ctx, '#ffffff', lw * 0.6);
  }
};
const paintBoomerang: IconPainter = ({ ctx, r, c, lw, id }) => {
  ctx.translate(0, id === 'mine_boomerang' ? -r * 0.15 : 0);
  boomerangShape(ctx, r);
  neon(ctx, c, lw * 1.6);
  if (id === 'mine_boomerang') {
    ctx.beginPath();
    mineShape(ctx, -r * 0.55, r * 0.7, r * 0.3);
    mineShape(ctx, r * 0.55, r * 0.7, r * 0.3);
    neon(ctx, '#ffb347', lw * 0.6, 0.3);
  }
};
const paintWaves: IconPainter = ({ ctx, r, c, lw, id }) => {
  ctx.arc(0, 0, r * 0.18, 0, TAU);
  solid(ctx, '#ffffff', lw * 0.6);
  ctx.beginPath();
  arcs(ctx, id === 'earthquake' ? 3 : 2, r * (id === 'earthquake' ? 1 : 1.25), 0.75);
  neon(ctx, c, lw * 0.9);
  if (id === 'earthquake') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, -r * 0.9);
    ctx.lineTo(-r * 0.05, -r * 0.5);
    ctx.lineTo(-r * 0.2, -r * 0.35);
    ctx.moveTo(r * 0.2, r * 0.9);
    ctx.lineTo(r * 0.02, r * 0.5);
    ctx.lineTo(r * 0.18, r * 0.35);
    neon(ctx, c, lw * 0.6);
  }
};
const paintLash: IconPainter = ({ ctx, r, c, lw, id }) => {
  if (id === 'scythe') {
    // Curved blade on a handle
    ctx.moveTo(-r * 0.55, r * 0.85);
    ctx.lineTo(r * 0.15, -r * 0.55);
    neon(ctx, '#ffffff', lw * 0.8);
    ctx.beginPath();
    ctx.moveTo(r * 0.15, -r * 0.55);
    ctx.quadraticCurveTo(-r * 0.2, -r * 1.0, -r * 0.9, -r * 0.55);
    ctx.quadraticCurveTo(-r * 0.3, -r * 0.62, r * 0.05, -r * 0.35);
    neon(ctx, c, lw, 0.35);
  } else {
    // Handle with a pommel, a lash that loops then stretches out thinner, a crack at the tip.
    ctx.moveTo(-r * 0.92, r * 0.9);
    ctx.lineTo(-r * 0.5, r * 0.48);
    neon(ctx, '#ffffff', lw * 1.5);
    ctx.beginPath();
    ctx.arc(-r * 0.92, r * 0.9, r * 0.08, 0, TAU);
    solid(ctx, '#ffffff', lw * 0.4);
    const lash: [number, number, number, number, number, number, number][] = [
      // c1x, c1y, c2x, c2y, x, y, thickness
      [-r * 0.1, r * 0.4, r * 0.55, r * 0.45, r * 0.48, r * 0.1, 1.1],
      [r * 0.42, -r * 0.62, -r * 0.55, -r * 0.6, -r * 0.32, -r * 0.2, 0.85],
      [-r * 0.15, r * 0.05, r * 0.35, -r * 0.5, r * 0.82, -r * 0.62, 0.6],
    ];
    let px = -r * 0.5;
    let py = r * 0.48;
    for (const [c1x, c1y, c2x, c2y, x, y, k] of lash) {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
      neon(ctx, c, lw * k);
      px = x;
      py = y;
    }
    // Crack: a 4-pointed spark
    ctx.beginPath();
    const sx = r * 0.82;
    const sy = -r * 0.62;
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      ctx.moveTo(sx + Math.cos(a) * r * 0.1, sy + Math.sin(a) * r * 0.1);
      ctx.lineTo(sx + Math.cos(a) * r * 0.26, sy + Math.sin(a) * r * 0.26);
    }
    neon(ctx, '#fff4d6', lw * 0.55);
  }
};
const paintTurret: IconPainter = ({ ctx, r, c, lw, id }) => {
  const big = id === 'bastion';
  // Tripod
  ctx.moveTo(0, r * 0.25);
  ctx.lineTo(-r * 0.6, r * 0.9);
  ctx.moveTo(0, r * 0.25);
  ctx.lineTo(r * 0.6, r * 0.9);
  ctx.moveTo(0, r * 0.25);
  ctx.lineTo(0, r * 0.9);
  neon(ctx, c, lw * 0.8);
  // Dome
  ctx.beginPath();
  ctx.arc(-r * 0.05, r * 0.2, r * (big ? 0.48 : 0.4), Math.PI, 0);
  ctx.closePath();
  neon(ctx, c, lw, 0.3);
  // Barrel(s), pointing to the top right
  ctx.beginPath();
  const offs = big ? [-0.14, 0.14] : [0];
  for (const o of offs) {
    ctx.moveTo(r * (0.1 + o), r * (0.0 + o));
    ctx.lineTo(r * (0.85 + o), r * (-0.65 + o));
  }
  neon(ctx, c, lw * 1.2);
  ctx.beginPath();
  ctx.arc(-r * 0.05, r * 0.02, r * 0.1, 0, TAU);
  solid(ctx, '#ffffff', lw * 0.4);
};

function paintWeaponFallback({ ctx, r, c, lw }: IconArgs): void {
  ctx.arc(0, 0, r * 0.6, 0, TAU);
  neon(ctx, c, lw);
}

/** Weapon icons by weapon id (tests/icons.test.ts checks the keys against ALL_WEAPONS). */
export const WEAPON_PAINTERS: Record<string, IconPainter> = {
  blaster: ({ ctx, r, c, lw }) => {
    // Capsule projectile + speed trails
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
  },
  spiral: ({ ctx, r, c, lw }) => {
    // Spiral + three projectiles
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
  },
  orbs: paintOrbs,
  black_holes: paintOrbs,
  force_field: paintAura,
  vampire_field: paintAura,
  laser: ({ ctx, r, c, lw }) => {
    ctx.moveTo(-r * 0.55, r * 0.55);
    ctx.lineTo(r * 0.9, -r * 0.9);
    neon(ctx, c, lw * 1.5);
    ctx.beginPath();
    ctx.rect(-r * 0.9, r * 0.35, r * 0.55, r * 0.55);
    neon(ctx, c, lw * 0.8, 0.5);
  },
  mines: ({ ctx, r, c, lw }) => {
    mineShape(ctx, 0, 0, r * 0.9);
    neon(ctx, c, lw, 0.25);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.2, 0, TAU);
    solid(ctx, '#ff3b3b', lw * 0.6);
  },
  boomerang: paintBoomerang,
  mine_boomerang: paintBoomerang,
  electric_arc: ({ ctx, r, c, lw }) => {
    bolt(ctx, 0, 0, r * 0.95);
    neon(ctx, c, lw * 0.8, 0.45);
  },
  electric_storm: ({ ctx, r, c, lw }) => {
    bolt(ctx, -r * 0.35, -r * 0.1, r * 0.75);
    bolt(ctx, r * 0.4, r * 0.15, r * 0.75);
    neon(ctx, c, lw * 0.7, 0.45);
  },
  shockwave: paintWaves,
  earthquake: paintWaves,
  whip: paintLash,
  scythe: paintLash,
  flamethrower: ({ ctx, r, c, lw }) => {
    // Flame
    ctx.moveTo(0, r * 0.85);
    ctx.bezierCurveTo(-r * 0.75, r * 0.5, -r * 0.3, -r * 0.2, 0, -r * 0.9);
    ctx.bezierCurveTo(r * 0.25, -r * 0.35, r * 0.75, r * 0.2, 0, r * 0.85);
    neon(ctx, c, lw, 0.35);
    ctx.beginPath();
    ctx.moveTo(0, r * 0.7);
    ctx.bezierCurveTo(-r * 0.3, r * 0.5, -r * 0.1, r * 0.1, 0, -r * 0.2);
    ctx.bezierCurveTo(r * 0.1, r * 0.1, r * 0.3, r * 0.5, 0, r * 0.7);
    solid(ctx, '#fff1b8', lw * 0.4);
  },
  fire_tornado: ({ ctx, r, c, lw }) => {
    // Three jets swirling around a point
    for (let k = 0; k < 3; k++) {
      const a0 = (k * TAU) / 3;
      ctx.moveTo(Math.cos(a0) * r * 0.2, Math.sin(a0) * r * 0.2);
      ctx.quadraticCurveTo(
        Math.cos(a0 + 0.9) * r * 0.75,
        Math.sin(a0 + 0.9) * r * 0.75,
        Math.cos(a0 + 1.6) * r * 0.95,
        Math.sin(a0 + 1.6) * r * 0.95,
      );
    }
    neon(ctx, c, lw * 1.1);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.18, 0, TAU);
    solid(ctx, '#fff1b8', lw * 0.5);
  },
  phoenix: ({ ctx, r, c, lw }) => {
    // Fire bird, wings spread
    ctx.moveTo(0, -r * 0.55);
    ctx.quadraticCurveTo(-r * 0.5, -r * 0.75, -r * 0.95, -r * 0.2);
    ctx.quadraticCurveTo(-r * 0.45, -r * 0.2, -r * 0.15, r * 0.05);
    ctx.moveTo(0, -r * 0.55);
    ctx.quadraticCurveTo(r * 0.5, -r * 0.75, r * 0.95, -r * 0.2);
    ctx.quadraticCurveTo(r * 0.45, -r * 0.2, r * 0.15, r * 0.05);
    neon(ctx, c, lw * 0.9, 0.25);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.75);
    ctx.quadraticCurveTo(r * 0.22, -r * 0.1, 0, r * 0.35);
    ctx.quadraticCurveTo(-r * 0.22, -r * 0.1, 0, -r * 0.75);
    neon(ctx, '#fff1b8', lw * 0.7, 0.5);
    ctx.beginPath();
    ctx.moveTo(-r * 0.25, r * 0.4);
    ctx.lineTo(-r * 0.35, r * 0.95);
    ctx.moveTo(0, r * 0.4);
    ctx.lineTo(0, r * 1.0);
    ctx.moveTo(r * 0.25, r * 0.4);
    ctx.lineTo(r * 0.35, r * 0.95);
    neon(ctx, c, lw * 0.6);
  },
  turret: paintTurret,
  bastion: paintTurret,
  drone: ({ ctx, r, c, lw }) => {
    // Quadcopter seen from above: X arms, four rotors, a body with its eye facing forward.
    const arm = r * 0.58;
    for (const [sx, sy] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      ctx.moveTo(sx * r * 0.18, sy * r * 0.18);
      ctx.lineTo(sx * arm, sy * arm);
    }
    neon(ctx, c, lw * 0.7);
    ctx.beginPath();
    for (const [sx, sy] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      ctx.moveTo(sx * arm + r * 0.3, sy * arm);
      ctx.arc(sx * arm, sy * arm, r * 0.3, 0, TAU);
    }
    neon(ctx, c, lw * 0.75, 0.18);
    // Blades (thin strokes across the rotors)
    ctx.beginPath();
    for (const [sx, sy] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      ctx.moveTo(sx * arm - r * 0.2, sy * arm + r * 0.07);
      ctx.lineTo(sx * arm + r * 0.2, sy * arm - r * 0.07);
    }
    neon(ctx, '#ffffff', lw * 0.4, 0, false);
    ctx.beginPath();
    ctx.moveTo(r * 0.3, 0);
    ctx.lineTo(0, r * 0.24);
    ctx.lineTo(-r * 0.24, 0);
    ctx.lineTo(0, -r * 0.24);
    ctx.closePath();
    neon(ctx, c, lw, 0.45);
    ctx.beginPath();
    ctx.arc(r * 0.07, 0, r * 0.08, 0, TAU);
    solid(ctx, '#ffffff', lw * 0.4);
  },
  squadron: ({ ctx, r, c, lw }) => {
    // Three drones orbiting a target, launching a disc.
    ctx.arc(0, 0, r * 0.62, 0, TAU);
    ctx.setLineDash([lw, lw * 1.8]);
    neon(ctx, c, lw * 0.5, 0, false);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.13, 0, TAU);
    solid(ctx, '#ff4f9a', lw * 0.5);
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + (k * TAU) / 3;
      const x = Math.cos(a) * r * 0.62;
      const y = Math.sin(a) * r * 0.62;
      // tangent arrow (rotation direction)
      const tx = -Math.sin(a);
      const ty = Math.cos(a);
      const L = r * 0.26;
      ctx.moveTo(x + tx * L, y + ty * L);
      ctx.lineTo(x - tx * L * 0.6 + Math.cos(a) * L * 0.6, y - ty * L * 0.6 + Math.sin(a) * L * 0.6);
      ctx.lineTo(x - tx * L * 0.25, y - ty * L * 0.25);
      ctx.lineTo(x - tx * L * 0.6 - Math.cos(a) * L * 0.6, y - ty * L * 0.6 - Math.sin(a) * L * 0.6);
      ctx.closePath();
    }
    neon(ctx, c, lw * 0.7, 0.45);
  },
  kamikaze_drones: ({ ctx, r, c, lw }) => {
    // Arrow diving onto an explosion
    ctx.moveTo(-r * 0.8, -r * 0.8);
    ctx.lineTo(-r * 0.05, -r * 0.35);
    ctx.lineTo(-r * 0.35, -r * 0.05);
    ctx.closePath();
    neon(ctx, c, lw * 0.9, 0.4);
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k * TAU) / 8;
      const rr = k & 1 ? r * 0.28 : r * 0.55;
      const px = r * 0.3 + Math.cos(a) * rr;
      const py = r * 0.3 + Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    neon(ctx, '#ffd23a', lw * 0.8, 0.35);
  },
  mortar: ({ ctx, r, c, lw }) => {
    // Tilted tube + arcing shell
    ctx.moveTo(-r * 0.75, r * 0.85);
    ctx.lineTo(-r * 0.25, r * 0.15);
    ctx.moveTo(-r * 0.45, r * 0.95);
    ctx.lineTo(-r * 0.05, r * 0.3);
    neon(ctx, c, lw * 1.1);
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, r * 0.1);
    ctx.quadraticCurveTo(r * 0.25, -r * 0.9, r * 0.75, r * 0.2);
    ctx.setLineDash([lw, lw * 1.5]);
    neon(ctx, c, lw * 0.5);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(r * 0.3, -r * 0.42, r * 0.17, 0, TAU);
    solid(ctx, '#ffffff', lw * 0.5);
    ctx.beginPath();
    ctx.ellipse(r * 0.75, r * 0.45, r * 0.25, r * 0.1, 0, 0, TAU);
    neon(ctx, c, lw * 0.6);
  },
  meteors: ({ ctx, r, c, lw }) => {
    // Two slanted meteors with their trails
    for (const [mx, my, k] of [
      [r * 0.35, r * 0.35, 1],
      [-r * 0.35, -r * 0.05, 0.65],
    ] as const) {
      ctx.moveTo(mx - r * 0.55 * k, my - r * 0.8 * k);
      ctx.lineTo(mx, my);
    }
    neon(ctx, c, lw * 0.8);
    ctx.beginPath();
    ctx.arc(r * 0.35, r * 0.35, r * 0.24, 0, TAU);
    ctx.moveTo(-r * 0.35 + r * 0.16, -r * 0.05);
    ctx.arc(-r * 0.35, -r * 0.05, r * 0.16, 0, TAU);
    solid(ctx, c, lw * 0.6);
  },
  ricochet: ({ ctx, r, c, lw }) => {
    // Path bouncing off two impacts, then the saw disc flying off.
    const hits: [number, number][] = [
      [-r * 0.6, -r * 0.05],
      [-r * 0.05, r * 0.62],
    ];
    ctx.moveTo(-r * 0.95, r * 0.75);
    ctx.lineTo(...hits[0]);
    ctx.lineTo(...hits[1]);
    ctx.lineTo(r * 0.3, r * 0.05);
    ctx.setLineDash([lw * 1.2, lw * 1.4]);
    neon(ctx, c, lw * 0.55, 0, false);
    ctx.setLineDash([]);
    ctx.beginPath();
    for (const [hx, hy] of hits) {
      for (let k = 0; k < 5; k++) {
        const a = (k * TAU) / 5 + 0.3;
        ctx.moveTo(hx + Math.cos(a) * r * 0.07, hy + Math.sin(a) * r * 0.07);
        ctx.lineTo(hx + Math.cos(a) * r * 0.17, hy + Math.sin(a) * r * 0.17);
      }
    }
    neon(ctx, '#ffffff', lw * 0.45, 0, false);
    // Saw disc: 8 teeth
    const dx = r * 0.45;
    const dy = -r * 0.38;
    ctx.beginPath();
    const T = 8;
    for (let k = 0; k < T; k++) {
      const a0 = (k * TAU) / T;
      const a1 = a0 + TAU / T;
      const p0 = [dx + Math.cos(a0) * r * 0.36, dy + Math.sin(a0) * r * 0.36];
      const p1 = [dx + Math.cos(a0 + 0.2) * r * 0.5, dy + Math.sin(a0 + 0.2) * r * 0.5];
      if (k === 0) ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.lineTo(dx + Math.cos(a1) * r * 0.36, dy + Math.sin(a1) * r * 0.36);
    }
    ctx.closePath();
    neon(ctx, c, lw * 0.85, 0.3);
    ctx.beginPath();
    ctx.arc(dx, dy, r * 0.12, 0, TAU);
    solid(ctx, '#ffffff', lw * 0.5);
  },
};

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
  (WEAPON_PAINTERS[id] ?? paintWeaponFallback)({ ctx, r, c, lw, id });
  ctx.restore();
}

function paintPassiveFallback({ ctx, r, c, lw }: IconArgs): void {
  ctx.rect(-r * 0.5, -r * 0.5, r, r);
  neon(ctx, c, lw);
}

/** Passive icons by passive id (tests/icons.test.ts checks the keys against PASSIVES). */
export const PASSIVE_PAINTERS: Record<string, IconPainter> = {
  overclock: ({ ctx, r, c, lw }) => {
    // Stopwatch: faster cooldown
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
  },
  thrusters: ({ ctx, r, c, lw }) => {
    // Double chevron: speed
    for (const ox of [-0.38, 0.22]) {
      ctx.moveTo(r * (ox - 0.25), -r * 0.6);
      ctx.lineTo(r * (ox + 0.3), 0);
      ctx.lineTo(r * (ox - 0.25), r * 0.6);
    }
    neon(ctx, c, lw * 1.3);
  },
  magnet: ({ ctx, r, c, lw }) => {
    ctx.arc(0, -r * 0.05, r * 0.5, Math.PI, 0, true);
    ctx.lineTo(r * 0.5, -r * 0.7);
    ctx.moveTo(-r * 0.5, -r * 0.05);
    ctx.lineTo(-r * 0.5, -r * 0.7);
    neon(ctx, c, lw * 1.6);
    ctx.beginPath();
    ctx.rect(-r * 0.66, -r * 0.88, r * 0.32, r * 0.24);
    ctx.rect(r * 0.34, -r * 0.88, r * 0.32, r * 0.24);
    solid(ctx, '#ffffff', lw * 0.5);
  },
  might: ({ ctx, r, c, lw }) => {
    // Sword: damage
    ctx.moveTo(r * 0.75, -r * 0.75);
    ctx.lineTo(-r * 0.25, r * 0.25);
    neon(ctx, c, lw * 1.4);
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, 0);
    ctx.lineTo(0, r * 0.5);
    ctx.moveTo(-r * 0.3, r * 0.3);
    ctx.lineTo(-r * 0.7, r * 0.7);
    neon(ctx, c, lw);
  },
  amplifier: ({ ctx, r, c, lw }) => {
    // Four outward arrows: area
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
  },
  vitality: ({ ctx, r, c, lw }) => {
    // Heart: vitality
    ctx.moveTo(0, r * 0.75);
    ctx.bezierCurveTo(-r * 1.05, 0, -r * 0.55, -r * 0.85, 0, -r * 0.35);
    ctx.bezierCurveTo(r * 0.55, -r * 0.85, r * 1.05, 0, 0, r * 0.75);
    ctx.closePath();
    neon(ctx, c, lw, 0.35);
  },
  armor: ({ ctx, r, c, lw }) => {
    shieldPath(ctx, r * 0.85);
    neon(ctx, c, lw, 0.2);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.45);
    ctx.lineTo(0, r * 0.45);
    neon(ctx, c, lw * 0.6);
  },
  luck: ({ ctx, r, c, lw }) => {
    // Four-leaf clover
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
  },
};

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
  (PASSIVE_PAINTERS[id] ?? paintPassiveFallback)({ ctx, r, c, lw, id });
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

/** Pickup families: a different frame makes them recognizable at a glance. */
const KIND_FAMILY: Record<PickupKind, 'bonus' | 'active' | 'relic' | 'chest'> = {
  instant: 'bonus',
  timed: 'bonus',
  active: 'active',
  relic: 'relic',
  chest: 'chest',
};
const PICKUP_DEFS = Object.fromEntries(PICKUPS.map((p) => [p.id, p])) as Record<PickupIcon, PickupDef>;

/** Pickup icons by pickup id (tests/icons.test.ts checks the keys against PICKUPS). */
export const PICKUP_PAINTERS: Record<PickupIcon, PickupPainter> = {
  heal: ({ ctx, q, c, lw }) => {
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
  },
  rage: ({ ctx, q, c, lw }) => {
    // Flame
    ctx.moveTo(0, -q);
    ctx.quadraticCurveTo(q * 0.9, -q * 0.1, q * 0.55, q * 0.55);
    ctx.quadraticCurveTo(q * 0.3, q * 0.95, 0, q * 0.9);
    ctx.quadraticCurveTo(-q * 0.3, q * 0.95, -q * 0.55, q * 0.55);
    ctx.quadraticCurveTo(-q * 0.8, q * 0.05, -q * 0.25, -q * 0.35);
    ctx.quadraticCurveTo(-q * 0.1, -q * 0.1, 0, -q);
    neon(ctx, c, lw * 0.8, 0.4);
  },
  frenzy: ({ ctx, q, c, lw }) => {
    // Circular arrows: faster cooldown
    ctx.arc(0, 0, q * 0.7, -2.6, 0.2);
    ctx.moveTo(q * 0.7 + q * 0.3, -q * 0.05);
    ctx.lineTo(q * 0.69, q * 0.15);
    ctx.lineTo(q * 0.45, -q * 0.12);
    ctx.moveTo(Math.cos(0.55) * -q * 0.7, Math.sin(0.55) * -q * 0.7);
    ctx.arc(0, 0, q * 0.7, Math.PI - 2.6 + 0.55, Math.PI + 0.2);
    neon(ctx, c, lw * 0.9);
  },
  turbo: ({ ctx, q, c, lw }) => {
    for (const ox of [-0.55, -0.05, 0.45]) {
      ctx.moveTo(q * (ox - 0.2), -q * 0.55);
      ctx.lineTo(q * (ox + 0.2), 0);
      ctx.lineTo(q * (ox - 0.2), q * 0.55);
    }
    neon(ctx, c, lw);
  },
  shield: ({ ctx, q, c, lw }) => {
    shieldPath(ctx, q * 0.9);
    neon(ctx, c, lw * 0.9, 0.3);
  },
  fever: ({ ctx, q, c, lw }) => {
    // XP gem topped by a rising arrow
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
  },
  totem: ({ ctx, q, c, lw }) => {
    // Ankh: loop, stem and bar, the symbol of returning life
    ctx.ellipse(0, -q * 0.48, q * 0.3, q * 0.4, 0, 0, TAU);
    ctx.moveTo(0, -q * 0.08);
    ctx.lineTo(0, q * 0.95);
    ctx.moveTo(-q * 0.55, q * 0.12);
    ctx.lineTo(q * 0.55, q * 0.12);
    neon(ctx, c, lw * 0.9);
  },
  clock: ({ ctx, q, c, lw }) => {
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
  },
  clone: ({ ctx, q, c, lw }) => {
    // Two offset octagons: the hero and their double
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
  },
  vacuum: ({ ctx, q, c, lw }) => {
    ctx.arc(0, -q * 0.05, q * 0.6, Math.PI, 0, true);
    ctx.lineTo(q * 0.6, -q * 0.8);
    ctx.moveTo(-q * 0.6, -q * 0.05);
    ctx.lineTo(-q * 0.6, -q * 0.8);
    neon(ctx, c, lw * 1.4);
  },
  freeze: ({ ctx, q, c, lw }) => {
    flakePath(ctx, q * 0.95);
    neon(ctx, c, lw * 0.8);
  },
  bomb: ({ ctx, q, c, lw }) => {
    ctx.arc(-q * 0.1, q * 0.15, q * 0.62, 0, TAU);
    neon(ctx, c, lw, 0.25);
    ctx.beginPath();
    ctx.moveTo(q * 0.3, -q * 0.32);
    ctx.quadraticCurveTo(q * 0.5, -q * 0.8, q * 0.8, -q * 0.7);
    neon(ctx, '#ffffff', lw * 0.6);
  },
  eradicate: ({ ctx, q, c, lw }) => {
    // 8-pointed explosion burst
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 8;
      const d = i % 2 ? q * 0.38 : q * 0.95;
      if (i === 0) ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d);
      else ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
    }
    ctx.closePath();
    neon(ctx, c, lw * 0.8, 0.35);
  },
  chest: ({ ctx, r, c, lw }) => {
    ctx.rect(-r * 0.85, -r * 0.45, r * 1.7, r * 1.15);
    ctx.moveTo(-r * 0.85, -r * 0.05);
    ctx.lineTo(r * 0.85, -r * 0.05);
    neon(ctx, c, lw, 0.2);
    ctx.beginPath();
    ctx.rect(-r * 0.14, -r * 0.2, r * 0.28, r * 0.36);
    solid(ctx, '#ffffff', lw * 0.5);
  },
};

/**
 * Pickups (world, HUD, codex).
 * Bonuses (heal and timed) in a circle, active items in a diamond, relics in a hexagon, chest unframed.
 * `framed = false`: pictogram only (HUD).
 */
export function drawPickupIcon(ctx: Ctx, kind: PickupIcon, cx: number, cy: number, size: number, framed = true): void {
  const r = size / 2;
  const lw = Math.max(1.6, size / 14);
  const def = PICKUP_DEFS[kind];
  const c = def.color;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const fam = KIND_FAMILY[def.kind];
  if (framed && fam !== 'chest') {
    ctx.beginPath();
    if (fam === 'bonus') ctx.arc(0, 0, r * 0.95, 0, TAU);
    else if (fam === 'relic') {
      // Relic: hexagon (neither a bonus circle nor an active-item diamond)
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
  PICKUP_PAINTERS[kind]?.({ ctx, r, q, c, lw });
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

/** Creates a small icon canvas for the DOM UI. */
export function iconCanvas(kind: 'weapon' | 'passive' | 'pickup', id: string, size: number): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(size);
  if (kind === 'weapon') drawWeaponIcon(ctx, id, size / 2, size / 2, size * 0.78);
  else if (kind === 'passive') drawPassiveIcon(ctx, id, size / 2, size / 2, size * 0.78);
  else drawPickupIcon(ctx, id as PickupIcon, size / 2, size / 2, size * 0.86);
  return cv;
}

export { makeCanvas };
