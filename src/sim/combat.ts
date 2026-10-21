/** Dégâts, morts, butin, explosions. */
import { LOOT, PICKUPS } from '../data/loot';
import { HERO } from '../data/hero';
import { TICK_RATE } from './constants';
import { TWO_PI, dcos, dsin } from './dmath';
import { spawnGem, spawnPickup } from './entities';
import { BEHAVIOR, ENEMY_BEHAVIOR } from './registry';
import {
  EV_BOSS_DEAD,
  EV_DEATH,
  EV_EXPLOSION,
  EV_HEAL,
  EV_HIT,
  EV_HURT,
  EV_KILL,
  PK_CHEST,
  emit,
  type GameState,
  type Player,
} from './state';

/** Inflige des dégâts à l'ennemi d'index `idx`. Renvoie true s'il meurt. `owner` = joueur crédité (-1 = personne). */
export function damageEnemy(s: GameState, idx: number, amount: number, owner: number, kx: number, ky: number): boolean {
  const e = s.enemies[idx];
  if (!e.alive) return false;
  e.hp -= amount;
  e.hitTick = s.tick;
  const k = 1 - e.kbResist;
  if (k > 0 && (kx !== 0 || ky !== 0)) {
    e.kbx += kx * k;
    e.kby += ky * k;
  }
  if (owner >= 0) s.players[owner].damageDealt += amount;
  emit(s, EV_HIT, e.x, e.y - e.r, amount, e.type);
  if (e.hp <= 0) {
    killEnemy(s, idx, owner);
    return true;
  }
  return false;
}

export function killEnemy(s: GameState, idx: number, owner: number): void {
  const e = s.enemies[idx];
  e.alive = false;
  e.hp = 0;
  const beh = ENEMY_BEHAVIOR[e.type];
  emit(s, EV_KILL, e.x, e.y, e.r, e.type);
  if (beh === BEHAVIOR.PROP) {
    dropPropLoot(s, e.x, e.y);
    return;
  }
  if (owner >= 0) s.players[owner].kills++;
  s.totalKills++;
  if (beh === BEHAVIOR.BOSS) {
    if (owner >= 0) s.players[owner].bossKills++;
    if (s.bossId === e.id) s.bossId = -1;
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
  // Butin : toujours 2 tirages (taux, famille) pour garder un flux régulier.
  const luck = owner >= 0 ? s.players[owner].stats.luck : 1;
  const mul = (swarm ? LOOT.swarmMul : 1) * luck;
  const r = s.rngLoot.next();
  const pick = s.rngLoot.next();
  if (r < LOOT.activeChance * mul) spawnPickup(s, pickFrom(ACTIVE_KINDS, ACTIVE_W, pick), e.x, e.y);
  else if (r < (LOOT.activeChance + LOOT.bonusChance) * mul) spawnPickup(s, pickFrom(BONUS_KINDS, BONUS_W, pick), e.x, e.y);
}

// Familles d'objets (codes PK_* = index dans PICKUPS).
const BONUS_KINDS = PICKUPS.map((p, i) => (p.kind === 'instant' || p.kind === 'timed' ? i : -1)).filter((i) => i >= 0);
const BONUS_W = BONUS_KINDS.map((i) => PICKUPS[i].weight);
const ACTIVE_KINDS = PICKUPS.map((p, i) => (p.kind === 'active' ? i : -1)).filter((i) => i >= 0);
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

/** Caisse bonus : un activable ou un bonus, à coup sûr. */
function dropPropLoot(s: GameState, x: number, y: number): void {
  const r = s.rngLoot.next();
  const pick = s.rngLoot.next();
  spawnPickup(s, r < LOOT.propActiveChance ? pickFrom(ACTIVE_KINDS, ACTIVE_W, pick) : pickFrom(BONUS_KINDS, BONUS_W, pick), x, y);
}

/** Objet activable tiré au sort (récompense de boss). */
export function randomActive(s: GameState): number {
  return pickFrom(ACTIVE_KINDS, ACTIVE_W, s.rngLoot.next());
}

/** Explosion circulaire qui blesse les ennemis (et optionnellement les joueurs). */
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
  emit(s, EV_EXPLOSION, x, y, radius, playerDamage > 0 ? 1 : 0);
}

/**
 * Blesse un joueur. Renvoie false si le coup est ignoré (invulnérabilité).
 * `environment` : dégâts de zone, qui ignorent et ne déclenchent pas l'invulnérabilité.
 */
export function hurtPlayer(s: GameState, p: Player, amount: number, environment = false): boolean {
  if (!p.alive || amount <= 0) return false;
  if (p.shieldUntil > s.tick || s.sandbox?.invincible) return false;
  if (!environment) {
    if (s.tick < p.invulnUntil) return false;
    p.invulnUntil = s.tick + IFRAME_TICKS;
  }
  amount *= 1 - p.stats.armor;
  p.hp -= amount;
  p.hurtTick = s.tick;
  emit(s, EV_HURT, p.x, p.y, amount, environment ? 1 : 0, 0, 0, p.index);
  if (p.hp <= 0) {
    p.hp = 0;
    p.alive = false;
    p.deathTick = s.tick;
    emit(s, EV_DEATH, p.x, p.y, 0, 0, 0, 0, p.index);
  }
  return true;
}

const IFRAME_TICKS = Math.round(HERO.iframes * TICK_RATE);

export function healPlayer(s: GameState, p: Player, amount: number, notify = true): void {
  if (!p.alive) return;
  const before = p.hp;
  p.hp = Math.min(p.stats.maxHp, p.hp + amount);
  if (notify && p.hp > before) emit(s, EV_HEAL, p.x, p.y, p.hp - before, 0, 0, 0, p.index);
}

/** Joueur vivant le plus proche d'un point (-1 si aucun). */
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
