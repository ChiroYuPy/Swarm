import { describe, expect, it } from 'vitest';
import {
  createGame,
  step,
  isAwaitingChoice,
  availableFusions,
  PassiveInst,
  OFFER_FUSION,
  OFFER_HEAL,
  OFFER_PASSIVE,
  OFFER_WEAPON,
  TICK_RATE,
  type GameState,
  type Offer,
  type Player,
} from '../src/sim';
import { addWeapon, rollOffers } from '../src/sim/levelup';
import { PASSIVES } from '../src/data/passives';
import { ALL_WEAPONS, BASE_WEAPONS } from '../src/data/weapons';
import { LOOT } from '../src/data/loot';

/** Stands still until the first level-up (with a giant magnet to collect XP without moving). */
function untilLevelUp(s: GameState): void {
  s.players[0].base.magnet = 5000;
  for (let i = 0; i < 120 * TICK_RATE && !isAwaitingChoice(s) && !s.over; i++) step(s, [0]);
}

describe('level-up offers', () => {
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

  it('after the first level-ups, at most one new item per level-up while upgrades are left', () => {
    const s = createGame({ seed: 'AMELIORATIONS' });
    const p = s.players[0];
    give(p, ['blaster', 'saws', 'blade'], ['overclock', 'might']);
    let fresh = 0;
    const levels = 200;
    for (let level = LOOT.offers.earlyLevels + 2; level < LOOT.offers.earlyLevels + 2 + levels; level++) {
      const offers = roll(s, p, level);
      expect(offers.length).toBe(3);
      const n = offers.filter((o) => isNew(p, o)).length;
      expect(n, `level ${level}`).toBeLessThanOrEqual(1);
      fresh += n;
    }
    // About one level-up in two (newWeapon + newPassive = 0.75 here, both kinds have free slots).
    expect(fresh / levels).toBeGreaterThan(0.6);
    expect(fresh / levels).toBeLessThan(0.9);
  });

  it('the first level-ups can offer several new items', () => {
    const s = createGame({ seed: 'DEBUT' });
    const p = s.players[0];
    let most = 0;
    for (let seed = 0; seed < 20; seed++) {
      s.seed = seed;
      most = Math.max(most, roll(s, p, 2).filter((o) => isNew(p, o)).length);
    }
    expect(most).toBe(3);
  });

  it('an evolution is drawn like an upgrade of its max-level weapon', () => {
    const s = createGame({ seed: 'FUSION-OFFRE' });
    const p = s.players[0];
    p.weapons[0].level = 5;
    const fi = availableFusions(p)[0];
    let seen = 0;
    for (let level = 10; level < 60; level++) {
      const offers = roll(s, p, level);
      // Never the base weapon itself at max level.
      expect(offers.some((o) => o.kind === OFFER_WEAPON && o.id === p.weapons[0].def)).toBe(false);
      if (offers.some((o) => o.kind === OFFER_FUSION && o.id === fi)) seen++;
    }
    // Only upgrade left: offered on almost every level-up.
    expect(seen).toBeGreaterThan(40);
  });

  it('a heal sometimes takes a card, more often when few upgrades are left', () => {
    const s = createGame({ seed: 'SOIN' });
    const p = s.players[0];
    give(p, ['saws', 'blade', 'mortar', 'railgun', 'shuriken'], ['overclock', 'might', 'armor']);
    const heals = (): number => {
      let n = 0;
      for (let level = 10; level < 410; level++) {
        const offers = roll(s, p, level);
        expect(offers.filter((o) => o.kind === OFFER_HEAL).length).toBeLessThanOrEqual(1);
        if (offers.some((o) => o.kind === OFFER_HEAL)) n++;
      }
      return n;
    };
    const many = heals();
    for (const w of p.weapons) w.level = 5;
    for (const x of p.passives.slice(1)) x.level = 5;
    const few = heals();
    expect(many).toBeGreaterThan(0);
    expect(few).toBeGreaterThan(many * 2);
  });

  it('a full build is offered a heal only', () => {
    const s = createGame({ seed: 'COMPLET' });
    const p = s.players[0];
    give(p, ['shuriken', 'railgun', 'mines'], ['might', 'armor', 'overclock', 'magnet']);
    for (const id of ['spiral', 'scythe', 'hornets']) addWeapon(p, ALL_WEAPONS.findIndex((w) => w.id === id));
    for (const w of p.weapons) w.level = ALL_WEAPONS[w.def].levels.length;
    for (const x of p.passives) x.level = 5;
    expect(roll(s, p, 20)).toEqual([{ kind: OFFER_HEAL, id: 0, toLevel: 0 }]);
  });
});

function roll(s: GameState, p: Player, level: number): Offer[] {
  p.level = level;
  p.pendingLevels = 1;
  rollOffers(s, p);
  return p.offers;
}

function isNew(p: Player, o: Offer): boolean {
  if (o.kind === OFFER_WEAPON) return !p.weapons.some((w) => w.def === o.id);
  if (o.kind === OFFER_PASSIVE) return !p.passives.some((x) => x.def === o.id);
  return false;
}

function givePassive(p: Player, id: string, level: number): void {
  const x = new PassiveInst();
  x.def = PASSIVES.findIndex((d) => d.id === id);
  expect(x.def, id).toBeGreaterThanOrEqual(0);
  x.level = level;
  p.passives.push(x);
}

/** Replaces the build with these weapons and passives, all at level 1. */
function give(p: Player, weapons: string[], passives: string[]): void {
  p.weapons.length = 0;
  p.passives.length = 0;
  for (const id of weapons) {
    const def = BASE_WEAPONS.findIndex((w) => w.id === id);
    expect(def, id).toBeGreaterThanOrEqual(0);
    addWeapon(p, def);
  }
  for (const id of passives) givePassive(p, id, 1);
}
