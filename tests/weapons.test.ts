import { describe, expect, it } from 'vitest';
import {
  createGame,
  step,
  availableFusions,
  FUSION_TABLE,
  DMG_FIRE,
  EV_HIT,
  EV_SHOOT,
  PJ_BEE,
  PJ_BLAZE,
  PJ_BOOMERANG,
  PJ_EBULLET,
  PJ_MINE,
  PJ_RING,
  PJ_SHELL,
  PJ_SHURIKEN,
  TICK_RATE,
  weaponDef,
  type GameState,
} from '../src/sim';
import { spawnEnemy } from '../src/sim/entities';
import { enemyId, weaponId } from '../src/sim/registry';
import { BEE_STUCK, SHURIKEN_BOX_X, SHURIKEN_BOX_Y, spawnMine } from '../src/sim/weapons';
import { ALL_WEAPONS, FUSED_WEAPONS } from '../src/data/weapons';
import { addWeapon } from '../src/sim/levelup';
import { computeStats } from '../src/sim/player';

/** Every weapon and evolution deals damage: the list comes from the data, nothing to add for a new weapon. */
const DAMAGING = ALL_WEAPONS.map((w) => w.id);

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

/** A game with a single weapon and no enemy (the test places its own). */
function empty(id: string, level: number): GameState {
  const s = arena(id, level);
  for (let i = 0; i < s.enemyCount; i++) s.enemies[i].alive = false;
  s.enemyCount = 0;
  return s;
}

function run(s: GameState, seconds: number, each?: (s: GameState) => void): void {
  for (let i = 0; i < seconds * TICK_RATE && !s.over; i++) {
    step(s, [0]);
    each?.(s);
  }
}

const projs = (s: GameState, kind: number) => s.projectiles.slice(0, s.projCount).filter((b) => b.kind === kind);
const alive = (s: GameState) => s.enemies.slice(0, s.enemyCount).filter((e) => e.alive);

describe('weapons', () => {
  it.each(DAMAGING)('%s deals damage (level 1 and max)', (id) => {
    const max = weaponDef(weaponId(id)).levels.length;
    for (const level of [1, max]) {
      const s = arena(id, level);
      run(s, 8);
      expect(s.players[0].damageDealt, `${id} lvl ${level}`).toBeGreaterThan(0);
    }
  });

  it('every evolution is offered once its weapon is maxed, without any passive', () => {
    for (const result of FUSED_WEAPONS.map((w) => w.id)) {
      const fi = FUSION_TABLE.findIndex((f) => f.result === weaponId(result));
      expect(fi, result).toBeGreaterThanOrEqual(0);
      const f = FUSION_TABLE[fi];
      const s = createGame({ seed: 'FUSIONS' });
      const p = s.players[0];
      p.weapons.length = 0;
      addWeapon(p, f.weapon).level = weaponDef(f.weapon).levels.length;
      expect(p.passives.length).toBe(0);
      expect(availableFusions(p), result).toContain(fi);
    }
  });

  it('the Blaster fires its level as a burst of shots in a row', () => {
    const s = arena('blaster', 4, 100000);
    let most = 0;
    let fired = 0;
    run(s, 0.8, (st) => {
      fired = Math.max(fired, st.players[0].weapons[0].burstLeft);
      most = Math.max(most, st.projectiles.slice(0, st.projCount).filter((b) => b.kind === 0 && b.age === 1).length);
    });
    // One bullet per tick at most (a burst, not a fan), 3 still to come after the first.
    expect(most).toBe(1);
    expect(fired).toBe(3);
  });

  it('the Blade sweeps, hurts and knocks back', () => {
    const s = arena('blade', 5, 5000);
    const p = s.players[0];
    const w = p.weapons[0];
    const angles: number[] = [];
    run(s, 1.2, () => {
      if (w.activeTicks > 0 && w.tickTimer < w.vN) angles.push(w.angles[2]);
    });
    expect(p.damageDealt).toBeGreaterThan(0);
    expect(new Set(angles).size).toBeGreaterThan(3);
    expect(alive(s).some((e) => e.kbx !== 0 || e.kby !== 0)).toBe(true);
  });

  it('the Railgun fires at once: one beam hits everything on its line, near and far, the same tick', () => {
    const s = empty('railgun', 1);
    const p = s.players[0];
    const near = spawnEnemy(s, enemyId('block'), p.x + 120, p.y, 1, 0.01, 0.001, 0)!;
    const far = spawnEnemy(s, enemyId('block'), p.x + 700, p.y, 1, 0.01, 0.001, 0)!;
    const aside = spawnEnemy(s, enemyId('block'), p.x, p.y + 300, 1, 0.01, 0.001, 0)!;
    for (const e of [near, far, aside]) e.hp = e.maxHp = 5000;
    let beams = 0;
    let both = false;
    run(s, 0.5, (st) => {
      for (let i = 0; i < st.eventCount; i++) if (st.events[i].type === EV_SHOOT) beams++;
      if (beams === 1 && near.hp < 5000) both = far.hp < 5000;
    });
    expect(beams).toBe(1);
    expect(both).toBe(true);
    expect(aside.hp).toBe(5000);
  });

  it('the Electric arc locks on the biggest by max HP, holds it in place and shocks its neighbours', () => {
    const s = empty('electric_arc', 1);
    const p = s.players[0];
    const big = spawnEnemy(s, enemyId('block'), p.x + 150, p.y, 1, 0.01, 1, 0)!;
    big.maxHp = 100000;
    big.hp = 50000;
    const fresh = spawnEnemy(s, enemyId('block'), p.x - 120, p.y, 1, 0.01, 1, 0)!;
    fresh.maxHp = fresh.hp = 60000;
    const side = spawnEnemy(s, enemyId('hunter'), p.x + 190, p.y, 1, 0.01, 1, 0)!;
    side.maxHp = side.hp = 60000;
    const w = p.weapons[0];
    let lockedOn = -1;
    let stunned = false;
    run(s, 1, () => {
      if (w.activeTicks > 0 && lockedOn < 0) lockedOn = w.lockId;
      if (big.stunUntil > s.tick) stunned = true;
    });
    expect(lockedOn).toBe(big.id);
    expect(stunned).toBe(true);
    expect(big.hp).toBeLessThan(50000);
    expect(side.hp).toBeLessThan(60000);
    expect(fresh.hp).toBe(60000);
  });

  it('the Electric arc works in windows: a short lock, then a pause', () => {
    const s = arena('electric_arc', 1, 100000);
    const w = s.players[0].weapons[0];
    let on = 0;
    run(s, 6, () => {
      if (w.activeTicks > 0) on++;
    });
    const L = weaponDef(w.def).levels[0];
    // 0.8 s out of every 3.3 s: well under half of the time.
    expect(on).toBeGreaterThan(0);
    expect(on / (6 * TICK_RATE)).toBeLessThan(((L.duration ?? 0) / ((L.duration ?? 0) + (L.cooldown ?? 0))) * 1.5);
  });

  it('Mines: one every cooldown, even with no enemy around, and a blast does not set off the others', () => {
    const s = empty('mines', 1);
    run(s, 5);
    const L = weaponDef(s.players[0].weapons[0].def).levels[0];
    const n = projs(s, PJ_MINE).length;
    expect(n).toBeGreaterThanOrEqual(Math.floor(5 / (L.cooldown ?? 1)));
    expect(n).toBeLessThanOrEqual(Math.floor(5 / (L.cooldown ?? 1)) + 1);
    const c = empty('mines', 1);
    const p = c.players[0];
    p.weapons.length = 0;
    spawnMine(c, 0, weaponId('mines'), p.x + 200, p.y, 10, 60, 20, 600, 0, 0);
    spawnMine(c, 0, weaponId('mines'), p.x + 240, p.y, 10, 60, 20, 600, 0, 0);
    spawnMine(c, 0, weaponId('mines'), p.x + 400, p.y, 10, 60, 20, 600, 0, 0);
    spawnEnemy(c, enemyId('hunter'), p.x + 200, p.y, 1, 0.01, 0.001, 0);
    run(c, 0.5);
    // Only the one under the enemy went off.
    expect(projs(c, PJ_MINE).map((m) => Math.round(m.x - p.x)).sort()).toEqual([240, 400]);
  });

  it('the Scythe goes all the way around, and its tip hits twice as hard', () => {
    const s = empty('scythe', 1);
    const p = s.players[0];
    const L = weaponDef(p.weapons[0].def).levels[0];
    const reach = L.length ?? 0;
    const inner = spawnEnemy(s, enemyId('block'), p.x + 50, p.y, 1, 0.01, 0.001, 0)!;
    const tip = spawnEnemy(s, enemyId('block'), p.x - reach + 20, p.y, 1, 0.01, 0.001, 0)!;
    for (const e of [inner, tip]) e.hp = e.maxHp = 100000;
    run(s, 1.1); // one swing (the first comes after one cooldown)
    const a = 100000 - inner.hp;
    const b = 100000 - tip.hp;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeCloseTo(a * 2, 5);
  });

  it('the Boomerang flies out, stops, and comes back to the player as fast as it left', () => {
    const s = arena('boomerang', 1, 100000);
    const p = s.players[0];
    const steps: number[] = [];
    let back = false;
    run(s, 3, (st) => {
      const b = projs(st, PJ_BOOMERANG)[0];
      if (!b || back) return;
      steps.push(Math.hypot(b.x - b.px, b.y - b.py));
      if (b.a === 1 && Math.hypot(b.x - p.x, b.y - p.y) < 30) back = true;
    });
    expect(steps.length).toBeGreaterThan(20);
    const first = steps[1];
    const last = Math.max(...steps.slice(-4));
    // Symmetric: no burst of speed on the way back.
    expect(last).toBeLessThan(first * 1.3);
    expect(Math.min(...steps.slice(5, -5))).toBeLessThan(first * 0.2);
  });

  it('the Shockwave pushes the small ones much more than the big ones, and does not slow', () => {
    const s = empty('shockwave', 5);
    const p = s.players[0];
    const small = spawnEnemy(s, enemyId('hunter'), p.x + 60, p.y, 1, 0.01, 0.001, 0)!;
    const big = spawnEnemy(s, enemyId('block'), p.x - 60, p.y, 1, 0.01, 0.001, 0)!;
    small.hp = small.maxHp = big.hp = big.maxHp = 100000;
    let pushedSmall = 0;
    let pushedBig = 0;
    run(s, 1, () => {
      pushedSmall = Math.max(pushedSmall, Math.hypot(small.kbx, small.kby));
      pushedBig = Math.max(pushedBig, Math.hypot(big.kbx, big.kby));
    });
    expect(projs(s, PJ_RING).length + (pushedSmall > 0 ? 1 : 0)).toBeGreaterThan(0);
    expect(pushedSmall).toBeGreaterThan(pushedBig * 2);
    expect(small.slowUntil).toBe(0);
  });

  it('the Flamethrower sets enemies on fire, and the burn ticks are fire damage', () => {
    const s = arena('flamethrower', 1, 100000);
    let burning = false;
    let fireHits = 0;
    run(s, 4, (st) => {
      if (alive(st).some((e) => e.burnUntil > st.tick)) burning = true;
      for (let i = 0; i < st.eventCount; i++) if (st.events[i].type === EV_HIT && st.events[i].y2 === DMG_FIRE) fireHits++;
    });
    expect(burning).toBe(true);
    expect(fireHits).toBeGreaterThan(0);
  });

  it('the Flamethrower jet turns only slowly', () => {
    const s = arena('flamethrower', 1, 5000);
    const w = s.players[0].weapons[0];
    const L = weaponDef(w.def).levels[0];
    let prev = NaN;
    let maxTurn = 0;
    run(s, 3, () => {
      if (w.activeTicks <= 0) {
        prev = NaN;
        return;
      }
      if (!Number.isNaN(prev)) {
        let d = Math.abs(w.angles[0] - prev);
        if (d > Math.PI) d = 2 * Math.PI - d;
        maxTurn = Math.max(maxTurn, d);
      }
      prev = w.angles[0];
    });
    expect(maxTurn).toBeLessThanOrEqual((L.turn ?? 0) / TICK_RATE + 1e-9);
  });

  it('the Swarm goes for a Shooter before a nearer chaser, and its bees come back', () => {
    const s = empty('swarm', 1);
    const p = s.players[0];
    const chaser = spawnEnemy(s, enemyId('hunter'), p.x + 90, p.y, 1, 0.01, 0.001, 0)!;
    const shooter = spawnEnemy(s, enemyId('shooter'), p.x - 260, p.y, 1, 0.01, 0.001, 0)!;
    chaser.hp = chaser.maxHp = shooter.hp = shooter.maxHp = 100000;
    let first = -1;
    run(s, 3, (st) => {
      if (first >= 0) return;
      const b = projs(st, PJ_BEE).find((x) => x.c >= 0);
      if (b) first = b.ty;
    });
    expect(first).toBe(shooter.id);
    expect(projs(s, PJ_BEE).length).toBe(3);
    let stuck = false;
    run(s, 4, (st) => {
      if (projs(st, PJ_BEE).some((b) => b.a === BEE_STUCK)) stuck = true;
    });
    expect(stuck).toBe(true);
    expect(shooter.hp).toBeLessThan(100000);
  });

  it('Shurikens bounce off the screen edges around the player', () => {
    const s = arena('shuriken', 5, 100000);
    const p = s.players[0];
    let inside = true;
    let seen = 0;
    run(s, 6, (st) => {
      for (const b of projs(st, PJ_SHURIKEN)) {
        seen++;
        if (Math.abs(b.x - p.x) > SHURIKEN_BOX_X + 1 || Math.abs(b.y - p.y) > SHURIKEN_BOX_Y + 1) inside = false;
      }
    });
    expect(seen).toBeGreaterThan(0);
    expect(inside).toBe(true);
  });

  it('Shooters only fire straight ahead', () => {
    const s = arena('blaster', 1, 100000, 'shooter');
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

  it('the Mortar only aims at distant groups; Meteors leave a crater', () => {
    const m = arena('mortar', 1);
    const p = m.players[0];
    let shells = 0;
    let near = false;
    run(m, 3, (st) => {
      for (const b of projs(st, PJ_SHELL)) {
        shells++;
        if (Math.hypot(b.tx - p.x, b.ty - p.y) < 150) near = true;
      }
    });
    expect(shells).toBeGreaterThan(0);
    expect(near).toBe(false);
    expect(m.players[0].damageDealt).toBeGreaterThan(0);
    const met = arena('meteors', 1);
    let craters = 0;
    run(met, 3, (st) => (craters += projs(st, PJ_BLAZE).length));
    expect(craters).toBeGreaterThan(0);
  });
});
