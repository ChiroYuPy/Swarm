import { describe, expect, it } from 'vitest';
import {
  createGame,
  step,
  hashState,
  encodeLog,
  decodeLog,
  replayToEnd,
  ReplayCursor,
  computeScore,
  serializeState,
  deserializeState,
  encodeMove,
  aimCode,
  isZeroTimeCode,
  PJ_BULLET,
  TICK_RATE,
} from '../src/sim';
import { playWithBot } from './helpers';

describe('input log and replay', () => {
  it('RLE + base64 encoding: exact round trip', () => {
    const codes = new Uint8Array(5000);
    for (let i = 0; i < codes.length; i++) codes[i] = i < 300 ? 0 : i % 700 < 350 ? 17 : (i * 7) % 129;
    codes[4000] = 201;
    const str = encodeLog(codes);
    expect(str.startsWith('N1.')).toBe(true);
    expect(Array.from(decodeLog(str))).toEqual(Array.from(codes));
  });

  it('a keyboard log is compact', () => {
    // 10 minutes with a direction change every ~0.7 s
    const codes = new Uint8Array(10 * 60 * TICK_RATE);
    for (let i = 0; i < codes.length; i++) codes[i] = 1 + ((Math.floor(i / 40) * 8) % 64);
    expect(encodeLog(codes).length).toBeLessThan(5000);
  });

  it('manual aim: zero-time step, shots in the chosen direction, exact replay', () => {
    const s = createGame({ seed: 'VISEE' });
    const codes: number[] = [];
    const play = (c: number) => {
      codes.push(c);
      step(s, [c]);
    };
    // Downwards (direction 16/64 = 90 deg), then back to auto-aim.
    play(aimCode(16));
    expect(isZeroTimeCode(aimCode(16)) && s.tick === 0 && s.players[0].aim === 16).toBe(true);
    let fired = false;
    for (let i = 0; i < 2 * TICK_RATE && !fired; i++) {
      play(0);
      for (let k = 0; k < s.projCount; k++) {
        const b = s.projectiles[k];
        if (b.kind !== PJ_BULLET || b.owner !== 0) continue;
        fired = true;
        expect(b.vy).toBeGreaterThan(0);
        expect(Math.abs(b.vx)).toBeLessThan(1e-6 * b.vy);
      }
    }
    expect(fired).toBe(true);
    play(aimCode(-1));
    expect(s.players[0].aim).toBe(-1);
    for (let i = 0; i < 5 * TICK_RATE; i++) play(encodeMove(1, 0));
    const replayed = replayToEnd({ seed: 'VISEE' }, decodeLog(encodeLog(Uint8Array.from(codes))));
    expect(hashState(replayed)).toBe(hashState(s));
  });

  it('replaying seed + log gives exactly the same game', () => {
    const { state, log } = playWithBot('RELECTURE', 150);
    const text = encodeLog(log.toArray());
    const replayed = replayToEnd({ seed: 'RELECTURE' }, decodeLog(text));
    expect(replayed.tick).toBe(state.tick);
    expect(hashState(replayed)).toBe(hashState(state));
    expect(computeScore(replayed)).toEqual(computeScore(state));
  });

  it('the step-by-step cursor reaches the same state', () => {
    const { state, log } = playWithBot('CURSEUR', 60);
    const cur = new ReplayCursor({ seed: 'CURSEUR' }, log.toArray());
    while (!cur.done) cur.next();
    expect(hashState(cur.state)).toBe(hashState(state));
  });

  it('serialize / restore mid-game then continue = same result', () => {
    const { state, log } = playWithBot('INSTANTANE', 70);
    const restored = deserializeState(serializeState(state));
    expect(hashState(restored)).toBe(hashState(state));
    // Continue both games with the same inputs.
    for (let i = 0; i < 20 * TICK_RATE; i++) {
      const code = encodeMove(Math.cos(i / 50), Math.sin(i / 50));
      const c = state.players[0].offers.length ? 200 : code;
      step(state, [c]);
      step(restored, [c]);
    }
    expect(hashState(restored)).toBe(hashState(state));
    expect(log.length).toBeGreaterThan(0);
  });

  it('movement encoding', () => {
    expect(encodeMove(0, 0)).toBe(0);
    expect(encodeMove(1, 0)).toBe(1);
    expect(encodeMove(0, 1)).toBe(17); // down = 90 deg
    expect(encodeMove(-1, 0)).toBe(33);
    expect(encodeMove(0, -1)).toBe(49);
    expect(encodeMove(0.4, 0)).toBe(65); // half speed
    const g = createGame({ seed: 'X' });
    expect(g.players[0].x).toBe(0); // start at the world origin
  });
});
