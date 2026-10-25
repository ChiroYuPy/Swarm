/**
 * Enemies: sprites batched by type, frozen shells, Jumper landing marks, Hexagon cracks, bomb sparks,
 * rising walls, kamikaze blast zones, then the boss on top.
 */
import { ENEMIES } from '../data/enemies';
import { BEHAVIOR, EF_BOSS, ENEMY_BEHAVIOR, SPLIT_INTO, WALL_RISE, WALL_TYPE, EGG_TYPE, MAX_ENEMIES, TICK_RATE, type GameState, type Enemy } from '../sim';
import { drawBoss } from './draw-bosses';
import { hash01, lerp, type RenderView } from './view';

const NUM_TYPES = ENEMIES.length;
/** Types by behaviour; each reads its own data (several types may share a behaviour). */
const typesOf = (b: number) => ENEMY_BEHAVIOR.flatMap((x, t) => (x === b ? [t] : []));
const KAMIKAZE_TYPES = typesOf(BEHAVIOR.KAMIKAZE);
const JUMPER_TYPES = typesOf(BEHAVIOR.JUMPER);
/** splitters crack as they lose HP; bombs show a burning fuse */
const SPLITTER_TYPES = ENEMIES.flatMap((d, t) => (SPLIT_INTO[t] >= 0 && d.behavior !== 'boss' ? [t] : []));
const BOMB_TYPES = ENEMIES.flatMap((d, t) => (d.shape === 'bomb' ? [t] : []));
/** per-type blast radius (kamikaze), landing radius and timings (jumper, in ticks) */
const KAMIKAZE_BLAST = ENEMIES.map((d) => d.blastRadius ?? 80);
const LAND_RADIUS = ENEMIES.map((d) => d.blastRadius ?? 40);
const HOP_CROUCH = ENEMIES.map((d) => Math.max(1, Math.round((d.hop?.crouch ?? 1) * TICK_RATE)));
const HOP_AIR = ENEMIES.map((d) => Math.max(1, Math.round((d.hop?.air ?? 1) * TICK_RATE)));
/** Jumper states (see hop() in src/sim/enemies.ts) */
const J_CROUCH = 1;
const J_AIR = 2;
const J_CROUCH_BACK = 4;
const J_AIR_BACK = 5;
const WALL_COLOR = ENEMIES[WALL_TYPE].color;

/** per-type scratch lists of visible enemy indices, refilled each frame */
const buckets: Int32Array[] = [];
for (let t = 0; t < NUM_TYPES; t++) buckets.push(new Int32Array(MAX_ENEMIES));
const bucketN = new Int32Array(NUM_TYPES);

/** A Jumper in the air: how high it is (0 → 1 → 0), else 0. */
function lift(e: Enemy): number {
  if (ENEMY_BEHAVIOR[e.type] !== BEHAVIOR.JUMPER || (e.ai !== J_AIR && e.ai !== J_AIR_BACK)) return 0;
  const k = Math.min(1, Math.max(0, 1 - e.timer / HOP_AIR[e.type]));
  return Math.sin(k * Math.PI);
}

/**
 * Jumpers: the landing circle fills while they crouch and stays while they fly (the attack: in their
 * colour; the hop away: faint, dashed), and a shadow under them in the air.
 */
function drawHops(view: RenderView, s: GameState): void {
  const ctx = view.ctx;
  for (const t of JUMPER_TYPES) {
    const color = ENEMIES[t].color;
    const R = LAND_RADIUS[t];
    for (let i = 0; i < s.enemyCount; i++) {
      const e = s.enemies[i];
      if (!e.alive || e.type !== t || e.ai < J_CROUCH || e.ai > J_AIR_BACK || e.ai === 3) continue;
      if (!view.visible(e.ax, e.ay, R)) continue;
      const attack = e.ai === J_CROUCH || e.ai === J_AIR;
      if (!attack) {
        ctx.beginPath();
        ctx.arc(e.ax, e.ay, e.r * 1.2, 0, Math.PI * 2);
        ctx.setLineDash([3, 6]);
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        const prog = e.ai === J_AIR ? 1 : Math.min(1, Math.max(0, 1 - e.timer / HOP_CROUCH[t]));
        ctx.beginPath();
        ctx.arc(e.ax, e.ay, R * prog, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.12 + 0.14 * prog;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(e.ax, e.ay, R, 0, Math.PI * 2);
        ctx.globalAlpha = 0.45 + 0.45 * prog;
        view.glow(color, 2);
      }
      const h = lift(e);
      if (h > 0) {
        // shadow on the ground, under where it flies
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + e.r * 0.6, e.r * (1 - h * 0.3), e.r * 0.45 * (1 - h * 0.3), 0, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.globalAlpha = 0.35;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
      }
      ctx.globalAlpha = 1;
    }
  }
}

/** Hexagons (splitters): cracks run from the corners as they lose HP, and light leaks through. */
function drawCracks(view: RenderView, s: GameState, alpha: number, time: number): void {
  const ctx = view.ctx;
  for (const t of SPLITTER_TYPES) {
    for (let i = 0; i < s.enemyCount; i++) {
      const e = s.enemies[i];
      if (!e.alive || e.type !== t) continue;
      const k = Math.min(1, Math.max(0, 1 - e.hp / e.maxHp));
      if (k < 0.02) continue;
      const x = lerp(e.px, e.x, alpha) + shakeOf(e, k);
      const y = lerp(e.py, e.y, alpha) + shakeOf(e, k, 1);
      if (!view.visible(x, y, e.r)) continue;
      const r = e.r;
      const fa = Math.atan2(e.vy || 0, e.vx || 1);
      ctx.beginPath();
      view.polygon(x, y, 6, r * 0.94, fa + Math.PI / 6);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = k * 0.2 + (k > 0.7 ? Math.sin(time * 16) * 0.05 : 0);
      ctx.fill();
      ctx.beginPath();
      for (let c = 0; c < 6; c++) {
        const len = Math.min(1, Math.max(0, k * 1.7 - c * 0.12));
        if (len <= 0) continue;
        let ang = fa + Math.PI / 6 + (c * Math.PI) / 3;
        let px = x + Math.cos(ang) * r;
        let py = y + Math.sin(ang) * r;
        ctx.moveTo(px, py);
        // 3 jagged segments toward the centre, the same for this enemy every frame
        const segs = len * 3;
        for (let j = 1; j <= 3; j++) {
          const f = Math.min(1, segs - (j - 1));
          if (f <= 0) break;
          ang += (hash01(e.id * 7 + c * 3 + j) - 0.5) * 0.7;
          const rr = r * (1 - j * 0.2);
          const nx = x + Math.cos(ang) * rr;
          const ny = y + Math.sin(ang) * rr;
          px += (nx - px) * f;
          py += (ny - py) * f;
          ctx.lineTo(px, py);
          if (f < 1) break;
        }
      }
      ctx.globalAlpha = 0.9;
      view.glow('#ffffff', 1.3);
      ctx.globalAlpha = 1;
    }
  }
}

/** Badly cracked: it shakes just before it bursts (decorative). */
function shakeOf(e: Enemy, k: number, axis = 0): number {
  return k > 0.75 ? (hash01(e.id * 13 + axis + Math.floor(performance.now() / 33)) - 0.5) * 2 : 0;
}

/** Bombs: the spark at the end of the fuse, crackling. */
function drawSparks(view: RenderView, s: GameState, alpha: number, time: number): void {
  const ctx = view.ctx;
  let any = false;
  ctx.beginPath();
  for (const t of BOMB_TYPES) {
    for (let i = 0; i < s.enemyCount; i++) {
      const e = s.enemies[i];
      if (!e.alive || e.type !== t || e.frozenUntil > s.tick) continue;
      const x = lerp(e.px, e.x, alpha);
      const y = lerp(e.py, e.y, alpha);
      if (!view.visible(x, y, e.r * 2)) continue;
      // fuse tip, behind it (the sprite faces (vx, vy))
      const fx = e.vx || 1;
      const fy = e.vy || 0;
      const tx = x - fx * e.r * 1.85 - fy * e.r * 0.2;
      const ty = y - fy * e.r * 1.85 + fx * e.r * 0.2;
      const sp = (e.ai === 1 ? 4.2 : 2.6) + Math.sin(time * 24 + e.id) * 1.2;
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 4 + time * 6 + e.id;
        ctx.moveTo(tx + Math.cos(a) * sp, ty + Math.sin(a) * sp);
        ctx.lineTo(tx - Math.cos(a) * sp, ty - Math.sin(a) * sp);
      }
      any = true;
    }
  }
  if (any) view.glow('#ffe14d', 1.4);
}

export function drawEnemies(view: RenderView, s: GameState, alpha: number, time: number): void {
  const ctx = view.ctx;
  const n = bucketN;
  n.fill(0);
  const tick = s.tick;
  let boss: Enemy | null = null;
  let frozenCount = 0;
  for (let i = 0; i < s.enemyCount; i++) {
    const e = s.enemies[i];
    if (!e.alive) continue;
    const x = lerp(e.px, e.x, alpha);
    const y = lerp(e.py, e.y, alpha);
    if (!view.visible(x, y, e.r * 1.5)) continue;
    if (e.flags & EF_BOSS) {
      boss = e;
      continue;
    }
    if (e.frozenUntil > tick) frozenCount++;
    buckets[e.type][n[e.type]++] = i;
  }
  // Sprites, batched by type then by variant (normal / flash) to limit texture switches.
  for (let t = 0; t < NUM_TYPES; t++) {
    const cnt = n[t];
    if (!cnt) continue;
    const list = buckets[t];
    const shape = ENEMIES[t].shape;
    const rotates = shape !== 'box' && shape !== 'dot' && shape !== 'block' && shape !== 'egg';
    // Kamikazes blink while their fuse burns, Jumpers while they crouch.
    const fuses = ENEMY_BEHAVIOR[t] === BEHAVIOR.KAMIKAZE;
    const hops = ENEMY_BEHAVIOR[t] === BEHAVIOR.JUMPER;
    const cracks = SPLITTER_TYPES.includes(t);
    for (let pass = 0; pass < 2; pass++) {
      const sp = pass === 0 ? view.sprites.enemy[t] : view.sprites.enemyFlash[t];
      if (!rotates) view.worldTransform();
      for (let k = 0; k < cnt; k++) {
        const e = s.enemies[list[k]];
        // Wall rising from the ground: drawn separately (dashed), not solid yet.
        if (t === WALL_TYPE && e.ai === 0) continue;
        const flash =
          e.frozenUntil > tick ||
          tick - e.hitTick < 5 ||
          (fuses && e.ai === 1 && ((tick >> 2) & 1) === 1) ||
          (hops && (e.ai === J_CROUCH || e.ai === J_CROUCH_BACK) && ((tick >> 3) & 1) === 1) ||
          (t === EGG_TYPE && e.timer < 50 && ((tick >> 2) & 1) === 1);
        if (flash !== (pass === 1)) continue;
        let x = lerp(e.px, e.x, alpha);
        let y = lerp(e.py, e.y, alpha);
        let scale = 1;
        if (cracks) {
          const k = 1 - e.hp / e.maxHp;
          x += shakeOf(e, k);
          y += shakeOf(e, k, 1);
        }
        if (hops) {
          // in the air: higher on screen, and bigger
          const h = lift(e);
          y -= h * e.r * 1.6;
          scale = 1 + h * 0.35;
        }
        if (rotates) view.sprite(sp, x, y, e.vx || 1, e.vy || 0, scale);
        else view.spriteAt(sp, x, y, scale);
      }
    }
  }
  view.worldTransform();

  // Frozen: an ice shell around the white sprite, blinking just before it melts.
  if (frozenCount > 0) {
    ctx.beginPath();
    for (let i = 0; i < s.enemyCount; i++) {
      const e = s.enemies[i];
      if (!e.alive || e.frozenUntil <= tick || (e.frozenUntil - tick < 40 && (tick >> 2) & 1)) continue;
      if (!view.visible(e.x, e.y, e.r * 1.5)) continue;
      const r = e.r * 1.3;
      ctx.moveTo(e.x + r, e.y);
      for (let k = 1; k <= 6; k++) ctx.lineTo(e.x + Math.cos((k * Math.PI) / 3) * r, e.y + Math.sin((k * Math.PI) / 3) * r);
    }
    ctx.globalAlpha = 0.8;
    view.glow('#9feaff', 1.6);
    ctx.globalAlpha = 1;
  }

  if (JUMPER_TYPES.some((t) => n[t] > 0)) drawHops(view, s);
  if (SPLITTER_TYPES.some((t) => n[t] > 0)) drawCracks(view, s, alpha, time);
  if (BOMB_TYPES.some((t) => n[t] > 0)) drawSparks(view, s, alpha, time);
  if (n[WALL_TYPE] > 0) drawRisingWalls(view, s, time);

  // Blast zone of the bubbles about to burst (every kamikaze type, each with its own radius)
  if (KAMIKAZE_TYPES.some((t) => n[t] > 0)) {
    ctx.beginPath();
    let fusing = false;
    for (const t of KAMIKAZE_TYPES) {
      const list = buckets[t];
      const R = KAMIKAZE_BLAST[t];
      for (let k = 0; k < n[t]; k++) {
        const e = s.enemies[list[k]];
        if (e.ai !== 1) continue;
        const x = lerp(e.px, e.x, alpha);
        const y = lerp(e.py, e.y, alpha);
        ctx.moveTo(x + R, y);
        ctx.arc(x, y, R, 0, Math.PI * 2);
        fusing = true;
      }
    }
    if (fusing) {
      ctx.globalAlpha = 0.35 + 0.25 * ((tick >> 2) & 1);
      ctx.strokeStyle = '#ff2b2b';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  // Boss: vector (only one), with its warnings.
  if (boss) drawBoss(view, s, boss, lerp(boss.px, boss.x, alpha), lerp(boss.py, boss.y, alpha), time);
}

/** Walls rising from the ground: growing dashed outline. */
function drawRisingWalls(view: RenderView, s: GameState, time: number): void {
  const ctx = view.ctx;
  const rise = WALL_RISE * TICK_RATE;
  let any = false;
  ctx.beginPath();
  for (let i = 0; i < s.enemyCount; i++) {
    const e = s.enemies[i];
    if (!e.alive || e.type !== WALL_TYPE || e.ai !== 0 || !view.visible(e.x, e.y, e.r)) continue;
    const prog = Math.max(0, Math.min(1, 1 - (e.timer - e.aux) / rise));
    view.polygon(e.x, e.y, 6, e.r * (0.4 + 0.6 * prog), 0);
    any = true;
  }
  if (!any) return;
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -time * 20;
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = WALL_COLOR;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.globalAlpha = 1;
}
