/** XP gems and pickups (instant bonuses, timed buffs, active items, chest). */
import { LOOT, PICKUPS, type PickupId, type PickupIdOf } from '../data/loot';
import { DT, TICK_RATE } from './constants';
import { removeGem, removePickup } from './entities';
import { healPlayer } from './combat';
import { addXp, applyBuffs } from './player';
import { openChest } from './levelup';
import { EV_GEM, EV_PICKUP, emit, isActiveItem, type GameState, type Player } from './state';

function nearestAlive(s: GameState, x: number, y: number): { p: Player | null; d2: number } {
  let best: Player | null = null;
  let bestD = Infinity;
  for (const p of s.players) {
    if (!p.alive || p.master >= 0) continue; // clones pick nothing up
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

/** A timed buff that is already active is extended (not stacked). */
function buffUntil(s: GameState, cur: number, kind: number): number {
  return Math.max(cur, s.tick) + buffTicks(kind);
}

type PickupEffect = (s: GameState, p: Player, kind: number) => void;

/**
 * Effect of each pickup picked up, by id (active items are stored instead: see useActivable in player.ts).
 * Typed from the data: a new pickup fails to typecheck until it has its entry here.
 */
const PICKUP_EFFECTS: Record<Exclude<PickupId, PickupIdOf<'active'>>, PickupEffect> = {
  heal: (s, p) => healPlayer(s, p, p.stats.maxHp * LOOT.healAmount),
  rage: (s, p, kind) => {
    p.rageUntil = buffUntil(s, p.rageUntil, kind);
  },
  frenzy: (s, p, kind) => {
    p.frenzyUntil = buffUntil(s, p.frenzyUntil, kind);
  },
  turbo: (s, p, kind) => {
    p.turboUntil = buffUntil(s, p.turboUntil, kind);
  },
  shield: (s, p, kind) => {
    p.shieldUntil = buffUntil(s, p.shieldUntil, kind);
  },
  fever: (s, p, kind) => {
    p.feverUntil = buffUntil(s, p.feverUntil, kind);
  },
  totem: (s, p) => {
    // Only one Totem at a time: the next one turns into a heal.
    if (p.totem > 0) healPlayer(s, p, p.stats.maxHp * LOOT.healAmount);
    else p.totem = 1;
  },
  chest: (s, p) => openChest(s, p),
};
/** PICKUP_EFFECTS by pickup code (null for active items). */
const EFFECT_BY_CODE: (PickupEffect | null)[] = PICKUPS.map((d) =>
  d.kind === 'active' ? null : PICKUP_EFFECTS[d.id as keyof typeof PICKUP_EFFECTS],
);

function applyPickup(s: GameState, p: Player, kind: number, x: number, y: number): void {
  emit(s, EV_PICKUP, x, y, 0, kind, 0, 0, p.index);
  if (isActiveItem(kind)) {
    p.activeItem = kind; // a new active item replaces the old one
    return;
  }
  EFFECT_BY_CODE[kind]?.(s, p, kind);
  applyBuffs(p, s.tick);
}
