/**
 * Projectiles: player bullets (batched by weapon), boomerangs, mines, enemy fire, ground blaze, mortar shells
 * and meteors, drones, phoenixes, turrets, ricochet discs, enemy bullets and shockwave rings.
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
  PJ_DRONE,
  PJ_PHOENIX,
  PJ_RICOCHET,
  PJ_SHELL,
  PJ_TURRET,
  SQUADRON_WEAPON,
  KAMIKAZE_DRONES_WEAPON,
  type GameState,
} from '../sim';
import { drawPhoenix, drawShockwave } from './draw-weapon-fx';
import { hash01, lerp, type RenderView } from './view';

/** scratch: weapons that have at least one bullet in flight this frame */
const weaponSeen = new Uint8Array(ALL_WEAPONS.length);

export function drawProjectiles(view: RenderView, s: GameState, alpha: number): void {
  const ctx = view.ctx;
  const sp = view.sprites;
  // Player bullets: batched by weapon (one texture per weapon).
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
  // Boomerangs (continuous spin)
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_BOOMERANG) continue;
    const x = lerp(b.px, b.x, alpha);
    const y = lerp(b.py, b.y, alpha);
    if (!view.visible(x, y, 30)) continue;
    const a = (b.age + alpha) * 0.45;
    view.sprite(sp.boomerang[b.weapon], x, y, Math.cos(a), Math.sin(a), b.r / 10);
  }
  view.worldTransform();
  // Mines + indicator light once armed
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_MINE || !view.visible(b.x, b.y, 20)) continue;
    view.spriteAt(b.b < 65 ? sp.miniMine : sp.mine, b.x, b.y);
  }
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_MINE || b.age < b.a || (b.age >> 3) & 1 || !view.visible(b.x, b.y, 20)) continue;
    view.spriteAt(sp.mineLight, b.x, b.y);
  }
  // Star's flames: flickering orange discs that die out.
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
  // Player ground fire: Meteors craters (dashed ring, which tells it apart from the solid enemy fire)
  // and the Phoenix trail (simple flamelets), with rising embers.
  const flameCore = view.softPuff('#ffe9a8');
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_BLAZE || !view.visible(b.x, b.y, b.r)) continue;
    const def = ALL_WEAPONS[b.weapon];
    const col = def.color;
    if (def.behavior === 'phoenix') {
      const fade = Math.min(1, b.life / 40);
      const mid = view.softPuff(col);
      const deep = view.softPuff('#ff3d1a');
      // Ground glow, then rising flamelets (white at first, red as they die out).
      let R = b.r * 1.1;
      ctx.globalAlpha = 0.14 * fade;
      ctx.drawImage(fade > 0.6 ? mid : deep, b.x - R, b.y - R, R * 2, R * 2);
      for (let k = 0; k < 2; k++) {
        const h = hash01(i * 5 + k);
        const t = ((b.age * 0.035 + h) % 1 + 1) % 1;
        const ex = b.x + (h - 0.5) * b.r * 1.2;
        const ey = b.y + (hash01(k * 11 + i) - 0.5) * b.r - t * 20;
        R = b.r * (0.6 - 0.3 * t) * (0.5 + 0.5 * fade);
        ctx.globalAlpha = 0.32 * fade * (1 - t);
        ctx.drawImage(t < 0.5 ? mid : deep, ex - R, ey - R, R * 2, R * 2);
      }
      ctx.globalAlpha = 1;
      continue;
    }
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
  // Mortar shells (arcing, with their shadow) and Meteors (falling at an angle): the impact zone shows on the ground.
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
  // Autonomous drones: small oriented arrows that fade in.
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_DRONE) continue;
    const x = lerp(b.px, b.x, alpha);
    const y = lerp(b.py, b.y, alpha);
    if (!view.visible(x, y, 16)) continue;
    const def = ALL_WEAPONS[b.weapon];
    const sp = Math.hypot(b.vx, b.vy);
    const ux = sp > 5 ? b.vx / sp : 1;
    const uy = sp > 5 ? b.vy / sp : 0;
    const L = b.weapon === SQUADRON_WEAPON ? 10 : 8;
    ctx.beginPath();
    ctx.moveTo(x + ux * L, y + uy * L);
    ctx.lineTo(x - ux * L * 0.7 - uy * L * 0.7, y - uy * L * 0.7 + ux * L * 0.7);
    ctx.lineTo(x - ux * L * 0.35, y - uy * L * 0.35);
    ctx.lineTo(x - ux * L * 0.7 + uy * L * 0.7, y - uy * L * 0.7 - ux * L * 0.7);
    ctx.closePath();
    ctx.globalAlpha = Math.min(1, b.age / 20);
    ctx.fillStyle = def.color;
    const dive = b.weapon === KAMIKAZE_DRONES_WEAPON;
    ctx.globalAlpha *= dive && (b.age >> 2) & 1 ? 0.9 : 0.35;
    ctx.fill();
    ctx.globalAlpha = Math.min(1, b.age / 20);
    view.glow(def.color, 1.8);
    ctx.globalAlpha = 1;
  }
  // Phoenix: a fire bird with flapping wings, followed by flamelets.
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_PHOENIX) continue;
    const x = lerp(b.px, b.x, alpha);
    const y = lerp(b.py, b.y, alpha);
    if (!view.visible(x, y, b.r * 3)) continue;
    drawPhoenix(view, x, y, b.vx, b.vy, b.r, ALL_WEAPONS[b.weapon].color, b.age + alpha);
  }
  // Turrets: hexagonal base and barrel turned towards the target; they blink before vanishing.
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_TURRET || !view.visible(b.x, b.y, 30)) continue;
    if (b.life < 60 && (b.life >> 3) & 1) continue;
    const def = ALL_WEAPONS[b.weapon];
    const big = def.fusion ? 1.3 : 1;
    ctx.beginPath();
    view.polygon(b.x, b.y, 6, 12 * big, Math.PI / 6);
    ctx.fillStyle = def.color;
    ctx.globalAlpha = 0.15;
    ctx.fill();
    ctx.globalAlpha = 1;
    view.glow(def.color, 2);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + b.vx * 17 * big, b.y + b.vy * 17 * big);
    if (def.fusion) {
      const nx = -b.vy * 5;
      const ny = b.vx * 5;
      ctx.moveTo(b.x + nx, b.y + ny);
      ctx.lineTo(b.x + nx + b.vx * 15 * big, b.y + ny + b.vy * 15 * big);
      ctx.moveTo(b.x - nx, b.y - ny);
      ctx.lineTo(b.x - nx + b.vx * 15 * big, b.y - ny + b.vy * 15 * big);
    }
    view.glow(def.color, 3);
  }
  // Ricochet discs: a spinning ring with three notches.
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_RICOCHET) continue;
    const x = lerp(b.px, b.x, alpha);
    const y = lerp(b.py, b.y, alpha);
    if (!view.visible(x, y, b.r + 6)) continue;
    const rot = (b.age + alpha) * 0.5;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a0 = rot + (k * Math.PI * 2) / 3;
      ctx.moveTo(x + Math.cos(a0 + 0.35) * b.r, y + Math.sin(a0 + 0.35) * b.r);
      ctx.arc(x, y, b.r, a0 + 0.35, a0 + (Math.PI * 2) / 3 - 0.35);
    }
    view.glow(ALL_WEAPONS[b.weapon].color, 2.5);
    ctx.beginPath();
    ctx.arc(x, y, b.r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  // Enemy bullets: solid, red with a white core (distinct from everything else). Shooters' bullets,
  // which can be destroyed, are purple with a dashed ring.
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_EBULLET || b.life <= 0) continue;
    const x = lerp(b.px, b.x, alpha);
    const y = lerp(b.py, b.y, alpha);
    if (!view.visible(x, y, 10)) continue;
    view.spriteAt(b.a === 1 ? sp.breakableBullet : sp.enemyBullet, x, y);
  }

  // Shockwaves (Shockwave, Earthquake, Bastion): few of them, vector.
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_RING || !view.visible(b.x, b.y, b.a)) continue;
    drawShockwave(view, b.x, b.y, b.a, Math.min(1, (b.age + alpha) / b.b), ALL_WEAPONS[b.weapon].color, b.d >= 0.5, i);
  }
}
