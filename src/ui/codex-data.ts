/**
 * Codex content: the items of each tab (weapons, evolutions, passives, items, enemies), enemy arrival
 * times per difficulty, and the HTML of the detail sheet and the rules page. No DOM state here: the
 * codex screen itself (tabs, grid, selection) lives in screens/codex.ts.
 */
import { ALL_WEAPONS, BASE_WEAPONS } from '../data/weapons';
import { PASSIVES } from '../data/passives';
import { FUSIONS } from '../data/fusions';
import { BOSS_ORDER, ENEMIES, type EnemyBehavior } from '../data/enemies';
import { PICKUPS, type PickupKind } from '../data/loot';
import { DEFAULT_DIFFICULTY, DIFFICULTIES } from '../data/difficulty';
import { WAVES } from '../data/waves';
import { SCORE } from '../data/hero';
import { MIX_TICKS, UNLOCK_SLOT } from '../sim/registry';
import { TICK_RATE } from '../sim/constants';
import { MAX_PASSIVE_SLOTS, MAX_WEAPON_SLOTS, weaponLevel } from '../sim';
import { dec, formatTime } from '../render/hud';
import { esc, num, rows, statTiles } from './html';
import { FIRST_BOSS, passiveTotal } from './describe';

export type CodexTab = 'rules' | 'weapons' | 'passives' | 'items' | 'enemies' | 'evolutions';

// ---------- Codex : données ----------
interface CodexItem {
  tab: CodexTab;
  id: string;
  name: string;
  color: string;
  /** "kind:id" pour iconCanvas / enemyPreview */
  icon: string;
  group?: string;
}

const BEHAVIOR_LABEL: Record<EnemyBehavior, string> = {
  chaser: 'Poursuivant',
  shooter: 'À distance',
  kamikaze: 'Explosif',
  swarm: 'En groupe',
  prop: 'Caisse',
  boss: 'Boss',
  leader: 'Soutien',
  blinker: 'Téléportation',
  orbiter: 'Tournoyant',
  wall: 'Mur',
  egg: 'Œuf',
};

/** Seconde d'apparition de chaque type d'ennemi, par difficulté (-1 : jamais). */
function enemyArrival(id: string): number[] {
  const t = ENEMIES.findIndex((e) => e.id === id);
  return DIFFICULTIES.map((d, di) => {
    if (BOSS_ORDER.includes(id)) return FIRST_BOSS * (BOSS_ORDER.indexOf(id) + 1);
    const slot = UNLOCK_SLOT[di][t];
    let at = slot < 0 ? -1 : (slot * MIX_TICKS) / TICK_RATE;
    if (id === WAVES.swarm.type) {
      const sw = WAVES.swarm.firstAt * d.pace;
      at = at < 0 ? sw : Math.min(at, sw);
    }
    return at;
  });
}

/** codex groups of the « objets » tab, in display order */
const PICKUP_GROUPS = ['Bonus temporaires', 'Activables · Espace', 'Autres'] as const;
const PICKUP_GROUP: Record<PickupKind, (typeof PICKUP_GROUPS)[number]> = {
  timed: 'Bonus temporaires',
  active: 'Activables · Espace',
  instant: 'Autres',
  relic: 'Autres',
  chest: 'Autres',
};

export function codexItems(tab: CodexTab): CodexItem[] {
  switch (tab) {
    case 'rules':
      return [];
    case 'weapons':
      return BASE_WEAPONS.map((w) => ({ tab, id: w.id, name: w.name, color: w.color, icon: `weapon:${w.id}` }));
    case 'evolutions':
      return FUSIONS.map((f) => {
        const r = ALL_WEAPONS.find((w) => w.id === f.result)!;
        return { tab, id: r.id, name: r.name, color: r.color, icon: `weapon:${r.id}` };
      });
    case 'passives':
      return PASSIVES.map((p) => ({ tab, id: p.id, name: p.name, color: p.color, icon: `passive:${p.id}` }));
    case 'items': {
      const out: CodexItem[] = [];
      for (const group of PICKUP_GROUPS)
        for (const p of PICKUPS) if (PICKUP_GROUP[p.kind] === group) out.push({ tab, id: p.id, name: p.name, color: p.color, icon: `pickup:${p.id}`, group });
      const prop = ENEMIES.find((e) => e.behavior === 'prop')!;
      out.push({ tab, id: prop.id, name: prop.name, color: prop.color, icon: `enemy:${prop.id}`, group: 'Autres' });
      return out;
    }
    case 'enemies': {
      return ENEMIES.filter((e) => e.behavior !== 'prop' && !e.hidden)
        .map((e) => ({ e, at: e.behavior === 'boss' ? 1e9 + BOSS_ORDER.indexOf(e.id) : enemyArrival(e.id)[DEFAULT_DIFFICULTY] }))
        .sort((a, b) => a.at - b.at)
        .map(({ e }) => ({ tab, id: e.id, name: e.name, color: e.color, icon: `enemy:${e.id}` }));
    }
  }
}

/** Petit lien vers une autre fiche du codex. */
function chip(tab: CodexTab, id: string, suffix = ''): string {
  const it = codexItems(tab).find((x) => x.id === id);
  if (!it) return '';
  return `<button class="chip" data-goto="${tab}:${id}" style="--c:${it.color}"><span data-icon="${it.icon}" data-size="26"></span>${esc(it.name)}${suffix ? `<small>${suffix}</small>` : ''}</button>`;
}

function recipe(i: number): string {
  const f = FUSIONS[i];
  return `<div class="recipe">${chip('weapons', f.weapon, 'niv. 5')}<span class="op">+</span>${chip('passives', f.with, 'niv. 5')}<span class="res"><span class="op">→</span>${chip('evolutions', f.result)}</span></div>`;
}

/** « 12 → 18 » si la valeur change entre le niveau 1 et le niveau max, sinon « 12 ». */
const span = (a: string, b: string) => (a === b ? a : `${a} <i class="to">→</i> ${b}`);

/** Chiffres clés d'une arme, du niveau 1 au niveau max (tuiles de la fiche du codex). */
function weaponTiles(id: string): string {
  const i = ALL_WEAPONS.findIndex((w) => w.id === id);
  const a = weaponLevel(i, 1);
  const b = weaponLevel(i, ALL_WEAPONS[i].levels.length);
  const out: [string, string][] = [];
  if (a.pctHp) out.push(['Dégâts', `${dec(a.pctHp * 100, 1)} % <i class="to">PV max</i>`]);
  else if (a.damage > 0) out.push(['Dégâts', span(dec(a.damage, 1), dec(b.damage, 1))]);
  const rate = (L: typeof a) => L.cooldown ?? L.tick ?? L.hitCd ?? L.fireEvery;
  if (rate(a)) out.push([a.cooldown ? 'Recharge' : 'Cadence', `${span(dec(rate(a)!), dec(rate(b)!))} s`]);
  if ((a.count ?? 1) > 1 || (b.count ?? 1) > 1) out.push(['Nombre', span(String(a.count ?? 1), String(b.count ?? 1))]);
  const reach = (L: typeof a) => L.radius ?? L.range ?? L.length ?? L.attackRange;
  if (reach(a)) out.push([a.radius ? 'Rayon' : 'Portée', span(String(reach(a)), String(reach(b)))]);
  return out.length ? statTiles(out.slice(0, 4), 'mini') : '';
}

export function codexDetail(it: CodexItem): string {
  let tag = '';
  let body = '';
  let desc = '';
  let figures = '';
  const h3 = (t: string) => `<h3 class="rule">${t}</h3>`;
  switch (it.tab) {
    case 'weapons': {
      const w = ALL_WEAPONS.find((x) => x.id === it.id)!;
      tag = 'Arme';
      desc = w.desc;
      figures = weaponTiles(w.id);
      body = `${h3('Niveaux')}${rows(w.levelText.map((t, k) => [`Niv. ${k + 1}`, t]))}`;
      const fi = FUSIONS.map((f, i) => [f, i] as const).filter(([f]) => f.weapon === it.id);
      if (fi.length) body += `${h3(fi.length > 1 ? 'Évolutions' : 'Évolution')}${fi.map(([, i]) => recipe(i)).join('')}`;
      break;
    }
    case 'evolutions': {
      const w = ALL_WEAPONS.find((x) => x.id === it.id)!;
      const i = FUSIONS.findIndex((f) => f.result === it.id);
      tag = 'Évolution';
      desc = w.desc;
      figures = weaponTiles(w.id);
      body = `${h3('Effet')}<p>${esc(w.levelText[0])}</p>${h3('Recette')}${recipe(i)}<p class="hint">Proposée au level-up quand l’arme et le passif sont au niveau 5, ou offerte par le coffre du boss. Elle remplace l’arme d’origine, au même emplacement, et tu gardes le passif.</p>`;
      break;
    }
    case 'passives': {
      const p = PASSIVES.find((x) => x.id === it.id)!;
      tag = 'Passif';
      desc = p.desc;
      figures = statTiles([
        ['Par niveau', esc(p.effect)],
        ['Au niveau 5', esc(passiveTotal(p, 5))],
      ], 'mini wide');
      body = `${h3('Total par niveau')}${rows([1, 2, 3, 4, 5].map((l) => [`Niv. ${l}`, passiveTotal(p, l)]))}`;
      const fi = FUSIONS.map((f, i) => [f, i] as const).filter(([f]) => f.with === it.id);
      if (fi.length) body += `${h3(fi.length > 1 ? 'Évolutions' : 'Évolution')}${fi.map(([, i]) => recipe(i)).join('')}`;
      break;
    }
    case 'items': {
      const p = PICKUPS.find((x) => x.id === it.id);
      if (!p) {
        const e = ENEMIES.find((x) => x.id === it.id)!;
        tag = 'Caisse';
        desc = e.desc;
        body = `<p class="hint">Apparaît régulièrement non loin de toi. Elle contient toujours un objet, souvent un activable.</p>`;
        break;
      }
      desc = p.desc;
      switch (p.kind) {
        case 'timed':
          tag = `Bonus temporaire · ${p.duration} s`;
          body = `<p class="hint">Lâché au hasard par les ennemis. En reprendre un identique prolonge la durée. Le temps restant s’affiche en bas de l’écran.</p>`;
          break;
        case 'active':
          tag = 'Activable · Espace';
          body = `<p class="hint">Rangé dans l’emplacement « Objet » et déclenché avec Espace (bouton A). Un seul en réserve : en ramasser un autre le remplace.</p>`;
          break;
        case 'relic':
          tag = 'Relique · automatique';
          body = `<p class="hint">Gardée à part (elle n’occupe pas l’emplacement « Objet ») et affichée au-dessus de ta barre. Une seule à la fois. Très rare : lâchée par les ennemis et les caisses bonus.</p>`;
          break;
        case 'instant':
          tag = 'Effet immédiat';
          body = `<p class="hint">Lâché au hasard par les ennemis, et proposé au level-up quand ton équipement est complet.</p>`;
          break;
        case 'chest':
          tag = 'Coffre';
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
      tag = BEHAVIOR_LABEL[e.behavior];
      desc = e.desc;
      const top: [string, string][] = [
        ['PV', num(e.hp)],
        ['Vitesse', num(e.speed)],
        e.behavior === 'kamikaze' ? ['Explosion', String(e.blastDamage ?? 0)] : ['Contact', String(e.damage)],
      ];
      if (e.behavior !== 'boss') top.push(['XP', String(e.xp)]);
      figures = statTiles(top, 'mini');
      const st: [string, string][] = [];
      if (e.behavior === 'shooter') st.push(['Tir', `${e.bulletDamage ?? 0} dégâts`]);
      if (e.behavior === 'blinker') st.push(['Atterrissage', `${e.blastDamage ?? 0} dégâts`]);
      if (e.behavior === 'leader') st.push(['Aura', `+${Math.round((e.auraSpeed ?? 0) * 100)} % de vitesse aux voisins`]);
      if (e.capMax) st.push(['Nombre', `${e.capStart} à son arrivée, jusqu’à ${e.capMax} en même temps`]);
      if (e.splitInto) {
        const f = ENEMIES.find((x) => x.id === e.splitInto)!;
        const g = f.splitInto ? ENEMIES.find((x) => x.id === f.splitInto) : undefined;
        st.push(['À sa mort', `${e.splitCount ?? 2} × ${f.name} (${f.hp} PV)${g ? `, puis ${(e.splitCount ?? 2) * (f.splitCount ?? 2)} × ${g.name} (${g.hp} PV)` : ''}`]);
      }
      body = `${st.length ? `${h3('Capacités')}${rows(st)}` : ''}<p class="hint">Statistiques de base : les PV augmentent avec le temps et selon la difficulté.</p>`;
      const at = enemyArrival(e.id);
      body +=
        e.behavior === 'boss'
          ? `${h3('Arrivée')}<p>Boss n°${BOSS_ORDER.indexOf(e.id) + 1}, après la vague ${(BOSS_ORDER.indexOf(e.id) + 1) * WAVES.wavesPerBoss}, quelle que soit la difficulté. Les boss reviennent ensuite dans le même ordre, plus forts (Mk II…).</p>`
          : `${h3('Arrivée')}<div class="stats mini arrivals">${DIFFICULTIES.map(
              (d, i) => `<div style="--c:${d.color}"><small>${esc(d.name)}</small><b>${at[i] < 0 ? '—' : at[i] === 0 ? 'Début' : formatTime(at[i])}</b></div>`,
            ).join('')}</div>`;
      break;
    }
  }
  return `<header class="dhead" style="--c:${it.color}"><span class="ico big" data-icon="${it.icon}"></span><div><span class="tag">${esc(tag)}</span><h2>${esc(it.name)}</h2></div></header>
    <p class="desc">${esc(desc)}</p>${figures}${body}`;
}

export function codexRules(): string {
  return `
    <div class="rules">
      <section><h3 class="rule">Contrôles</h3>
        <p><kbd>ZQSD</kbd> <kbd>WASD</kbd> <kbd>flèches</kbd> ou stick : se déplacer. Tes armes tirent toutes seules.</p>
        <p><kbd>Espace</kbd> (ou bouton A) : utiliser l’objet activable en réserve.</p>
        <p><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> ou flèches + <kbd>Entrée</kbd> : choisir une amélioration. <kbd>Échap</kbd> : pause.</p>
      </section>
      <section><h3 class="rule">Objectif</h3>
        <p>Survivre le plus longtemps possible dans un monde sans fin. Score : ${SCORE.perSecond} points par seconde, ${SCORE.perKill} par ennemi, ${SCORE.perBoss} par boss.</p>
        <p>Ramasse l’XP (losanges) pour monter de niveau et choisir 1 amélioration parmi 3. Jusqu’à ${MAX_WEAPON_SLOTS} armes et ${MAX_PASSIVE_SLOTS} passifs, 5 niveaux chacun.</p>
        <p>Les ennemis arrivent par vagues de ${WAVES.waveLength} s (2 ou 3 types à la fois), séparées de ${WAVES.pause} s de calme. Toutes les ${WAVES.wavesPerBoss} vagues, un boss : les autres ennemis s’enfuient, il ne reste que lui et ses renforts ; les vagues reprennent à sa mort. La frise en haut de l’écran montre ce qui arrive.</p>
      </section>
      <section><h3 class="rule">Objets</h3>
        <p><b>Bonus</b> (dans un cercle) : effet immédiat ou temporaire. <b>Activables</b> (dans un losange) : gardés en réserve, un seul à la fois. <b>Reliques</b> (dans un hexagone) : se déclenchent toutes seules.</p>
        <p>Les boules violettes des Tireurs se cassent : tes tirs, explosions, ondes, orbes, aura et laser les détruisent.</p>
        <p>Les caisses bonus <b>?</b> apparaissent régulièrement près de toi : casse-les.</p>
      </section>
    </div>`;
}
