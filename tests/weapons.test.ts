import { describe, expect, it } from 'vitest';
import {
  createGame,
  step,
  availableFusions,
  FUSION_TABLE,
  PassiveInst,
  PJ_BLAZE,
  PJ_DRONE,
  PJ_EBULLET,
  PJ_PHOENIX,
  PJ_RICOCHET,
  PJ_SHELL,
  PJ_TURRET,
  TICK_RATE,
  weaponDef,
  type GameState,
} from '../src/sim';
import { spawnEnemy } from '../src/sim/entities';
import { enemyId, weaponId } from '../src/sim/registry';
import { addWeapon, rollOffers } from '../src/sim/levelup';
import { computeStats } from '../src/sim/player';
import { OFFER_FUSION } from '../src/sim/state';

const DAMAGING = ['whip', 'flamethrower', 'turret', 'drone', 'ricochet', 'mortar', 'scythe', 'fire_tornado', 'phoenix', 'bastion', 'squadron', 'kamikaze_drones', 'meteors'];

/** A game with a single weapon, an immortal hero and enemies all around. */
function arena(id: string, level: number, hp = 50, type = 'block'): GameState {
  const s = createGame({ seed: 'ARMES' });
  s.sandbox = { invincible: true, enemyMul: 0, enemies: null, bosses: false, summons: true, duel: -1, xp: 1 };
  const p = s.players[0];
  p.weapons.length = 0;
  addWeapon(p, weaponId(id)).level = level;
  computeStats(p);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const d = 90 + (i % 4) * 70;
    spawnEnemy(s, enemyId(type), Math.cos(a) * d, Math.sin(a) * d, hp, 0.01, 0.3, 0);
  }
  return s;
}

function run(s: GameState, seconds: number, each?: (s: GameState) => void): void {
  for (let i = 0; i < seconds * TICK_RATE && !s.over; i++) {
    step(s, [0]);
    each?.(s);
  }
}

const projs = (s: GameState, kind: number) => s.projectiles.slice(0, s.projCount).filter((b) => b.kind === kind);

describe('new weapons', () => {
  it.each(DAMAGING)('%s deals damage (level 1 and max)', (id) => {
    const max = weaponDef(weaponId(id)).levels.length;
    for (const level of [1, max]) {
      const s = arena(id, level);
      run(s, 8);
      expect(s.players[0].damageDealt, `${id} lvl ${level}`).toBeGreaterThan(0);
    }
  });

  it('the Whip hurts and knocks back', () => {
    const s = arena('whip', 5, 5000);
    const p = s.players[0];
    const before = s.enemies.slice(0, s.enemyCount).map((e) => Math.hypot(e.x - p.x, e.y - p.y));
    run(s, 0.8);
    expect(p.damageDealt).toBeGreaterThan(0);
    const pushed = s.enemies.slice(0, s.enemyCount).some((e, i) => e.kbx !== 0 || e.kby !== 0 || Math.hypot(e.x - p.x, e.y - p.y) > before[i] + 20);
    expect(pushed).toBe(true);
  });

  it('every new evolution is offered when the weapon and its passive are maxed', () => {
    for (const result of ['scythe', 'fire_tornado', 'phoenix', 'bastion', 'squadron', 'kamikaze_drones', 'meteors']) {
      const fi = FUSION_TABLE.findIndex((f) => f.result === weaponId(result));
      expect(fi, result).toBeGreaterThanOrEqual(0);
      const f = FUSION_TABLE[fi];
      const s = createGame({ seed: 'FUSIONS' });
      const p = s.players[0];
      p.weapons.length = 0;
      addWeapon(p, f.weapon).level = weaponDef(f.weapon).levels.length;
      const x = new PassiveInst();
      x.def = f.with;
      x.level = 5;
      p.passives.push(x);
      expect(availableFusions(p), result).toContain(fi);
    }
  });

  it('a weapon with two possible fusions offers both', () => {
    const s = createGame({ seed: 'FUSIONS' });
    const p = s.players[0];
    p.weapons.length = 0;
    addWeapon(p, weaponId('flamethrower')).level = 5;
    for (const id of ['amplifier', 'vitality']) {
      const x = new PassiveInst();
      x.def = ['might', 'overclock', 'amplifier', 'thrusters', 'magnet', 'vitality', 'armor', 'luck'].indexOf(id);
      x.level = 5;
      p.passives.push(x);
    }
    p.pendingLevels = 1;
    rollOffers(s, p);
    const fused = p.offers.filter((o) => o.kind === OFFER_FUSION).map((o) => FUSION_TABLE[o.id].result);
    expect(fused).toContain(weaponId('fire_tornado'));
    expect(fused).toContain(weaponId('phoenix'));
  });

  it('the Scythe removes a share of max HP, and finishes off nearly dead enemies', () => {
    const s = arena('scythe', 1, 1);
    for (let i = 0; i < s.enemyCount; i++) {
      const e = s.enemies[i];
      e.maxHp = 100000;
      // one hit (15%) leaves these under the execute threshold
      e.hp = i % 2 ? 20000 : 100000;
    }
    run(s, 1);
    const L = weaponDef(weaponId('scythe')).levels[0];
    // the healthy ones that were hit (the farthest are out of range) lose exactly their share of max HP
    const hit = s.enemies.slice(0, s.enemyCount).filter((e) => e.alive && e.hp < e.maxHp && e.hp > 20000);
    expect(s.players[0].kills).toBeGreaterThan(0);
    expect(hit.length).toBeGreaterThan(0);
    for (const e of hit) expect(e.hp).toBeCloseTo(e.maxHp * (1 - L.pctHp!), 0);
  });

  it('the turret stays put and fires without the player', () => {
    const s = arena('turret', 1);
    run(s, 0.5);
    const t = projs(s, PJ_TURRET)[0];
    expect(t).toBeDefined();
    const before = s.players[0].damageDealt;
    run(s, 4);
    const t2 = projs(s, PJ_TURRET)[0];
    expect([t2?.x, t2?.y]).toEqual([t.x, t.y]);
    expect(s.players[0].damageDealt).toBeGreaterThan(before);
  });

  it('a ricochet disc hits several enemies (max level)', () => {
    const s = arena('ricochet', 5);
    let maxHits = 0;
    run(s, 3, (st) => {
      for (const b of projs(st, PJ_RICOCHET)) maxHits = Math.max(maxHits, b.hitCount);
    });
    expect(maxHits).toBeGreaterThan(1);
  });

  it('drones go hunting, and come back near the player when shot down', () => {
    const s = arena('drone', 2, 50, 'shooter');
    run(s, 1);
    expect(projs(s, PJ_DRONE).length).toBe(2);
    // Shoot down every drone: they must respawn near the player.
    for (const b of projs(s, PJ_DRONE)) b.b = -1;
    // An enemy in contact triggers the destruction on the next step; here it is forced through HP.
    run(s, 0.1);
    const p = s.players[0];
    run(s, 4);
    const ds = projs(s, PJ_DRONE);
    expect(ds.length).toBe(2);
    expect(ds.every((b) => b.age < 4 * TICK_RATE)).toBe(true);
    expect(p.damageDealt).toBeGreaterThan(0);
  });

  it('the Flamethrower no longer turns once lit', () => {
    const s = arena('flamethrower', 1, 5000);
    const w = s.players[0].weapons[0];
    let start = NaN;
    let moved = false;
    run(s, 2, () => {
      if (w.activeTicks > 0) {
        if (Number.isNaN(start)) start = w.angles[0];
        else if (w.angles[0] !== start) moved = true;
      }
    });
    expect(Number.isNaN(start)).toBe(false);
    expect(moved).toBe(false);
  });

  it('drones split their targets and do not spin in place', () => {
    const s = arena('drone', 5, 100000);
    let maxTurn = 0;
    const heading = new Map<number, number>();
    run(s, 3, (st) => {
      for (const b of projs(st, PJ_DRONE)) {
        const h = Math.atan2(b.vy, b.vx);
        const prev = heading.get(b.d);
        if (prev !== undefined && b.age > 1) {
          let d = Math.abs(h - prev);
          if (d > Math.PI) d = 2 * Math.PI - d;
          maxTurn = Math.max(maxTurn, d);
        }
        heading.set(b.d, h);
      }
    });
    const drones = projs(s, PJ_DRONE).filter((b) => b.c >= 0);
    expect(drones.length).toBeGreaterThan(2);
    expect(new Set(drones.map((b) => b.ty)).size).toBe(drones.length);
    // Limited turning: never a sudden U-turn.
    expect(maxTurn).toBeLessThan(0.2);
  });

  it('Shooters only fire straight ahead', () => {
    const s = arena('whip', 1, 100000, 'shooter');
    s.players[0].weapons.length = 0;
    let checked = 0;
    run(s, 6, (st) => {
      for (const b of projs(st, PJ_EBULLET)) {
        if (b.age !== 1) continue;
        // The bullet leaves in the direction the Shooter is facing.
        const e = st.enemies.slice(0, st.enemyCount).find((en) => Math.hypot(en.x - b.x, en.y - b.y) < 12);
        if (!e) continue;
        const dot = (b.vx * e.vx + b.vy * e.vy) / Math.hypot(b.vx, b.vy);
        expect(dot).toBeGreaterThan(0.99);
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(0);
  });

  it('Phoenixes fly straight without turning back, are reborn near the player and leave fire', () => {
    const s = arena('phoenix', 1, 100000);
    const p = s.players[0];
    let maxTurn = 0;
    let fires = 0;
    let maxAlive = 0;
    const births = new Set<number>();
    const heading = new Map<number, number>();
    run(s, 10, (st) => {
      fires = Math.max(fires, projs(st, PJ_BLAZE).length);
      const birds = projs(st, PJ_PHOENIX);
      maxAlive = Math.max(maxAlive, birds.length);
      for (const ph of birds) {
        // One bird per flight: identified by its launch tick.
        const id = st.tick - ph.age;
        if (ph.age === 1) {
          births.add(id);
          expect(Math.hypot(ph.x - p.x, ph.y - p.y)).toBeLessThan(20);
        }
        const h = Math.atan2(ph.vy, ph.vx);
        const prev = heading.get(id);
        if (prev !== undefined) {
          let d = Math.abs(h - prev);
          if (d > Math.PI) d = 2 * Math.PI - d;
          maxTurn = Math.max(maxTurn, d);
        }
        heading.set(id, h);
      }
    });
    expect(maxAlive).toBe(1);
    // 2.2 s lifetime: in 10 s it is reborn several times.
    expect(births.size).toBeGreaterThan(2);
    expect(fires).toBeGreaterThan(3);
    expect(maxTurn).toBeLessThan(1e-9);
    expect(p.hp).toBe(p.stats.maxHp);
  });

  it('the Phoenix heads for the biggest HP pool, not the nearest enemy', () => {
    const s = arena('phoenix', 1, 5, 'hunter');
    const p = s.players[0];
    // A "boss" far to the left, the small crowd all around: it must head left.
    const big = s.enemies[0];
    big.x = p.x - 500;
    big.y = p.y;
    big.hp = big.maxHp = 5000;
    let heading: number | null = null;
    run(s, 3, (st) => {
      const b = projs(st, PJ_PHOENIX)[0];
      if (b && heading === null) heading = Math.atan2(b.vy, b.vx);
    });
    expect(heading).not.toBeNull();
    expect(Math.abs(Math.abs(heading!) - Math.PI)).toBeLessThan(0.2);
  });

  it('at max level the Whip cracks in a fan in front of the player and the Flamethrower in a half circle', () => {
    const whip = arena('whip', 5, 100000);
    run(whip, 2);
    const w = whip.players[0].weapons[0];
    const spread = (a: Float64Array, n: number) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let k = 0; k < n; k++) {
        lo = Math.min(lo, a[k]);
        hi = Math.max(hi, a[k]);
      }
      return hi - lo;
    };
    expect(spread(w.angles, 5)).toBeCloseTo((2 * Math.PI) / 5, 5);
    const fl = arena('flamethrower', 5, 100000);
    run(fl, 2);
    const f = fl.players[0].weapons[0];
    // 5 jets of 1/10 turn each, side by side: a half circle (edge to edge).
    expect(spread(f.angles, 5) + 2 * (Math.PI / 10)).toBeCloseTo(Math.PI, 5);
  });

  it('the Mortar lobs shells that explode at a distance, Meteors leave a crater', () => {
    const m = arena('mortar', 1);
    let shells = 0;
    run(m, 3, (st) => (shells += projs(st, PJ_SHELL).length));
    expect(shells).toBeGreaterThan(0);
    expect(m.players[0].damageDealt).toBeGreaterThan(0);
    const met = arena('meteors', 1);
    let craters = 0;
    run(met, 3, (st) => (craters += projs(st, PJ_BLAZE).length));
    expect(craters).toBeGreaterThan(0);
  });
});
