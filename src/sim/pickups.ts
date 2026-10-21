/** Gemmes d'XP et objets ramassables (bonus instantanés, temporaires, activables, coffre). */
import { LOOT, PICKUPS } from '../data/loot';
import { DT, TICK_RATE } from './constants';
import { removeGem, removePickup } from './entities';
import { healPlayer } from './combat';
import { addXp, applyBuffs } from './player';
import { openChest } from './levelup';
import {
  EV_GEM,
  EV_PICKUP,
  PK_CHEST,
  PK_FIRST_ACTIVE,
  PK_FRENZY,
  PK_HEAL,
  PK_LAST_ACTIVE,
  PK_RAGE,
  PK_SHIELD,
  PK_TURBO,
  emit,
  type GameState,
  type Player,
} from './state';

function nearestAlive(s: GameState, x: number, y: number): { p: Player | null; d2: number } {
  let best: Player | null = null;
  let bestD = Infinity;
  for (const p of s.players) {
    if (!p.alive) continue;
    const dx = p.x - x;
    const dy = p.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  NEAR.p = best;
  NEAR.d2 = bestD;
  return NEAR;
}
const NEAR: { p: Player | null; d2: number } = { p: null, d2: 0 };

export function updateGems(s: GameState): void {
  for (let i = s.gemCount - 1; i >= 0; i--) {
    const g = s.gems[i];
    g.px = g.x;
    g.py = g.y;
    const { p: best, d2: bestD } = nearestAlive(s, g.x, g.y);
    if (!best) continue;
    if (!g.magnet) {
      if (bestD > best.stats.magnet * best.stats.magnet) continue;
      g.magnet = true;
    }
    const d = Math.sqrt(bestD);
    if (d < best.r + 8) {
      addXp(s, best, g.value);
      emit(s, EV_GEM, g.x, g.y, g.value, g.tier, 0, 0, best.index);
      removeGem(s, i);
      continue;
    }
    g.speed = Math.min(g.speed + 1100 * DT, 1000);
    const step = Math.min(d, g.speed * DT);
    g.x += ((best.x - g.x) / d) * step;
    g.y += ((best.y - g.y) / d) * step;
  }
}

export function updatePickups(s: GameState): void {
  for (let i = s.pickupCount - 1; i >= 0; i--) {
    const it = s.pickups[i];
    if (it.life > 0 && --it.life === 0) {
      removePickup(s, i);
      continue;
    }
    const { p, d2 } = nearestAlive(s, it.x, it.y);
    if (!p) continue;
    if (it.magnet && d2 > 1) {
      const d = Math.sqrt(d2);
      it.speed = Math.min(it.speed + 1100 * DT, 1000);
      const step = Math.min(d, it.speed * DT);
      it.x += ((p.x - it.x) / d) * step;
      it.y += ((p.y - it.y) / d) * step;
    }
    const dx = p.x - it.x;
    const dy = p.y - it.y;
    const rr = p.r + 18;
    if (dx * dx + dy * dy > rr * rr) continue;
    const kind = it.kind;
    const x = it.x;
    const y = it.y;
    removePickup(s, i);
    applyPickup(s, p, kind, x, y);
  }
}

function buffTicks(kind: number): number {
  return Math.round((PICKUPS[kind].duration ?? 5) * TICK_RATE);
}

function applyPickup(s: GameState, p: Player, kind: number, x: number, y: number): void {
  emit(s, EV_PICKUP, x, y, 0, kind, 0, 0, p.index);
  if (kind >= PK_FIRST_ACTIVE && kind <= PK_LAST_ACTIVE) {
    p.activable = kind; // un nouvel activable remplace l'ancien
    return;
  }
  // Un bonus temporaire déjà actif est prolongé (pas cumulé).
  const until = (cur: number) => Math.max(cur, s.tick) + buffTicks(kind);
  switch (kind) {
    case PK_HEAL:
      healPlayer(s, p, p.stats.maxHp * LOOT.healAmount);
      break;
    case PK_RAGE:
      p.rageUntil = until(p.rageUntil);
      break;
    case PK_FRENZY:
      p.frenzyUntil = until(p.frenzyUntil);
      break;
    case PK_TURBO:
      p.turboUntil = until(p.turboUntil);
      break;
    case PK_SHIELD:
      p.shieldUntil = until(p.shieldUntil);
      break;
    case PK_CHEST:
      openChest(s, p);
      break;
  }
  applyBuffs(p, s.tick);
}
