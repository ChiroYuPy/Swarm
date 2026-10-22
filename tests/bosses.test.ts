import { describe, expect, it } from 'vitest';
import { createGame, step, TICK_RATE, EV_FLEE, EV_WAVE, PJ_FIRE, type GameState } from '../src/sim';
import { spawnEnemy } from '../src/sim/entities';
import { BOSS_PATTERNS, BOSS_TICKS, BOSS_TYPES, MIX_TICKS, WAVE_TICKS, enemyId } from '../src/sim/registry';
import { damageEnemy } from '../src/sim/combat';
import { BOSS, BOSS_ORDER, HEXAGONE, OEIL, REINE, bossName } from '../src/data/enemies';
import { defaultSandbox } from '../src/storage/storage';

/** Partie vide (aucune apparition automatique, pas de boss). */
function arena(): GameState {
  return createGame({ seed: 'BOSS', sandbox: { ...defaultSandbox().rules, invincible: false, enemyMul: 0, bosses: false, weapons: [] } });
}

/** Pose un boss à (dx, dy) du joueur, prêt à entrer dans la phase `kind` au prochain pas. */
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

describe('vagues et boss', () => {
  it('une vague, puis une pause sans aucune apparition', () => {
    const s = createGame({ seed: 'VAGUES', sandbox: { ...defaultSandbox().rules, invincible: true, bosses: false, weapons: [] } });
    let waves = 0;
    for (let i = 0; i < WAVE_TICKS; i++) {
      step(s, [0]);
      for (let k = 0; k < s.eventCount; k++) if (s.events[k].type === EV_WAVE) waves++;
    }
    expect(waves).toBe(1);
    // (les caisses bonus, elles, continuent d'arriver)
    const foes = () => s.enemies.slice(0, s.enemyCount).filter((e) => e.alive && e.type !== enemyId('distributeur'));
    const last = () => Math.max(0, ...foes().map((e) => e.id));
    const n = last();
    for (let i = 0; i < MIX_TICKS - WAVE_TICKS - 1; i++) step(s, [0]);
    expect(last()).toBe(n);
    for (let i = 0; i < 30; i++) step(s, [0]);
    expect(last()).toBeGreaterThan(n);
  });

  it('le boss arrive seul : les autres fuient, plus rien n’apparaît et l’horloge attend sa mort', () => {
    const s = createGame({ seed: 'SEUL', sandbox: { ...defaultSandbox().rules, invincible: true, weapons: [] } });
    s.clock = BOSS_TICKS - 30;
    s.tick = s.clock;
    for (let i = 0; i < 20; i++) step(s, [0]);
    const p = s.players[0];
    spawnEnemy(s, enemyId('triangle'), p.x + 300, p.y, 1, 1, 1, 0);
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
    // Seul le boss (et ses propres renforts) a pu apparaître.
    const bosses = s.enemies.slice(0, s.enemyCount).filter((e) => e.alive && BOSS_TYPES.includes(e.type));
    expect(bosses.length).toBe(1);
    expect(s.enemies.slice(0, s.enemyCount).filter((e) => e.alive && e.id >= n && e.type !== enemyId(BOSS.summon.type)).length).toBe(0);
    // Mort du boss : un peu de calme, puis les vagues reprennent.
    damageEnemy(s, s.enemies.indexOf(bosses[0]), 1e9, 0, 0, 0);
    step(s, [0]);
    expect(s.clock).toBe(clock);
    for (let i = 0; i < 7 * TICK_RATE; i++) step(s, [0]);
    expect(s.clock).toBeGreaterThan(clock);
  });

  it('les boss arrivent dans l’ordre, puis reviennent en Mk II', () => {
    expect(BOSS_ORDER.map((id, k) => [BOSS_TYPES[k], bossName(k)])).toEqual(BOSS_ORDER.map((id, k) => [enemyId(id), bossName(k)]));
    expect(bossName(0)).toBe('Trapèze');
    expect(bossName(1)).toBe('Hexagone bâtisseur');
    expect(bossName(5)).toBe('Trapèze Mk II');
  });

  it('Trapèze : la charge va jusqu’au bout de la ligne et fait très mal', () => {
    const s = arena();
    const p = s.players[0];
    const e = boss(s, 'boss', 600, 0, 'charge');
    const x0 = e.x;
    for (let i = 0; i < 2.4 * TICK_RATE - 2; i++) {
      step(s, [0]);
      p.hp = p.stats.maxHp;
      p.invulnUntil = 0;
    }
    expect(x0 - e.x).toBeGreaterThan(BOSS.chargeLength - 20);
    // Et il écrase : un coup en pleine charge vaut plus que son contact normal.
    const t = arena();
    const q = t.players[0];
    const b = boss(t, 'boss', 300, 0, 'charge');
    const hp0 = q.hp;
    for (let i = 0; i < 1.6 * TICK_RATE; i++) step(t, [0]);
    expect(hp0 - q.hp).toBeGreaterThan(b.dmg * 1.5 * (1 - q.stats.armor));
  });

  it('Hexagone : une cage de murs autour du joueur, qui le bloque, puis tombe toute seule', () => {
    const s = arena();
    const p = s.players[0];
    const hex = boss(s, 'hexagone', 500, 0, 'build');
    step(s, [0]);
    hex.alive = false;
    const walls = alive(s, 'mur');
    expect(walls.length).toBeGreaterThan(30);
    for (const w of walls)
      expect(Math.abs(Math.hypot(w.x - p.x, w.y - p.y) - HEXAGONE.cageRadius)).toBeLessThan(HEXAGONE.cageRadius * 0.15);
    for (let i = 0; i < HEXAGONE.wallRise * TICK_RATE + 2; i++) step(s, [0]);
    // On fonce vers la droite : on reste dans la cage.
    for (let i = 0; i < 3 * TICK_RATE; i++) step(s, [1]);
    expect(Math.hypot(p.x, p.y)).toBeLessThan(HEXAGONE.cageRadius);
    for (let i = 0; i < HEXAGONE.wallLife * TICK_RATE; i++) step(s, [0]);
    expect(alive(s, 'mur').length).toBe(0);
  });

  it('Étoile : sa ruée laisse des flammes qui brûlent', () => {
    const s = arena();
    const p = s.players[0];
    const e = boss(s, 'etoile', 300, 0, 'aim');
    for (let i = 0; i < 1.4 * TICK_RATE; i++) step(s, [0]);
    const fires = s.projectiles.slice(0, s.projCount).filter((b) => b.kind === PJ_FIRE);
    expect(fires.length).toBeGreaterThan(5);
    // Une flamme sous le joueur, loin de l'Étoile.
    e.x = p.x + 2000;
    const hp0 = p.hp;
    fires[0].x = p.x;
    fires[0].y = p.y;
    fires[0].life = 120;
    for (let i = 0; i < 30; i++) step(s, [0]);
    expect(p.hp).toBeLessThan(hp0);
  });

  it('Œil : le rayon balaie le cône et touche ; hors de portée, rien', () => {
    const s = arena();
    const p = s.players[0];
    boss(s, 'oeil', 300, 0, 'focus');
    const hp0 = p.hp;
    for (let i = 0; i < 2.2 * TICK_RATE; i++) step(s, [0]);
    expect(p.hp).toBeLessThan(hp0);
    const t = arena();
    const q = t.players[0];
    const e = boss(t, 'oeil', 300, 0, 'focus');
    step(t, [0]);
    // Le joueur part au-delà de la portée du rayon.
    q.x = e.x - OEIL.beamLength - 80;
    q.px = q.x;
    const hq = q.hp;
    for (let i = 0; i < 2.0 * TICK_RATE; i++) {
      step(t, [0]);
      q.x = q.px = e.x - OEIL.beamLength - 80;
      q.y = q.py = e.y;
    }
    expect(q.hp).toBe(hq);
  });

  it('Reine : pond des œufs qui éclosent en Essaim, sauf si on les casse', () => {
    const s = arena();
    boss(s, 'reine', 300, 0);
    for (let i = 0; i < 4 * TICK_RATE; i++) step(s, [0]);
    const eggs = alive(s, 'oeuf');
    expect(eggs.length).toBeGreaterThan(1);
    damageEnemy(s, s.enemies.indexOf(eggs[0]), 1e6, 0, 0, 0);
    const swarm0 = alive(s, 'points').length;
    for (let i = 0; i < REINE.hatchAfter * TICK_RATE; i++) step(s, [0]);
    expect(alive(s, 'points').length).toBeGreaterThan(swarm0);
  });
});
