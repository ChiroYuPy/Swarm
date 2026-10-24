import { describe, expect, it } from 'vitest';
import * as state from '../src/sim/state';
import { BOSS_ORDER, ENEMIES } from '../src/data/enemies';
import { PICKUPS } from '../src/data/loot';
import { BOSS_PATTERNS, BOSS_SPIRALS, BOSS_SUMMONS, ENEMY_INDEX } from '../src/sim/registry';

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

  it('a boss with a spiral phase has spiral params', () => {
    ENEMIES.forEach((e, t) => {
      if (BOSS_PATTERNS[t].some((ph) => ph.kind === 'spiral')) expect(BOSS_SPIRALS[t], e.id).not.toBeNull();
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
