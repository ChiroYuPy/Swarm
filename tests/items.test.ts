import { describe, expect, it } from 'vitest';
import {
  createGame,
  step,
  hashState,
  serializeState,
  deserializeState,
  INPUT_USE,
  TICK_RATE,
  PJ_EBULLET,
  PK_CLOCK,
  PK_CLONE,
  PK_FEVER,
  PK_FREEZE,
  PK_TOTEM,
  type GameState,
} from '../src/sim';
import { spawnEnemy, spawnPickup } from '../src/sim/entities';
import { enemyId } from '../src/sim/registry';
import { LOOT } from '../src/data/loot';
import { damageEnemy } from '../src/sim/combat';
import { addXp } from '../src/sim/player';
import { defaultSandbox } from '../src/storage/storage';

/** Partie vide (aucune apparition automatique) avec l'équipement voulu. */
function arena(weapons: { id: string; level: number }[] = []): GameState {
  return createGame({ seed: 'OBJETS', sandbox: { ...defaultSandbox().rules, invincible: false, enemyMul: 0, bosses: false, weapons } });
}

function put(s: GameState, id: string, x: number, y: number, hp = 1) {
  return spawnEnemy(s, enemyId(id), x, y, hp, 1, 1, 0)!;
}

function run(s: GameState, ticks: number, code = 0) {
  for (let i = 0; i < ticks && !s.over; i++) step(s, [code]);
}

function use(s: GameState, kind: number) {
  s.players[0].activable = kind;
  step(s, [INPUT_USE]);
}

describe('balles de Tireur cassables', () => {
  it('le Tireur tire des balles cassables, le boss non', () => {
    const s = arena();
    put(s, 'pentagone', 300, 0);
    run(s, 4 * TICK_RATE);
    const shots = s.projectiles.slice(0, s.projCount).filter((b) => b.kind === PJ_EBULLET);
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every((b) => b.a === 1)).toBe(true);
  });

  it('une aura détruit les balles avant qu’elles touchent', () => {
    const withAura = arena([{ id: 'aura', level: 5 }]);
    const without = arena();
    for (const s of [withAura, without]) put(s, 'pentagone', 320, 0, 100);
    run(withAura, 6 * TICK_RATE);
    run(without, 6 * TICK_RATE);
    const p = withAura.players[0];
    expect(p.hp).toBe(p.stats.maxHp);
    expect(without.players[0].hp).toBeLessThan(without.players[0].stats.maxHp);
  });
});

describe('Gel et Horloge', () => {
  it('Gel : fige les ennemis proches seulement, ils éclatent en chaîne', () => {
    const s = arena();
    const near = [0, 1, 2, 3, 4].map((k) => put(s, 'triangle', 120 + k * 30, 0));
    const far = put(s, 'triangle', 900, 0);
    use(s, PK_FREEZE);
    expect(near.every((e) => e.frozenUntil > s.tick)).toBe(true);
    expect(far.frozenUntil).toBe(0);
    const x0 = near[2].x;
    run(s, 30);
    expect(near[2].x).toBe(x0); // figé
    // On en tue un seul : les éclats emportent toute la rangée gelée.
    damageEnemy(s, s.enemies.indexOf(near[0]), 1000, 0, 0, 0);
    run(s, 1);
    expect(near.every((e) => !e.alive)).toBe(true);
    expect(far.alive).toBe(true);
  });

  it('Horloge : les ennemis avancent environ 3× moins vite', () => {
    const a = arena();
    const b = arena();
    const ea = put(a, 'triangle', 500, 0, 50);
    const eb = put(b, 'triangle', 500, 0, 50);
    use(b, PK_CLOCK);
    run(a, 60);
    run(b, 60);
    const da = 500 - ea.x;
    const db = 500 - eb.x;
    expect(db).toBeGreaterThan(da * LOOT.clockFactor * 0.8);
    expect(db).toBeLessThan(da * LOOT.clockFactor * 1.3);
  });
});

describe('Totem, Clone, Fièvre', () => {
  it('Totem : ramène une fois le joueur à 50 % de PV', () => {
    const s = arena();
    const p = s.players[0];
    spawnPickup(s, PK_TOTEM, p.x, p.y);
    run(s, 2);
    expect(p.totem).toBe(1);
    p.hp = 1;
    put(s, 'carre', p.x + 10, p.y, 100);
    run(s, 10);
    expect(p.alive).toBe(true);
    expect(p.totem).toBe(0);
    expect(p.hp).toBeGreaterThan(p.stats.maxHp * 0.4);
  });

  it('Clone : tire pour le joueur, ne ramasse rien, disparaît à l’heure', () => {
    const s = arena([{ id: 'confetti', level: 5 }]);
    use(s, PK_CLONE);
    const c = s.players[1];
    expect(c.master).toBe(0);
    expect(c.weapons.length).toBe(1);
    // Le joueur part loin : seuls les tirs du clone peuvent tuer cet ennemi.
    for (let i = 0; i < 90; i++) step(s, [1]);
    put(s, 'triangle', c.x + 120, c.y, 1);
    run(s, 2 * TICK_RATE);
    expect(s.players[0].kills).toBeGreaterThan(0);
    expect(c.kills).toBe(0);
    expect(c.xp).toBe(0);
    run(s, LOOT.cloneSeconds * TICK_RATE);
    expect(c.alive).toBe(false);
    expect(s.over).toBe(false);
    // L'état avec un clone se sauvegarde et se restaure à l'identique.
    expect(hashState(deserializeState(serializeState(s)))).toBe(hashState(s));
  });

  it('Fièvre d’XP : XP doublée', () => {
    const s = arena();
    const p = s.players[0];
    p.xpNext = 1000;
    addXp(s, p, 10);
    expect(p.xp).toBe(10);
    spawnPickup(s, PK_FEVER, p.x, p.y);
    run(s, 1);
    addXp(s, p, 10);
    expect(p.xp).toBe(30);
    expect(p.stats.magnet).toBeCloseTo(p.base.magnet * LOOT.feverMagnet);
  });
});
