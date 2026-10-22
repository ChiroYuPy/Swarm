/**
 * Comportements des armes. Chaque `behavior` des données correspond à une fonction ici.
 * Pour ajouter une arme : réutiliser un comportement existant dans data/weapons.ts,
 * ou ajouter un cas dans le switch de `updateWeapons`.
 */
import type { WeaponLevel } from '../data/weapons';
import { INPUT_DIRS, MAX_WEAPON_SLOTS, TICK_RATE, DT } from './constants';
import { TWO_PI, dcos, datan2, dsin } from './dmath';
import { spawnProjectile } from './entities';
import { damageEnemy, healPlayer, pushEnemy } from './combat';
import { clearShotsIn, clearShotsOnLine } from './shots';
import { ENEMY_INDEX, weaponDef, weaponLevel } from './registry';
import {
  EF_BOSS,
  EV_LINE,
  EV_RING,
  EV_SHOOT,
  PJ_BLAZE,
  PJ_BOOMERANG,
  PJ_BULLET,
  PJ_DRONE,
  PJ_MINE,
  PJ_PHOENIX,
  PJ_RICOCHET,
  PJ_RING,
  PJ_SHELL,
  PJ_TURRET,
  emit,
  type GameState,
  type Player,
  type Projectile,
  type WeaponInst,
} from './state';

const HITS = new Int32Array(64);
let hitN = 0;
const FRONT_A = new Int32Array(64);
const FRONT_B = new Int32Array(64);

function cdTicks(L: WeaponLevel, p: Player): number {
  return Math.max(1, (L.cooldown ?? 1) * p.stats.cooldownMul * TICK_RATE);
}

function target(s: GameState, x: number, y: number, range: number): number {
  return s.grid.nearest(s.enemies, x, y, range, undefined, 0, true);
}

/** Angle vers la dernière cible trouvée par `aim`. */
let AIM = 0;

/**
 * Visée manuelle : la direction choisie, que des ennemis y soient ou non.
 * Sinon, vise l'ennemi le plus proche à portée. Renvoie false s'il n'y a personne (l'arme ne tire pas).
 */
function aim(s: GameState, p: Player, range: number): boolean {
  if (p.aim >= 0) {
    AIM = (p.aim * TWO_PI) / INPUT_DIRS;
    return true;
  }
  const ti = target(s, p.x, p.y, range);
  if (ti < 0) return false;
  const e = s.enemies[ti];
  AIM = datan2(e.y - p.y, e.x - p.x);
  return true;
}

/** Personne à portée : l'arme reste chargée et réessaie bientôt. */
const RETRY_TICKS = 6;

/** Balle du joueur `p`, partant de (ox, oy) (par défaut, du joueur). */
export function spawnBullet(
  s: GameState,
  p: Player,
  slot: number,
  def: number,
  a: number,
  L: WeaponLevel,
  ox = p.x,
  oy = p.y,
): Projectile | null {
  const b = spawnProjectile(s);
  if (!b) return null;
  const speed = L.shotSpeed ?? L.speed ?? 450;
  b.kind = PJ_BULLET;
  b.owner = p.index;
  b.slot = slot;
  b.weapon = def;
  b.x = b.px = ox;
  b.y = b.py = oy;
  b.vx = dcos(a) * speed;
  b.vy = dsin(a) * speed;
  b.life = Math.round((L.life ?? 1.2) * TICK_RATE);
  b.damage = L.damage * p.stats.might;
  b.pierce = L.pierce ?? 0;
  b.r = (L.size ?? 5) * p.stats.area;
  b.knock = 40;
  return b;
}

export function spawnMine(
  s: GameState,
  owner: number,
  def: number,
  x: number,
  y: number,
  damage: number,
  radius: number,
  trigger: number,
  life: number,
  arm: number,
  knock: number,
): void {
  const m = spawnProjectile(s);
  if (!m) return;
  m.kind = PJ_MINE;
  m.owner = owner;
  m.weapon = def;
  m.x = m.px = x;
  m.y = m.py = y;
  m.damage = damage;
  m.b = radius;
  m.c = trigger;
  m.a = arm;
  m.life = life;
  m.r = 9;
  m.knock = knock;
}

export function updateWeapons(s: GameState, p: Player): void {
  for (let slot = 0; slot < p.weapons.length; slot++) {
    const w = p.weapons[slot];
    const L = weaponLevel(w.def, w.level);
    switch (weaponDef(w.def).behavior) {
      case 'projectile':
        projectile(s, p, w, slot, L);
        break;
      case 'spiral':
        spiral(s, p, w, slot, L);
        break;
      case 'orbit':
        orbit(s, p, w, slot, L);
        break;
      case 'aura':
        aura(s, p, w, L);
        break;
      case 'beam':
        beam(s, p, w, L);
        break;
      case 'mine':
        mine(s, p, w, L);
        break;
      case 'boomerang':
        boomerang(s, p, w, slot, L);
        break;
      case 'chain':
        chain(s, p, w, L);
        break;
      case 'pulse':
        pulse(s, p, w, slot, L);
        break;
      case 'whip':
        whip(s, p, w, L);
        break;
      case 'scythe':
        scythe(s, p, w, L);
        break;
      case 'mortar':
        mortar(s, p, w, slot, L);
        break;
      case 'phoenix':
        phoenix(s, p, w, slot, L);
        break;
      case 'flame':
        flame(s, p, w, L);
        break;
      case 'turret':
        turret(s, p, w, slot, L);
        break;
      case 'drone':
        drone(s, p, w, slot, L);
        break;
      case 'ricochet':
        ricochet(s, p, w, slot, L);
        break;
    }
  }
}

function projectile(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  if (!aim(s, p, 640)) {
    w.timer = RETRY_TICKS;
    return;
  }
  const a = AIM;
  const n = L.count ?? 1;
  const spread = L.spread ?? 0.2;
  for (let k = 0; k < n; k++) spawnBullet(s, p, slot, w.def, a + (k - (n - 1) / 2) * spread, L);
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

function spiral(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  if (!aim(s, p, 640)) {
    w.timer = RETRY_TICKS;
    return;
  }
  const n = L.count ?? 3;
  for (let k = 0; k < n; k++) spawnBullet(s, p, slot, w.def, w.angle + (k * TWO_PI) / n, L);
  w.angle += L.rotStep ?? 0.4;
  if (w.angle > TWO_PI) w.angle -= TWO_PI;
  w.shots++;
  const every = L.burstEvery ?? 8;
  if (w.shots % every === 0) {
    const a = AIM;
    const bc = L.burstCount ?? 5;
    const spread = L.spread ?? 0.15;
    for (let k = 0; k < bc; k++) spawnBullet(s, p, slot, w.def, a + (k - (bc - 1) / 2) * spread, L);
  }
  w.timer += cdTicks(L, p);
  if (w.shots % 3 === 0) emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

function orbit(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  const n = L.count ?? 2;
  const R = (L.radius ?? 75) * p.stats.area;
  const orbR = (L.size ?? 9) * p.stats.area;
  w.angle += (L.rotSpeed ?? 3) * DT;
  if (w.angle > TWO_PI) w.angle -= TWO_PI;
  w.vN = n;
  w.vR = R;
  w.vS = orbR;
  const key = p.index * MAX_WEAPON_SLOTS + slot;
  const hitCd = Math.round((L.hitCd ?? 0.5) * TICK_RATE);
  const dmg = L.damage * p.stats.might;
  const knock = L.knockback ?? 60;
  const pull = L.pull ?? 0;
  const pullR = (L.pullRadius ?? 0) * p.stats.area;
  const enemies = s.enemies;
  const g = s.grid;
  for (let k = 0; k < n; k++) {
    const a = w.angle + (k * TWO_PI) / n;
    const ox = p.x + dcos(a) * R;
    const oy = p.y + dsin(a) * R;
    clearShotsIn(s, ox, oy, orbR);
    if (pull > 0) {
      const m = g.query(enemies, ox, oy, pullR);
      for (let q = 0; q < m; q++) {
        const e = enemies[g.out[q]];
        if (!e.alive || e.flags & EF_BOSS || e.speed === 0) continue;
        const dx = ox - e.x;
        const dy = oy - e.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > pullR * pullR || d2 < 1) continue;
        const d = Math.sqrt(d2);
        e.kbx += (dx / d) * pull * 0.18;
        e.kby += (dy / d) * pull * 0.18;
      }
    }
    const m = g.query(enemies, ox, oy, orbR);
    for (let q = 0; q < m; q++) {
      const idx = g.out[q];
      const e = enemies[idx];
      if (!e.alive || e.immune[key] > s.tick) continue;
      const dx = e.x - ox;
      const dy = e.y - oy;
      const rr = orbR + e.r;
      if (dx * dx + dy * dy >= rr * rr) continue;
      e.immune[key] = s.tick + hitCd;
      const px = e.x - p.x;
      const py = e.y - p.y;
      const pd = Math.sqrt(px * px + py * py) || 1;
      damageEnemy(s, idx, dmg, p.index, (px / pd) * knock, (py / pd) * knock);
    }
  }
}

function aura(s: GameState, p: Player, w: WeaponInst, L: WeaponLevel): void {
  const R = (L.radius ?? 80) * p.stats.area;
  w.vR = R;
  if (w.activeTicks > 0) w.activeTicks--;
  w.tickTimer -= 1;
  if (w.tickTimer > 0) return;
  w.tickTimer += Math.max(1, Math.round((L.tick ?? 0.5) * TICK_RATE));
  const dmg = L.damage * p.stats.might;
  const slow = L.slow ?? 0;
  clearShotsIn(s, p.x, p.y, R);
  const g = s.grid;
  const n = g.query(s.enemies, p.x, p.y, R);
  let heal = 0;
  let hit = false;
  for (let q = 0; q < n; q++) {
    const idx = g.out[q];
    const e = s.enemies[idx];
    if (!e.alive) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const rr = R + e.r;
    if (dx * dx + dy * dy >= rr * rr) continue;
    if (slow > 0) {
      e.slowFactor = e.slowUntil > s.tick ? Math.max(e.slowFactor, slow) : slow;
      e.slowUntil = s.tick + Math.round((L.tick ?? 0.5) * TICK_RATE) + 6;
    }
    damageEnemy(s, idx, dmg, p.index, 0, 0);
    heal += dmg * (L.lifesteal ?? 0);
    hit = true;
  }
  if (hit) w.activeTicks = 8; // flash visuel du tic, seulement s'il a touché quelqu'un
  if (heal > 0) healPlayer(s, p, Math.min(heal, 4), false);
}

function beam(s: GameState, p: Player, w: WeaponInst, L: WeaponLevel): void {
  const len = L.length ?? 420;
  const width = (L.width ?? 8) * p.stats.area;
  const n = Math.min(4, L.count ?? 1);
  w.vLen = len;
  w.vW = width;
  w.vN = n;
  if (w.activeTicks > 0) {
    w.activeTicks--;
    w.tickTimer -= 1;
    if (w.tickTimer <= 0) {
      w.tickTimer += Math.max(1, Math.round((L.tick ?? 0.1) * TICK_RATE));
      const dmg = L.damage * p.stats.might;
      const g = s.grid;
      for (let b = 0; b < n; b++) {
        const ux = dcos(w.angles[b]);
        const uy = dsin(w.angles[b]);
        clearShotsOnLine(s, p.x, p.y, ux, uy, len, width);
        const m = g.query(s.enemies, p.x + (ux * len) / 2, p.y + (uy * len) / 2, len / 2 + width);
        for (let q = 0; q < m; q++) {
          const idx = g.out[q];
          const e = s.enemies[idx];
          if (!e.alive) continue;
          const rx = e.x - p.x;
          const ry = e.y - p.y;
          const t = rx * ux + ry * uy;
          if (t < -e.r || t > len + e.r) continue;
          const perp = Math.abs(rx * uy - ry * ux);
          if (perp > width + e.r) continue;
          damageEnemy(s, idx, dmg, p.index, 0, 0);
        }
      }
    }
    return;
  }
  w.timer -= 1;
  if (w.timer > 0) return;
  if (!aim(s, p, len)) {
    w.timer = RETRY_TICKS;
    return;
  }
  for (let b = 0; b < n; b++) w.angles[b] = AIM + (b * TWO_PI) / n;
  w.activeTicks = Math.round((L.duration ?? 0.4) * TICK_RATE);
  w.tickTimer = 0;
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

function mine(s: GameState, p: Player, w: WeaponInst, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  // Les mines sont des pièges : on en pose dès que des ennemis approchent, pas dans le vide.
  if (target(s, p.x, p.y, 400) < 0) {
    w.timer = RETRY_TICKS;
    return;
  }
  const n = L.count ?? 1;
  for (let k = 0; k < n; k++) {
    const a = w.angle + (k * TWO_PI) / n;
    const dist = n === 1 ? 0 : 42;
    spawnMine(
      s,
      p.index,
      w.def,
      p.x + dcos(a) * dist,
      p.y + dsin(a) * dist,
      L.damage * p.stats.might,
      (L.radius ?? 70) * p.stats.area,
      L.trigger ?? 34,
      Math.round((L.life ?? 9) * TICK_RATE),
      24,
      L.knockback ?? 200,
    );
  }
  w.angle += 2.4;
  if (w.angle > TWO_PI) w.angle -= TWO_PI;
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

function boomerang(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  if (!aim(s, p, 520)) {
    w.timer = RETRY_TICKS;
    return;
  }
  const a0 = AIM;
  const n = L.count ?? 1;
  const speed = L.speed ?? 400;
  const range = L.range ?? 260;
  for (let k = 0; k < n; k++) {
    const b = spawnProjectile(s);
    if (!b) break;
    const a = a0 + (k - (n - 1) / 2) * 0.5;
    b.kind = PJ_BOOMERANG;
    b.owner = p.index;
    b.slot = slot;
    b.weapon = w.def;
    b.x = b.px = p.x;
    b.y = b.py = p.y;
    b.vx = dcos(a);
    b.vy = dsin(a);
    b.a = 0;
    b.b = (speed * speed) / (2 * range);
    b.c = 0;
    b.d = speed;
    b.pierce = -1;
    b.r = (L.size ?? 11) * p.stats.area;
    b.damage = L.damage * p.stats.might;
    b.knock = L.knockback ?? 80;
    b.life = 6 * TICK_RATE;
  }
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

function chain(s: GameState, p: Player, w: WeaponInst, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  const g = s.grid;
  const enemies = s.enemies;
  const dmg = L.damage * p.stats.might;
  const range = L.range ?? 280;
  const jumpR = L.jumpRange ?? 150;
  const jumps = L.jumps ?? 2;
  const branch = L.branch ?? 1;
  const stun = Math.round((L.stun ?? 0) * TICK_RATE);
  const count = L.count ?? 1;
  hitN = 0;
  let fired = false;
  for (let c = 0; c < count; c++) {
    const first = g.nearest(enemies, p.x, p.y, range, HITS, hitN, true);
    if (first < 0) break;
    fired = true;
    zap(s, p, p.x, p.y, first, dmg, stun, w.def);
    let front = FRONT_A;
    let next = FRONT_B;
    let fn = 1;
    front[0] = first;
    for (let depth = 0; depth < jumps && fn > 0; depth++) {
      let nn = 0;
      for (let f = 0; f < fn; f++) {
        const src = enemies[front[f]];
        for (let b = 0; b < branch; b++) {
          if (hitN >= HITS.length - 1 || nn >= next.length) break;
          const t = g.nearest(enemies, src.x, src.y, jumpR, HITS, hitN, true);
          if (t < 0) break;
          zap(s, p, src.x, src.y, t, dmg, stun, w.def);
          next[nn++] = t;
        }
      }
      const tmp = front;
      front = next;
      next = tmp;
      fn = nn;
    }
  }
  if (!fired) {
    w.timer = RETRY_TICKS;
    return;
  }
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

function zap(s: GameState, p: Player, fx: number, fy: number, idx: number, dmg: number, stun: number, def: number): void {
  const e = s.enemies[idx];
  HITS[hitN++] = e.id;
  emit(s, EV_LINE, fx, fy, 0, def, e.x, e.y, p.index);
  if (stun > 0 && !(e.flags & EF_BOSS)) e.stunUntil = Math.max(e.stunUntil, s.tick + stun);
  damageEnemy(s, idx, dmg, p.index, 0, 0);
}

function pulse(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  if (w.burstLeft > 0) {
    w.burstTimer -= 1;
    if (w.burstTimer <= 0) {
      emitRing(s, p, w, slot, L);
      w.burstLeft--;
      w.burstTimer = Math.round((L.delay ?? 0.15) * TICK_RATE);
    }
  }
  w.timer -= 1;
  if (w.timer > 0) return;
  if (target(s, p.x, p.y, (L.radius ?? 140) * p.stats.area + 40) < 0) {
    w.timer = RETRY_TICKS;
    return;
  }
  emitRing(s, p, w, slot, L);
  w.burstLeft = (L.count ?? 1) - 1;
  w.burstTimer = Math.round((L.delay ?? 0.15) * TICK_RATE);
  w.timer += cdTicks(L, p);
}

function emitRing(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  spawnRing(s, p, slot, w.def, p.x, p.y, L);
}

/** Onde de choc du joueur `p` centrée en (x, y). */
export function spawnRing(s: GameState, p: Player, slot: number, def: number, x: number, y: number, L: WeaponLevel): void {
  const b = spawnProjectile(s);
  if (!b) return;
  const dur = Math.max(2, Math.round((L.duration ?? 0.35) * TICK_RATE));
  b.kind = PJ_RING;
  b.owner = p.index;
  b.slot = slot;
  b.weapon = def;
  b.x = b.px = x;
  b.y = b.py = y;
  b.a = (L.radius ?? 140) * p.stats.area;
  b.b = dur;
  b.c = Math.round((L.stun ?? 0) * TICK_RATE);
  b.d = L.slow ?? 0;
  b.tx = Math.round((L.slowTime ?? 0) * TICK_RATE);
  b.r = 0;
  b.damage = L.damage * p.stats.might;
  b.knock = L.knockback ?? 250;
  b.life = dur + 1;
  b.pierce = -1;
  emit(s, EV_RING, x, y, b.a, def, 0, 0, p.index);
}

// ---------- Fouet, Faux, Lance-flammes, Tourelle, Drones, Ricochet, Mortier, Phénix ----------

export const ticks = (sec: number | undefined, def: number) => Math.max(1, Math.round((sec ?? def) * TICK_RATE));

/** L'ennemi (dx, dy) depuis le joueur est-il dans le cône d'axe `a`, de demi-angle `arc` et de longueur `len` ? */
function inCone(dx: number, dy: number, r: number, a: number, arc: number, len: number): boolean {
  const d2 = dx * dx + dy * dy;
  const reach = len + r;
  if (d2 > reach * reach) return false;
  if (arc >= Math.PI) return true;
  const d = Math.sqrt(d2);
  if (d < r) return true;
  let diff = datan2(dy, dx) - a;
  while (diff > Math.PI) diff -= TWO_PI;
  while (diff < -Math.PI) diff += TWO_PI;
  return Math.abs(diff) <= arc + r / d;
}

/** Direction « devant toi » : la visée manuelle, sinon le sens de la marche. */
function facing(p: Player): number {
  return p.aim >= 0 ? (p.aim * TWO_PI) / INPUT_DIRS : datan2(p.faceY, p.faceX);
}

export const WHIP_FX_TICKS = 16;
/** écart entre deux lanières du Fouet (1/20 de tour) */
const WHIP_STEP = TWO_PI / 20;

/** Fouet : des lanières en éventail devant toi (1/5 de tour au plus), qui blessent et repoussent loin dans leur axe. */
function whip(s: GameState, p: Player, w: WeaponInst, L: WeaponLevel): void {
  if (w.activeTicks > 0) w.activeTicks--;
  w.timer -= 1;
  if (w.timer > 0) return;
  const len = (L.length ?? 160) * p.stats.area;
  if (target(s, p.x, p.y, len + 30) < 0) {
    w.timer = RETRY_TICKS;
    return;
  }
  const width = (L.width ?? 26) * p.stats.area;
  const n = Math.min(8, L.count ?? 1);
  const base = facing(p);
  const knock = L.knockback ?? 420;
  const stun = Math.round((L.stun ?? 0) * TICK_RATE);
  const dmg = L.damage * p.stats.might;
  const g = s.grid;
  for (let k = 0; k < n; k++) {
    // Éventail centré devant toi : 18° entre deux lanières, 72° pour 5.
    const a = base + (k - (n - 1) / 2) * WHIP_STEP;
    w.angles[k] = a;
    const ux = dcos(a);
    const uy = dsin(a);
    const m = g.query(s.enemies, p.x + (ux * len) / 2, p.y + (uy * len) / 2, len / 2 + width);
    for (let q = 0; q < m; q++) {
      const idx = g.out[q];
      const e = s.enemies[idx];
      if (!e.alive) continue;
      const rx = e.x - p.x;
      const ry = e.y - p.y;
      const t = rx * ux + ry * uy;
      if (t < -e.r || t > len + e.r) continue;
      if (Math.abs(rx * uy - ry * ux) > width + e.r) continue;
      if (dmg > 0) damageEnemy(s, idx, dmg, p.index, ux * knock, uy * knock);
      else pushEnemy(s, idx, ux * knock, uy * knock);
      if (stun > 0 && !(e.flags & EF_BOSS)) e.stunUntil = Math.max(e.stunUntil, s.tick + stun);
    }
  }
  w.vLen = len;
  w.vW = width;
  w.vN = n;
  w.activeTicks = WHIP_FX_TICKS;
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

export const SCYTHE_FX_TICKS = 18;

/** Faux : un coup instantané tout autour de toi, qui achève les ennemis presque morts. */
function scythe(s: GameState, p: Player, w: WeaponInst, L: WeaponLevel): void {
  if (w.activeTicks > 0) w.activeTicks--;
  w.timer -= 1;
  if (w.timer > 0) return;
  const len = (L.length ?? 150) * p.stats.area;
  if (target(s, p.x, p.y, len + 30) < 0) {
    w.timer = RETRY_TICKS;
    return;
  }
  const arc = L.arc ?? Math.PI;
  const n = Math.min(4, L.count ?? 1);
  const base = facing(p);
  const dmg = L.damage * p.stats.might;
  const knock = L.knockback ?? 100;
  const exec = L.execute ?? 0;
  const g = s.grid;
  for (let k = 0; k < n; k++) {
    const a = base + (k * TWO_PI) / n;
    w.angles[k] = a;
    const m = g.query(s.enemies, p.x, p.y, len);
    for (let q = 0; q < m; q++) {
      const idx = g.out[q];
      const e = s.enemies[idx];
      if (!e.alive) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (!inCone(dx, dy, e.r, a, arc, len)) continue;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      damageEnemy(s, idx, dmg, p.index, (dx / d) * knock, (dy / d) * knock);
      if (exec > 0 && e.alive && !(e.flags & EF_BOSS) && e.hp < e.maxHp * exec) damageEnemy(s, idx, e.hp + 1, p.index, 0, 0);
    }
  }
  w.vLen = len;
  w.vW = arc;
  w.vN = n;
  w.activeTicks = SCYTHE_FX_TICKS;
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

/**
 * Lance-flammes : des jets côte à côte, centrés là où tu vises, figés dans leur direction de départ (comme le laser).
 * Tornade de feu : des jets répartis tout autour, qui tournent sans arrêt.
 */
function flame(s: GameState, p: Player, w: WeaponInst, L: WeaponLevel): void {
  const len = (L.length ?? 135) * p.stats.area;
  const arc = L.arc ?? 0.32;
  const n = Math.min(8, L.count ?? 1);
  w.vLen = len;
  w.vW = arc;
  w.vN = n;
  if (L.spin) {
    w.angle += L.spin * DT;
    if (w.angle > TWO_PI) w.angle -= TWO_PI;
    for (let b = 0; b < n; b++) w.angles[b] = w.angle + (b * TWO_PI) / n;
    w.activeTicks = 2;
    flameTick(s, p, w, L, len, arc, n);
    return;
  }
  if (w.activeTicks > 0) {
    w.activeTicks--;
    flameTick(s, p, w, L, len, arc, n);
    return;
  }
  w.timer -= 1;
  if (w.timer > 0) return;
  if (!aim(s, p, len + 40)) {
    w.timer = RETRY_TICKS;
    return;
  }
  for (let b = 0; b < n; b++) w.angles[b] = AIM + (b - (n - 1) / 2) * 2 * arc;
  w.activeTicks = ticks(L.duration, 1.4);
  w.tickTimer = 0;
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

function flameTick(s: GameState, p: Player, w: WeaponInst, L: WeaponLevel, len: number, arc: number, n: number): void {
  w.tickTimer -= 1;
  if (w.tickTimer > 0) return;
  w.tickTimer += ticks(L.tick, 0.12);
  const dmg = L.damage * p.stats.might;
  const g = s.grid;
  const m = g.query(s.enemies, p.x, p.y, len);
  for (let q = 0; q < m; q++) {
    const idx = g.out[q];
    const e = s.enemies[idx];
    if (!e.alive) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    for (let b = 0; b < n; b++) {
      if (!inCone(dx, dy, e.r, w.angles[b], arc, len)) continue;
      damageEnemy(s, idx, dmg, p.index, 0, 0);
      break;
    }
  }
}

/** Sol en feu du joueur (cratère de Météore) : `dps` dégâts par seconde aux ennemis dessus. */
export function spawnBlaze(s: GameState, owner: number, def: number, x: number, y: number, radius: number, dps: number, life: number): void {
  const b = spawnProjectile(s);
  if (!b) return;
  b.kind = PJ_BLAZE;
  b.owner = owner;
  b.weapon = def;
  b.x = b.px = x;
  b.y = b.py = y;
  b.r = radius;
  b.a = dps;
  b.life = life;
  b.pierce = -1;
}

/** Tourelle / Bastion : posée là où tu es, elle tire seule (voir projectiles.ts). */
function turret(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  if (target(s, p.x, p.y, (L.range ?? 320) + 120) < 0) {
    w.timer = RETRY_TICKS;
    return;
  }
  const n = L.count ?? 1;
  for (let k = 0; k < n; k++) {
    const b = spawnProjectile(s);
    if (!b) break;
    const a = w.angle + (k * TWO_PI) / n;
    const dist = n === 1 ? 0 : 44;
    b.kind = PJ_TURRET;
    b.owner = p.index;
    b.slot = slot;
    b.weapon = w.def;
    b.lv = w.level;
    b.x = b.px = p.x + dcos(a) * dist;
    b.y = b.py = p.y + dsin(a) * dist;
    b.vx = dcos(a);
    b.vy = dsin(a);
    b.r = 14;
    b.a = 12 + k * 5;
    b.d = ticks(L.ringEvery, 2);
    b.life = ticks(L.life, 12);
    b.pierce = -1;
  }
  w.angle += 2.4;
  if (w.angle > TWO_PI) w.angle -= TWO_PI;
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

/**
 * Drones / Escadrille / Kamikazes : des agents autonomes (projectiles PJ_DRONE, voir projectiles.ts).
 * L'arme ne fait que compléter l'effectif : un drone abattu revient près de toi après `respawn` s.
 */
function drone(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  const n = L.count ?? 1;
  let alive = 0;
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind === PJ_DRONE && b.owner === p.index && b.weapon === w.def && b.life > 0) alive++;
  }
  w.vN = alive;
  if (alive >= n) return;
  if (w.burstTimer > 0) {
    w.burstTimer--;
    return;
  }
  const b = spawnProjectile(s);
  if (!b) return;
  const a = w.angle + alive * 2.1;
  w.angle += 1.3;
  b.kind = PJ_DRONE;
  b.owner = p.index;
  b.slot = slot;
  b.weapon = w.def;
  b.x = b.px = p.x + dcos(a) * 30;
  b.y = b.py = p.y + dsin(a) * 30;
  b.vx = dcos(a) * 80;
  b.vy = dsin(a) * 80;
  b.r = 8;
  b.a = 20;
  b.b = L.hp ?? 50;
  b.c = -1;
  b.d = alive;
  b.life = DRONE_LIFE;
  b.pierce = -1;
  w.burstTimer = 15; // les drones manquants arrivent un par un
}
/** durée de vie « infinie » d'un drone (il meurt abattu, ou quand l'arme disparaît) */
export const DRONE_LIFE = 1 << 30;

/**
 * Cible de drone, la plus proche de (x, y) dans cet ordre : un gênant libre, un ennemi libre, un gênant déjà pris,
 * un ennemi déjà pris. « Pris » = déjà visé par un autre de tes drones (ids dans `claimed[0..nClaimed)`).
 */
const PRIORITY: number[] = ['pentagone', 'meneur', 'teleporteur', 'cercle'].map((id) => ENEMY_INDEX[id]).filter((t) => t !== undefined);
export function huntTarget(
  s: GameState,
  x: number,
  y: number,
  range: number,
  priorityFirst: boolean,
  claimed: Int32Array,
  nClaimed: number,
): number {
  const g = s.grid;
  const m = g.query(s.enemies, x, y, range);
  let best = -1;
  let bestD = Infinity;
  let bestRank = 4;
  for (let q = 0; q < m; q++) {
    const idx = g.out[q];
    const e = s.enemies[idx];
    if (!e.alive || e.speed === 0) continue;
    let taken = false;
    for (let k = 0; k < nClaimed; k++) {
      if (claimed[k] === e.id) {
        taken = true;
        break;
      }
    }
    const rank = (taken ? 2 : 0) + (priorityFirst && PRIORITY.includes(e.type) ? 0 : 1);
    if (rank > bestRank) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d = dx * dx + dy * dy;
    if (rank < bestRank || d < bestD) {
      best = idx;
      bestD = d;
      bestRank = rank;
    }
  }
  return best;
}

/** Ricochet : des disques chercheurs qui rebondissent d'ennemi en ennemi (voir projectiles.ts). */
function ricochet(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  if (!aim(s, p, L.range ?? 520)) {
    w.timer = RETRY_TICKS;
    return;
  }
  const n = L.count ?? 1;
  const a0 = AIM;
  for (let k = 0; k < n; k++) spawnDisc(s, p, slot, w.def, p.x, p.y, a0 + (k - (n - 1) / 2) * 0.35, L);
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

export function spawnDisc(s: GameState, p: Player, slot: number, def: number, x: number, y: number, a: number, L: WeaponLevel): void {
  const b = spawnProjectile(s);
  if (!b) return;
  const speed = L.shotSpeed ?? L.speed ?? 440;
  b.kind = PJ_RICOCHET;
  b.owner = p.index;
  b.slot = slot;
  b.weapon = def;
  b.x = b.px = x;
  b.y = b.py = y;
  b.vx = dcos(a) * speed;
  b.vy = dsin(a) * speed;
  b.a = L.bounces ?? 4;
  b.c = -1;
  b.r = (L.size ?? 10) * p.stats.area;
  b.damage = L.damage * p.stats.might;
  b.knock = 50;
  b.pierce = -1;
  b.life = ticks(L.life, 3);
}

/** le Mortier ne vise pas les ennemis plus près que ça de toi */
const MORTAR_MIN = 200;

/** Candidats du Mortier (copiés : la recherche de voisins réutilise la grille). */
const CAND = new Int32Array(24);

/** Le Mortier vise le groupe le plus dense à portée (hors des ennemis tout près de toi), ou le plus proche. */
function mortarTarget(s: GameState, p: Player, range: number, minDist: number): number {
  const g = s.grid;
  const m = g.query(s.enemies, p.x, p.y, range);
  let c = 0;
  for (let q = 0; q < m && c < CAND.length; q++) {
    const e = s.enemies[g.out[q]];
    if (!e.alive || e.speed === 0 || isExcludedHit(e.id)) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    if (dx * dx + dy * dy < minDist * minDist) continue;
    CAND[c++] = g.out[q];
  }
  let best = -1;
  let bestN = -1;
  for (let k = 0; k < c; k++) {
    const e = s.enemies[CAND[k]];
    const n = g.query(s.enemies, e.x, e.y, 70);
    if (n > bestN) {
      bestN = n;
      best = CAND[k];
    }
  }
  return best >= 0 ? best : target(s, p.x, p.y, range);
}
function isExcludedHit(id: number): boolean {
  for (let i = 0; i < hitN; i++) if (HITS[i] === id) return true;
  return false;
}

/** Mortier / Météores : des obus (ou des météores) sur les groupes d'ennemis. */
function mortar(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  const range = L.range ?? 480;
  const n = L.count ?? 1;
  hitN = 0;
  let fired = 0;
  for (let k = 0; k < n; k++) {
    const t = mortarTarget(s, p, range, L.meteor ? 0 : MORTAR_MIN);
    if (t < 0) break;
    const e = s.enemies[t];
    HITS[hitN++] = e.id;
    // Un météore tombe du ciel pile sur sa cible ; un obus part de toi.
    const sx = L.meteor ? e.x : p.x;
    const sy = L.meteor ? e.y : p.y;
    spawnShell(
      s,
      p.index,
      slot,
      w.def,
      sx,
      sy,
      e.x,
      e.y,
      ticks(L.duration, 0.7),
      (L.radius ?? 70) * p.stats.area,
      L.damage * p.stats.might,
      L.knockback ?? 160,
      L.meteor ? 1 : 0,
    );
    fired++;
  }
  if (!fired) {
    w.timer = RETRY_TICKS;
    return;
  }
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

/** Obus en vol de (sx, sy) vers (tx, ty) pendant `flight` ticks. `meteor` : laisse un cratère en feu. */
export function spawnShell(
  s: GameState,
  owner: number,
  slot: number,
  def: number,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  flight: number,
  radius: number,
  damage: number,
  knock: number,
  meteor: number,
): void {
  const b = spawnProjectile(s);
  if (!b) return;
  b.kind = PJ_SHELL;
  b.owner = owner;
  b.slot = slot;
  b.weapon = def;
  b.x = b.px = sx;
  b.y = b.py = sy;
  b.vx = sx;
  b.vy = sy;
  b.tx = tx;
  b.ty = ty;
  b.a = Math.max(1, flight);
  b.b = radius;
  b.c = meteor;
  b.damage = damage;
  b.knock = knock;
  b.life = b.a + 2;
  b.pierce = -1;
}

/**
 * Phénix : des oiseaux de feu qui partent à travers la horde sans revenir (voir projectiles.ts).
 * Comme les drones, l'arme complète l'effectif : un oiseau éteint renaît près de toi après `respawn` s.
 */
function phoenix(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  const n = L.count ?? 1;
  let alive = 0;
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind === PJ_PHOENIX && b.owner === p.index && b.weapon === w.def && b.life > 0) alive++;
  }
  if (alive >= n) {
    w.timer = ticks(L.respawn, 0.8);
    return;
  }
  w.timer -= 1;
  if (w.timer > 0) return;
  if (!aim(s, p, 520)) {
    w.timer = RETRY_TICKS;
    return;
  }
  const b = spawnProjectile(s);
  if (!b) return;
  // Le deuxième oiseau part un peu de biais, pour ne pas suivre le premier.
  const a = AIM + (alive & 1 ? 0.6 : -0.3);
  b.kind = PJ_PHOENIX;
  b.owner = p.index;
  b.slot = slot;
  b.weapon = w.def;
  b.x = b.px = p.x;
  b.y = b.py = p.y;
  b.vx = dcos(a);
  b.vy = dsin(a);
  b.c = -1;
  b.r = (L.size ?? 26) * p.stats.area;
  b.damage = L.damage * p.stats.might;
  b.knock = L.knockback ?? 40;
  b.pierce = -1;
  b.life = ticks(L.life, 4);
  w.timer = 15; // le suivant ne part pas dans la même image
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}
