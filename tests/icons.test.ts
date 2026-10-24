import { describe, expect, it } from 'vitest';
import { ALL_WEAPONS } from '../src/data/weapons';
import { PASSIVES } from '../src/data/passives';
import { PICKUPS } from '../src/data/loot';
import { PASSIVE_PAINTERS, PICKUP_PAINTERS, WEAPON_PAINTERS } from '../src/render/icons';

const sorted = (ids: string[]) => [...ids].sort();

describe('icons', () => {
  it('every weapon has an icon, and every weapon icon has a weapon', () => {
    expect(sorted(Object.keys(WEAPON_PAINTERS))).toEqual(sorted(ALL_WEAPONS.map((w) => w.id)));
  });

  it('every passive has an icon, and every passive icon has a passive', () => {
    expect(sorted(Object.keys(PASSIVE_PAINTERS))).toEqual(sorted(PASSIVES.map((p) => p.id)));
  });

  it('every pickup has an icon, and every pickup icon has a pickup', () => {
    expect(sorted(Object.keys(PICKUP_PAINTERS))).toEqual(sorted(PICKUPS.map((p) => p.id)));
  });
});
