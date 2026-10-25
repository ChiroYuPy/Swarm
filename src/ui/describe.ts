/**
 * Game data turned into the short texts and figures shown by several screens: passive totals,
 * real weapon numbers with the hero bonuses, evolution hints, and when the first boss arrives.
 */
import { ALL_WEAPONS } from '../data/weapons';
import type { PassiveDef } from '../data/passives';
import { FUSIONS } from '../data/fusions';
import { WAVES } from '../data/waves';
import { weaponLevel } from '../sim';
import { dec } from '../render/hud';
import { t } from '../i18n';
import { weaponName } from '../i18n/content';

export function passiveTotal(def: PassiveDef, level: number): string {
  const p = def.perLevel;
  const out: string[] = [];
  const pc = (v: number) => Math.round(v * level * 100);
  if (p.might) out.push(t('describe.damage', { n: pc(p.might) }));
  if (p.cooldown) out.push(t('describe.cooldown', { n: pc(p.cooldown) }));
  if (p.area) out.push(t('describe.area', { n: pc(p.area) }));
  if (p.speed) out.push(t('describe.speed', { n: pc(p.speed) }));
  if (p.magnet) out.push(t('describe.magnet', { n: pc(p.magnet) }));
  if (p.maxHp) out.push(t('describe.maxHp', { n: p.maxHp * level }));
  if (p.regen) out.push(t('describe.regen', { n: (p.regen * level).toFixed(2).replace('.', t('format.decimal')) }));
  if (p.armor) out.push(t('describe.armor', { n: pc(p.armor) }));
  if (p.luck) out.push(t('describe.luck', { n: pc(p.luck) }));
  return out.join(', ');
}

/** Real numbers of a weapon at the given level, hero bonuses included. */
export function weaponNumbers(id: string, level: number, might: number, cooldownMul: number): string {
  const L = weaponLevel(ALL_WEAPONS.findIndex((w) => w.id === id), level);
  const out = [L.damage > 0 ? t('describe.weaponDamage', { n: dec(L.damage * might, 1) }) : t('describe.noDamage')];
  if (L.cooldown) out.push(t('describe.reload', { n: dec(L.cooldown * cooldownMul) }));
  else if (L.tick) out.push(t('describe.every', { n: dec(L.tick) }));
  else if (L.hitCd) out.push(t('describe.hitsEvery', { n: dec(L.hitCd) }));
  if ((L.count ?? 1) > 1) out.push(`×${L.count}`);
  return out.join(' · ');
}

/** "Max level: evolves into X at the next level-up.", or nothing if the weapon has no evolution. */
export function evolutionHint(weaponId: string): string {
  const names = FUSIONS.filter((f) => f.weapon === weaponId).map((f) => weaponName(f.result));
  return names.length ? t('describe.evolutionHint', { names: names.join(t('describe.or')) }) : '';
}

/** The first boss arrives after `wavesPerBoss` waves and their pauses (seconds). */
export const FIRST_BOSS = (WAVES.waveLength + WAVES.pause) * WAVES.wavesPerBoss;
