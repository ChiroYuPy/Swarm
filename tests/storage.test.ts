import { describe, expect, it } from 'vitest';
import { migrate, SAVE_VERSION, topScores } from '../src/storage/storage';
import { ALL_WEAPONS } from '../src/data/weapons';
import { PASSIVES } from '../src/data/passives';
import { ENEMIES } from '../src/data/enemies';
import { LEGACY_ENEMY_IDS, LEGACY_PASSIVE_IDS, LEGACY_WEAPON_IDS, RENAMED_WEAPON_IDS_V4 } from '../src/storage/legacy-ids';

/** A save as written by the game before the id rename (v2: French content ids, `tempsSurvecu`). */
const V2_SAVE = {
  version: 2,
  settings: { volume: 0.5, music: 0.3, sfx: 0.9, muted: false, quality: 'low', shake: false, damageNumbers: true, showFps: true, autoPause: false },
  difficulty: 2,
  scores: [
    { seed: 'ABCD-1234', difficulty: 1, tempsSurvecu: 312.4, kills: 1520, level: 31, score: 5890, version: '0.8.4', date: '2026-09-30T20:11:00.000Z' },
    { seed: 'WXYZ-9876', difficulty: 1, tempsSurvecu: 95.2, kills: 210, level: 12, score: 1160, version: '0.8.4', date: '2026-10-01T18:02:00.000Z' },
    { seed: 'HARD-0001', difficulty: 2, tempsSurvecu: 640, kills: 4100, level: 44, score: 11750, version: '0.8.5', date: '2026-10-10T21:45:00.000Z' },
  ],
  sandbox: {
    difficulty: 0,
    rules: {
      invincible: false,
      level: 20,
      startWave: 5,
      enemyMul: 2,
      enemies: ['triangle', 'losange', 'golem', 'teleporteur', 'nexistepas'],
      bosses: true,
      duel: 'etoile',
      duelMark: 3,
      summons: false,
      might: 2,
      xp: 5,
      weapons: [
        { id: 'confetti', level: 5 },
        { id: 'aura', level: 3 },
        { id: 'laser', level: 2 },
        { id: 'escadrille', level: 1 },
        { id: 'retiree', level: 4 },
      ],
      passives: [
        { id: 'cafe', level: 5 },
        { id: 'soupe', level: 2 },
        { id: 'chance', level: 1 },
      ],
      item: 'freeze',
    },
  },
};

describe('save migration', () => {
  it('v2 save: ids renamed to English, tempsSurvecu → survivedSec, the rest kept', () => {
    const save = migrate(structuredClone(V2_SAVE));
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.difficulty).toBe(2);
    // Saves older than the language setting read as French.
    expect(save.settings).toEqual({ ...V2_SAVE.settings, language: 'fr' });

    expect(save.scores).toHaveLength(3);
    for (const s of save.scores) expect(s).not.toHaveProperty('tempsSurvecu');
    expect(save.scores.map((s) => s.survivedSec)).toEqual([312.4, 95.2, 640]);
    expect(topScores(save, 1).map((s) => s.seed)).toEqual(['ABCD-1234', 'WXYZ-9876']);
    expect(save.scores[2]).toEqual({ seed: 'HARD-0001', difficulty: 2, survivedSec: 640, kills: 4100, level: 44, score: 11750, version: '0.8.5', date: '2026-10-10T21:45:00.000Z' });

    const r = save.sandbox.rules;
    expect(save.sandbox.difficulty).toBe(0);
    expect(r.enemies).toEqual(['hunter', 'rusher', 'golem', 'teleporter']);
    expect(r.duel).toBe('ricochet_star');
    expect(r.duelMark).toBe(3);
    expect(r.weapons).toEqual([
      { id: 'blaster', level: 5 },
      { id: 'force_field', level: 3 },
      { id: 'railgun', level: 2 },
    ]);
    expect(r.passives).toEqual([
      { id: 'overclock', level: 5 },
      { id: 'vitality', level: 2 },
      { id: 'luck', level: 1 },
    ]);
    expect(r.item).toBe('freeze');
    expect([r.invincible, r.level, r.startWave, r.enemyMul, r.bosses, r.summons, r.might, r.xp]).toEqual([false, 20, 5, 2, true, false, 2, 5]);
  });

  it('unknown duel boss is dropped, not kept as a dangling id', () => {
    const save = migrate({ ...structuredClone(V2_SAVE), sandbox: { difficulty: 1, rules: { ...V2_SAVE.sandbox.rules, duel: 'pyramide' } } });
    expect(save.sandbox.rules.duel).toBeNull();
  });

  it('v1 scores also get survivedSec', () => {
    const save = migrate({ version: 1, settings: {}, scores: [{ seed: 'OLD', tempsSurvecu: 42, kills: 3, score: 423 }] });
    expect(save.scores).toHaveLength(1);
    expect(save.scores[0].survivedSec).toBe(42);
    expect(save.scores[0]).not.toHaveProperty('tempsSurvecu');
  });

  it('a current save goes through unchanged', () => {
    const v3 = migrate(structuredClone(V2_SAVE));
    expect(migrate(structuredClone(v3))).toEqual(v3);
  });

  it('v3 → v4: renamed weapons get their new id, removed ones are dropped', () => {
    const v3 = { ...migrate(structuredClone(V2_SAVE)), version: 3 };
    v3.sandbox.rules.weapons = [
      { id: 'orbs', level: 2 },
      { id: 'laser', level: 3 },
      { id: 'turret', level: 1 },
      { id: 'whip', level: 4 },
      { id: 'kamikaze_drones', level: 1 },
      { id: 'scythe', level: 1 },
      { id: 'mines', level: 2 },
    ];
    expect(migrate(v3).sandbox.rules.weapons).toEqual([
      { id: 'saws', level: 2 },
      { id: 'railgun', level: 3 },
      { id: 'blade', level: 4 },
      { id: 'hornets', level: 1 },
      { id: 'mines', level: 2 },
    ]);
  });

  it('legacy tables only point at existing content ids', () => {
    const weapons = new Set(ALL_WEAPONS.map((w) => w.id));
    const passives = new Set(PASSIVES.map((p) => p.id));
    const enemies = new Set(ENEMIES.map((e) => e.id));
    for (const id of Object.values(LEGACY_WEAPON_IDS)) expect(weapons.has(id), id).toBe(true);
    for (const id of Object.values(RENAMED_WEAPON_IDS_V4)) expect(weapons.has(id), id).toBe(true);
    for (const id of Object.values(LEGACY_PASSIVE_IDS)) expect(passives.has(id), id).toBe(true);
    for (const id of Object.values(LEGACY_ENEMY_IDS)) expect(enemies.has(id), id).toBe(true);
    expect(Object.keys(LEGACY_WEAPON_IDS)).toHaveLength(ALL_WEAPONS.length);
    expect(Object.keys(LEGACY_PASSIVE_IDS)).toHaveLength(PASSIVES.length);
    expect(Object.keys(LEGACY_ENEMY_IDS)).toHaveLength(ENEMIES.length);
  });
});

describe('language setting', () => {
  it('kept when valid, French when missing or unknown (no save version bump)', () => {
    const v3 = migrate(structuredClone(V2_SAVE));
    expect(migrate({ ...v3, settings: { ...v3.settings, language: 'en' } }).settings.language).toBe('en');
    expect(migrate({ ...v3, settings: { ...v3.settings, language: 'de' } }).settings.language).toBe('fr');
    const { language: _drop, ...noLanguage } = v3.settings;
    expect(migrate({ ...v3, settings: noLanguage }).settings.language).toBe('fr');
    expect(SAVE_VERSION).toBe(4);
  });
});
