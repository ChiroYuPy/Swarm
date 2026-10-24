import { describe, expect, it } from 'vitest';
import {
  createGame,
  step,
  availableFusions,
  FUSION_TABLE,
  PassiveInst,
  WeaponInst,
  weaponDef,
  isAwaitingChoice,
  EV_FUSION,
  OFFER_FUSION,
  PK_CHEST,
  type GameState,
  type Player,
} from '../src/sim';
import { FUSIONS } from '../src/data/fusions';
import { ALL_WEAPONS } from '../src/data/weapons';
import { PASSIVES } from '../src/data/passives';

const wIdx = (id: string) => ALL_WEAPONS.findIndex((w) => w.id === id);
const pIdx = (id: string) => PASSIVES.findIndex((p) => p.id === id);

function giveWeapon(p: Player, id: string, level: number) {
  const w = new WeaponInst();
  w.def = wIdx(id);
  w.level = level;
  p.weapons.push(w);
}
function givePassive(p: Player, id: string, level: number) {
  const x = new PassiveInst();
  x.def = pIdx(id);
  x.level = level;
  p.passives.push(x);
}

/** Forces a level-up offer on the next step and picks offer 0. */
function levelUpAndPickFirst(s: GameState): void {
  const p = s.players[0];
  p.pendingLevels = 1;
  p.offers = [];
  step(s, [0]); // rolls the offers
  expect(isAwaitingChoice(s)).toBe(true);
  step(s, [200]);
}

describe('fusions', () => {
  it('at least 4 fusions defined, all consistent', () => {
    expect(FUSIONS.length).toBeGreaterThanOrEqual(4);
    for (const f of FUSION_TABLE) {
      expect(weaponDef(f.result).fusion).toBe(true);
      expect(weaponDef(f.weapon).fusion).toBeFalsy();
    }
  });

  it('no fusion until both items are at max level', () => {
    const s = createGame({ seed: 'FUSION-1' });
    const p = s.players[0];
    p.weapons[0].level = 4; // Blaster level 4
    givePassive(p, 'overclock', 5);
    expect(availableFusions(p)).toEqual([]);
    p.weapons[0].level = 5;
    expect(availableFusions(p).length).toBe(1);
  });

  it('weapon + passive: the weapon is replaced by the fusion, the passive stays', () => {
    const s = createGame({ seed: 'FUSION-2' });
    const p = s.players[0];
    p.weapons[0].level = 5;
    givePassive(p, 'overclock', 5);
    levelUpAndPickFirst(s);
    expect(p.weapons.map((w) => weaponDef(w.def).id)).toEqual(['spiral']);
    expect(p.passives.map((x) => PASSIVES[x.def].id)).toEqual(['overclock']);
    // The base weapon can no longer be offered again.
    expect(p.banned).toContain(wIdx('blaster'));
  });

  it('every evolution = one base weapon + one passive, and every evolution has a recipe', () => {
    for (const f of FUSIONS) {
      expect(PASSIVES.some((x) => x.id === f.with), f.result).toBe(true);
      expect(ALL_WEAPONS.find((w) => w.id === f.weapon)?.fusion, f.result).toBeFalsy();
    }
    for (const w of ALL_WEAPONS.filter((x) => x.fusion)) expect(FUSIONS.some((f) => f.result === w.id), w.id).toBe(true);
  });

  it('an evolution keeps its weapon slot, and the passive stays', () => {
    const s = createGame({ seed: 'FUSION-3' });
    const p = s.players[0];
    giveWeapon(p, 'electric_arc', 5);
    givePassive(p, 'overclock', 5);
    const before = p.weapons.length;
    const slot = p.weapons.findIndex((w) => weaponDef(w.def).id === 'electric_arc');
    const fi = FUSION_TABLE.findIndex((f) => weaponDef(f.result).id === 'electric_storm');
    expect(availableFusions(p)).toContain(fi);
    levelUpAndPickFirst(s);
    expect(weaponDef(p.weapons[slot].def).id).toBe('electric_storm');
    expect(p.weapons.length).toBe(before);
    expect(p.passives.some((x) => PASSIVES[x.def].id === 'overclock')).toBe(true);
  });

  it('every fused weapon has a behaviour that deals damage', () => {
    for (const f of FUSIONS) {
      const s = createGame({ seed: `FUSION-DPS-${f.result}` });
      const p = s.players[0];
      p.weapons.length = 0;
      giveWeapon(p, f.result, 1);
      for (let i = 0; i < 60 * 40 && !s.over; i++) step(s, [isAwaitingChoice(s) ? 200 : 0]);
      expect(p.damageDealt, f.result).toBeGreaterThan(0);
    }
  });

  it('the boss chest grants the guaranteed fusion when one is possible', () => {
    const s = createGame({ seed: 'COFFRE' });
    const p = s.players[0];
    p.weapons[0].level = 5;
    givePassive(p, 'overclock', 5);
    // Put a chest right under the hero.
    s.pickups[0].kind = PK_CHEST;
    s.pickups[0].life = -1;
    s.pickups[0].x = p.x;
    s.pickups[0].y = p.y;
    s.pickupCount = 1;
    step(s, [0]);
    let fused = false;
    for (let i = 0; i < s.eventCount; i++) if (s.events[i].type === EV_FUSION) fused = true;
    expect(fused).toBe(true);
    expect(weaponDef(p.weapons[0].def).id).toBe('spiral');
    expect(OFFER_FUSION).toBe(2);
  });
});
