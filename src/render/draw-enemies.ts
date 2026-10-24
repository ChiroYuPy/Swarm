/**
 * Enemies: sprites batched by type, frozen shells, leader zones and speed trails, blinker targets,
 * rising walls, kamikaze blast zones, then the boss on top.
 */
import { ENEMIES } from '../data/enemies';
import { BEHAVIOR, EF_BOSS, ENEMY_BEHAVIOR, RALLY_TYPE, WALL_RISE, WALL_TYPE, EGG_TYPE, MAX_ENEMIES, TICK_RATE, type GameState, type Enemy } from '../sim';
import { drawBoss } from './draw-bosses';
import { lerp, type RenderView } from './view';

const NUM_TYPES = ENEMIES.length;
/** Types by behaviour; each reads its own data (several types may share a behaviour). */
const typesOf = (b: number) => ENEMY_BEHAVIOR.flatMap((x, t) => (x === b ? [t] : []));
const KAMIKAZE_TYPES = typesOf(BEHAVIOR.KAMIKAZE);
const LEADER_TYPES = typesOf(BEHAVIOR.LEADER);
/** per-type blast radius (kamikaze), landing radius and fuse (blinker), aura radius (leader) */
const KAMIKAZE_BLAST = ENEMIES.map((d) => d.blastRadius ?? 80);
const BLINK_RADIUS = ENEMIES.map((d) => d.blastRadius ?? 52);
const BLINK_FUSE = ENEMIES.map((d) => Math.round((d.fuse ?? 1) * TICK_RATE));
const AURA_RADIUS = ENEMIES.map((d) => d.auraRadius ?? 170);
/** Rallied enemies don't know which leader rallied them (see RALLY_TYPE): trails take the strongest leader's color. */
const RALLY_COLOR = RALLY_TYPE >= 0 ? ENEMIES[RALLY_TYPE].color : '#ffffff';
const WALL_COLOR = ENEMIES[WALL_TYPE].color;

/** per-type scratch lists of visible enemy indices, refilled each frame */
const buckets: Int32Array[] = [];
for (let t = 0; t < NUM_TYPES; t++) buckets.push(new Int32Array(MAX_ENEMIES));
const bucketN = new Int32Array(NUM_TYPES);

/** Leaders: their zone (dashed, one path per leader type), and a trail behind every enemy they speed up. */
function drawLeaders(view: RenderView, s: GameState, alpha: number, time: number): void {
  if (LEADER_TYPES.length === 0) return;
  const ctx = view.ctx;
  const tick = s.tick;
  let trails = false;
  for (const lt of LEADER_TYPES) {
    const R = AURA_RADIUS[lt];
    let zones = false;
    ctx.beginPath();
    for (let i = 0; i < s.enemyCount; i++) {
      const e = s.enemies[i];
      if (!e.alive || e.type !== lt || e.frozenUntil > tick) continue;
      const x = lerp(e.px, e.x, alpha);
      const y = lerp(e.py, e.y, alpha);
      if (!view.visible(x, y, R)) continue;
      ctx.moveTo(x + R, y);
      ctx.arc(x, y, R, 0, Math.PI * 2);
      zones = true;
    }
    if (zones) {
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = ENEMIES[lt].color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 10]);
      ctx.lineDashOffset = -time * 20;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.globalAlpha = 1;
    }
  }
  ctx.beginPath();
  for (let i = 0; i < s.enemyCount; i++) {
    const e = s.enemies[i];
    if (!e.alive || e.boostUntil <= tick) continue;
    const x = lerp(e.px, e.x, alpha);
    const y = lerp(e.py, e.y, alpha);
    if (!view.visible(x, y, e.r * 3)) continue;
    // Two speed lines behind it.
    const fx = e.vx || 1;
    const fy = e.vy || 0;
    const nx = -fy * e.r * 0.5;
    const ny = fx * e.r * 0.5;
    const bx = x - fx * e.r * 1.2;
    const by = y - fy * e.r * 1.2;
    const L = e.r * 1.3;
    ctx.moveTo(bx + nx, by + ny);
    ctx.lineTo(bx + nx - fx * L, by + ny - fy * L);
    ctx.moveTo(bx - nx, by - ny);
    ctx.lineTo(bx - nx - fx * L, by - ny - fy * L);
    trails = true;
  }
  if (trails) {
    ctx.globalAlpha = 0.75;
    view.glow(RALLY_COLOR, 1.6);
    ctx.globalAlpha = 1;
  }
}

/** Teleporters (every blinker type): ground impact circle that fills up, linked to the teleporter. */
function drawBlinks(view: RenderView, s: GameState, alpha: number): void {
  const ctx = view.ctx;
  for (let i = 0; i < s.enemyCount; i++) {
    const e = s.enemies[i];
    if (!e.alive || ENEMY_BEHAVIOR[e.type] !== BEHAVIOR.BLINKER || e.ai !== 1) continue;
    const color = ENEMIES[e.type].color;
    const R = BLINK_RADIUS[e.type];
    const tx = e.aux;
    const ty = e.aux2;
    if (!view.visible(tx, ty, R)) continue;
    const prog = Math.min(1, Math.max(0, 1 - e.timer / BLINK_FUSE[e.type]));
    const x = lerp(e.px, e.x, alpha);
    const y = lerp(e.py, e.y, alpha);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tx, ty);
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 9]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(tx, ty, R * prog, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.18 + 0.12 * prog;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tx, ty, R, 0, Math.PI * 2);
    ctx.globalAlpha = 0.5 + 0.4 * prog;
    view.glow(color, 2);
    ctx.globalAlpha = 1;
  }
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
    // Kamikazes and teleporters blink while their fuse burns.
    const fuses = ENEMY_BEHAVIOR[t] === BEHAVIOR.KAMIKAZE || ENEMY_BEHAVIOR[t] === BEHAVIOR.BLINKER;
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
          (t === EGG_TYPE && e.timer < 50 && ((tick >> 2) & 1) === 1);
        if (flash !== (pass === 1)) continue;
        const x = lerp(e.px, e.x, alpha);
        const y = lerp(e.py, e.y, alpha);
        if (rotates) view.sprite(sp, x, y, e.vx || 1, e.vy || 0);
        else view.spriteAt(sp, x, y);
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

  drawLeaders(view, s, alpha, time);
  drawBlinks(view, s, alpha);
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
