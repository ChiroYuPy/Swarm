/**
 * Projectiles: player bullets (batched by weapon), boomerangs, mines, enemy fire, ground blaze, mortar shells
 * and meteors, bees, shurikens, enemy bullets and shockwave rings.
 */
import { ALL_WEAPONS } from '../data/weapons';
import {
  PJ_BULLET,
  PJ_EBULLET,
  PJ_MINE,
  PJ_BOOMERANG,
  PJ_RING,
  PJ_FIRE,
  PJ_BLAZE,
  PJ_BEE,
  PJ_SHELL,
  PJ_SHURIKEN,
  HORNETS_WEAPON,
  type GameState,
  type ProjectileKind,
} from '../sim';
import { BEE_DEAD } from '../sim/weapons';
import { drawShockwave } from './draw-weapon-fx';
import { hash01, lerp, type RenderView } from './view';

/** scratch: weapons that have at least one bullet in flight this frame */
const weaponSeen = new Uint8Array(ALL_WEAPONS.length);

/** Player bullets: batched by weapon (one texture per weapon). */
function drawBullets(view: RenderView, s: GameState, alpha: number): void {
  const sp = view.sprites;
  const seen = weaponSeen;
  seen.fill(0);
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind === PJ_BULLET) seen[b.weapon] = 1;
  }
  for (let w = 0; w < seen.length; w++) {
    if (!seen[w]) continue;
    const img = sp.bullet[w];
    for (let i = 0; i < s.projCount; i++) {
      const b = s.projectiles[i];
      if (b.kind !== PJ_BULLET || b.weapon !== w) continue;
      const x = lerp(b.px, b.x, alpha);
      const y = lerp(b.py, b.y, alpha);
      if (!view.visible(x, y, 20)) continue;
      const v = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
      view.sprite(img, x, y, b.vx / v, b.vy / v, Math.max(0.8, b.r / 6));
    }
  }
  view.worldTransform(); // view.sprite() leaves its own transform behind
}

/** Boomerangs (continuous spin) */
function drawBoomerangs(view: RenderView, s: GameState, alpha: number): void {
  const sp = view.sprites;
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_BOOMERANG) continue;
    const x = lerp(b.px, b.x, alpha);
    const y = lerp(b.py, b.y, alpha);
    if (!view.visible(x, y, 30)) continue;
    const a = (b.age + alpha) * 0.45;
    view.sprite(sp.boomerang[b.weapon], x, y, Math.cos(a), Math.sin(a), b.r / 10);
  }
  view.worldTransform(); // view.sprite() leaves its own transform behind
}

/** Mines: their blast zone (mines inside it go off together), the mine, its light once armed; white when set off by another. */
function drawMines(view: RenderView, s: GameState): void {
  const sp = view.sprites;
  const ctx = view.ctx;
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_MINE || !view.visible(b.x, b.y, b.b)) continue;
    const mini = ALL_WEAPONS[b.weapon].behavior === 'boomerang';
    if (!mini) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.b, 0, Math.PI * 2);
      ctx.strokeStyle = ALL_WEAPONS[b.weapon].color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = b.d > 0 ? 0.6 : 0.16;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    view.spriteAt(mini ? sp.miniMine : sp.mine, b.x, b.y);
  }
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_MINE || (b.d === 0 && (b.age < b.a || (b.age >> 3) & 1)) || !view.visible(b.x, b.y, 20)) continue;
    view.spriteAt(sp.mineLight, b.x, b.y);
  }
}

/** Star's flames: flickering orange discs that die out. */
function drawFires(view: RenderView, s: GameState): void {
  const ctx = view.ctx;
  let fires = false;
  ctx.beginPath();
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_FIRE || !view.visible(b.x, b.y, b.r)) continue;
    const fade = Math.min(1, b.life / 40);
    const r = b.r * (0.75 + 0.25 * fade) * (0.92 + 0.08 * Math.sin(b.age * 0.7 + i));
    ctx.moveTo(b.x + r, b.y);
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    fires = true;
  }
  if (fires) {
    ctx.fillStyle = '#ff8a1f';
    ctx.globalAlpha = 0.28;
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#ffd23a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** Player ground fire: Meteors craters (dashed ring, which tells it apart from the solid enemy fire), with rising embers. */
function drawBlazes(view: RenderView, s: GameState): void {
  const ctx = view.ctx;
  const flameCore = view.softPuff('#ffe9a8');
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_BLAZE || !view.visible(b.x, b.y, b.r)) continue;
    const def = ALL_WEAPONS[b.weapon];
    const col = def.color;
    const fade = Math.min(1, b.life / 30);
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.08 * fade;
    ctx.fill();
    ctx.setLineDash([4, 6]);
    ctx.globalAlpha = 0.5 * fade;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    const ember = view.softPuff(col);
    for (let k = 0; k < 9; k++) {
      const h = hash01(i * 7 + k);
      const t = ((b.age * 0.025 + h) % 1 + 1) % 1;
      const a = h * Math.PI * 2;
      const d = b.r * 0.8 * hash01(k * 13 + i);
      const ex = b.x + Math.cos(a) * d;
      const ey = b.y + Math.sin(a) * d - t * 22;
      const R = 7 + 11 * (1 - t);
      ctx.globalAlpha = 0.75 * fade * (1 - t);
      ctx.drawImage(t < 0.25 ? flameCore : ember, ex - R, ey - R, R * 2, R * 2);
    }
    ctx.globalAlpha = 1;
  }
}

/** Mortar shells (arcing, with their shadow) and Meteors (falling at an angle): the impact zone shows on the ground. */
function drawShells(view: RenderView, s: GameState, alpha: number): void {
  const ctx = view.ctx;
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_SHELL) continue;
    const col = ALL_WEAPONS[b.weapon].color;
    const t = Math.min(1, (b.age + alpha) / b.a);
    if (view.visible(b.tx, b.ty, b.b)) {
      ctx.beginPath();
      ctx.arc(b.tx, b.ty, b.b * (0.35 + 0.65 * t), 0, Math.PI * 2);
      ctx.setLineDash([6, 6]);
      ctx.globalAlpha = 0.25 + 0.35 * t;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    const gx = b.vx + (b.tx - b.vx) * t;
    const gy = b.vy + (b.ty - b.vy) * t;
    if (!view.visible(gx, gy, 400)) continue;
    if (b.c === 1) {
      // Meteor: comes from the top left, with a trail.
      const k = 1 - t;
      const mx = gx - 170 * k;
      const my = gy - 440 * k;
      // Fire tail
      const tail = view.softPuff(col);
      for (let q = 0; q < 8; q++) {
        const f = q / 8;
        const R = 14 * (1 - f) + 4;
        ctx.globalAlpha = 0.7 * (1 - f);
        ctx.drawImage(q < 2 ? view.softPuff('#ffe9a8') : tail, mx - 50 * f * 1.3 - R, my - 130 * f * 1.3 - R, R * 2, R * 2);
      }
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx - 50, my - 130);
      ctx.globalAlpha = 0.8;
      view.glow(col, 5);
      ctx.beginPath();
      ctx.arc(mx, my, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.globalAlpha = 1;
      view.glow(col, 3);
    } else {
      const dist = Math.hypot(b.tx - b.vx, b.ty - b.vy);
      const h = 4 * Math.min(160, dist * 0.45) * t * (1 - t);
      ctx.beginPath();
      ctx.ellipse(gx, gy, 6, 3, 0, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.25;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(gx, gy - h, 6, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;
      view.glow(col, 2);
    }
  }
}

/** Bees: small darts pointing where they fly (hornets bigger, blinking); they fade in when they come back. */
function drawBees(view: RenderView, s: GameState, alpha: number): void {
  const ctx = view.ctx;
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_BEE || b.a === BEE_DEAD) continue;
    const x = lerp(b.px, b.x, alpha);
    const y = lerp(b.py, b.y, alpha);
    if (!view.visible(x, y, 16)) continue;
    const col = ALL_WEAPONS[b.weapon].color;
    const hornet = b.weapon === HORNETS_WEAPON;
    const S = hornet ? 10 : 8;
    const a = b.tx;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * S, y + Math.sin(a) * S);
    ctx.lineTo(x + Math.cos(a + 2.45) * S * 0.85, y + Math.sin(a + 2.45) * S * 0.85);
    ctx.lineTo(x - Math.cos(a) * S * 0.3, y - Math.sin(a) * S * 0.3);
    ctx.lineTo(x + Math.cos(a - 2.45) * S * 0.85, y + Math.sin(a - 2.45) * S * 0.85);
    ctx.closePath();
    const born = Math.min(1, (b.age + alpha) / 20);
    ctx.fillStyle = col;
    ctx.globalAlpha = born * (hornet && (b.age >> 2) & 1 ? 0.9 : 0.5);
    ctx.fill();
    ctx.globalAlpha = born;
    view.glow(col, 1.6);
    ctx.globalAlpha = 1;
  }
}

/** Shurikens: a spinning four-pointed star with a white heart. */
function drawShurikens(view: RenderView, s: GameState, alpha: number): void {
  const ctx = view.ctx;
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_SHURIKEN) continue;
    const x = lerp(b.px, b.x, alpha);
    const y = lerp(b.py, b.y, alpha);
    if (!view.visible(x, y, b.r + 6)) continue;
    const rot = (b.age + alpha) * 0.27;
    const R = b.r;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(0, -R);
    ctx.lineTo(R * 0.4, 0);
    ctx.lineTo(0, R);
    ctx.lineTo(-R * 0.4, 0);
    ctx.closePath();
    ctx.moveTo(-R, 0);
    ctx.lineTo(0, -R * 0.4);
    ctx.lineTo(R, 0);
    ctx.lineTo(0, R * 0.4);
    ctx.closePath();
    const col = ALL_WEAPONS[b.weapon].color;
    ctx.globalAlpha = Math.min(1, b.life / 18);
    ctx.fillStyle = col;
    ctx.globalAlpha *= 0.25;
    ctx.fill();
    ctx.globalAlpha = Math.min(1, b.life / 18);
    view.glow(col, 2);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.14, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

/** Enemy bullets: solid, red with a white core (distinct from everything else). Shooters' bullets, which can be destroyed, are purple with a dashed ring. */
function drawEnemyBullets(view: RenderView, s: GameState, alpha: number): void {
  const sp = view.sprites;
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_EBULLET || b.life <= 0) continue;
    const x = lerp(b.px, b.x, alpha);
    const y = lerp(b.py, b.y, alpha);
    if (!view.visible(x, y, 10)) continue;
    view.spriteAt(b.a === 1 ? sp.breakableBullet : sp.enemyBullet, x, y);
  }
}

/** Shockwaves (Shockwave, Earthquake): few of them, vector. */
function drawRings(view: RenderView, s: GameState, alpha: number): void {
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_RING || !view.visible(b.x, b.y, b.a * 1.6)) continue;
    drawShockwave(view, b.x, b.y, b.a, (b.age + alpha) / b.b, ALL_WEAPONS[b.weapon].color, b.d >= 0.5, i);
  }
}

type DrawPass = (view: RenderView, s: GameState, alpha: number) => void;

/** One draw pass per projectile kind, back to front. */
const PASSES = [
  [PJ_BULLET, drawBullets],
  [PJ_BOOMERANG, drawBoomerangs],
  [PJ_MINE, drawMines],
  [PJ_FIRE, drawFires],
  [PJ_BLAZE, drawBlazes],
  [PJ_SHELL, drawShells],
  [PJ_BEE, drawBees],
  [PJ_SHURIKEN, drawShurikens],
  [PJ_EBULLET, drawEnemyBullets],
  [PJ_RING, drawRings],
] as const satisfies readonly (readonly [ProjectileKind, DrawPass])[];
type Undrawn = Exclude<ProjectileKind, (typeof PASSES)[number][0]>;
// Exhaustive: a ProjectileKind without a pass in PASSES fails to typecheck here (the error names it).
true satisfies [Undrawn] extends [never] ? true : { undrawn: Undrawn };

export function drawProjectiles(view: RenderView, s: GameState, alpha: number): void {
  for (let i = 0; i < PASSES.length; i++) PASSES[i][1](view, s, alpha);
}
