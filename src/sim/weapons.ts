/**
 * Comportements des armes. Chaque `behavior` des données correspond à une fonction ici.
 * Pour ajouter une arme : réutiliser un comportement existant dans data/weapons.ts,
 * ou ajouter un cas dans le switch de `updateWeapons`.
 */
import type { WeaponLevel } from '../data/weapons';
import { MAX_WEAPON_SLOTS, TICK_RATE, DT } from './constants';
import { TWO_PI, dcos, datan2, dsin } from './dmath';
import { spawnProjectile } from './entities';
import { damageEnemy, healPlayer } from './combat';
import { weaponDef, weaponLevel } from './registry';
import {
  EF_BOSS,
  EV_LINE,
  EV_RING,
  EV_SHOOT,
  PJ_BOOMERANG,
  PJ_BULLET,
  PJ_MINE,
  PJ_RING,
  emit,
  type GameState,
  type Player,
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

/** Vise l'ennemi le plus proche à portée. Renvoie false s'il n'y a personne (l'arme ne tire pas). */
function aim(s: GameState, p: Player, range: number): boolean {
  const ti = target(s, p.x, p.y, range);
  if (ti < 0) return false;
  const e = s.enemies[ti];
  AIM = datan2(e.y - p.y, e.x - p.x);
  return true;
}

/** Personne à portée : l'arme reste chargée et réessaie bientôt. */
const RETRY_TICKS = 6;

function spawnBullet(
  s: GameState,
  p: Player,
  slot: number,
  def: number,
  a: number,
  L: WeaponLevel,
): void {
  const b = spawnProjectile(s);
  if (!b) return;
  const speed = L.speed ?? 450;
  b.kind = PJ_BULLET;
  b.owner = p.index;
  b.slot = slot;
  b.weapon = def;
  b.x = b.px = p.x;
  b.y = b.py = p.y;
  b.vx = dcos(a) * speed;
  b.vy = dsin(a) * speed;
  b.life = Math.round((L.life ?? 1.2) * TICK_RATE);
  b.damage = L.damage * p.stats.might;
  b.pierce = L.pierce ?? 0;
  b.r = (L.size ?? 5) * p.stats.area;
  b.knock = 40;
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
  const b = spawnProjectile(s);
  if (!b) return;
  const dur = Math.max(2, Math.round((L.duration ?? 0.35) * TICK_RATE));
  b.kind = PJ_RING;
  b.owner = p.index;
  b.slot = slot;
  b.weapon = w.def;
  b.x = b.px = p.x;
  b.y = b.py = p.y;
  b.a = (L.radius ?? 140) * p.stats.area;
  b.b = dur;
  b.c = Math.round((L.stun ?? 0) * TICK_RATE);
  b.r = 0;
  b.damage = L.damage * p.stats.might;
  b.knock = L.knockback ?? 250;
  b.life = dur + 1;
  b.pierce = -1;
  emit(s, EV_RING, p.x, p.y, b.a, w.def, 0, 0, p.index);
}
