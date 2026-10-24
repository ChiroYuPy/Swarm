import { describe, expect, it } from 'vitest';
import {
  createGame,
  step,
  hashState,
  replayToEnd,
  encodeLog,
  decodeLog,
  weaponLevel,
  spawnRate,
  INPUT_USE,
  PK_CLOCK,
  PK_RAGE,
  PK_SHIELD,
  EV_NEW_ENEMY,
  TICK_RATE,
} from '../src/sim';
import { damageEnemy } from '../src/sim/combat';
import { addWeapon } from '../src/sim/levelup';
import { weaponId } from '../src/sim/registry';
import { BASE_WEAPONS } from '../src/data/weapons';
import { ENEMIES } from '../src/data/enemies';
import { botInput } from '../src/ai/bot';

describe('content', () => {
  it('base weapons have 5 levels; the force field grows at every level', () => {
    const aura = weaponId('force_field');
    for (let l = 2; l <= 5; l++) expect(weaponLevel(aura, l).radius!).toBeGreaterThan(weaponLevel(aura, l - 1).radius!);
    expect(BASE_WEAPONS.every((w) => w.levels.length === 5)).toBe(true);
  });

  it('there are as many orbs in play as the weapon level', () => {
    const s = createGame({ seed: 'ORBES' });
    const p = s.players[0];
    const w = addWeapon(p, weaponId('orbs'));
    for (let l = 1; l <= 5; l++) {
      w.level = l;
      step(s, [0]);
      expect(w.vN).toBe(l);
    }
  });

  it('enemy types arrive gradually, earlier on hard', () => {
    const firstSeen = (difficulty: number, seconds: number) => {
      const s = createGame({ seed: 'ARRIVEES', difficulty });
      s.players[0].base.maxHp = 1e9;
      s.players[0].hp = 1e9;
      s.players[0].base.magnet = 0;
      const seen = new Map<string, number>();
      // Wave time (the clock stops during bosses: kill them as soon as they arrive).
      while (s.clock < seconds * TICK_RATE && !s.over) {
        step(s, [s.players[0].offers.length ? 200 : 0]);
        for (let k = 0; k < s.eventCount; k++) {
          const e = s.events[k];
          if (e.type === EV_NEW_ENEMY && !seen.has(ENEMIES[e.k].id)) seen.set(ENEMIES[e.k].id, s.clock / TICK_RATE);
        }
        if (s.bossId >= 0)
          damageEnemy(
            s,
            s.enemies.findIndex((e) => e.alive && e.id === s.bossId),
            1e9,
            0,
            0,
            0,
          );
      }
      return seen;
    };
    const normal = firstSeen(1, 380);
    const hard = firstSeen(2, 200);
    // At first, only Hunters; the other types are announced later.
    expect(normal.get('rusher')).toBeGreaterThan(60);
    expect(normal.has('block')).toBe(true);
    expect(hard.get('rusher')!).toBeLessThan(normal.get('rusher')!);
    expect(spawnRate(30 * TICK_RATE, 0).rate).toBeLessThan(spawnRate(30 * TICK_RATE, 2).rate);
  });

  it('temporary bonuses apply, then expire', () => {
    const s = createGame({ seed: 'BONUS' });
    const p = s.players[0];
    const base = p.stats.might;
    s.pickups[0].kind = PK_RAGE;
    s.pickups[0].x = p.x;
    s.pickups[0].y = p.y;
    s.pickups[0].life = 100;
    s.pickups[0].magnet = false;
    s.pickupCount = 1;
    step(s, [0]);
    step(s, [0]);
    expect(p.stats.might).toBe(base * 2);
    for (let i = 0; i < 9 * TICK_RATE; i++) step(s, [0]);
    expect(p.stats.might).toBe(base);
    // Shield: no damage taken.
    p.shieldUntil = s.tick + 100;
    const hp = p.hp;
    for (let i = 0; i < s.enemyCount; i++) s.enemies[i].x = p.x;
    step(s, [0]);
    expect(p.hp).toBeGreaterThanOrEqual(hp);
    expect(PK_SHIELD).toBeGreaterThan(PK_RAGE);
  });

  it('using an active item is a zero-time step, replayed identically', () => {
    const s = createGame({ seed: 'ACTIVABLE' });
    const codes: number[] = [];
    for (let i = 0; i < 40 * TICK_RATE; i++) {
      const c = botInput(s, 0);
      codes.push(c);
      step(s, [c]);
    }
    s.players[0].activeItem = PK_CLOCK;
    const tick = s.tick;
    codes.push(INPUT_USE);
    step(s, [INPUT_USE]);
    expect(s.tick).toBe(tick);
    expect(s.players[0].activeItem).toBe(-1);
    expect(s.clockUntil).toBeGreaterThan(tick);
    // The replay must do exactly the same thing... provided the same item is in reserve:
    // so replay a game where the item was picked up in play (the bot uses it on its own).
    const g = createGame({ seed: 'ACTIVABLE-4' });
    const log: number[] = [];
    let used = 0;
    for (let i = 0; i < 300 * TICK_RATE && !g.over; i++) {
      const c = botInput(g, 0);
      if (c === INPUT_USE && g.players[0].activeItem >= 0) used++;
      log.push(c);
      step(g, [c]);
    }
    const replayed = replayToEnd({ seed: 'ACTIVABLE-4' }, decodeLog(encodeLog(Uint8Array.from(log))));
    expect(hashState(replayed)).toBe(hashState(g));
    expect(used).toBeGreaterThan(0);
  });

  it('difficulty changes the game but stays deterministic', () => {
    const run = (difficulty: number) => {
      const s = createGame({ seed: 'DIFF', difficulty });
      for (let i = 0; i < 60 * TICK_RATE; i++) step(s, [botInput(s, 0)]);
      return hashState(s);
    };
    expect(run(0)).toBe(run(0));
    expect(run(0)).not.toBe(run(2));
  });
});
