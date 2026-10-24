/**
 * Localization core: the current locale, `t()` for dot-path keys checked at compile time with `{name}`
 * interpolation, and `tn()` for the few strings that need a plural form. French (locales/fr.ts) is the
 * source of truth; every other locale must have exactly the same keys (see LocaleShape).
 *
 * No DOM access here: the app applies `document.documentElement.lang` itself. src/sim and src/data
 * never import this module (the simulation stays text-free).
 */
import { fr } from './locales/fr';
import { en } from './locales/en';

export type Locale = 'fr' | 'en';
export const LOCALES: readonly Locale[] = ['fr', 'en'];
export const DEFAULT_LOCALE: Locale = 'fr';
/** Name of each language, written in that language (language selector). */
export const LOCALE_NAMES: Record<Locale, string> = { fr: 'Français', en: 'English' };
/** BCP 47 tag used for Intl formatting (numbers, dates, plural rules). */
const INTL_TAGS: Record<Locale, string> = { fr: 'fr-FR', en: 'en-US' };

/** The French table with every string leaf widened to `string`: other locales must match it exactly (tuples keep their length). */
type Widen<T> = T extends string ? string : { readonly [K in keyof T]: Widen<T[K]> };
export type LocaleShape = Widen<typeof fr>;

type Plural = { readonly one: string; readonly other: string };
/** Dot paths to string leaves (arrays and plural pairs excluded). */
type TextPaths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : T[K] extends readonly unknown[] | Plural ? never : TextPaths<T[K], `${P}${K}.`>;
}[keyof T & string];
/** Dot paths to `{ one, other }` plural pairs. */
type PluralPaths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends Plural ? `${P}${K}` : T[K] extends string | readonly unknown[] ? never : PluralPaths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TextKey = TextPaths<LocaleShape>;
export type PluralKey = PluralPaths<LocaleShape>;
export type Params = Record<string, string | number>;

const TABLES: Record<Locale, LocaleShape> = { fr, en };

let current: Locale = DEFAULT_LOCALE;

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

/** Intl tag of the current locale ('fr-FR', 'en-US'). */
export function intlTag(): string {
  return INTL_TAGS[current];
}

/** The whole table of the current locale (content helpers read it by id). */
export function table(): LocaleShape {
  return TABLES[current];
}

/** Flattened string leaves, built once per locale ('a.b.c' → text). */
const flat = new Map<Locale, Map<string, string>>();
function flatten(node: unknown, prefix: string, out: Map<string, string>): void {
  if (typeof node === 'string') out.set(prefix, node);
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
}
function lookup(key: string): string {
  let m = flat.get(current);
  if (!m) {
    m = new Map();
    flatten(TABLES[current], '', m);
    flat.set(current, m);
  }
  return m.get(key) ?? key;
}

/** Replaces `{name}` placeholders with `params.name` (unknown placeholders are left as is). */
export function format(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Localized text for `key` in the current locale. */
export function t(key: TextKey, params?: Params): string {
  return format(lookup(key), params);
}

const pluralRules = new Map<Locale, Intl.PluralRules>();
/** Plural text: picks `key.one` or `key.other` for `n` with the locale's plural rules; `{n}` is `n`. */
export function tn(key: PluralKey, n: number, params?: Params): string {
  let rules = pluralRules.get(current);
  if (!rules) {
    rules = new Intl.PluralRules(INTL_TAGS[current]);
    pluralRules.set(current, rules);
  }
  const form = rules.select(n) === 'one' ? 'one' : 'other';
  return format(lookup(`${key}.${form}`), { n, ...params });
}
