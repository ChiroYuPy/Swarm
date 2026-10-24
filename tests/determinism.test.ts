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

describe('determinism', () => {
  it('same seed + same inputs => identical final state (scripted inputs)', () => {
    const a = runScripted('DETERMINISME', 90 * TICK_RATE);
    const b = runScripted('DETERMINISME', 90 * TICK_RATE);
    expect(a.tick).toBeGreaterThan(0);
    expect(hashState(a)).toBe(hashState(b));
  });

  it('same seed + same inputs => identical state, long game driven by the bot', () => {
    const a = playWithBot('BOT-DETERMINISME', 200);
    const b = playWithBot('BOT-DETERMINISME', 200);
    expect(a.log.length).toBe(b.log.length);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(computeScore(a.state)).toEqual(computeScore(b.state));
    // The game really happened: enemies died, levels were gained.
    expect(a.state.players[0].kills).toBeGreaterThan(50);
    expect(a.state.players[0].level).toBeGreaterThan(3);
  });

  it('different seeds give different games', () => {
    const a = runScripted('SEED-A', 30 * TICK_RATE);
    const b = runScripted('SEED-B', 30 * TICK_RATE);
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('the seed is normalized (case, spaces)', () => {
    const a = createGame({ seed: '  tofu-furieux ' });
    const b = createGame({ seed: 'TOFU-FURIEUX' });
    expect(a.seed).toBe(b.seed);
    expect(hashState(a)).toBe(hashState(b));
  });

  it("waves do not depend on the player's actions", () => {
    // Two players with opposite behaviours: the wave stream must stay aligned.
    const still = createGame({ seed: 'VAGUES' });
    const moving = createGame({ seed: 'VAGUES' });
    for (let i = 0; i < 25 * TICK_RATE; i++) {
      step(still, [isAwaitingChoice(still) ? 200 : 0]);
      step(moving, [isAwaitingChoice(moving) ? 201 : scriptedCode(i, false)]);
    }
    // Only compare at equal ticks (zero-time level-up steps do not advance time).
    while (still.tick < moving.tick && !still.over) step(still, [isAwaitingChoice(still) ? 200 : 0]);
    while (moving.tick < still.tick && !moving.over) step(moving, [isAwaitingChoice(moving) ? 201 : 0]);
    expect(still.tick).toBe(moving.tick);
    expect(still.rngWaves.s).toBe(moving.rngWaves.s);
    expect(still.bossSpawned).toBe(moving.bossSpawned);
  });
});
