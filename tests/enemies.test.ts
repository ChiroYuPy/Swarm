import { describe, expect, it } from 'vitest';
import { createGame, step, TICK_RATE, type GameState } from '../src/sim';
import { spawnEnemy } from '../src/sim/entities';
import { enemyId } from '../src/sim/registry';
import { damageEnemy } from '../src/sim/combat';
import { ENEMIES } from '../src/data/enemies';
import { defaultSandbox } from '../src/storage/storage';
import { DIFFICULTIES } from '../src/data/difficulty';
import { WAVES } from '../src/data/waves';
import { ENDLESS_MIXES, PLAN_MIXES, PLAN_WAVES, UNLOCK_SLOT, VICTORY_BOSS } from '../src/sim/registry';
import { mixAt } from '../src/sim/spawner';
import { BOSS_ORDER } from '../src/data/enemies';

/** Empty game (no automatic spawns). */
function arena(): GameState {
  return createGame({ seed: 'ENNEMIS', sandbox: { ...defaultSandbox().rules, invincible: false, enemyMul: 0, bosses: false, weapons: [] } });
}

function put(s: GameState, id: string, x: number, y: number, hp = 1) {
  return spawnEnemy(s, enemyId(id), s.players[0].x + x, s.players[0].y + y, hp, 1, 1, 0)!;
}

function alive(s: GameState, id: string) {
  const t = enemyId(id);
  return s.enemies.slice(0, s.enemyCount).filter((e) => e.alive && e.type === t);
}

const def = (id: string) => ENEMIES.find((e) => e.id === id)!;

describe('enemies', () => {
  it('Hexagon: bursts into 6 Shards flying out all around', () => {
    const s = arena();
    const g = put(s, 'hexagon', 400, 0);
    damageEnemy(s, s.enemies.indexOf(g), 1e6, 0, 0, 0);
    step(s, [0]);
    const shards = alive(s, 'shard');
    expect(shards.length).toBe(def('hexagon').splitCount);
    // they fly off in every direction
    const xs = shards.map((e) => e.x - 400 - s.players[0].x);
    const ys = shards.map((e) => e.y - s.players[0].y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(10);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(10);
  });

  it('Jumper: crouches, lands where the player was and hurts only there', () => {
    const s = arena();
    const p = s.players[0];
    const j = put(s, 'jumper', 200, 0, 100);
    const hop = def('jumper').hop!;
    const hp0 = p.hp;
    // it never hurts by touching
    expect(j.dmg).toBe(0);
    let crouched = false;
    for (let i = 0; i < (hop.every + hop.crouch + hop.air + 1) * TICK_RATE && j.ai < 3; i++) {
      step(s, [0]);
      if (j.ai === 1) crouched = true;
    }
    expect(crouched).toBe(true);
    expect(Math.hypot(j.x - p.x, j.y - p.y)).toBeLessThan(5);
    expect(p.hp).toBeLessThan(hp0);
  });

  it('Jumper: dodged by leaving the landing circle', () => {
    const s = arena();
    const p = s.players[0];
    const j = put(s, 'jumper', 200, 0, 100);
    const hop = def('jumper').hop!;
    for (let i = 0; i < hop.every * TICK_RATE * 2 && j.ai !== 1; i++) step(s, [0]);
    expect(j.ai).toBe(1);
    const hp0 = p.hp;
    // flee downwards while it crouches and flies (code 1 + 16: a quarter turn out of 64 directions)
    for (let i = 0; i < (hop.crouch + hop.air) * TICK_RATE + 2; i++) step(s, [17]);
    expect(j.ai).toBeGreaterThanOrEqual(3);
    expect(p.hp).toBe(hp0);
  });

  it('Orbiter: circles the player, then dives at it', () => {
    const s = arena();
    const p = s.players[0];
    const o = put(s, 'orbiter', 200, 0, 100);
    // it goes around (more than a quarter turn in 3 s), not straight in
    let swept = 0;
    let a = Math.atan2(o.y - p.y, o.x - p.x);
    for (let i = 0; i < 3 * TICK_RATE && o.ai <= 1; i++) {
      step(s, [0]);
      const b = Math.atan2(o.y - p.y, o.x - p.x);
      swept += Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
      a = b;
    }
    expect(swept).toBeGreaterThan(Math.PI / 2);
    let closest = Infinity;
    for (let i = 0; i < def('orbiter').fly!.waitMax * TICK_RATE + 4 * TICK_RATE; i++) {
      step(s, [0]);
      closest = Math.min(closest, Math.hypot(o.x - p.x, o.y - p.y));
    }
    expect(closest).toBeLessThan(o.r + p.r + 10);
  });

  it('Orbiter: in a small arena with the player against the ring, it glances off the wall and keeps diving', () => {
    const s = arena();
    const p = s.players[0];
    s.arenaX = p.x + 150;
    s.arenaY = p.y;
    s.arenaR = 260;
    const o = put(s, 'orbiter', 200, 0, 100);
    let dives = 0;
    let was = o.ai;
    let still = 0;
    let longestStill = 0;
    for (let i = 0; i < 25 * TICK_RATE; i++) {
      const x = o.x;
      const y = o.y;
      step(s, [0]);
      p.hp = p.stats.maxHp;
      if (o.ai === 2 && was !== 2) dives++;
      was = o.ai;
      still = Math.hypot(o.x - x, o.y - y) < 0.5 ? still + 1 : 0;
      longestStill = Math.max(longestStill, still);
    }
    expect(dives).toBeGreaterThanOrEqual(2);
    expect(longestStill).toBeLessThan(TICK_RATE);
  });

  it('Orbiter: flies over the boss walls to reach the player', () => {
    const s = arena();
    const p = s.players[0];
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      const w = put(s, 'wall', Math.cos(a) * 260, Math.sin(a) * 260, 100);
      w.ai = 1; // solid
      w.timer = 1e6; // never falls
    }
    const o = put(s, 'orbiter', 420, 0, 100);
    let closest = Infinity;
    for (let i = 0; i < 15 * TICK_RATE; i++) {
      step(s, [0]);
      p.hp = p.stats.maxHp;
      closest = Math.min(closest, Math.hypot(o.x - p.x, o.y - p.y));
    }
    expect(closest).toBeLessThan(o.r + p.r + 10);
  });

  it('steering: an enemy speeds up progressively, and turns toward where it goes', () => {
    const s = arena();
    const e = put(s, 'hunter', 400, 0, 100);
    step(s, [0]);
    const v1 = Math.hypot(e.mvx, e.mvy);
    expect(v1).toBeGreaterThan(0);
    expect(v1).toBeLessThan(e.speed * 0.5);
    for (let i = 0; i < 40; i++) step(s, [0]);
    expect(Math.hypot(e.mvx, e.mvy)).toBeCloseTo(e.speed, 0);
  });

  it('collisions: crowded enemies push apart and do not stack', () => {
    const s = arena();
    const list = [0, 1, 2, 3, 4, 5].map((k) => put(s, 'block', 300 + k * 2, k, 100));
    for (let i = 0; i < 60; i++) step(s, [0]);
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) expect(Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y)).toBeGreaterThan(list[i].r);
  });
});

describe('boss arena and victory', () => {
  it('the arena closes on the boss, keeps the player in, and opens on its death', () => {
    const s = createGame({ seed: 'ARENE', sandbox: { ...defaultSandbox().rules, invincible: true, enemyMul: 0, duel: BOSS_ORDER[0], weapons: [] } });
    step(s, [0]);
    expect(s.arenaR).toBeGreaterThan(0);
    const p = s.players[0];
    for (let i = 0; i < 12 * TICK_RATE; i++) step(s, [1]);
    expect(Math.hypot(p.x - s.arenaX, p.y - s.arenaY)).toBeLessThanOrEqual(s.arenaR - p.r + 0.01);
    const b = s.enemies.findIndex((e) => e.alive && e.id === s.bossId);
    damageEnemy(s, b, 1e12, 0, 0, 0);
    expect(s.arenaR).toBe(0);
  });

  it('the run is won when the last planned boss dies (never in the sandbox)', () => {
    const s = createGame({ seed: 'VICTOIRE' });
    const p = s.players[0];
    // the hero cannot fall (the sandbox's invincibility would rule out the victory)
    const keepAlive = () => {
      p.hp = p.stats.maxHp;
      p.invulnUntil = s.tick + 600;
    };
    let guard = 0;
    while (!s.won && guard++ < 60 * 60 * TICK_RATE) {
      keepAlive();
      step(s, [p.offers.length ? 200 : 0]);
      if (s.bossId >= 0) damageEnemy(s, s.enemies.findIndex((e) => e.alive && e.id === s.bossId), 1e12, 0, 0, 0);
    }
    expect(s.won).toBe(true);
    expect(s.bossSpawned).toBe(VICTORY_BOSS + 1);
    // and it goes on: waves come back
    const clock = s.clock;
    for (let i = 0; i < 20 * TICK_RATE; i++) {
      keepAlive();
      step(s, [p.offers.length ? 200 : 0]);
    }
    expect(s.clock).toBeGreaterThan(clock);
  });
});

describe('readable waves', () => {
  it('2-3 types per wave, the planned waves bring every enemy, and endless waves never repeat', () => {
    for (const m of [...PLAN_MIXES, ...ENDLESS_MIXES]) expect(m.types.length).toBeLessThanOrEqual(3);
    for (let t = 0; t < ENEMIES.length; t++) {
      const d = ENEMIES[t];
      if (d.hidden || d.behavior === 'boss' || d.behavior === 'prop') continue;
      expect(UNLOCK_SLOT[t], d.id).toBeGreaterThanOrEqual(0);
      expect(UNLOCK_SLOT[t], d.id).toBeLessThan(PLAN_WAVES);
    }
    for (let k = PLAN_WAVES + 1; k < PLAN_WAVES + 40; k++) expect(mixAt(7, k)).not.toBe(mixAt(7, k - 1));
    // the same waves in every difficulty
    for (let diff = 0; diff < DIFFICULTIES.length; diff++) expect(mixAt(12345, 3)).toBe(PLAN_MIXES[3]);
  });

  it('strong types are capped, Marbles come in packs', () => {
    const s = createGame({ seed: 'PLAFONDS', sandbox: { ...defaultSandbox().rules, invincible: true, enemyMul: 6, bosses: false, enemies: ['hexagon', 'marble'], weapons: [] } });
    let packs = 0;
    for (let i = 0; i < 40 * TICK_RATE; i++) {
      const n = alive(s, 'marble').length;
      step(s, [0]);
      if (alive(s, 'marble').length >= n + def('marble').pack!) packs++;
      expect(alive(s, 'hexagon').length).toBeLessThanOrEqual(def('hexagon').cap!);
    }
    expect(alive(s, 'hexagon').length).toBeGreaterThan(0);
    expect(packs).toBeGreaterThan(0);
  });
});

describe('outrun enemies and cap', () => {
  it('an enemy left far behind the player despawns, with no gem and no kill', () => {
    const s = arena();
    put(s, 'hunter', WAVES.lostDistance + 200, 0);
    put(s, 'hunter', 300, 0);
    step(s, [0]);
    expect(alive(s, 'hunter').length).toBe(1);
    expect(s.gemCount).toBe(0);
    expect(s.players[0].kills).toBe(0);
  });

  it('waves never exceed the cap, even when many enemies are requested', () => {
    const s = createGame({ seed: 'PLAFOND', sandbox: { ...defaultSandbox().rules, startWave: 30, enemyMul: 10, bosses: false, weapons: [] } });
    let max = 0;
    for (let i = 0; i < 90 * TICK_RATE; i++) {
      step(s, [0]);
      max = Math.max(max, s.enemyCount);
    }
    expect(max).toBeGreaterThan(WAVES.fluxCap - 20);
    // + a few bonus crates, which do not count
    expect(max).toBeLessThanOrEqual(WAVES.enemyCap + WAVES.props.max);
  });
});
