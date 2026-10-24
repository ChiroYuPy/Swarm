/**
 * Game data turned into the short French texts and figures shown by several screens: passive totals,
 * real weapon numbers with the hero bonuses, evolution hints, and when the first boss arrives.
 */
import { ALL_WEAPONS } from '../data/weapons';
import { PASSIVES, type PassiveDef } from '../data/passives';
import { FUSIONS } from '../data/fusions';
import { WAVES } from '../data/waves';
import { weaponLevel } from '../sim';
import { dec } from '../render/hud';

export function passiveTotal(def: PassiveDef, level: number): string {
  const p = def.perLevel;
  const out: string[] = [];
  const pc = (v: number) => Math.round(v * level * 100);
  if (p.might) out.push(`Dégâts +${pc(p.might)} %`);
  if (p.cooldown) out.push(`Recharge −${pc(p.cooldown)} %`);
  if (p.area) out.push(`Zone +${pc(p.area)} %`);
  if (p.speed) out.push(`Vitesse +${pc(p.speed)} %`);
  if (p.magnet) out.push(`Collecte +${pc(p.magnet)} %`);
  if (p.maxHp) out.push(`PV max +${p.maxHp * level}`);
  if (p.regen) out.push(`Régén. +${(p.regen * level).toFixed(2).replace('.', ',')} PV/s`);
  if (p.armor) out.push(`Dégâts subis −${pc(p.armor)} %`);
  if (p.luck) out.push(`Objets +${pc(p.luck)} %`);
  return out.join(', ');
}

/** Vrais chiffres d'une arme au niveau donné, bonus du héros compris. */
export function weaponNumbers(id: string, level: number, might: number, cooldownMul: number): string {
  const L = weaponLevel(ALL_WEAPONS.findIndex((w) => w.id === id), level);
  const out = [L.pctHp ? `${dec(L.pctHp * might * 100, 1)} % des PV max` : L.damage > 0 ? `Dégâts ${dec(L.damage * might, 1)}` : 'Sans dégâts'];
  if (L.cooldown) out.push(`recharge ${dec(L.cooldown * cooldownMul)} s`);
  else if (L.tick) out.push(`toutes les ${dec(L.tick)} s`);
  else if (L.hitCd) out.push(`touche toutes les ${dec(L.hitCd)} s`);
  if ((L.count ?? 1) > 1) out.push(`×${L.count}`);
  return out.join(' · ');
}

export const fusionPartner = (i: number) => PASSIVES.find((x) => x.id === FUSIONS[i].with)!;

/** « Niveau max : évolue avec X (ou Y) au niveau 5. », ou rien si l'arme n'a pas d'évolution. */
export function evolutionHint(weaponId: string): string {
  const names = FUSIONS.filter((f) => f.weapon === weaponId).map((f) => PASSIVES.find((x) => x.id === f.with)!.name);
  return names.length ? `Niveau max : évolue avec ${names.join(' ou ')} au niveau 5.` : '';
}

/** Le premier boss arrive après `wavesPerBoss` vagues et leurs pauses (secondes). */
export const FIRST_BOSS = (WAVES.waveLength + WAVES.pause) * WAVES.wavesPerBoss;
