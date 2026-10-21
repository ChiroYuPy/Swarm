import { describe, expect, it } from 'vitest';
import { createGame, step, hashState, isAwaitingChoice, TICK_RATE, computeScore } from '../src/sim';
import { playWithBot, scriptedCode } from './helpers';

function runScripted(seed: string, ticks: number) {
  const s = createGame({ seed });
  const input = [0];
  for (let i = 0; i < ticks * 2 && s.tick < ticks && !s.over; i++) {
    input[0] = scriptedCode(i, isAwaitingChoice(s));
    step(s, input);
  }
  return s;
}

describe('déterminisme', () => {
  it('même seed + mêmes entrées => état final identique (entrées scriptées)', () => {
    const a = runScripted('DETERMINISME', 90 * TICK_RATE);
    const b = runScripted('DETERMINISME', 90 * TICK_RATE);
    expect(a.tick).toBeGreaterThan(0);
    expect(hashState(a)).toBe(hashState(b));
  });

  it('même seed + mêmes entrées => état identique, partie longue pilotée par le bot', () => {
    const a = playWithBot('BOT-DETERMINISME', 200);
    const b = playWithBot('BOT-DETERMINISME', 200);
    expect(a.log.length).toBe(b.log.length);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(computeScore(a.state)).toEqual(computeScore(b.state));
    // La partie a vraiment eu lieu : des ennemis sont morts, des niveaux ont été pris.
    expect(a.state.players[0].kills).toBeGreaterThan(50);
    expect(a.state.players[0].level).toBeGreaterThan(3);
  });

  it('des seeds différentes donnent des parties différentes', () => {
    const a = runScripted('SEED-A', 30 * TICK_RATE);
    const b = runScripted('SEED-B', 30 * TICK_RATE);
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('la seed est normalisée (casse, espaces)', () => {
    const a = createGame({ seed: '  tofu-furieux ' });
    const b = createGame({ seed: 'TOFU-FURIEUX' });
    expect(a.seed).toBe(b.seed);
    expect(hashState(a)).toBe(hashState(b));
  });

  it('les vagues ne dépendent pas des actions du joueur', () => {
    // Deux joueurs aux comportements opposés : le flux de vagues doit rester aligné.
    const still = createGame({ seed: 'VAGUES' });
    const moving = createGame({ seed: 'VAGUES' });
    for (let i = 0; i < 25 * TICK_RATE; i++) {
      step(still, [isAwaitingChoice(still) ? 200 : 0]);
      step(moving, [isAwaitingChoice(moving) ? 201 : scriptedCode(i, false)]);
    }
    // On ne compare qu'à tick égal (les pas « zéro » de level-up ne font pas avancer le temps).
    while (still.tick < moving.tick && !still.over) step(still, [isAwaitingChoice(still) ? 200 : 0]);
    while (moving.tick < still.tick && !moving.over) step(moving, [isAwaitingChoice(moving) ? 201 : 0]);
    expect(still.tick).toBe(moving.tick);
    expect(still.rngWaves.s).toBe(moving.rngWaves.s);
    expect(still.bossSpawned).toBe(moving.bossSpawned);
  });
});
