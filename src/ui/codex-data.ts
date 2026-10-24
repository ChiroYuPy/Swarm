/**
 * Codex content: the items of each tab (weapons, evolutions, passives, items, enemies), enemy arrival
 * times per difficulty, and the HTML of the detail sheet and the rules page. No DOM state here: the
 * codex screen itself (tabs, grid, selection) lives in screens/codex.ts.
 */
import { ALL_WEAPONS, BASE_WEAPONS } from '../data/weapons';
import { PASSIVES } from '../data/passives';
import { FUSIONS } from '../data/fusions';
import { BOSS_ORDER, ENEMIES } from '../data/enemies';
import { PICKUPS, type PickupKind } from '../data/loot';
import { DEFAULT_DIFFICULTY, DIFFICULTIES } from '../data/difficulty';
import { WAVES } from '../data/waves';
import { SCORE } from '../data/hero';
import { MIX_TICKS, UNLOCK_SLOT } from '../sim/registry';
import { TICK_RATE } from '../sim/constants';
import { MAX_PASSIVE_SLOTS, MAX_WEAPON_SLOTS, weaponLevel } from '../sim';
import { dec, formatTime, seconds } from '../render/hud';
import { t } from '../i18n';
import {
  difficultyName,
  enemyDesc,
  enemyName,
  passiveDesc,
  passiveEffect,
  passiveName,
  pickupDesc,
  pickupName,
  weaponDesc,
  weaponLevelLines,
  weaponLevelText,
  weaponName,
} from '../i18n/content';
import { esc, num, rows, statTiles } from './html';
import { FIRST_BOSS, passiveTotal } from './describe';

export type CodexTab = 'rules' | 'weapons' | 'passives' | 'items' | 'enemies' | 'evolutions';

// ---------- Codex: data ----------
interface CodexItem {
  tab: CodexTab;
  id: string;
  name: string;
  color: string;
  /** "kind:id" for iconCanvas / enemyPreview */
  icon: string;
  group?: string;
}

/** Second at which each enemy type shows up, per difficulty (-1: never). */
function enemyArrival(id: string): number[] {
  const type = ENEMIES.findIndex((e) => e.id === id);
  return DIFFICULTIES.map((d, di) => {
    if (BOSS_ORDER.includes(id)) return FIRST_BOSS * (BOSS_ORDER.indexOf(id) + 1);
    const slot = UNLOCK_SLOT[di][type];
    let at = slot < 0 ? -1 : (slot * MIX_TICKS) / TICK_RATE;
    if (id === WAVES.swarm.type) {
      const sw = WAVES.swarm.firstAt * d.pace;
      at = at < 0 ? sw : Math.min(at, sw);
    }
    return at;
  });
}

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

export function codexItems(tab: CodexTab): CodexItem[] {
  switch (tab) {
    case 'rules':
      return [];
    case 'weapons':
      return BASE_WEAPONS.map((w) => ({ tab, id: w.id, name: weaponName(w.id), color: w.color, icon: `weapon:${w.id}` }));
    case 'evolutions':
      return FUSIONS.map((f) => {
        const r = ALL_WEAPONS.find((w) => w.id === f.result)!;
        return { tab, id: r.id, name: weaponName(r.id), color: r.color, icon: `weapon:${r.id}` };
      });
    case 'passives':
      return PASSIVES.map((p) => ({ tab, id: p.id, name: passiveName(p.id), color: p.color, icon: `passive:${p.id}` }));
    case 'items': {
      const out: CodexItem[] = [];
      for (const g of PICKUP_GROUPS) {
        const group = t(`codex.groups.${g}`);
        for (const p of PICKUPS) if (PICKUP_GROUP[p.kind] === g) out.push({ tab, id: p.id, name: pickupName(p.id), color: p.color, icon: `pickup:${p.id}`, group });
      }
      const prop = ENEMIES.find((e) => e.behavior === 'prop')!;
      out.push({ tab, id: prop.id, name: enemyName(prop.id), color: prop.color, icon: `enemy:${prop.id}`, group: t('codex.groups.other') });
      return out;
    }
    case 'enemies': {
      return ENEMIES.filter((e) => e.behavior !== 'prop' && !e.hidden)
        .map((e) => ({ e, at: e.behavior === 'boss' ? 1e9 + BOSS_ORDER.indexOf(e.id) : enemyArrival(e.id)[DEFAULT_DIFFICULTY] }))
        .sort((a, b) => a.at - b.at)
        .map(({ e }) => ({ tab, id: e.id, name: enemyName(e.id), color: e.color, icon: `enemy:${e.id}` }));
    }
  }
}

/** Small link to another codex sheet. */
function chip(tab: CodexTab, id: string, suffix = ''): string {
  const it = codexItems(tab).find((x) => x.id === id);
  if (!it) return '';
  return `<button class="chip" data-goto="${tab}:${id}" style="--c:${it.color}"><span data-icon="${it.icon}" data-size="26"></span>${esc(it.name)}${suffix ? `<small>${suffix}</small>` : ''}</button>`;
}

function recipe(i: number): string {
  const f = FUSIONS[i];
  const lvl5 = t('common.lvl', { n: 5 });
  return `<div class="recipe">${chip('weapons', f.weapon, lvl5)}<span class="op">+</span>${chip('passives', f.with, lvl5)}<span class="res"><span class="op">→</span>${chip('evolutions', f.result)}</span></div>`;
}

/** "12 → 18" if the value changes between level 1 and max level, else "12". */
const span = (a: string, b: string) => (a === b ? a : `${a} <i class="to">→</i> ${b}`);

/** Key figures of a weapon, from level 1 to max level (tiles of the codex sheet). */
function weaponTiles(id: string): string {
  const i = ALL_WEAPONS.findIndex((w) => w.id === id);
  const a = weaponLevel(i, 1);
  const b = weaponLevel(i, ALL_WEAPONS[i].levels.length);
  const out: [string, string][] = [];
  if (a.pctHp) out.push([t('codex.tiles.damage'), t('codex.tiles.pctHp', { n: dec(a.pctHp * 100, 1) })]);
  else if (a.damage > 0) out.push([t('codex.tiles.damage'), span(dec(a.damage, 1), dec(b.damage, 1))]);
  const rate = (L: typeof a) => L.cooldown ?? L.tick ?? L.hitCd ?? L.fireEvery;
  if (rate(a)) out.push([t(a.cooldown ? 'codex.tiles.cooldown' : 'codex.tiles.rate'), seconds(span(dec(rate(a)!), dec(rate(b)!)))]);
  if ((a.count ?? 1) > 1 || (b.count ?? 1) > 1) out.push([t('codex.tiles.count'), span(String(a.count ?? 1), String(b.count ?? 1))]);
  const reach = (L: typeof a) => L.radius ?? L.range ?? L.length ?? L.attackRange;
  if (reach(a)) out.push([t(a.radius ? 'codex.tiles.radius' : 'codex.tiles.range'), span(String(reach(a)), String(reach(b)))]);
  return out.length ? statTiles(out.slice(0, 4), 'mini') : '';
}

export function codexDetail(it: CodexItem): string {
  let tag = '';
  let body = '';
  let desc = '';
  let figures = '';
  const h3 = (text: string) => `<h3 class="rule">${text}</h3>`;
  const hint = (text: string) => `<p class="hint">${text}</p>`;
  const evolutionsHeading = (n: number) => h3(t(n > 1 ? 'codex.headings.evolutions' : 'codex.headings.evolution'));
  switch (it.tab) {
    case 'weapons': {
      const w = ALL_WEAPONS.find((x) => x.id === it.id)!;
      tag = t('codex.tags.weapon');
      desc = weaponDesc(w.id);
      figures = weaponTiles(w.id);
      body = `${h3(t('codex.headings.levels'))}${rows(weaponLevelLines(w.id).map((line, k) => [t('common.lvlCap', { n: k + 1 }), line]))}`;
      const fi = FUSIONS.map((f, i) => [f, i] as const).filter(([f]) => f.weapon === it.id);
      if (fi.length) body += `${evolutionsHeading(fi.length)}${fi.map(([, i]) => recipe(i)).join('')}`;
      break;
    }
    case 'evolutions': {
      const w = ALL_WEAPONS.find((x) => x.id === it.id)!;
      const i = FUSIONS.findIndex((f) => f.result === it.id);
      tag = t('codex.tags.evolution');
      desc = weaponDesc(w.id);
      figures = weaponTiles(w.id);
      body = `${h3(t('codex.headings.effect'))}<p>${esc(weaponLevelText(w.id, 1))}</p>${h3(t('codex.headings.recipe'))}${recipe(i)}${hint(t('codex.evolutionHint'))}`;
      break;
    }
    case 'passives': {
      const p = PASSIVES.find((x) => x.id === it.id)!;
      tag = t('codex.tags.passive');
      desc = passiveDesc(p.id);
      figures = statTiles(
        [
          [t('codex.tiles.perLevel'), esc(passiveEffect(p.id))],
          [t('codex.tiles.atMax'), esc(passiveTotal(p, 5))],
        ],
        'mini wide',
      );
      body = `${h3(t('codex.headings.totalPerLevel'))}${rows([1, 2, 3, 4, 5].map((l) => [t('common.lvlCap', { n: l }), passiveTotal(p, l)]))}`;
      const fi = FUSIONS.map((f, i) => [f, i] as const).filter(([f]) => f.with === it.id);
      if (fi.length) body += `${evolutionsHeading(fi.length)}${fi.map(([, i]) => recipe(i)).join('')}`;
      break;
    }
    case 'items': {
      const p = PICKUPS.find((x) => x.id === it.id);
      if (!p) {
        const e = ENEMIES.find((x) => x.id === it.id)!;
        tag = t('codex.tags.crate');
        desc = enemyDesc(e.id);
        body = hint(t('codex.itemHints.crate'));
        break;
      }
      desc = pickupDesc(p.id);
      switch (p.kind) {
        case 'timed':
          tag = t('codex.tags.timed', { duration: p.duration ?? 0 });
          body = hint(t('codex.itemHints.timed'));
          break;
        case 'active':
          tag = t('codex.tags.active');
          body = hint(t('codex.itemHints.active'));
          break;
        case 'relic':
          tag = t('codex.tags.relic');
          body = hint(t('codex.itemHints.relic'));
          break;
        case 'instant':
          tag = t('codex.tags.instant');
          body = hint(t('codex.itemHints.instant'));
          break;
        case 'chest':
          tag = t('codex.tags.chest');
          break;
        default: {
          const unhandled: never = p.kind;
          throw new Error(`Unhandled pickup kind ${unhandled}`);
        }
      }
      break;
    }
    case 'enemies': {
      const e = ENEMIES.find((x) => x.id === it.id)!;
      tag = t(`codex.behaviors.${e.behavior}`);
      desc = enemyDesc(e.id);
      const top: [string, string][] = [
        [t('codex.enemy.hp'), num(e.hp)],
        [t('codex.enemy.speed'), num(e.speed)],
        e.behavior === 'kamikaze' ? [t('codex.enemy.blast'), String(e.blastDamage ?? 0)] : [t('codex.enemy.contact'), String(e.damage)],
      ];
      if (e.behavior !== 'boss') top.push([t('codex.enemy.xp'), String(e.xp)]);
      figures = statTiles(top, 'mini');
      const st: [string, string][] = [];
      if (e.behavior === 'shooter') st.push([t('codex.enemy.shot'), t('codex.enemy.damageValue', { n: e.bulletDamage ?? 0 })]);
      if (e.behavior === 'blinker') st.push([t('codex.enemy.landing'), t('codex.enemy.damageValue', { n: e.blastDamage ?? 0 })]);
      if (e.behavior === 'leader') st.push([t('codex.enemy.aura'), t('codex.enemy.auraValue', { n: Math.round((e.auraSpeed ?? 0) * 100) })]);
      if (e.capMax) st.push([t('codex.enemy.count'), t('codex.enemy.countValue', { start: e.capStart ?? 0, max: e.capMax })]);
      if (e.splitInto) {
        const f = ENEMIES.find((x) => x.id === e.splitInto)!;
        const g = f.splitInto ? ENEMIES.find((x) => x.id === f.splitInto) : undefined;
        const n = e.splitCount ?? 2;
        const then = g ? t('codex.enemy.splitThen', { n: n * (f.splitCount ?? 2), name: enemyName(g.id), hp: g.hp }) : '';
        st.push([t('codex.enemy.onDeath'), t('codex.enemy.split', { n, name: enemyName(f.id), hp: f.hp }) + then]);
      }
      body = `${st.length ? `${h3(t('codex.headings.abilities'))}${rows(st)}` : ''}${hint(t('codex.enemy.baseStats'))}`;
      const at = enemyArrival(e.id);
      const k = BOSS_ORDER.indexOf(e.id) + 1;
      body +=
        e.behavior === 'boss'
          ? `${h3(t('codex.headings.arrival'))}<p>${t('codex.enemy.bossArrival', { n: k, wave: k * WAVES.wavesPerBoss })}</p>`
          : `${h3(t('codex.headings.arrival'))}<div class="stats mini arrivals">${DIFFICULTIES.map(
              (d, i) =>
                `<div style="--c:${d.color}"><small>${esc(difficultyName(d.id))}</small><b>${at[i] < 0 ? '—' : at[i] === 0 ? t('codex.enemy.start') : formatTime(at[i])}</b></div>`,
            ).join('')}</div>`;
      break;
    }
  }
  return `<header class="dhead" style="--c:${it.color}"><span class="ico big" data-icon="${it.icon}"></span><div><span class="tag">${esc(tag)}</span><h2>${esc(it.name)}</h2></div></header>
    <p class="desc">${esc(desc)}</p>${figures}${body}`;
}

export function codexRules(): string {
  const r = (key: Parameters<typeof t>[0], params?: Parameters<typeof t>[1]) => `<p>${t(key, params)}</p>`;
  return `
    <div class="rules">
      <section><h3 class="rule">${t('codex.rules.controls')}</h3>
        ${r('codex.rules.controls1')}
        ${r('codex.rules.controls2')}
        ${r('codex.rules.controls3')}
      </section>
      <section><h3 class="rule">${t('codex.rules.goal')}</h3>
        ${r('codex.rules.goal1', { perSecond: SCORE.perSecond, perKill: SCORE.perKill, perBoss: SCORE.perBoss })}
        ${r('codex.rules.goal2', { weapons: MAX_WEAPON_SLOTS, passives: MAX_PASSIVE_SLOTS })}
        ${r('codex.rules.goal3', { waveLength: WAVES.waveLength, pause: WAVES.pause, wavesPerBoss: WAVES.wavesPerBoss })}
      </section>
      <section><h3 class="rule">${t('codex.rules.items')}</h3>
        ${r('codex.rules.items1')}
        ${r('codex.rules.items2')}
        ${r('codex.rules.items3')}
      </section>
    </div>`;
}
