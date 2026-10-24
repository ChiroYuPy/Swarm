import { describe, expect, it } from 'vitest';
import { createGame, step, hashState, weaponDef, isAwaitingChoice, choiceCode, TICK_RATE, MIX_TICKS, EF_BOSS, EF_PROP, type SandboxConfig } from '../src/sim';
import { BOSS_ORDER, ENEMIES } from '../src/data/enemies';
import { PASSIVES } from '../src/data/passives';
import { defaultSandbox } from '../src/storage/storage';

const rules = (over: Partial<SandboxConfig> = {}): SandboxConfig => ({ ...defaultSandbox().rules, ...over });

/** Avance la partie sans bouger, en prenant toujours la première amélioration proposée. */
function run(cfg: Parameters<typeof createGame>[0], seconds: number) {
  const s = createGame(cfg);
  const end = s.tick + seconds * TICK_RATE;
  while (s.tick < end && !s.over) step(s, [isAwaitingChoice(s) ? choiceCode(0) : 0]);
  return s;
}

describe('bac à sable', () => {
  it('équipement, niveau, objet et minute de départ', () => {
    const s = createGame({
      seed: 'SB',
      sandbox: rules({
        level: 12,
        startWave: 6,
        weapons: [
          { id: 'laser', level: 3 },
          { id: 'spiral', level: 1 },
        ],
        passives: [{ id: 'might', level: 5 }],
        item: 'bomb',
        might: 3,
      }),
    });
    const p = s.players[0];
    expect(p.weapons.map((w) => [weaponDef(w.def).id, w.level])).toEqual([
      ['laser', 3],
      ['spiral', 1],
    ]);
    expect(PASSIVES[p.passives[0].def].id).toBe('might');
    expect(p.level).toBe(12);
    expect(p.activable).toBeGreaterThanOrEqual(0);
    expect(s.tick).toBe(5 * MIX_TICKS);
    expect(p.stats.might).toBeCloseTo((1 + PASSIVES[p.passives[0].def].perLevel.might! * 5) * 3);
    expect(p.hp).toBe(p.stats.maxHp);
  });

  it('invincible : ne meurt jamais, même en Difficile sans bouger', () => {
    const s = run({ seed: 'SB-INV', difficulty: 2, sandbox: rules({ invincible: true, startWave: 11, weapons: [] }) }, 120);
    expect(s.over).toBe(false);
    expect(s.players[0].hp).toBe(s.players[0].stats.maxHp);
  });

  it('sans ennemis : seules les caisses bonus apparaissent, et pas de boss', () => {
    const s = run({ seed: 'SB-VIDE', sandbox: rules({ enemyMul: 0, bosses: false }) }, 200);
    for (let i = 0; i < s.enemyCount; i++) expect(s.enemies[i].flags & EF_PROP).toBeTruthy();
    expect(s.bossSpawned).toBe(0);
  });

  it('types choisis : uniquement ceux-là, dès le début', () => {
    const s = run({ seed: 'SB-TYPES', sandbox: rules({ enemies: ['block'], weapons: [] }) }, 30);
    const types = new Set<string>();
    for (let i = 0; i < s.enemyCount; i++) if (!(s.enemies[i].flags & EF_PROP)) types.add(ENEMIES[s.enemies[i].type].id);
    expect([...types]).toEqual(['block']);
  });

  it('ids inconnus ignorés, partie reproductible', () => {
    const cfg = { seed: 'SB-REPRO', sandbox: rules({ weapons: [{ id: 'nexistepas', level: 2 }, { id: 'force_field', level: 9 }], xp: 5 }) };
    const a = run(cfg, 60);
    const b = run(cfg, 60);
    expect(weaponDef(a.players[0].weapons[0].def).id).toBe('force_field');
    expect(a.players[0].weapons[0].level).toBe(5);
    expect(hashState(a)).toBe(hashState(b));
  });
  it('duel : le boss choisi arrive tout de suite, seul, avec la force de son rang', () => {
    const s = run({ seed: 'SB-DUEL', sandbox: rules({ startWave: 3, duel: 'ricochet_star', duelMark: 2, weapons: [] }) }, 1);
    const bosses = s.enemies.slice(0, s.enemyCount).filter((e) => e.alive && e.flags & EF_BOSS);
    expect(bosses.map((e) => ENEMIES[e.type].id)).toEqual(['ricochet_star']);
    // Mk II : son deuxième passage dans une partie.
    expect(bosses[0].aux2).toBe(BOSS_ORDER.length + BOSS_ORDER.indexOf('ricochet_star'));
    // Hors du compte : le boss de la vague 4 reste le Trapèze.
    expect(s.bossSpawned).toBe(0);
  });

  it('renforts des boss : coupés, le boss reste seul', () => {
    const minions = (summons: boolean) => {
      const s = run({ seed: 'SB-SEUL', sandbox: rules({ duel: 'trapezoid', summons, enemyMul: 0, weapons: [] }) }, 20);
      return s.enemies.slice(0, s.enemyCount).filter((e) => e.alive && !(e.flags & (EF_BOSS | EF_PROP))).length;
    };
    expect(minions(true)).toBeGreaterThan(0);
    expect(minions(false)).toBe(0);
  });
});
