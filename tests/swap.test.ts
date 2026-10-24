import { describe, expect, it } from 'vitest';
import {
  createGame,
  step,
  isAwaitingChoice,
  canSwap,
  swapCode,
  choiceCode,
  hashState,
  weaponDef,
  INPUT_SWAP_CANCEL,
  OFFER_SWAP,
  PK_VACUUM,
  EV_MAP_ITEM,
  TICK_RATE,
  type GameState,
} from '../src/sim';
import { spawnGem } from '../src/sim/entities';
import { weaponId } from '../src/sim/registry';
import { LOOT } from '../src/data/loot';

function untilLevelUp(s: GameState): void {
  s.players[0].base.magnet = 5000;
  for (let i = 0; i < 120 * TICK_RATE && !isAwaitingChoice(s) && !s.over; i++) step(s, [0]);
}

describe('weapon swap', () => {
  it('offers 3 weapons at the same level, replaces without using up the level-up, and costs a charge', () => {
    const s = createGame({ seed: 'ECHANGE' });
    untilLevelUp(s);
    const p = s.players[0];
    expect(p.swaps).toBe(LOOT.swaps.start);
    p.weapons[0].level = 3;
    const level = p.offerLevel;
    const pending = p.pendingLevels;
    expect(canSwap(p, 0)).toBe(true);

    step(s, [swapCode(0)]);
    expect(p.swapSlot).toBe(0);
    expect(p.offers.length).toBe(3);
    for (const o of p.offers) {
      expect(o.kind).toBe(OFFER_SWAP);
      expect(o.toLevel).toBe(3);
      expect(weaponDef(o.id).fusion).toBeFalsy();
      expect(o.id).not.toBe(weaponId('blaster'));
    }
    const target = p.offers[1].id;
    step(s, [choiceCode(1)]);
    expect(p.weapons[0].def).toBe(target);
    expect(p.weapons[0].level).toBe(3);
    expect(p.banned).toContain(weaponId('blaster'));
    expect(p.swaps).toBe(LOOT.swaps.start - 1);
    expect(p.swapSlot).toBe(-1);
    // The level-up is still to be chosen, with its normal offers.
    expect(p.pendingLevels).toBe(pending);
    expect(p.offerLevel).toBe(level);
    expect(p.offers.every((o) => o.kind !== OFFER_SWAP)).toBe(true);
    // No charge left: no more swaps.
    expect(canSwap(p, 0)).toBe(false);
  });

  it('cancelling restores the level-up offers, without spending a charge', () => {
    const s = createGame({ seed: 'ECHANGE' });
    untilLevelUp(s);
    const p = s.players[0];
    const before = p.offers.map((o) => ({ ...o }));
    step(s, [swapCode(0)]);
    step(s, [INPUT_SWAP_CANCEL]);
    expect(p.swapSlot).toBe(-1);
    expect(p.offers).toEqual(before);
    expect(p.swaps).toBe(LOOT.swaps.start);
  });

  it('a fusion can only be swapped for another fusion', () => {
    const s = createGame({ seed: 'ECHANGE' });
    untilLevelUp(s);
    const p = s.players[0];
    p.weapons[0].def = weaponId('spiral');
    p.weapons[0].level = 1;
    step(s, [swapCode(0)]);
    expect(p.offers.length).toBeGreaterThan(0);
    for (const o of p.offers) expect(weaponDef(o.id).fusion).toBe(true);
  });

  it('swaps are deterministic (same seed, same codes, same state)', () => {
    const run = () => {
      const s = createGame({ seed: 'ECHANGE' });
      untilLevelUp(s);
      step(s, [swapCode(0)]);
      step(s, [choiceCode(0)]);
      return hashState(s);
    };
    expect(run()).toBe(run());
  });
});

describe('arena items', () => {
  it('items spawn on their own near the player, mostly Vacuums', () => {
    const s = createGame({ seed: 'ARENE' });
    let vacuums = 0;
    let items = 0;
    const seen = new Set<number>();
    for (let i = 0; i < 10 * 60 * TICK_RATE && !s.over; i++) {
      if (isAwaitingChoice(s)) {
        step(s, [choiceCode(0)]);
        continue;
      }
      s.players[0].hp = s.players[0].stats.maxHp; // immortal: only item spawning is under test
      step(s, [0]);
      for (let k = 0; k < s.eventCount; k++) {
        const e = s.events[k];
        if (e.type !== EV_MAP_ITEM) continue;
        items++;
        if (e.k === PK_VACUUM) vacuums++;
        seen.add(e.k);
      }
    }
    expect(items).toBeGreaterThan(10);
    expect(vacuums / items).toBeGreaterThan(0.35);
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('gem merging', () => {
  it('past the threshold, a new gem merges into a nearby gem instead of being added', () => {
    const s = createGame({ seed: 'GEMMES' });
    for (let i = 0; i < 200; i++) spawnGem(s, 5000 + (i % 20) * 200, 5000 + Math.floor(i / 20) * 200, 1);
    expect(s.gemCount).toBe(200);
    spawnGem(s, 5010, 5010, 3);
    expect(s.gemCount).toBe(200);
    const g = s.gems.slice(0, s.gemCount).find((x) => x.x === 5000 && x.y === 5000)!;
    expect(g.value).toBe(4);
    spawnGem(s, 90000, 90000, 1);
    expect(s.gemCount).toBe(201);
  });
});
