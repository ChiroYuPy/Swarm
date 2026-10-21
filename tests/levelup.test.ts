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

/** Avance immobile jusqu'au premier level-up (avec un aimant géant pour ramasser l'XP sans bouger). */
function untilLevelUp(s: GameState): void {
  s.players[0].base.magnet = 5000;
  for (let i = 0; i < 120 * TICK_RATE && !isAwaitingChoice(s) && !s.over; i++) step(s, [0]);
}

describe('propositions de level-up', () => {
  it("l'ordre des propositions ne dépend que de (seed, niveau)", () => {
    const seed = 123456;
    expect(offerOrder(seed, 5)).toEqual(offerOrder(seed, 5));
    expect(offerOrder(seed, 5)).not.toEqual(offerOrder(seed, 6));
    expect(offerOrder(seed, 5)).not.toEqual(offerOrder(seed + 1, 5));
    expect(new Set(offerOrder(seed, 9)).size).toBe(offerOrder(seed, 9).length);
  });

  it('même seed, même build => mêmes propositions au même niveau', () => {
    const a = createGame({ seed: 'PROPOSITIONS' });
    const b = createGame({ seed: 'PROPOSITIONS' });
    untilLevelUp(a);
    untilLevelUp(b);
    expect(isAwaitingChoice(a)).toBe(true);
    expect(a.players[0].offers).toEqual(b.players[0].offers);
    expect(a.players[0].offers.length).toBe(3);
  });

  it('les propositions sont les mêmes même si le chemin pour y arriver diffère', () => {
    // Joueur A immobile, joueur B qui bouge : ils atteignent le niveau 2 à des instants différents,
    // mais avec le même build => mêmes propositions.
    const a = createGame({ seed: 'CHEMINS' });
    const b = createGame({ seed: 'CHEMINS' });
    untilLevelUp(a);
    b.players[0].base.magnet = 5000;
    for (let i = 0; i < 120 * TICK_RATE && !isAwaitingChoice(b) && !b.over; i++) step(b, [1 + ((i >> 6) % 64)]);
    expect(isAwaitingChoice(b)).toBe(true);
    expect(a.players[0].offerLevel).toBe(b.players[0].offerLevel);
    expect(a.players[0].offers).toEqual(b.players[0].offers);
  });

  it('le choix du joueur est appliqué et libre', () => {
    const s = createGame({ seed: 'CHOIX' });
    untilLevelUp(s);
    const offer = s.players[0].offers[2];
    const tick = s.tick;
    step(s, [202]);
    expect(s.tick).toBe(tick); // pas « zéro » : le temps n'avance pas
    const p = s.players[0];
    if (offer.kind === OFFER_WEAPON) {
      expect(p.weapons.find((w) => w.def === offer.id)?.level).toBe(Math.max(1, offer.toLevel));
    } else if (offer.kind === OFFER_PASSIVE) {
      expect(p.passives.find((x) => x.def === offer.id)?.level).toBe(Math.max(1, offer.toLevel));
    }
  });

  it('le monde est figé pendant le choix', () => {
    const s = createGame({ seed: 'GEL' });
    untilLevelUp(s);
    const tick = s.tick;
    const x = s.players[0].x;
    for (let i = 0; i < 100; i++) step(s, [5]);
    expect(s.tick).toBe(tick);
    expect(s.players[0].x).toBe(x);
  });

  it('une fusion disponible est toujours proposée en premier', () => {
    const s = createGame({ seed: 'FUSION-OFFRE' });
    untilLevelUp(s);
    const p = s.players[0];
    // Blaster niveau max + Surcadence niveau max => Spirale
    p.weapons[0].level = 5;
    const cafe = new PassiveInst();
    cafe.def = PASSIVES.findIndex((x) => x.id === 'cafe');
    cafe.level = 5;
    p.passives.push(cafe);
    p.offers = [];
    p.pendingLevels = 1;
    // Les propositions sont retirées au pas suivant.
    step(s, [0]);
    expect(p.offers[0].kind).toBe(OFFER_FUSION);
  });
});
