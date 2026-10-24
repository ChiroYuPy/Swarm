/**
 * Content text by id (names, descriptions, per-level lines) in the current locale, so screens never
 * build content keys by hand. Ids are the ones in src/data; a missing entry falls back to the id
 * (tests/i18n.test.ts checks that every id has its text in every locale).
 */
import { BOSS_ORDER } from '../data/enemies';
import { table } from './index';

interface WeaponText {
  readonly name: string;
  readonly desc: string;
  /** one line per level (index 0 = when obtained) */
  readonly levels: readonly string[];
}
interface PassiveText {
  readonly name: string;
  readonly desc: string;
  /** effect of one level */
  readonly effect: string;
}
interface NamedText {
  readonly name: string;
  readonly desc: string;
}
interface EnemyText extends NamedText {
  /** bosses only: short name for tiles and hints (« Étoile » for « Étoile ricochet ») */
  readonly short?: string;
}

const missing = (id: string): WeaponText & PassiveText & EnemyText => ({ name: id, desc: id, effect: id, levels: [id] });

/** Base weapons and evolutions share one id space (ALL_WEAPONS). */
function weapon(id: string): WeaponText {
  const L = table();
  return (L.weapons as Record<string, WeaponText>)[id] ?? (L.evolutions as Record<string, WeaponText>)[id] ?? missing(id);
}
const passive = (id: string): PassiveText => (table().passives as Record<string, PassiveText>)[id] ?? missing(id);
const pickup = (id: string): NamedText => (table().pickups as Record<string, NamedText>)[id] ?? missing(id);
const enemy = (id: string): EnemyText => (table().enemies as Record<string, EnemyText>)[id] ?? missing(id);
const difficulty = (id: string): NamedText => (table().difficulties as Record<string, NamedText>)[id] ?? missing(id);

export const weaponName = (id: string) => weapon(id).name;
export const weaponDesc = (id: string) => weapon(id).desc;
/** Line of a weapon level (1-based, clamped); evolutions have a single line. */
export function weaponLevelText(id: string, level: number): string {
  const lines = weapon(id).levels;
  return lines[Math.max(0, Math.min(lines.length - 1, level - 1))] ?? '';
}
export const weaponLevelLines = (id: string): readonly string[] => weapon(id).levels;

export const passiveName = (id: string) => passive(id).name;
export const passiveDesc = (id: string) => passive(id).desc;
export const passiveEffect = (id: string) => passive(id).effect;

export const pickupName = (id: string) => pickup(id).name;
export const pickupDesc = (id: string) => pickup(id).desc;

export const enemyName = (id: string) => enemy(id).name;
export const enemyDesc = (id: string) => enemy(id).desc;
/** Short name of a boss (falls back to the full name for other enemies). */
export const enemyShortName = (id: string) => enemy(id).short ?? enemy(id).name;

export const difficultyName = (id: string) => difficulty(id).name;
export const difficultyDesc = (id: string) => difficulty(id).desc;

/** Later rounds of the boss cycle: « Mk II », « Mk III »… */
const MARKS = ['', ' Mk II', ' Mk III', ' Mk IV', ' Mk V', ' Mk VI', ' Mk VII', ' Mk VIII'];

/** Name of the k-th boss of the run (0 = the first one). */
export function bossName(k: number): string {
  return enemyName(BOSS_ORDER[k % BOSS_ORDER.length]) + MARKS[Math.min(MARKS.length - 1, Math.floor(k / BOSS_ORDER.length))];
}
