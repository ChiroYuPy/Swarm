import { describe, expect, it } from 'vitest';
import * as state from '../src/sim/state';
import { BOSS_ORDER, ENEMIES, PHASE_PARAMS, bossConfig } from '../src/data/enemies';
import { PICKUPS } from '../src/data/loot';
import { BOSS_CONFIGS, BOSS_PATTERNS, BOSS_SUMMONS, ENEMY_INDEX, HATCH_INTO, missingBossParams } from '../src/sim/registry';

describe('registry: content links', () => {
  it('every boss has a pattern and a slot in BOSS_ORDER, and BOSS_ORDER only lists bosses', () => {
    for (const e of ENEMIES.filter((x) => x.behavior === 'boss')) {
      expect(BOSS_PATTERNS[ENEMY_INDEX[e.id]].length, e.id).toBeGreaterThan(0);
      expect(BOSS_ORDER, e.id).toContain(e.id);
    }
    for (const id of BOSS_ORDER) expect(ENEMIES[ENEMY_INDEX[id]]?.behavior, id).toBe('boss');
    expect(new Set(BOSS_ORDER).size).toBe(BOSS_ORDER.length);
  });

  it('boss phases last a positive time; non-bosses have no pattern', () => {
    ENEMIES.forEach((e, t) => {
      if (e.behavior !== 'boss') expect(BOSS_PATTERNS[t], e.id).toEqual([]);
      for (const ph of BOSS_PATTERNS[t]) expect(ph.duration, `${e.id} ${ph.kind}`).toBeGreaterThan(0);
    });
  });

  it('every boss declares the parameter groups of every phase in its pattern, and no other', () => {
    ENEMIES.forEach((e, t) => {
      const cfg = BOSS_CONFIGS[t];
      if (e.behavior !== 'boss') return expect(cfg, e.id).toBeNull();
      expect(cfg, e.id).not.toBeNull();
      expect(missingBossParams(cfg!), e.id).toEqual([]);
      const used = new Set<string>(cfg!.pattern.flatMap((ph) => PHASE_PARAMS[ph.kind]));
      const declared = Object.keys(cfg!).filter((k) => k !== 'pattern');
      expect(declared.filter((k) => !used.has(k)), `${e.id}: groups no phase reads`).toEqual([]);
    });
  });

  it('bossConfig() rejects a missing or unused parameter group at compile time (npm run typecheck)', () => {
    // @ts-expect-error a 'charge' phase without the 'charge' group
    bossConfig({ pattern: [{ kind: 'chase', duration: 1 }, { kind: 'charge', duration: 1 }] });
    // @ts-expect-error a 'spiral' phase needs 'bullets' too
    bossConfig({ pattern: [{ kind: 'spiral', duration: 1 }], spiral: { every: 1, arms: 1, turn: 1 } });
    // @ts-expect-error a 'laser' group that no phase reads
    bossConfig({ pattern: [{ kind: 'chase', duration: 1 }], laser: { length: 1, width: 1, arc: 1, damage: 1 } });
    const ok = bossConfig({ pattern: [{ kind: 'charge', duration: 1 }], charge: { telegraph: 1, speed: 1, length: 1, damage: 1 } });
    expect(missingBossParams(ok)).toEqual([]);
  });

  it('a missing phase parameter group is reported', () => {
    expect(missingBossParams({ pattern: [{ kind: 'charge', duration: 1 }, { kind: 'lay', duration: 1 }] })).toEqual(['charge', 'lay', 'bullets']);
    expect(missingBossParams({ pattern: [{ kind: 'chase', duration: 1 }] })).toEqual([]);
  });

  it('walls rise and eggs hatch into a real, non-boss enemy', () => {
    ENEMIES.forEach((e, t) => {
      if (e.behavior === 'wall') expect(e.rise, e.id).toBeGreaterThan(0);
      if (e.behavior === 'egg') {
        expect(HATCH_INTO[t], e.id).toBeGreaterThanOrEqual(0);
        expect(e.hatchCount, e.id).toBeGreaterThan(0);
        expect(ENEMIES[HATCH_INTO[t]].behavior, e.id).not.toBe('boss');
      }
    });
  });

  it('summons call real, non-boss enemies', () => {
    ENEMIES.forEach((e, t) => {
      const sm = BOSS_SUMMONS[t];
      if (BOSS_PATTERNS[t].some((ph) => ph.kind === 'summon')) expect(sm, e.id).not.toBeNull();
      if (sm) expect(ENEMIES[sm.typeId].behavior, e.id).not.toBe('boss');
    });
  });

  it('PK_* codes match PICKUPS order, pickup kinds come from the data', () => {
    const codes = Object.entries(state).filter(([name]) => name.startsWith('PK_'));
    expect(codes.length).toBeGreaterThan(0);
    for (const [name, code] of codes) expect(PICKUPS[code as number]?.id.toUpperCase(), name).toBe(name.slice(3));
    PICKUPS.forEach((p, i) => {
      expect(state.PICKUP_KIND[i], p.id).toBe(p.kind);
      expect(state.isActiveItem(i), p.id).toBe(p.kind === 'active');
    });
    expect(state.ACTIVE_PICKUPS).toEqual(PICKUPS.flatMap((p, i) => (p.kind === 'active' ? [i] : [])));
    expect(state.isActiveItem(-1)).toBe(false);
  });

  it('projectile kinds, event codes and offer kinds are distinct', () => {
    for (const prefix of ['PJ_', 'EV_', 'OFFER_']) {
      const codes = Object.entries(state).filter(([name]) => name.startsWith(prefix)).map(([, v]) => v);
      expect(codes.length, prefix).toBeGreaterThan(0);
      expect(new Set(codes).size, prefix).toBe(codes.length);
    }
  });
});
