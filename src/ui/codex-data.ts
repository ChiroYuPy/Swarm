/**
 * Codex content: the items of each tab (entities, items, weapons, passives), the levels a sheet can show,
 * the live preview each item asks for, and the HTML of the detail sheet. No DOM state here: the codex
 * screen itself (tabs, grid, selection, level) lives in screens/codex.ts, the preview in codex-preview.ts.
 */
import { ALL_WEAPONS, BASE_WEAPONS } from '../data/weapons';
import { PASSIVES } from '../data/passives';
import { FUSIONS } from '../data/fusions';
import { BOSS_ORDER, ENEMIES, type EnemyDef } from '../data/enemies';
import { PICKUPS, type PickupKind } from '../data/loot';
import { WAVES } from '../data/waves';
import { UNLOCK_SLOT } from '../sim/registry';
import { MAX_ITEM_LEVEL, weaponLevel } from '../sim';
import { dec, seconds } from '../render/hud';
import { t } from '../i18n';
import {
  enemyDesc,
  enemyName,
  passiveDesc,
  passiveEffect,
  passiveName,
  pickupDesc,
  pickupName,
  weaponDesc,
  weaponLevelText,
  weaponName,
} from '../i18n/content';
import { esc, num, rows, statTiles } from './html';
import { passiveTotal } from './describe';
import type { PreviewSubject } from './codex-preview';

export type CodexTab = 'entities' | 'weapons' | 'items' | 'passives';
export const CODEX_TABS: readonly CodexTab[] = ['entities', 'items', 'weapons', 'passives'];

// ---------- Codex: data ----------
export interface CodexItem {
  tab: CodexTab;
  id: string;
  name: string;
  color: string;
  /** "kind:id" for iconCanvas / enemyPreview */
  icon: string;
  group?: string;
}

/** Level shown for a weapon's evolution (after level 5). */
export const EVO_LEVEL = MAX_ITEM_LEVEL + 1;

/** Groups of the items tab, in display order. */
type PickupGroup = 'timed' | 'active' | 'other';
const PICKUP_GROUPS: readonly PickupGroup[] = ['timed', 'active', 'other'];
const PICKUP_GROUP: Record<PickupKind, PickupGroup> = {
  timed: 'timed',
  active: 'active',
  instant: 'other',
  relic: 'other',
  chest: 'other',
};

/** The bonus crate: the only 'prop' type by design (uniqueType() in src/sim/registry.ts throws otherwise). */
const CRATE = ENEMIES.find((e) => e.behavior === 'prop')!;

const enemyItem = (tab: CodexTab, e: EnemyDef, group: string): CodexItem => ({ tab, id: e.id, name: enemyName(e.id), color: e.color, icon: `enemy:${e.id}`, group });

export function codexItems(tab: CodexTab): CodexItem[] {
  switch (tab) {
    case 'entities': {
      // Enemies in their order of arrival, then the bosses in theirs.
      const foes = ENEMIES.map((e, i) => ({ e, at: UNLOCK_SLOT[i] }))
        .filter(({ e, at }) => at >= 0 && !e.hidden)
        .sort((a, b) => a.at - b.at)
        .map(({ e }) => enemyItem(tab, e, t('codex.groups.enemies')));
      const bosses = BOSS_ORDER.map((id) => enemyItem(tab, ENEMIES.find((e) => e.id === id)!, t('codex.groups.bosses')));
      return [...foes, ...bosses];
    }
    case 'weapons':
      return BASE_WEAPONS.map((w) => ({ tab, id: w.id, name: weaponName(w.id), color: w.color, icon: `weapon:${w.id}` }));
    case 'passives':
      return PASSIVES.map((p) => ({ tab, id: p.id, name: passiveName(p.id), color: p.color, icon: `passive:${p.id}` }));
    case 'items': {
      const out: CodexItem[] = [];
      for (const g of PICKUP_GROUPS) {
        const group = t(`codex.groups.${g}`);
        for (const p of PICKUPS) if (PICKUP_GROUP[p.kind] === g) out.push({ tab, id: p.id, name: pickupName(p.id), color: p.color, icon: `pickup:${p.id}`, group });
      }
      out.push(enemyItem(tab, CRATE, t('codex.groups.other')));
      return out;
    }
  }
}

/** The evolution of a base weapon (null: none). */
export function evolutionOf(weapon: string): string | null {
  return FUSIONS.find((f) => f.weapon === weapon)?.result ?? null;
}

/** Levels a sheet can show (weapons: 1-5, plus the evolution if there is one; passives: 1-5), empty otherwise. */
export function codexLevels(it: CodexItem): number[] {
  const five = Array.from({ length: MAX_ITEM_LEVEL }, (_, k) => k + 1);
  if (it.tab === 'weapons') return evolutionOf(it.id) ? [...five, EVO_LEVEL] : five;
  if (it.tab === 'passives') return five;
  return [];
}

/** What the live preview shows for an item at a level. */
export function previewSubject(it: CodexItem, level: number): PreviewSubject {
  switch (it.tab) {
    case 'weapons': {
      const evo = level >= EVO_LEVEL ? evolutionOf(it.id) : null;
      return evo ? { kind: 'weapon', id: evo, level: 1 } : { kind: 'weapon', id: it.id, level };
    }
    case 'passives':
      return { kind: 'passive', id: it.id, level };
    case 'entities':
      return BOSS_ORDER.includes(it.id) ? { kind: 'boss', id: it.id } : { kind: 'enemy', id: it.id };
    case 'items':
      return it.id === CRATE.id ? { kind: 'crate' } : { kind: 'pickup', id: it.id };
  }
}

/** Key figures of a weapon at one level (tiles of the codex sheet). */
function weaponTiles(id: string, level: number): string {
  const i = ALL_WEAPONS.findIndex((w) => w.id === id);
  const L = weaponLevel(i, level);
  const out: [string, string][] = [];
  if (L.damage > 0) out.push([t('codex.tiles.damage'), dec(L.damage, 1)]);
  const rate = L.cooldown ?? L.tick ?? L.hitCd;
  if (rate) out.push([t(L.cooldown ? 'codex.tiles.cooldown' : 'codex.tiles.rate'), seconds(dec(rate))]);
  if ((L.count ?? 1) > 1) out.push([t('codex.tiles.count'), String(L.count)]);
  const reach = L.radius ?? L.range ?? L.length;
  if (reach) out.push([t(L.radius ? 'codex.tiles.radius' : 'codex.tiles.range'), String(reach)]);
  return out.length ? statTiles(out.slice(0, 4), 'mini') : '';
}

/** Header of a sheet: icon in a halo, tag, name. */
function head(icon: string, color: string, tag: string, name: string): string {
  return `<header class="dhead" style="--c:${color}"><span class="ico big" data-icon="${icon}"></span><div><span class="tag">${esc(tag)}</span><h2>${esc(name)}</h2></div></header>`;
}

/** Level picker of a sheet (weapons, passives): buttons 1 to 5, the current one lit, then the evolution's icon. */
function levelPicker(it: CodexItem, level: number): string {
  const levels = codexLevels(it);
  if (!levels.length) return '';
  const evo = it.tab === 'weapons' ? evolutionOf(it.id) : null;
  const evoColor = evo ? ALL_WEAPONS.find((w) => w.id === evo)!.color : it.color;
  return `<div class="lvls" style="--c:${it.color}">${levels
    .map((l) =>
      l === EVO_LEVEL && evo
        ? `<button class="lvl evo ${l === level ? 'on' : ''}" data-lvl="${l}" style="--c:${evoColor}" title="${esc(t('codex.evo'))}"><span class="ico" data-icon="weapon:${evo}"></span></button>`
        : `<button class="lvl ${l === level ? 'on' : ''}" data-lvl="${l}" title="${esc(t('common.lvlCap', { n: l }))}">${l}</button>`,
    )
    .join('')}</div>`;
}

/** Abilities and arrival of an enemy or a boss. */
function enemyBody(e: EnemyDef): { tiles: string; body: string } {
  const top: [string, string][] = [[t('codex.enemy.hp'), num(e.hp)]];
  if (e.behavior !== 'boss') top.push([t('codex.enemy.speed'), num(e.speed)]);
  if (e.behavior === 'kamikaze') top.push([t('codex.enemy.blast'), String(e.blastDamage ?? 0)]);
  else if (e.behavior === 'jumper') top.push([t('codex.enemy.landing'), String(e.blastDamage ?? 0)]);
  else top.push([t('codex.enemy.contact'), String(e.damage)]);
  if (e.behavior !== 'boss') top.push([t('codex.enemy.xp'), String(e.xp)]);
  const st: [string, string][] = [];
  if (e.behavior === 'shooter') st.push([t('codex.enemy.shot'), t('codex.enemy.damageValue', { n: e.bulletDamage ?? 0 })]);
  if (e.pack) st.push([t('codex.enemy.group'), t('codex.enemy.pack', { n: e.pack })]);
  if (e.cap) st.push([t('codex.enemy.group'), t('codex.enemy.cap', { n: e.cap })]);
  if (e.splitInto) {
    const f = ENEMIES.find((x) => x.id === e.splitInto)!;
    st.push([t('codex.enemy.onDeath'), t('codex.enemy.split', { n: e.splitCount ?? 2, name: enemyName(f.id), hp: f.hp })]);
  }
  const sm = e.boss?.summon;
  if (sm) st.push([t('codex.enemy.reinforcements'), enemyName(sm.type)]);
  const k = BOSS_ORDER.indexOf(e.id);
  const at = UNLOCK_SLOT[ENEMIES.indexOf(e)];
  st.push([
    t('codex.enemy.arrival'),
    k >= 0 ? t('codex.enemy.bossArrival', { n: k + 1, wave: (k + 1) * WAVES.wavesPerBoss }) : t('codex.enemy.waveArrival', { n: at + 1 }),
  ]);
  return { tiles: statTiles(top, 'mini'), body: rows(st) };
}

/** A sheet: `top` (header and level picker, always first), then the preview, then `body`. */
export interface CodexSheet {
  top: string;
  body: string;
}

/** The detail sheet of an item at a level (weapons and passives; ignored otherwise). */
export function codexDetail(it: CodexItem, level: number): CodexSheet {
  const desc = (text: string) => `<p class="desc">${esc(text)}</p>`;
  switch (it.tab) {
    case 'weapons': {
      const evo = level >= EVO_LEVEL ? evolutionOf(it.id) : null;
      if (evo) {
        const w = ALL_WEAPONS.find((x) => x.id === evo)!;
        return {
          top: `${head(`weapon:${evo}`, w.color, t('codex.tags.evolutionOf', { name: weaponName(it.id) }), weaponName(evo))}${levelPicker(it, level)}`,
          body: `${desc(weaponDesc(evo))}${weaponTiles(evo, 1)}<p class="line">${esc(weaponLevelText(evo, 1))}</p><p class="hint">${t('codex.evolutionHint')}</p>`,
        };
      }
      return {
        top: `${head(it.icon, it.color, t('codex.tags.weapon'), it.name)}${levelPicker(it, level)}`,
        body: `${desc(weaponDesc(it.id))}${weaponTiles(it.id, level)}<p class="line">${esc(weaponLevelText(it.id, level))}</p>`,
      };
    }
    case 'passives': {
      const p = PASSIVES.find((x) => x.id === it.id)!;
      return {
        top: `${head(it.icon, it.color, t('codex.tags.passive'), it.name)}${levelPicker(it, level)}`,
        body: `${desc(passiveDesc(p.id))}${statTiles(
          [
            [t('codex.tiles.perLevel'), esc(passiveEffect(p.id))],
            [t('codex.tiles.total', { n: level }), esc(passiveTotal(p, level))],
          ],
          'mini wide',
        )}`,
      };
    }
    case 'entities': {
      const e = ENEMIES.find((x) => x.id === it.id)!;
      const { tiles, body } = enemyBody(e);
      return { top: head(it.icon, it.color, t(`codex.behaviors.${e.behavior}`), it.name), body: `${desc(enemyDesc(e.id))}${tiles}${body}` };
    }
    case 'items': {
      const p = PICKUPS.find((x) => x.id === it.id);
      if (!p) return { top: head(it.icon, it.color, t('codex.tags.crate'), it.name), body: `${desc(enemyDesc(it.id))}<p class="hint">${t('codex.itemHints.crate')}</p>` };
      const tag = p.kind === 'timed' ? t('codex.tags.timed', { duration: p.duration ?? 0 }) : t(`codex.tags.${p.kind}`);
      const hint = p.kind === 'chest' ? '' : `<p class="hint">${t(`codex.itemHints.${p.kind}`)}</p>`;
      return { top: head(it.icon, it.color, tag, it.name), body: `${desc(pickupDesc(p.id))}${hint}` };
    }
  }
}
