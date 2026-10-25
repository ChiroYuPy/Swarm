import { describe, expect, it } from 'vitest';
import { createGame, step, aimCode, INPUT_DASH, TICK_RATE, type GameState } from '../src/sim';
import { spawnEnemy } from '../src/sim/entities';
import { enemyId } from '../src/sim/registry';
import { hurtPlayer } from '../src/sim/combat';
import { AIM, aim } from '../src/sim/weapons/common';
import { HERO } from '../src/data/hero';
import { defaultSandbox } from '../src/storage/storage';

/** Empty game (no automatic spawns, no boss, no weapon). */
function arena(): GameState {
  return createGame({ seed: 'DASH', sandbox: { ...defaultSandbox().rules, invincible: false, enemyMul: 0, bosses: false, weapons: [] } });
}

const DASH_TICKS = Math.round(HERO.dash.seconds * TICK_RATE);

describe('dash', () => {
  it('covers its distance in its duration, toward the facing when standing still', () => {
    const s = arena();
    const p = s.players[0];
    step(s, [0]);
    const x0 = p.x;
    const y0 = p.y;
    step(s, [INPUT_DASH]);
    for (let i = 0; i < DASH_TICKS + 5; i++) step(s, [0]);
    const d = Math.hypot(p.x - x0, p.y - y0);
    expect(d).toBeCloseTo(HERO.dash.distance, 0);
    expect(p.x - x0).toBeCloseTo(p.faceX * HERO.dash.distance, 0);
  });

  it('makes the hero invulnerable, then waits for its cooldown', () => {
    const s = arena();
    const p = s.players[0];
    step(s, [0]);
    step(s, [INPUT_DASH]);
    step(s, [0]);
    expect(hurtPlayer(s, p, 10)).toBe(false);
    for (let i = 0; i < DASH_TICKS + 20; i++) step(s, [0]);
    // On cooldown: a second dash does nothing.
    const x = p.x;
    step(s, [INPUT_DASH]);
    for (let i = 0; i < DASH_TICKS; i++) step(s, [0]);
    expect(p.x).toBe(x);
    // Once ready, it works again.
    for (let i = 0; i < HERO.dash.cooldown * TICK_RATE; i++) step(s, [0]);
    step(s, [INPUT_DASH]);
    for (let i = 0; i < DASH_TICKS; i++) step(s, [0]);
    expect(p.x).toBeGreaterThan(x + HERO.dash.distance * 0.9);
  });
});

describe('manual aim assist', () => {
  function aimedAt(angleDeg: number): number {
    const s = arena();
    const p = s.players[0];
    const a = (angleDeg * Math.PI) / 180;
    spawnEnemy(s, enemyId('marble'), p.x + Math.cos(a) * 200, p.y + Math.sin(a) * 200, 100, 1, 1, 0);
    step(s, [aimCode(0)]); // manual aim toward +x
    step(s, [0]); // builds the grid
    expect(aim(s, p, 640)).toBe(true);
    return AIM;
  }

  it('shoots at an enemy close to the aimed direction', () => {
    const a = aimedAt(12);
    expect(a).toBeGreaterThan(0.1);
    expect(a).toBeLessThan(0.3);
  });

  it('keeps the aimed direction when nobody is in the cone', () => {
    expect(aimedAt(45)).toBe(0);
  });
});
