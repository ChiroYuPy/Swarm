import { describe, expect, it } from 'vitest';
import { WorldMap, generateChunk, circleHitsObstacle, hashString, createGame, step, CHUNK, OB_RECT } from '../src/sim';
import { MAP_GEN } from '../src/data/map';
import { spawnEnemy } from '../src/sim/entities';
import type { Obstacle } from '../src/sim';

describe('monde infini', () => {
  it('même seed => mêmes obstacles, morceau par morceau', () => {
    const seed = hashString('CARTE');
    for (const [cx, cy] of [[0, 0], [3, -2], [-17, 40]]) {
      expect(generateChunk(seed, cx, cy)).toEqual(generateChunk(seed, cx, cy));
    }
  });

  it('seeds différentes => mondes différents', () => {
    const a = new WorldMap(hashString('CARTE-1'));
    const b = new WorldMap(hashString('CARTE-2'));
    let diff = 0;
    for (let cx = -3; cx <= 3; cx++) for (let cy = -3; cy <= 3; cy++) if (JSON.stringify(a.chunk(cx, cy)) !== JSON.stringify(b.chunk(cx, cy))) diff++;
    expect(diff).toBeGreaterThan(20);
  });

  it('le cache ne change rien : un morceau régénéré est identique', () => {
    const m = new WorldMap(hashString('CACHE'));
    const first = JSON.stringify(m.chunk(5, 5));
    for (let i = 0; i < 1000; i++) m.chunk(i, -i); // force la purge du cache
    expect(JSON.stringify(m.chunk(5, 5))).toBe(first);
  });

  it('il y a des obstacles variés, jamais au départ, jamais collés entre eux', () => {
    const m = new WorldMap(hashString('OBSTACLES'));
    const kinds = new Set<number>();
    let total = 0;
    for (let cx = -8; cx <= 8; cx++) {
      for (let cy = -8; cy <= 8; cy++) {
        const list = m.chunk(cx, cy);
        total += list.length;
        for (const o of list) {
          kinds.add(o.kind);
          // Un obstacle reste dans son morceau (pas de recoin piège entre deux morceaux).
          expect(o.x - o.r).toBeGreaterThanOrEqual(cx * CHUNK);
          expect(o.x + o.r).toBeLessThanOrEqual((cx + 1) * CHUNK);
          if (o.kind === OB_RECT) expect(o.hw).toBeGreaterThan(0);
        }
        for (let i = 0; i < list.length; i++)
          for (let j = i + 1; j < list.length; j++) {
            const d = Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y);
            expect(d).toBeGreaterThanOrEqual(list[i].r + list[j].r + MAP_GEN.gap - 1e-6);
          }
      }
    }
    expect(kinds.size).toBe(3);
    expect(total).toBeGreaterThan(200);
    expect(circleHitsObstacle(m, 0, 0, MAP_GEN.clearRadius - 10)).toBe(false);
  });

  it('le héros ne traverse jamais un obstacle', () => {
    const s = createGame({ seed: 'COLLISION' });
    for (let i = 0; i < 60 * 60; i++) {
      step(s, [s.players[0].offers.length ? 200 : 1 + (Math.floor(i / 200) * 9) % 64]);
      if (s.over) break;
      expect(circleHitsObstacle(s.map, s.players[0].x, s.players[0].y, s.players[0].r - 1)).toBe(false);
    }
  });

  it("un ennemi caché derrière un obstacle le contourne pour rejoindre le joueur", () => {
    const probe = createGame({ seed: 'CONTOURNEMENT' });
    const cases: Obstacle[] = [];
    for (let cx = -4; cx <= 4 && cases.length < 18; cx++)
      for (let cy = -4; cy <= 4 && cases.length < 18; cy++) for (const o of probe.map.chunk(cx, cy)) cases.push(o);
    expect(cases.length).toBeGreaterThan(10);
    let tested = 0;
    for (const o of cases) {
      // Le joueur et l'ennemi de part et d'autre, dans l'axe où l'obstacle est le plus large.
      const long = o.kind === 2 && o.hw > o.hh;
      const ux = long ? -o.sa : 1;
      const uy = long ? o.ca : 0;
      const span = long ? o.hh : o.r;
      const s = createGame({ seed: 'CONTOURNEMENT' });
      const p = s.players[0];
      p.x = p.px = o.x + ux * (span + 30);
      p.y = p.py = o.y + uy * (span + 30);
      p.shieldUntil = 1e9;
      const ex = o.x - ux * (span + 45);
      const ey = o.y - uy * (span + 45);
      if (circleHitsObstacle(s.map, p.x, p.y, p.r + 2) || circleHitsObstacle(s.map, ex, ey, 14)) continue;
      const e = spawnEnemy(s, 0, ex, ey, 1, 1, 1, 0)!;
      e.hp = e.maxHp = 1e12;
      const id = e.id;
      let reached = false;
      for (let t = 0; t < 30 * 60 && !reached; t++) {
        step(s, [s.players[0].offers.length ? 200 : 0]);
        p.x = p.px = o.x + ux * (span + 30);
        p.y = p.py = o.y + uy * (span + 30);
        const me = s.enemies.slice(0, s.enemyCount).find((x) => x.id === id);
        if (!me) break;
        if (Math.hypot(me.x - p.x, me.y - p.y) < p.r + me.r + 12) reached = true;
      }
      expect(reached, `obstacle ${o.kind} en (${o.x | 0}, ${o.y | 0})`).toBe(true);
      tested++;
    }
    expect(tested).toBeGreaterThan(8);
  });
});
