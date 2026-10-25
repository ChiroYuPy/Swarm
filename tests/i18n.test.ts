import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE_WEAPONS, FUSED_WEAPONS } from '../src/data/weapons';
import { PASSIVES } from '../src/data/passives';
import { PICKUPS } from '../src/data/loot';
import { BOSS_ORDER, ENEMIES } from '../src/data/enemies';
import { DIFFICULTIES } from '../src/data/difficulty';
import { fr } from '../src/i18n/locales/fr';
import { en } from '../src/i18n/locales/en';
import { DEFAULT_LOCALE, LOCALES, getLocale, setLocale, t, tn, type Locale, type LocaleShape } from '../src/i18n';
import { bossName, enemyName, enemyShortName, weaponLevelText, weaponName } from '../src/i18n/content';

const TABLES: Record<Locale, LocaleShape> = { fr, en };

/** Every string leaf as 'a.b.c' (array items as 'a.levels.0') → text. */
function leaves(node: unknown, prefix = '', out = new Map<string, string>()): Map<string, string> {
  if (typeof node === 'string') out.set(prefix, node);
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) leaves(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

afterEach(() => setLocale(DEFAULT_LOCALE));

describe('locales', () => {
  const ref = leaves(fr);

  it('French is the default', () => {
    expect(DEFAULT_LOCALE).toBe('fr');
    expect(getLocale()).toBe('fr');
    expect(LOCALES).toEqual(['fr', 'en']);
  });

  for (const locale of LOCALES) {
    it(`${locale}: same keys as fr, no empty string, same placeholders`, () => {
      const map = leaves(TABLES[locale]);
      expect([...map.keys()].sort()).toEqual([...ref.keys()].sort());
      for (const [k, v] of map) {
        expect(v.trim(), `${locale}.${k} is empty`).not.toBe('');
        expect(placeholders(v), `${locale}.${k} placeholders`).toEqual(placeholders(ref.get(k)!));
      }
    });
  }

  for (const locale of LOCALES) {
    it(`${locale}: every content id has its text, with one line per level`, () => {
      const L = TABLES[locale] as unknown as Record<string, Record<string, Record<string, unknown>>>;
      const named = (table: string, ids: string[], fields: string[]) => {
        expect(Object.keys(L[table]).sort(), `${locale}.${table} ids`).toEqual([...ids].sort());
        for (const id of ids) for (const f of fields) expect(typeof L[table][id][f], `${locale}.${table}.${id}.${f}`).toBe('string');
      };
      named('weapons', BASE_WEAPONS.map((w) => w.id), ['name', 'desc']);
      named('evolutions', FUSED_WEAPONS.map((w) => w.id), ['name', 'desc']);
      for (const w of [...BASE_WEAPONS, ...FUSED_WEAPONS]) {
        const lines = (L[w.fusion ? 'evolutions' : 'weapons'][w.id].levels ?? []) as string[];
        expect(lines.length, `${locale} ${w.id} level lines`).toBe(w.levels.length);
      }
      named('passives', PASSIVES.map((p) => p.id), ['name', 'desc', 'effect']);
      named('pickups', PICKUPS.map((p) => p.id), ['name', 'desc']);
      named('enemies', ENEMIES.map((e) => e.id), ['name', 'desc']);
      for (const id of BOSS_ORDER) expect(typeof L.enemies[id].short, `${locale} ${id} short name`).toBe('string');
      named('difficulties', DIFFICULTIES.map((d) => d.id), ['name', 'desc']);
    });
  }
});

describe('t()', () => {
  it('interpolates and follows the current locale', () => {
    expect(t('toasts.wave', { n: 3 })).toBe('Vague 3');
    expect(weaponName('electric_arc')).toBe('Arc électrique');
    expect(weaponLevelText('blaster', 1)).toBe('Rafale de 1 tir vers l’ennemi le plus proche.');
    expect(weaponLevelText('spiral', 4)).toBe('Tir continu en spirale et rafales ciblées.');
    expect(enemyShortName('ricochet_star')).toBe('Étoile');
    setLocale('en');
    expect(t('toasts.wave', { n: 3 })).toBe('Wave 3');
    expect(weaponName('electric_arc')).toBe('Electric Arc');
    expect(enemyName('hunter')).toBe('Hunter');
    expect(bossName(7)).toBe('Ricochet Star Mk II');
  });

  it('picks plural forms with the locale rules', () => {
    expect(tn('toasts.chest', 1)).toBe('Coffre : 1 amélioration');
    expect(tn('toasts.chest', 3)).toBe('Coffre : 3 améliorations');
    setLocale('en');
    expect(tn('toasts.chest', 1)).toBe('Chest: 1 upgrade');
    expect(tn('toasts.chest', 2)).toBe('Chest: 2 upgrades');
  });
});

describe('the simulation stays text-free', () => {
  const src = join(__dirname, '..', 'src');
  for (const dir of ['sim', 'data']) {
    it(`src/${dir} never imports src/i18n`, () => {
      const files = (readdirSync(join(src, dir), { recursive: true }) as string[]).filter((f) => f.endsWith('.ts'));
      for (const f of files) expect(readFileSync(join(src, dir, f), 'utf8'), f).not.toMatch(/from ['"][./]*i18n/);
    });
  }
});
