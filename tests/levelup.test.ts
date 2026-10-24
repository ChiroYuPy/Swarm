import { describe, expect, it } from 'vitest';
import {
  createGame,
  step,
  isAwaitingChoice,
  offerOrder,
  PassiveInst,
  OFFER_FUSION,
  OFFER_PASSIVE,
  OFFER_WEAPON,
  TICK_RATE,
  type GameState,
} from '../src/sim';
import { PASSIVES } from '../src/data/passives';

/** Stands still until the first level-up (with a giant magnet to collect XP without moving). */
function untilLevelUp(s: GameState): void {
  s.players[0].base.magnet = 5000;
  for (let i = 0; i < 120 * TICK_RATE && !isAwaitingChoice(s) && !s.over; i++) step(s, [0]);
}

describe('level-up offers', () => {
  it('offer order depends only on (seed, level)', () => {
    const seed = 123456;
    expect(offerOrder(seed, 5)).toEqual(offerOrder(seed, 5));
    expect(offerOrder(seed, 5)).not.toEqual(offerOrder(seed, 6));
    expect(offerOrder(seed, 5)).not.toEqual(offerOrder(seed + 1, 5));
    expect(new Set(offerOrder(seed, 9)).size).toBe(offerOrder(seed, 9).length);
  });

  it('same seed, same build => same offers at the same level', () => {
    const a = createGame({ seed: 'PROPOSITIONS' });
    const b = createGame({ seed: 'PROPOSITIONS' });
    untilLevelUp(a);
    untilLevelUp(b);
    expect(isAwaitingChoice(a)).toBe(true);
    expect(a.players[0].offers).toEqual(b.players[0].offers);
    expect(a.players[0].offers.length).toBe(3);
  });

  it('offers are the same even if the path to get there differs', () => {
    // Player A stands still, player B moves: they reach level 2 at different times,
    // but with the same build => same offers.
    const a = createGame({ seed: 'CHEMINS' });
    const b = createGame({ seed: 'CHEMINS' });
    untilLevelUp(a);
    b.players[0].base.magnet = 5000;
    for (let i = 0; i < 120 * TICK_RATE && !isAwaitingChoice(b) && !b.over; i++) step(b, [1 + ((i >> 6) % 64)]);
    expect(isAwaitingChoice(b)).toBe(true);
    expect(a.players[0].offerLevel).toBe(b.players[0].offerLevel);
    expect(a.players[0].offers).toEqual(b.players[0].offers);
  });

  it("the player's choice is applied, and any offer can be picked", () => {
    const s = createGame({ seed: 'CHOIX' });
    untilLevelUp(s);
    const offer = s.players[0].offers[2];
    const tick = s.tick;
    step(s, [202]);
    expect(s.tick).toBe(tick); // zero-time step: time does not advance
    const p = s.players[0];
    if (offer.kind === OFFER_WEAPON) {
      expect(p.weapons.find((w) => w.def === offer.id)?.level).toBe(Math.max(1, offer.toLevel));
    } else if (offer.kind === OFFER_PASSIVE) {
      expect(p.passives.find((x) => x.def === offer.id)?.level).toBe(Math.max(1, offer.toLevel));
    }
  });

  it('the world is frozen during the choice', () => {
    const s = createGame({ seed: 'GEL' });
    untilLevelUp(s);
    const tick = s.tick;
    const x = s.players[0].x;
    for (let i = 0; i < 100; i++) step(s, [5]);
    expect(s.tick).toBe(tick);
    expect(s.players[0].x).toBe(x);
  });

  it('an available fusion is always offered first', () => {
    const s = createGame({ seed: 'FUSION-OFFRE' });
    untilLevelUp(s);
    const p = s.players[0];
    // Blaster at max level + Overclock at max level => Spiral
    p.weapons[0].level = 5;
    const overclock = new PassiveInst();
    overclock.def = PASSIVES.findIndex((x) => x.id === 'overclock');
    overclock.level = 5;
    p.passives.push(overclock);
    p.offers = [];
    p.pendingLevels = 1;
    // The offers are re-rolled on the next step.
    step(s, [0]);
    expect(p.offers[0].kind).toBe(OFFER_FUSION);
  });
});
