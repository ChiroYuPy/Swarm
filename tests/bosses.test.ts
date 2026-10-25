import { describe, expect, it } from 'vitest';
import { createGame, step, TICK_RATE, EV_FLEE, EV_WAVE, PJ_FIRE, type GameState } from '../src/sim';
import { spawnEnemy } from '../src/sim/entities';
import { BOSS_PATTERNS, BOSS_TICKS, BOSS_TYPES, MIX_TICKS, WALL_RISE, WAVE_TICKS, enemyId } from '../src/sim/registry';
import { damageEnemy } from '../src/sim/combat';
import { TRAPEZOID_BOSS, BOSS_ORDER, BUILDER_HEXAGON_BOSS, LASER_EYE_BOSS, SWARM_QUEEN_BOSS } from '../src/data/enemies';
import { bossName } from '../src/i18n/content';
import { defaultSandbox } from '../src/storage/storage';

/** Empty game (no automatic spawns, no boss). */
function arena(): GameState {
  return createGame({ seed: 'BOSS', sandbox: { ...defaultSandbox().rules, invincible: false, enemyMul: 0, bosses: false, weapons: [] } });
}

/** Places a boss at (dx, dy) from the player, ready to enter phase `kind` on the next step. */
function boss(s: GameState, id: string, dx: number, dy: number, kind?: string) {
  const t = enemyId(id);
  const p = s.players[0];
  const e = spawnEnemy(s, t, p.x + dx, p.y + dy, 100, 1, 1, 0)!;
  s.bossId = e.id;
  const pat = BOSS_PATTERNS[t];
  const i = kind ? pat.findIndex((ph) => ph.kind === kind) : 0;
  e.ai = (i - 1 + pat.length) % pat.length;
  e.timer = kind ? 0 : Math.round(pat[0].duration * TICK_RATE);
  return e;
}

const alive = (s: GameState, id: string) => s.enemies.slice(0, s.enemyCount).filter((e) => e.alive && e.type === enemyId(id));

describe('waves and bosses', () => {
  it('a wave, then a break with no spawns at all', () => {
    const s = createGame({ seed: 'VAGUES', sandbox: { ...defaultSandbox().rules, invincible: true, bosses: false, weapons: [] } });
    let waves = 0;
    for (let i = 0; i < WAVE_TICKS; i++) {
      step(s, [0]);
      for (let k = 0; k < s.eventCount; k++) if (s.events[k].type === EV_WAVE) waves++;
    }
    expect(waves).toBe(1);
    // (bonus crates keep arriving, though)
    const foes = () => s.enemies.slice(0, s.enemyCount).filter((e) => e.alive && e.type !== enemyId('bonus_crate'));
    const last = () => Math.max(0, ...foes().map((e) => e.id));
    const n = last();
    for (let i = 0; i < MIX_TICKS - WAVE_TICKS - 1; i++) step(s, [0]);
    expect(last()).toBe(n);
    for (let i = 0; i < 3 * 60; i++) step(s, [0]);
    expect(last()).toBeGreaterThan(n);
  });

  it('the boss arrives alone: the others flee, nothing else spawns and the clock waits for its death', () => {
    const s = createGame({ seed: 'SEUL', sandbox: { ...defaultSandbox().rules, invincible: true, weapons: [] } });
    s.clock = BOSS_TICKS - 30;
    s.tick = s.clock;
    for (let i = 0; i < 20; i++) step(s, [0]);
    const p = s.players[0];
    spawnEnemy(s, enemyId('hunter'), p.x + 300, p.y, 1, 1, 1, 0);
    let fled = 0;
    for (let i = 0; i < 20; i++) {
      step(s, [0]);
      for (let k = 0; k < s.eventCount; k++) if (s.events[k].type === EV_FLEE) fled++;
    }
    expect(s.bossId).toBeGreaterThanOrEqual(0);
    expect(fled).toBeGreaterThan(0);
    const clock = s.clock;
    const n = s.nextEnemyId;
    for (let i = 0; i < 5 * TICK_RATE; i++) step(s, [0]);
    expect(s.clock).toBe(clock);
    // Only the boss (and its own reinforcements) could spawn.
    const bosses = s.enemies.slice(0, s.enemyCount).filter((e) => e.alive && BOSS_TYPES.includes(e.type));
    expect(bosses.length).toBe(1);
    expect(s.enemies.slice(0, s.enemyCount).filter((e) => e.alive && e.id >= n && e.type !== enemyId(TRAPEZOID_BOSS.summon.type)).length).toBe(0);
    // Boss death: a short lull, then the waves resume.
    damageEnemy(s, s.enemies.indexOf(bosses[0]), 1e9, 0, 0, 0);
    step(s, [0]);
    expect(s.clock).toBe(clock);
    for (let i = 0; i < 7 * TICK_RATE; i++) step(s, [0]);
    expect(s.clock).toBeGreaterThan(clock);
  });

  it('bosses arrive in order, then come back as Mk II', () => {
    expect(BOSS_ORDER.map((_id, k) => [BOSS_TYPES[k], bossName(k)])).toEqual(BOSS_ORDER.map((id, k) => [enemyId(id), bossName(k)]));
    expect(bossName(0)).toBe('Trapèze');
    expect(bossName(1)).toBe('Hexagone bâtisseur');
    expect(bossName(5)).toBe('Trapèze Mk II');
  });

  it('Trapezoid: the charge goes all the way down the line and hits very hard', () => {
    const s = arena();
    const p = s.players[0];
    const e = boss(s, 'trapezoid', 600, 0, 'charge');
    const x0 = e.x;
    for (let i = 0; i < 2.4 * TICK_RATE - 2; i++) {
      step(s, [0]);
      p.hp = p.stats.maxHp;
      p.invulnUntil = 0;
    }
    expect(x0 - e.x).toBeGreaterThan(TRAPEZOID_BOSS.charge.length - 20);
    // And it crushes: a hit mid-charge is worth more than its normal contact damage.
    const t = arena();
    const q = t.players[0];
    const b = boss(t, 'trapezoid', 300, 0, 'charge');
    const hp0 = q.hp;
    for (let i = 0; i < 1.6 * TICK_RATE; i++) step(t, [0]);
    expect(hp0 - q.hp).toBeGreaterThan(b.dmg * 1.5 * (1 - q.stats.armor));
  });

  it('Builder hexagon: a cage of walls around the player that blocks them, then falls on its own', () => {
    const s = arena();
    const p = s.players[0];
    const hex = boss(s, 'builder_hexagon', 500, 0, 'build');
    step(s, [0]);
    hex.alive = false;
    const walls = alive(s, 'wall');
    expect(walls.length).toBeGreaterThan(30);
    for (const w of walls)
      expect(Math.abs(Math.hypot(w.x - p.x, w.y - p.y) - BUILDER_HEXAGON_BOSS.cage.radius)).toBeLessThan(BUILDER_HEXAGON_BOSS.cage.radius * 0.15);
    for (let i = 0; i < WALL_RISE * TICK_RATE + 2; i++) step(s, [0]);
    // Rush to the right: the player stays inside the cage.
    for (let i = 0; i < 3 * TICK_RATE; i++) step(s, [1]);
    expect(Math.hypot(p.x, p.y)).toBeLessThan(BUILDER_HEXAGON_BOSS.cage.radius);
    for (let i = 0; i < BUILDER_HEXAGON_BOSS.cage.wallLife * TICK_RATE; i++) step(s, [0]);
    expect(alive(s, 'wall').length).toBe(0);
  });

  it('Builder hexagon: the cage has two opposite exits, and only comes back every other cycle', () => {
    const s = arena();
    const p = s.players[0];
    const hex = boss(s, 'builder_hexagon', 500, 0, 'build');
    step(s, [0]);
    const angles = alive(s, 'wall')
      .map((w) => Math.atan2(w.y - p.y, w.x - p.x))
      .sort((x, y) => x - y);
    // The exits: large angle gaps between two neighbouring walls (wrap-around included).
    const gaps = angles.map((a, i) => (i + 1 < angles.length ? angles[i + 1] - a : angles[0] + 2 * Math.PI - a));
    const big = gaps.filter((g) => g * BUILDER_HEXAGON_BOSS.cage.radius > 60);
    expect(big.length).toBe(2);
    for (const w of alive(s, 'wall')) w.alive = false;
    // Next cycle: no cage.
    hex.ai = (BOSS_PATTERNS[hex.type].findIndex((ph) => ph.kind === 'build') - 1 + BOSS_PATTERNS[hex.type].length) % BOSS_PATTERNS[hex.type].length;
    hex.timer = 0;
    step(s, [0]);
    expect(alive(s, 'wall').length).toBe(0);
  });

  it('Ricochet star: its dash leaves burning flames', () => {
    const s = arena();
    const p = s.players[0];
    const e = boss(s, 'ricochet_star', 300, 0, 'aim');
    for (let i = 0; i < 1.4 * TICK_RATE; i++) step(s, [0]);
    const fires = s.projectiles.slice(0, s.projCount).filter((b) => b.kind === PJ_FIRE);
    expect(fires.length).toBeGreaterThan(5);
    // A flame under the player, far from the star.
    e.x = p.x + 2000;
    const hp0 = p.hp;
    fires[0].x = p.x;
    fires[0].y = p.y;
    fires[0].life = 120;
    for (let i = 0; i < 30; i++) step(s, [0]);
    expect(p.hp).toBeLessThan(hp0);
  });

  it('Ricochet star: each dash bounces several times inside its box', () => {
    const s = createGame({ seed: 'BOSS', sandbox: { ...defaultSandbox().rules, invincible: true, enemyMul: 0, bosses: false, weapons: [] } });
    const e = boss(s, 'ricochet_star', 300, 0, 'aim');
    const pat = BOSS_PATTERNS[e.type];
    // Aim, then the whole first dash: each bounce changes its heading.
    for (let i = 0; i < 2 * TICK_RATE && pat[e.ai].kind !== 'dash'; i++) step(s, [0]);
    expect(pat[e.ai].kind).toBe('dash');
    let bounces = 0;
    let a = e.aux;
    for (let i = 0; i < 5 * TICK_RATE && pat[e.ai].kind === 'dash'; i++) {
      step(s, [0]);
      if (e.aux !== a) bounces++;
      a = e.aux;
    }
    expect(bounces).toBeGreaterThanOrEqual(3);
  });

  it('Laser eye: the beam sweeps the cone and hits; out of range, nothing', () => {
    const s = arena();
    const p = s.players[0];
    boss(s, 'laser_eye', 300, 0, 'focus');
    const hp0 = p.hp;
    for (let i = 0; i < 2.2 * TICK_RATE; i++) step(s, [0]);
    expect(p.hp).toBeLessThan(hp0);
    const t = arena();
    const q = t.players[0];
    const e = boss(t, 'laser_eye', 300, 0, 'focus');
    step(t, [0]);
    // The player moves beyond the beam's range.
    q.x = e.x - LASER_EYE_BOSS.laser.length - 80;
    q.px = q.x;
    const hq = q.hp;
    for (let i = 0; i < 2.0 * TICK_RATE; i++) {
      step(t, [0]);
      q.x = q.px = e.x - LASER_EYE_BOSS.laser.length - 80;
      q.y = q.py = e.y;
    }
    expect(q.hp).toBe(hq);
  });

  it('Swarm queen: lays eggs that hatch into swarm enemies, unless they are broken', () => {
    const s = arena();
    boss(s, 'swarm_queen', 300, 0);
    for (let i = 0; i < 4 * TICK_RATE; i++) step(s, [0]);
    const eggs = alive(s, 'egg');
    expect(eggs.length).toBeGreaterThan(1);
    damageEnemy(s, s.enemies.indexOf(eggs[0]), 1e6, 0, 0, 0);
    const swarm0 = alive(s, 'swarm').length;
    for (let i = 0; i < SWARM_QUEEN_BOSS.lay.hatchAfter * TICK_RATE; i++) step(s, [0]);
    expect(alive(s, 'swarm').length).toBeGreaterThan(swarm0);
  });
});
