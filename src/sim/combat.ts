/** Damage, deaths, loot, explosions. */
import { LOOT, PICKUPS, type PickupKind } from '../data/loot';
import { HERO } from '../data/hero';
import { TICK_RATE } from './constants';
import { PI, TWO_PI, datan2, dcos, dsin } from './dmath';
import { spawnEnemy, spawnGem, spawnPickup } from './entities';
import { circleHitsObstacle } from './map';
import { clearShotsIn } from './shots';
import { AFTER_BOSS_TICKS, BEHAVIOR, ENEMY_BEHAVIOR, SPLIT_INTO } from './registry';
import { dmgMul, hpMul, spdMul } from './spawner';
import { ENEMIES } from '../data/enemies';
import {
  EV_BOSS_DEAD,
  EV_DEATH,
  EV_EXPLOSION,
  EV_HEAL,
  EV_HIT,
  EV_HURT,
  EV_KILL,
  EV_REVIVE,
  EV_SHATTER,
  EF_BOSS,
  EF_PROP,
  DMG_COLD,
  DMG_FIRE,
  DMG_PHYS,
  PK_CHEST,
  PK_VACUUM,
  emit,
  type DamageType,
  type GameState,
  type Player,
} from './state';

/**
 * Deals damage to the enemy at index `idx`. Returns true if it dies. `owner` = credited player (-1 = nobody).
 * `quiet`: continuous burn (ground fire, burning) — the hit is flagged (x2 = 1) so it does not make noise every tick.
 * `type`: damage type, only shown (colour of the number).
 */
export function damageEnemy(
  s: GameState,
  idx: number,
  amount: number,
  owner: number,
  kx: number,
  ky: number,
  quiet = false,
  type: DamageType = DMG_PHYS,
): boolean {
  const e = s.enemies[idx];
  if (!e.alive) return false;
  owner = credited(s, owner);
  // Frozen: fragile and locked in place (no knockback).
  const frozen = e.frozenUntil > s.tick;
  if (frozen) amount *= LOOT.freezeFragile;
  e.hp -= amount;
  e.hitTick = s.tick;
  const k = 1 - e.kbResist;
  if (k > 0 && !frozen && (kx !== 0 || ky !== 0)) {
    e.kbx += kx * k;
    e.kby += ky * k;
  }
  if (owner >= 0) s.players[owner].damageDealt += amount;
  emit(s, EV_HIT, e.x, e.y - e.r, amount, e.type, quiet ? 1 : 0, type);
  if (e.hp <= 0) {
    killEnemy(s, idx, owner);
    return true;
  }
  return false;
}

/** a burning enemy takes its fire damage in ticks of this many sim ticks (0.5 s) */
export const BURN_TICKS = Math.round(TICK_RATE / 2);

/** Sets an enemy on fire: `dps` for `seconds` (the strongest burn wins, the longest duration wins). */
export function ignite(s: GameState, idx: number, dps: number, seconds: number, owner: number): void {
  const e = s.enemies[idx];
  if (!e.alive || dps <= 0) return;
  const burning = e.burnUntil > s.tick;
  if (!burning) e.burnNext = s.tick + BURN_TICKS;
  e.burnDps = burning ? Math.max(e.burnDps, dps) : dps;
  e.burnUntil = Math.max(e.burnUntil, s.tick + Math.round(seconds * TICK_RATE));
  e.burnOwner = owner;
}

/** Burning enemies take their fire damage, one tick every BURN_TICKS (shown as red numbers). */
export function updateBurns(s: GameState): void {
  const per = BURN_TICKS / TICK_RATE;
  for (let i = 0; i < s.enemyCount; i++) {
    const e = s.enemies[i];
    if (!e.alive || e.burnUntil <= 0) continue;
    if (s.tick >= e.burnNext && e.burnNext <= e.burnUntil) {
      e.burnNext += BURN_TICKS;
      damageEnemy(s, i, e.burnDps * per, e.burnOwner, 0, 0, true, DMG_FIRE);
    }
    if (e.alive && s.tick >= e.burnUntil) {
      e.burnUntil = 0;
      e.burnDps = 0;
    }
  }
}

/** Pushes an enemy back without hurting it (it still flashes, so the hit is visible). */
export function pushEnemy(s: GameState, idx: number, kx: number, ky: number): void {
  const e = s.enemies[idx];
  if (!e.alive || e.frozenUntil > s.tick) return;
  e.hitTick = s.tick;
  const k = 1 - e.kbResist;
  if (k <= 0) return;
  e.kbx += kx * k;
  e.kby += ky * k;
}

/** A clone credits its kills and damage to its original. */
function credited(s: GameState, owner: number): number {
  const p = owner >= 0 ? s.players[owner] : undefined;
  return p && p.master >= 0 ? p.master : owner;
}

export function killEnemy(s: GameState, idx: number, owner: number): void {
  const e = s.enemies[idx];
  owner = credited(s, owner);
  e.alive = false;
  e.hp = 0;
  const beh = ENEMY_BEHAVIOR[e.type];
  emit(s, EV_KILL, e.x, e.y, e.r, e.type);
  // Frozen: it shatters, the shards hurt its neighbours (handled at the end of the step, see processShatters).
  if (e.frozenUntil > s.tick) {
    const might = owner >= 0 ? s.players[owner].stats.might : 1;
    s.shatters.push(e.x, e.y, (LOOT.shatterDamage + e.maxHp * LOOT.shatterHp) * might, owner);
    emit(s, EV_SHATTER, e.x, e.y, LOOT.shatterRadius);
  }
  if (beh === BEHAVIOR.PROP) {
    dropPropLoot(s, e.x, e.y);
    return;
  }
  // Walls and eggs: no kill counted, no loot (an egg just gives its gem).
  if (beh === BEHAVIOR.WALL || beh === BEHAVIOR.EGG) {
    if (e.xp > 0) spawnGem(s, e.x, e.y, e.xp);
    return;
  }
  if (SPLIT_INTO[e.type] >= 0) split(s, e.x, e.y, e.vx, e.vy, e.type, e.target);
  if (owner >= 0) s.players[owner].kills++;
  s.totalKills++;
  if (beh === BEHAVIOR.BOSS) {
    if (owner >= 0) s.players[owner].bossKills++;
    for (const p of s.players) if (p.master < 0) p.swaps = Math.min(LOOT.swaps.max, p.swaps + LOOT.swaps.perBoss);
    if (s.bossId === e.id) {
      s.bossId = -1;
      // A bit of calm to pick up the chest before the waves resume.
      s.calmUntil = s.tick + AFTER_BOSS_TICKS;
    }
    spawnPickup(s, PK_CHEST, e.x, e.y);
    spawnPickup(s, randomActive(s), e.x + 60, e.y);
    const n = LOOT.bossGems.count;
    for (let i = 0; i < n; i++) {
      const a = (i * TWO_PI) / n;
      spawnGem(s, e.x + dcos(a) * 70, e.y + dsin(a) * 70, LOOT.bossGems.value);
    }
    emit(s, EV_BOSS_DEAD, e.x, e.y, 0, e.type);
    return;
  }
  const swarm = beh === BEHAVIOR.SWARM;
  if (swarm) {
    if (s.rngLoot.chance(LOOT.swarmGemChance)) spawnGem(s, e.x, e.y, e.xp);
  } else if (e.xp > 0) {
    spawnGem(s, e.x, e.y, e.xp);
  }
  // Loot: always 2 draws (rate, family) to keep a steady stream.
  const luck = owner >= 0 ? s.players[owner].stats.luck : 1;
  const mul = (swarm ? LOOT.swarmMul : 1) * luck;
  const r = s.rngLoot.next();
  const pick = s.rngLoot.next();
  if (r < LOOT.activeChance * mul) spawnPickup(s, pickFrom(ACTIVE_KINDS, ACTIVE_W, pick), e.x, e.y);
  else if (r < (LOOT.activeChance + LOOT.bonusChance) * mul) spawnPickup(s, pickFrom(BONUS_KINDS, BONUS_W, pick), e.x, e.y);
}

/**
 * Golem: its halves fly off to each side, perpendicular to its walk. They are born at the
 * end of the pool (outside this tick's grid): no ongoing query is disturbed.
 */
function split(s: GameState, x: number, y: number, fx: number, fy: number, type: number, target: number): void {
  const d = ENEMIES[type];
  const into = SPLIT_INTO[type];
  const n = d.splitCount ?? 2;
  const r = ENEMIES[into].radius;
  const fl = Math.sqrt(fx * fx + fy * fy) || 1;
  const a0 = datan2(fy / fl, fx / fl) + PI / 2;
  for (let k = 0; k < n; k++) {
    const a = a0 + (k * TWO_PI) / n;
    const ux = dcos(a);
    const uy = dsin(a);
    let cx = x + ux * d.radius * 0.6;
    let cy = y + uy * d.radius * 0.6;
    if (circleHitsObstacle(s.map, cx, cy, r)) {
      cx = x;
      cy = y;
    }
    const f = spawnEnemy(s, into, cx, cy, hpMul(s), dmgMul(s), spdMul(s), target);
    if (!f) return;
    f.kbx = ux * 260;
    f.kby = uy * 260;
    f.vx = ux;
    f.vy = uy;
    f.stunUntil = s.tick + 12;
  }
}

// Pickup families (PK_* codes = index into PICKUPS).
/** random-drop family of each pickup kind (null: never dropped at random) */
const DROP_FAMILY: Record<PickupKind, 'bonus' | 'active' | null> = { instant: 'bonus', timed: 'bonus', relic: 'bonus', active: 'active', chest: null };
const BONUS_KINDS = PICKUPS.map((p, i) => (DROP_FAMILY[p.kind] === 'bonus' ? i : -1)).filter((i) => i >= 0);
const BONUS_W = BONUS_KINDS.map((i) => PICKUPS[i].weight);
const ACTIVE_KINDS = PICKUPS.map((p, i) => (DROP_FAMILY[p.kind] === 'active' ? i : -1)).filter((i) => i >= 0);
const ACTIVE_W = ACTIVE_KINDS.map((i) => PICKUPS[i].weight);

function pickFrom(kinds: number[], weights: number[], u: number): number {
  let total = 0;
  for (const w of weights) total += w;
  let r = u * total;
  for (let i = 0; i < kinds.length; i++) {
    r -= weights[i];
    if (r < 0) return kinds[i];
  }
  return kinds[kinds.length - 1];
}

/** Bonus crate: an active item or a bonus, guaranteed. */
function dropPropLoot(s: GameState, x: number, y: number): void {
  const r = s.rngLoot.next();
  const pick = s.rngLoot.next();
  spawnPickup(s, r < LOOT.propActiveChance ? pickFrom(ACTIVE_KINDS, ACTIVE_W, pick) : pickFrom(BONUS_KINDS, BONUS_W, pick), x, y);
}

/** Item placed by the arena: mostly Vacuums (`u1` picks the family, `u2` the item). */
export function rollMapItem(u1: number, u2: number, vacuumAllowed: boolean): number {
  const m = LOOT.mapItems;
  if (vacuumAllowed && u1 < m.vacuumChance) return PK_VACUUM;
  return u2 < m.activeChance ? pickFrom(ACTIVE_KINDS, ACTIVE_W, u2 / m.activeChance) : pickFrom(BONUS_KINDS, BONUS_W, (u2 - m.activeChance) / (1 - m.activeChance));
}

/** Random active item (boss reward). */
export function randomActive(s: GameState): number {
  return pickFrom(ACTIVE_KINDS, ACTIVE_W, s.rngLoot.next());
}

const SHATTER_IDS: number[] = [];

/**
 * Pending Freeze shatters. A shatter that kills another frozen enemy adds a new one: the chain
 * reaction spreads through the whole frozen group. Called before enemy compaction (grid indices
 * still valid); the query is copied because damage can trigger other queries.
 */
export function processShatters(s: GameState): void {
  const q = s.shatters;
  const R = LOOT.shatterRadius;
  const g = s.grid;
  while (q.length >= 4) {
    const owner = q.pop()!;
    const dmg = q.pop()!;
    const y = q.pop()!;
    const x = q.pop()!;
    const n = g.query(s.enemies, x, y, R + 24);
    SHATTER_IDS.length = 0;
    for (let k = 0; k < n; k++) SHATTER_IDS.push(g.out[k]);
    for (const i of SHATTER_IDS) {
      const e = s.enemies[i];
      if (!e.alive || e.flags & EF_PROP) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const rr = R + e.r;
      if (dx * dx + dy * dy >= rr * rr) continue;
      damageEnemy(s, i, dmg, owner, 0, 0, false, DMG_COLD);
    }
  }
}

/** Circular explosion that hurts enemies (and optionally players). */
export function explode(
  s: GameState,
  x: number,
  y: number,
  radius: number,
  damage: number,
  owner: number,
  knock: number,
  playerDamage = 0,
): void {
  const g = s.grid;
  const n = g.query(s.enemies, x, y, radius);
  const out = g.out;
  for (let k = 0; k < n; k++) {
    const i = out[k];
    const e = s.enemies[i];
    if (!e.alive) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const rr = radius + e.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2);
    const nx = d > 0.001 ? dx / d : 0;
    const ny = d > 0.001 ? dy / d : 0;
    damageEnemy(s, i, damage, owner, nx * knock, ny * knock);
  }
  if (playerDamage > 0) {
    for (const p of s.players) {
      if (!p.alive) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      const rr = radius + p.r;
      if (dx * dx + dy * dy < rr * rr) hurtPlayer(s, p, playerDamage);
    }
  }
  if (playerDamage === 0) clearShotsIn(s, x, y, radius);
  emit(s, EV_EXPLOSION, x, y, radius, playerDamage > 0 ? 1 : 0);
}

/**
 * Hurts a player. Returns false if the hit is ignored (invulnerability).
 * `environment`: area damage, which ignores and does not trigger invulnerability.
 */
export function hurtPlayer(s: GameState, p: Player, amount: number, environment = false): boolean {
  // The clone is a decoy: it soaks up hits without ever going down.
  if (!p.alive || amount <= 0 || p.master >= 0) return false;
  if (p.shieldUntil > s.tick || s.sandbox?.invincible) return false;
  if (!environment) {
    if (s.tick < p.invulnUntil) return false;
    p.invulnUntil = s.tick + IFRAME_TICKS;
  }
  amount *= 1 - p.stats.armor;
  p.hp -= amount;
  p.hurtTick = s.tick;
  emit(s, EV_HURT, p.x, p.y, amount, environment ? 1 : 0, 0, 0, p.index);
  if (p.hp <= 0 && p.totem > 0) {
    revive(s, p);
    return true;
  }
  if (p.hp <= 0) {
    p.hp = 0;
    p.alive = false;
    p.deathTick = s.tick;
    emit(s, EV_DEATH, p.x, p.y, 0, 0, 0, 0, p.index);
  }
  return true;
}

const IFRAME_TICKS = Math.round(HERO.iframes * TICK_RATE);

/** Totem: the player comes back with half their HP, briefly invulnerable, and pushes everything away. */
function revive(s: GameState, p: Player): void {
  p.totem = 0;
  p.hp = p.stats.maxHp * LOOT.totemHeal;
  p.invulnUntil = s.tick + Math.round(LOOT.totemInvuln * TICK_RATE);
  const R = LOOT.totemRadius;
  const stun = s.tick + TICK_RATE;
  // Direct loop (no grid): this can be called while a grid query is in progress.
  for (let i = 0; i < s.enemyCount; i++) {
    const e = s.enemies[i];
    if (!e.alive || e.flags & (EF_BOSS | EF_PROP)) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > R * R) continue;
    const d = Math.sqrt(d2) || 1;
    e.kbx += (dx / d) * 900 * (1 - e.kbResist);
    e.kby += (dy / d) * 900 * (1 - e.kbResist);
    e.stunUntil = Math.max(e.stunUntil, stun);
  }
  clearShotsIn(s, p.x, p.y, R);
  emit(s, EV_REVIVE, p.x, p.y, R, 0, 0, 0, p.index);
}

export function healPlayer(s: GameState, p: Player, amount: number, notify = true): void {
  if (!p.alive) return;
  const before = p.hp;
  p.hp = Math.min(p.stats.maxHp, p.hp + amount);
  if (notify && p.hp > before) emit(s, EV_HEAL, p.x, p.y, p.hp - before, 0, 0, 0, p.index);
}

/** Nearest living player to a point (-1 if none). */
export function nearestPlayer(s: GameState, x: number, y: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < s.players.length; i++) {
    const p = s.players[i];
    if (!p.alive) continue;
    const dx = p.x - x;
    const dy = p.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
