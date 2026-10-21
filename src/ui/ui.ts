/**
 * Écrans DOM. Tous suivent le même gabarit (en-tête, contenu, actions) et les mêmes composants
 * (.btn, .tabs, .card, .panel), avec une seule police et une échelle de tailles commune (style.css).
 */
import { ALL_WEAPONS, BASE_WEAPONS } from '../data/weapons';
import { PASSIVES, type PassiveDef } from '../data/passives';
import { FUSIONS } from '../data/fusions';
import { ENEMIES } from '../data/enemies';
import { PICKUPS } from '../data/loot';
import { DIFFICULTIES } from '../data/difficulty';
import { WAVES } from '../data/waves';
import { SCORE } from '../data/hero';
import { WAVE_PHASES_BY_DIFFICULTY } from '../sim/registry';
import {
  FUSION_TABLE,
  GAME_VERSION,
  MAX_PASSIVE_SLOTS,
  MAX_WEAPON_SLOTS,
  OFFER_FUSION,
  OFFER_PASSIVE,
  OFFER_WEAPON,
  weaponDef,
  weaponLevel,
  type Offer,
  type ScoreRecord,
} from '../sim';
import { iconCanvas } from '../render/icons';
import { enemyPreview } from '../render/sprites';
import { dec, formatTime, pad7, type StatDetail } from '../render/hud';
import type { SaveData, Settings } from '../storage/storage';
import { DEFAULT_SETTINGS, bestScore, topScores } from '../storage/storage';

export interface AppApi {
  save: SaveData;
  play(difficulty: number): void;
  retry(): void;
  pickOffer(i: number): void;
  resume(): void;
  quit(): void;
  toMenu(): void;
  watchLastRun(): void;
  applySettings(s: Settings): void;
  uiSound(kind: 'ui' | 'uiMove'): void;
}

export interface BuildInfo {
  weapons: { id: string; level: number; fusion: boolean }[];
  passives: { id: string; level: number }[];
  stats: StatDetail[];
  /** multiplicateurs actuels, pour afficher les vrais chiffres des armes */
  might: number;
  cooldownMul: number;
}

export interface DeathInfo {
  record: ScoreRecord;
  bossKills: number;
  /** meilleur score de la difficulté avant cette partie */
  bestBefore: number;
  /** rang obtenu dans le top 10 de la difficulté (0 = hors classement) */
  rank: number;
  build: BuildInfo;
  canReplay: boolean;
  isReplay: boolean;
}

type CodexTab = 'regles' | 'armes' | 'bonus' | 'objets' | 'ennemis' | 'fusions';
export type NavDir = 'left' | 'right' | 'up' | 'down';

type SettingDef =
  | { key: 'volume' | 'music' | 'sfx'; kind: 'range'; label: string; hint?: string }
  | { key: 'muted' | 'shake' | 'damageNumbers' | 'showFps' | 'autoPause'; kind: 'toggle'; label: string; hint?: string }
  | { key: 'quality'; kind: 'choice'; label: string; hint?: string; options: [Settings['quality'], string][] };

/** Page Options : groupes et réglages, dans l'ordre d'affichage. */
const SETTINGS_UI: { title: string; items: SettingDef[] }[] = [
  {
    title: 'Son',
    items: [
      { key: 'volume', kind: 'range', label: 'Volume général' },
      { key: 'music', kind: 'range', label: 'Musique' },
      { key: 'sfx', kind: 'range', label: 'Effets sonores' },
      { key: 'muted', kind: 'toggle', label: 'Couper le son', hint: 'M' },
    ],
  },
  {
    title: 'Affichage',
    items: [
      { key: 'quality', kind: 'choice', label: 'Qualité graphique', options: [['high', 'Élevée'], ['low', 'Basse']] },
      { key: 'shake', kind: 'toggle', label: 'Secousses d’écran' },
      { key: 'damageNumbers', kind: 'toggle', label: 'Chiffres de dégâts' },
      { key: 'showFps', kind: 'toggle', label: 'Afficher les FPS', hint: 'F3' },
    ],
  },
  {
    title: 'Jeu',
    items: [{ key: 'autoPause', kind: 'toggle', label: 'Pause auto si la fenêtre perd le focus' }],
  },
];

const settingDef = (row: HTMLElement): SettingDef => SETTINGS_UI.flatMap((g) => g.items).find((x) => x.key === row.dataset.key)!;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const num = (n: number) => n.toLocaleString('fr-FR');

/** Une phrase courte sur la partie, choisie selon ce qui s'est passé. */
function deathLine(d: DeathInfo): string {
  const t = d.record.tempsSurvecu;
  const k = d.record.kills;
  if (d.isReplay) return 'Fin de la relecture.';
  if (d.rank === 1 && d.bestBefore > 0) return 'Nouveau record. Tu progresses.';
  if (t < 60) return 'Moins d’une minute… on respire et on y retourne.';
  if (d.bossKills >= 2) return `${d.bossKills} boss vaincus. Respect.`;
  if (d.bossKills === 1) return 'Le Trapèze est tombé. Pas toi… enfin, pas tout de suite.';
  if (k >= 1000) return `${num(k)} formes éliminées avant de céder.`;
  if (t >= WAVES.bossEvery - 20 && t < WAVES.bossEvery) return 'Si près du boss…';
  return `Submergé après ${formatTime(t)}. La prochaine sera la bonne.`;
}

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
function weaponNumbers(id: string, level: number, might: number, cooldownMul: number): string {
  const L = weaponLevel(ALL_WEAPONS.findIndex((w) => w.id === id), level);
  const out = [`Dégâts ${dec(L.damage * might, 1)}`];
  if (L.cooldown) out.push(`recharge ${dec(L.cooldown * cooldownMul)} s`);
  else if (L.tick) out.push(`toutes les ${dec(L.tick)} s`);
  else if (L.hitCd) out.push(`touche toutes les ${dec(L.hitCd)} s`);
  if ((L.count ?? 1) > 1) out.push(`×${L.count}`);
  return out.join(' · ');
}

const fusionPartner = (i: number) => {
  const f = FUSIONS[i];
  return f.withKind === 'weapon' ? ALL_WEAPONS.find((x) => x.id === f.with)! : PASSIVES.find((x) => x.id === f.with)!;
};

// ---------- Bestiaire : données ----------
interface CodexItem {
  tab: CodexTab;
  id: string;
  name: string;
  color: string;
  /** "kind:id" pour iconCanvas / enemyPreview */
  icon: string;
  group?: string;
}

const BEHAVIOR_LABEL: Record<string, string> = {
  chaser: 'Poursuivant',
  shooter: 'À distance',
  kamikaze: 'Explosif',
  swarm: 'En groupe',
  boss: 'Boss',
};

/** Seconde d'apparition de chaque type d'ennemi, par difficulté (-1 : jamais). */
function enemyArrival(id: string): number[] {
  const t = ENEMIES.findIndex((e) => e.id === id);
  return DIFFICULTIES.map((d, di) => {
    if (id === 'boss') return WAVES.bossEvery;
    let at = -1;
    for (const ph of WAVE_PHASES_BY_DIFFICULTY[di]) {
      if (ph.newTypes.includes(t)) {
        at = ph.atTick / 60;
        break;
      }
    }
    if (id === WAVES.swarm.type) {
      const sw = WAVES.swarm.firstAt * d.pace;
      at = at < 0 ? sw : Math.min(at, sw);
    }
    return at;
  });
}

function codexItems(tab: CodexTab): CodexItem[] {
  switch (tab) {
    case 'regles':
      return [];
    case 'armes':
      return BASE_WEAPONS.map((w) => ({ tab, id: w.id, name: w.name, color: w.color, icon: `weapon:${w.id}` }));
    case 'fusions':
      return FUSIONS.map((f) => {
        const r = ALL_WEAPONS.find((w) => w.id === f.result)!;
        return { tab, id: r.id, name: r.name, color: r.color, icon: `weapon:${r.id}` };
      });
    case 'bonus':
      return PASSIVES.map((p) => ({ tab, id: p.id, name: p.name, color: p.color, icon: `passive:${p.id}` }));
    case 'objets': {
      const groups: [string, string[]][] = [
        ['Bonus temporaires', ['timed']],
        ['Activables · Espace', ['active']],
        ['Autres', ['instant', 'chest']],
      ];
      const out: CodexItem[] = [];
      for (const [group, kinds] of groups)
        for (const p of PICKUPS) if (kinds.includes(p.kind)) out.push({ tab, id: p.id, name: p.name, color: p.color, icon: `pickup:${p.id}`, group });
      const prop = ENEMIES.find((e) => e.behavior === 'prop')!;
      out.push({ tab, id: prop.id, name: prop.name, color: prop.color, icon: `enemy:${prop.id}`, group: 'Autres' });
      return out;
    }
    case 'ennemis': {
      const normal = DIFFICULTIES.findIndex((d) => d.id === 'normal');
      return ENEMIES.filter((e) => e.behavior !== 'prop')
        .map((e) => ({ e, at: e.behavior === 'boss' ? 1e9 : enemyArrival(e.id)[Math.max(0, normal)] }))
        .sort((a, b) => a.at - b.at)
        .map(({ e }) => ({ tab, id: e.id, name: e.name, color: e.color, icon: `enemy:${e.id}` }));
    }
  }
}

/** Petit lien vers une autre fiche du bestiaire. */
function chip(tab: CodexTab, id: string, suffix = ''): string {
  const it = codexItems(tab).find((x) => x.id === id);
  if (!it) return '';
  return `<button class="chip" data-goto="${tab}:${id}" style="--c:${it.color}"><span data-icon="${it.icon}" data-size="22"></span>${esc(it.name)}${suffix}</button>`;
}

function recipe(i: number): string {
  const f = FUSIONS[i];
  const partnerTab: CodexTab = f.withKind === 'weapon' ? 'armes' : 'bonus';
  return `<div class="recipe">${chip('armes', f.weapon, ' niv. 5')}<span>+</span>${chip(partnerTab, f.with, ' niv. 5')}<span>→</span>${chip('fusions', f.result)}</div>`;
}

function rows(list: [string, string][]): string {
  return `<dl class="rows">${list.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

function codexDetail(it: CodexItem): string {
  let tag = '';
  let body = '';
  let desc = '';
  switch (it.tab) {
    case 'armes': {
      const w = ALL_WEAPONS.find((x) => x.id === it.id)!;
      tag = 'Arme';
      desc = w.desc;
      body = `<h3>Niveaux</h3>${rows(w.levelText.map((t, k) => [`Niv. ${k + 1}`, t]))}`;
      const fi = FUSIONS.map((f, i) => [f, i] as const).filter(([f]) => f.weapon === it.id || (f.withKind === 'weapon' && f.with === it.id));
      if (fi.length) body += `<h3>Fusion</h3>${fi.map(([, i]) => recipe(i)).join('')}`;
      break;
    }
    case 'fusions': {
      const w = ALL_WEAPONS.find((x) => x.id === it.id)!;
      const i = FUSIONS.findIndex((f) => f.result === it.id);
      tag = 'Fusion';
      desc = w.desc;
      body = `<h3>Effet</h3><p>${esc(w.levelText[0])}</p><h3>Recette</h3>${recipe(i)}<p class="hint">Proposée au level-up quand les deux sont au niveau 5, ou offerte par le coffre du boss. Elle remplace l’arme d’origine.</p>`;
      break;
    }
    case 'bonus': {
      const p = PASSIVES.find((x) => x.id === it.id)!;
      tag = 'Passif';
      desc = p.desc;
      body = `<h3>Par niveau</h3><p>${esc(p.effect)}</p><h3>Total</h3>${rows([1, 2, 3, 4, 5].map((l) => [`Niv. ${l}`, passiveTotal(p, l)]))}`;
      const fi = FUSIONS.map((f, i) => [f, i] as const).filter(([f]) => f.withKind === 'passive' && f.with === it.id);
      if (fi.length) body += `<h3>Fusion</h3>${fi.map(([, i]) => recipe(i)).join('')}`;
      break;
    }
    case 'objets': {
      const p = PICKUPS.find((x) => x.id === it.id);
      if (!p) {
        const e = ENEMIES.find((x) => x.id === it.id)!;
        tag = 'Caisse';
        desc = e.desc;
        body = `<p class="hint">Apparaît régulièrement non loin de toi. Elle contient toujours un objet, souvent un activable.</p>`;
        break;
      }
      desc = p.desc;
      if (p.kind === 'timed') {
        tag = `Bonus temporaire · ${p.duration} s`;
        body = `<p class="hint">Lâché au hasard par les ennemis. En reprendre un identique prolonge la durée. Le temps restant s’affiche en bas de l’écran.</p>`;
      } else if (p.kind === 'active') {
        tag = 'Activable · Espace';
        body = `<p class="hint">Rangé dans l’emplacement « Objet » et déclenché avec Espace (bouton A). Un seul en réserve : en ramasser un autre le remplace.</p>`;
      } else if (p.kind === 'instant') {
        tag = 'Effet immédiat';
        body = `<p class="hint">Lâché au hasard par les ennemis, et proposé au level-up quand ton équipement est complet.</p>`;
      } else {
        tag = 'Coffre';
      }
      break;
    }
    case 'ennemis': {
      const e = ENEMIES.find((x) => x.id === it.id)!;
      tag = BEHAVIOR_LABEL[e.behavior] ?? '';
      desc = e.desc;
      const st: [string, string][] = [
        ['PV', num(e.hp)],
        ['Vitesse', num(e.speed)],
      ];
      if (e.behavior === 'kamikaze') st.push(['Explosion', `${e.blastDamage ?? 0} dégâts`]);
      else st.push(['Contact', `${e.damage} dégâts`]);
      if (e.behavior === 'shooter') st.push(['Tir', `${e.bulletDamage ?? 0} dégâts`]);
      if (e.behavior !== 'boss') st.push(['XP', String(e.xp)]);
      body = `<h3>Statistiques de base</h3>${rows(st)}<p class="hint">Les PV augmentent avec le temps et selon la difficulté.</p>`;
      const at = enemyArrival(e.id);
      body +=
        e.behavior === 'boss'
          ? `<h3>Arrivée</h3><p>Toutes les ${WAVES.bossEvery / 60} minutes, quelle que soit la difficulté.</p>`
          : `<h3>Arrivée</h3><div class="arrivals">${DIFFICULTIES.map(
              (d, i) => `<span style="--c:${d.color}"><b>${esc(d.name)}</b>${at[i] < 0 ? '—' : at[i] === 0 ? 'dès le début' : formatTime(at[i])}</span>`,
            ).join('')}</div>`;
      break;
    }
  }
  return `<header class="dhead" style="--c:${it.color}"><span class="ico big" data-icon="${it.icon}"></span><div><span class="tag">${esc(tag)}</span><h2>${esc(it.name)}</h2></div></header>
    <p class="desc">${esc(desc)}</p>${body}`;
}

function codexRules(): string {
  return `
    <div class="rules">
      <section><h3>Contrôles</h3>
        <p><kbd>ZQSD</kbd> <kbd>WASD</kbd> <kbd>flèches</kbd> ou stick : se déplacer. Tes armes tirent toutes seules.</p>
        <p><kbd>Espace</kbd> (ou bouton A) : utiliser l’objet activable en réserve.</p>
        <p><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> ou flèches + <kbd>Entrée</kbd> : choisir une amélioration. <kbd>Échap</kbd> : pause.</p>
      </section>
      <section><h3>Objectif</h3>
        <p>Survivre le plus longtemps possible dans un monde sans fin. Score : ${SCORE.perSecond} points par seconde, ${SCORE.perKill} par ennemi, ${SCORE.perBoss} par boss.</p>
        <p>Ramasse l’XP (losanges) pour monter de niveau et choisir 1 amélioration parmi 3. Jusqu’à ${MAX_WEAPON_SLOTS} armes et ${MAX_PASSIVE_SLOTS} passifs, 5 niveaux chacun.</p>
        <p>Les ennemis arrivent par types, de plus en plus variés. Un boss toutes les ${WAVES.bossEvery / 60} minutes.</p>
      </section>
      <section><h3>Objets</h3>
        <p><b>Bonus</b> (dans un cercle) : effet immédiat ou temporaire. <b>Activables</b> (dans un losange) : gardés en réserve, un seul à la fois.</p>
        <p>Les caisses bonus <b>?</b> apparaissent régulièrement près de toi : casse-les.</p>
      </section>
    </div>`;
}

function paintIcons(root: HTMLElement, size: number): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((s) => {
    if (s.firstChild) return;
    const [kind, id] = s.dataset.icon!.split(':');
    const px = Number(s.dataset.size ?? size);
    s.appendChild(kind === 'enemy' ? enemyPreview(id, px) : iconCanvas(kind as 'weapon' | 'passive' | 'pickup', id, px));
  });
}

/** Écrans à onglets : changer d'onglet redessine l'écran sans transition d'écran. */
const TAB_SCREENS = new Set(['codex', 'scores']);
/** Profondeur de navigation : aller plus profond glisse vers la gauche, revenir glisse vers la droite. */
const DEPTH: Record<string, number> = { difficulty: 1, codex: 1, scores: 1, settings: 1 };
const depth = (name: string) => DEPTH[name] ?? 0;
/** Durée de sortie de chaque écran (ms), alignée sur style.css. */
const LEAVE_MS: Record<string, number> = { default: 240, death: 560, levelup: 340 };
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class UI {
  private readonly root: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly muteBtn: HTMLButtonElement;
  private current = '';
  private levelFocus = 0;
  private levelCount = 0;
  private settingsReturn: () => void = () => {};
  private codexReturn: () => void = () => this.showMenu();
  /** bestiaire ouvert depuis la pause : affiché par-dessus la partie */
  private codexOverlay = false;
  private codexTab: CodexTab = 'armes';
  private countAnim = 0;
  private levelOpenedAt = 0;
  /** écran affiché (ceux qui sortent restent un instant dans #ui, inertes) */
  private screenEl: HTMLElement | null = null;
  private closeTimer = 0;

  constructor(private readonly app: AppApi) {
    this.root = document.getElementById('ui')!;
    this.toasts = document.getElementById('toasts')!;
    this.muteBtn = document.getElementById('mute') as HTMLButtonElement;
    this.muteBtn.addEventListener('click', () => {
      this.toggleMute();
      this.muteBtn.blur(); // Espace ne doit pas re-déclencher le bouton en jeu
    });
    this.refreshMute();
  }

  get screen(): string {
    return this.current;
  }

  /**
   * Monte un écran. `overlay` : par-dessus la partie (fond assombri), sinon écran de menu.
   * L'écran précédent n'est pas effacé d'un coup : il reste un instant en place, inerte, le temps
   * de jouer sa sortie pendant que le nouveau entre (glissement selon le sens de navigation).
   */
  private mount(name: string, html: string, overlay = false): HTMLElement {
    cancelAnimationFrame(this.countAnim);
    clearTimeout(this.closeTimer);
    const prev = this.screenEl;
    const prevName = this.current;
    this.current = name;
    this.toasts.replaceChildren(); // les messages de jeu ne doivent pas traîner sur un écran
    this.root.className = `visible ${overlay ? 'overlay' : 'menu'}`;
    const el = document.createElement('div');
    el.className = `screen screen-${name}`;
    el.innerHTML = html;
    if (prev && prevName === name && TAB_SCREENS.has(name)) {
      // Même écran, autre onglet (bestiaire, records) : seul le contenu change.
      el.classList.add('same');
      prev.replaceWith(el);
    } else {
      const dir = depth(name) > depth(prevName) ? 'fwd' : depth(name) < depth(prevName) ? 'back' : 'swap';
      if (prev) this.leave(prev, prevName, dir);
      el.classList.add(`enter-${dir}`);
      this.root.appendChild(el);
    }
    this.screenEl = el;
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.app.uiSound('ui')));
    // Survol à la souris = même sélection qu'au clavier.
    el.querySelectorAll<HTMLButtonElement>('.nav').forEach((b) => b.addEventListener('mouseenter', () => b.focus({ preventScroll: true })));
    (el.querySelector<HTMLButtonElement>('.nav.primary') ?? el.querySelector<HTMLButtonElement>('.nav'))?.focus({ preventScroll: true });
    return el;
  }

  /** Fait sortir un écran : figé à sa place, inerte (ni focus ni clic), retiré à la fin de son animation. */
  private leave(el: HTMLElement, name: string, dir: 'fwd' | 'back' | 'swap' | 'out'): void {
    if (reducedMotion()) {
      el.remove();
      return;
    }
    const r = el.getBoundingClientRect();
    el.inert = true;
    el.style.position = 'fixed';
    el.style.left = `${r.left}px`;
    el.style.top = `${r.top}px`;
    el.style.width = `${r.width}px`;
    el.style.margin = '0';
    el.classList.remove('enter-fwd', 'enter-back', 'enter-swap', 'same');
    el.classList.add('leaving', `leave-${dir}`);
    setTimeout(() => el.remove(), LEAVE_MS[name] ?? LEAVE_MS.default);
  }

  hide(): void {
    cancelAnimationFrame(this.countAnim);
    const prev = this.screenEl;
    const prevName = this.current;
    this.current = '';
    this.screenEl = null;
    clearTimeout(this.closeTimer);
    if (!prev || reducedMotion()) {
      this.root.replaceChildren();
      this.root.className = '';
      return;
    }
    this.leave(prev, prevName, 'out');
    // Le fond s'efface en même temps que l'écran ; #ui reste affiché (sans capter la souris) jusqu'à la fin.
    this.root.classList.remove('visible');
    this.root.classList.add('closing');
    this.closeTimer = window.setTimeout(() => {
      if (this.current) return;
      this.root.replaceChildren();
      this.root.className = '';
    }, LEAVE_MS[prevName] ?? LEAVE_MS.default);
  }

  /** Carte choisie au level-up : elle s'illumine pendant que l'écran sort. */
  markPicked(i: number): void {
    if (this.current !== 'levelup') return;
    this.screenEl?.querySelectorAll<HTMLElement>('.card')[i]?.classList.add('picked');
  }

  /** Déplace la sélection entre les boutons de l'écran courant (flèches / croix de la manette). */
  navigate(dir: NavDir): void {
    if (this.current === 'codex' && this.codexNav(dir)) return;
    if (this.current === 'settings' && (dir === 'left' || dir === 'right') && this.adjustSetting(dir === 'left' ? -1 : 1)) return;
    const d = dir === 'left' || dir === 'up' ? -1 : 1;
    if (!this.screenEl) return;
    const items = [...this.screenEl.querySelectorAll<HTMLButtonElement>('.nav')].filter((b) => !b.disabled);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = items[(i < 0 ? 0 : i + d + items.length) % items.length];
    next.focus({ preventScroll: false });
    this.app.uiSound('uiMove');
  }

  /** Valide le bouton sélectionné (bouton A de la manette). */
  activate(): boolean {
    const ae = document.activeElement as HTMLElement | null;
    if (ae && ae.tagName === 'BUTTON' && this.screenEl?.contains(ae)) {
      ae.click();
      return true;
    }
    return false;
  }

  toggleMute(): void {
    const s = { ...this.app.save.settings, muted: !this.app.save.settings.muted };
    this.app.applySettings(s);
    this.refreshMute();
  }

  refreshMute(): void {
    const m = this.app.save.settings.muted;
    this.muteBtn.textContent = m ? '🔇' : '🔊';
    this.muteBtn.title = m ? 'Son coupé (M)' : 'Couper le son (M)';
    const row = this.screenEl?.querySelector<HTMLElement>('.set[data-key="muted"]');
    if (row) this.paintSetting(row);
  }

  toast(text: string, color = '#ffffff'): void {
    if (!text) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.setProperty('--c', color);
    el.textContent = text;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2800);
  }

  // ---------- Menu principal ----------
  showMenu(): void {
    const el = this.mount(
      'menu',
      `
      <header class="brand">
        <h1 class="title">SWARM</h1>
        <p class="sub">Survis à la marée géométrique</p>
      </header>
      <nav class="stack">
        <button class="btn nav primary" id="play">Jouer</button>
        <button class="btn nav" id="codex">Bestiaire</button>
        <button class="btn nav" id="scores">Records</button>
        <button class="btn nav" id="settings">Options</button>
      </nav>
      <footer class="foot">ZQSD / flèches / manette : bouger · Espace : objet · Échap : pause · M : muet · v${GAME_VERSION}</footer>
    `,
    );
    el.querySelector('#play')!.addEventListener('click', () => this.showDifficulty());
    el.querySelector('#codex')!.addEventListener('click', () => this.showCodex('armes', 0, () => this.showMenu()));
    el.querySelector('#scores')!.addEventListener('click', () => this.showScores(this.app.save.difficulty));
    el.querySelector('#settings')!.addEventListener('click', () => this.showSettings(() => this.showMenu()));
  }

  // ---------- Choix de la difficulté ----------
  showDifficulty(): void {
    const save = this.app.save;
    const cards = DIFFICULTIES.map((d, i) => {
      const best = bestScore(save, i);
      return `<button class="card nav ${i === save.difficulty ? 'primary' : ''}" data-d="${i}" style="--c:${d.color}">
        <span class="card-title">${esc(d.name)}</span>
        <span class="card-text">${esc(d.desc)}</span>
        <span class="card-meta">${best ? `Record ${pad7(best)}` : 'Pas encore de record'}</span>
      </button>`;
    }).join('');
    const el = this.mount(
      'difficulty',
      `
      <header class="head"><h2>Difficulté</h2><p class="sub">Change la résistance des ennemis et la vitesse à laquelle les nouveaux types arrivent.</p></header>
      <div class="cards">${cards}</div>
      <footer class="actions"><button class="btn nav" id="back">Retour</button></footer>
    `,
    );
    el.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => b.addEventListener('click', () => this.app.play(Number(b.dataset.d))));
    el.querySelector('#back')!.addEventListener('click', () => this.showMenu());
  }

  // ---------- Records ----------
  showScores(difficulty: number): void {
    const list = topScores(this.app.save, difficulty);
    const rows = list
      .map(
        (r, i) => `<tr class="${i === 0 ? 'first' : ''}">
          <td class="rank">${i + 1}</td>
          <td class="num score">${pad7(r.score)}</td>
          <td class="num">${formatTime(r.tempsSurvecu)}</td>
          <td class="num">${r.level || '—'}</td>
          <td class="num">${num(r.kills)}</td>
          <td class="date">${new Date(r.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</td>
        </tr>`,
      )
      .join('');
    const tabs = DIFFICULTIES.map(
      (d, i) => `<button class="tab nav ${i === difficulty ? 'on' : ''}" data-d="${i}" style="--c:${d.color}">${esc(d.name)}</button>`,
    ).join('');
    const el = this.mount(
      'scores',
      `
      <header class="head"><h2>Records</h2><p class="sub">Tes 10 meilleures parties, par difficulté.</p></header>
      <div class="tabs">${tabs}</div>
      <div class="panel wide">${
        rows
          ? `<table class="scores"><thead><tr><th>#</th><th class="num">Score</th><th class="num">Temps</th><th class="num">Niveau</th><th class="num">Éliminés</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table>`
          : '<p class="empty">Aucune partie dans cette difficulté pour l’instant.</p>'
      }</div>
      <footer class="actions"><button class="btn nav" id="back">Retour</button></footer>
    `,
    );
    el.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) => b.addEventListener('click', () => this.showScores(Number(b.dataset.d))));
    el.querySelector('#back')!.addEventListener('click', () => this.showMenu());
    el.querySelector<HTMLButtonElement>('.tab.on')?.focus({ preventScroll: true });
  }

  // ---------- Options ----------
  /** Contrôles maison (curseurs, interrupteurs, choix) : même look partout, valeurs visibles, pilotables au clavier. */
  showSettings(onBack: () => void): void {
    this.settingsReturn = onBack;
    const overlay = this.current === 'pause';
    const groups = SETTINGS_UI.map(
      (g) =>
        `<h3>${g.title}</h3>${g.items
          .map(
            (it) =>
              `<button class="set nav" data-key="${it.key}" data-kind="${it.kind}"><span class="set-label">${esc(it.label)}${it.hint ? ` <kbd>${it.hint}</kbd>` : ''}</span><span class="ctl"></span></button>`,
          )
          .join('')}`,
    );
    const el = this.mount(
      'settings',
      `
      <header class="head"><h2>Options</h2></header>
      <div class="panel form">${groups.join('')}</div>
      <p class="foot">↑ ↓ : choisir · ← → : régler · Échap : retour</p>
      <footer class="actions">
        <button class="btn nav primary" id="back">Retour</button>
        <button class="btn nav" id="reset">Réinitialiser</button>
      </footer>
    `,
      overlay,
    );
    el.querySelectorAll<HTMLButtonElement>('.set').forEach((row) => {
      const def = settingDef(row);
      this.paintSetting(row);
      if (def.kind === 'range') {
        // Clic ou glisser sur la piste : la valeur suit le pointeur.
        const track = row.querySelector<HTMLElement>('.track')!;
        const fromPointer = (e: PointerEvent) => {
          const r = track.getBoundingClientRect();
          this.setSetting(def.key, Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 20) / 20);
        };
        track.addEventListener('pointerdown', (e) => {
          track.setPointerCapture(e.pointerId);
          row.focus({ preventScroll: true });
          row.classList.add('drag');
          fromPointer(e);
        });
        track.addEventListener('pointermove', (e) => {
          if (track.hasPointerCapture(e.pointerId)) fromPointer(e);
        });
        const end = () => row.classList.remove('drag');
        track.addEventListener('pointerup', end);
        track.addEventListener('pointercancel', end);
      } else {
        row.addEventListener('click', (e) => this.stepSetting(row, (e.target as HTMLElement).closest('.arrow.prev') ? -1 : 1));
      }
    });
    el.querySelector<HTMLButtonElement>('.set')!.focus({ preventScroll: true });
    el.querySelector('#back')!.addEventListener('click', () => this.settingsReturn());
    el.querySelector('#reset')!.addEventListener('click', () => {
      this.app.applySettings({ ...DEFAULT_SETTINGS });
      this.refreshMute();
      el.querySelectorAll<HTMLButtonElement>('.set').forEach((row) => this.paintSetting(row));
    });
  }

  private setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    if (this.app.save.settings[key] === value) return;
    this.app.applySettings({ ...this.app.save.settings, [key]: value });
    this.refreshMute();
    const row = this.screenEl?.querySelector<HTMLButtonElement>(`.set[data-key="${key}"]`);
    if (row) this.paintSetting(row);
  }

  /** Gauche / droite (ou clic) sur une ligne : curseur ±5 %, interrupteur inversé, choix suivant / précédent. */
  private stepSetting(row: HTMLElement, delta: number): void {
    const def = settingDef(row);
    const cur = this.app.save.settings;
    if (def.kind === 'range') this.setSetting(def.key, Math.round(Math.max(0, Math.min(1, cur[def.key] + delta * 0.05)) * 20) / 20);
    else if (def.kind === 'toggle') this.setSetting(def.key, !cur[def.key]);
    else {
      const opts = def.options;
      const i = opts.findIndex(([v]) => v === cur[def.key]);
      this.setSetting(def.key, opts[(i + delta + opts.length) % opts.length][0]);
    }
  }

  private adjustSetting(delta: number): boolean {
    const row = document.activeElement as HTMLElement | null;
    if (!row || !row.classList.contains('set') || !this.screenEl?.contains(row)) return false;
    this.stepSetting(row, delta);
    this.app.uiSound('uiMove');
    return true;
  }

  private paintSetting(row: HTMLElement): void {
    const def = settingDef(row);
    const ctl = row.querySelector<HTMLElement>('.ctl')!;
    if (def.kind === 'range') {
      const n = this.app.save.settings[def.key];
      if (!ctl.firstChild) ctl.innerHTML = '<span class="track"><span class="fill"></span><span class="thumb"></span></span><b class="val"></b>';
      ctl.style.setProperty('--v', String(n));
      ctl.querySelector('.val')!.textContent = `${Math.round(n * 100)} %`;
      row.setAttribute('role', 'slider');
      row.setAttribute('aria-valuenow', String(Math.round(n * 100)));
    } else if (def.kind === 'toggle') {
      const on = this.app.save.settings[def.key];
      ctl.innerHTML = `<span class="switch"><i></i></span><b class="val">${on ? 'Oui' : 'Non'}</b>`;
      row.classList.toggle('on', on);
      row.setAttribute('role', 'switch');
      row.setAttribute('aria-checked', String(on));
    } else {
      const v = this.app.save.settings[def.key];
      const label = def.options.find(([o]) => o === v)?.[1] ?? '';
      ctl.innerHTML = `<span class="arrow prev">‹</span><b class="val">${esc(label)}</b><span class="arrow next">›</span>`;
    }
  }

  // ---------- Bestiaire ----------
  /** Catégories : à gauche. Grille d'icônes au centre. Fiche détaillée de l'élément sélectionné à droite. */
  showCodex(tab: CodexTab, sel = 0, onBack?: () => void): void {
    if (onBack) {
      this.codexReturn = onBack;
      this.codexOverlay = this.current === 'pause';
    }
    this.codexTab = tab;
    const cats: [CodexTab, string, number][] = [
      ['regles', 'Comment jouer', 0],
      ['armes', 'Armes', BASE_WEAPONS.length],
      ['fusions', 'Fusions', FUSIONS.length],
      ['bonus', 'Passifs', PASSIVES.length],
      ['objets', 'Objets', codexItems('objets').length],
      ['ennemis', 'Ennemis', codexItems('ennemis').length],
    ];
    const side = cats
      .map(([id, label, n]) => `<button class="cat nav ${id === tab ? 'on' : ''}" data-tab="${id}"><span>${label}</span>${n ? `<small>${n}</small>` : ''}</button>`)
      .join('');
    const items = codexItems(tab);
    let center = '';
    if (items.length) {
      let group = '';
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.group && it.group !== group) {
          if (group || i) center += '</div>';
          group = it.group;
          center += `<h3>${esc(group)}</h3><div class="tiles">`;
        } else if (i === 0) center += '<div class="tiles">';
        center += `<button class="tile nav" data-i="${i}" style="--c:${it.color}" title="${esc(it.name)}"><span class="ico" data-icon="${it.icon}"></span><span class="nm">${esc(it.name)}</span></button>`;
      }
      center += '</div>';
    }
    const el = this.mount(
      'codex',
      `
      <header class="head"><h2>Bestiaire</h2></header>
      <div class="codex ${items.length ? '' : 'solo'}">
        <nav class="cats">${side}</nav>
        ${items.length ? `<div class="panel list">${center}</div>` : ''}
        <article class="panel detail">${items.length ? '' : codexRules()}</article>
      </div>
      <p class="foot">↑ ↓ : catégorie · ← → : élément · Échap : retour</p>
      <footer class="actions"><button class="btn nav" id="back">Retour</button></footer>
    `,
      this.codexOverlay,
    );
    paintIcons(el, 52);
    const detail = el.querySelector<HTMLElement>('.detail')!;
    const tiles = [...el.querySelectorAll<HTMLButtonElement>('.tile')];
    const select = (i: number) => {
      if (!items[i]) return;
      tiles.forEach((t, k) => t.classList.toggle('on', k === i));
      detail.innerHTML = codexDetail(items[i]);
      // relance le petit fondu de la fiche à chaque changement d'élément
      detail.classList.remove('swap');
      void detail.offsetWidth;
      detail.classList.add('swap');
      paintIcons(detail, 72);
      detail.querySelectorAll<HTMLButtonElement>('[data-goto]').forEach((b) =>
        b.addEventListener('click', () => {
          const [t, id] = b.dataset.goto!.split(':');
          const idx = codexItems(t as CodexTab).findIndex((x) => x.id === id);
          this.showCodex(t as CodexTab, Math.max(0, idx));
        }),
      );
    };
    tiles.forEach((t) => t.addEventListener('focus', () => select(Number(t.dataset.i))));
    el.querySelectorAll<HTMLButtonElement>('.cat').forEach((b) =>
      b.addEventListener('click', () => {
        this.showCodex(b.dataset.tab as CodexTab);
        this.screenEl?.querySelector<HTMLButtonElement>('.cat.on')?.focus({ preventScroll: true });
      }),
    );
    el.querySelector('#back')!.addEventListener('click', () => this.codexReturn());
    if (items.length) {
      const i = Math.min(sel, items.length - 1);
      select(i);
      tiles[i].focus({ preventScroll: true });
      tiles[i].scrollIntoView({ block: 'nearest' });
    } else el.querySelector<HTMLButtonElement>('.cat.on')?.focus({ preventScroll: true });
  }

  /**
   * Bestiaire au clavier / à la manette : haut et bas changent de catégorie, gauche et droite
   * changent d'élément. Les deux bouclent.
   */
  private codexNav(dir: NavDir): boolean {
    if (!this.screenEl) return false;
    const cats = [...this.screenEl.querySelectorAll<HTMLButtonElement>('.cat')].map((b) => b.dataset.tab as CodexTab);
    if (dir === 'up' || dir === 'down') {
      const i = cats.indexOf(this.codexTab);
      this.showCodex(cats[(i + (dir === 'up' ? -1 : 1) + cats.length) % cats.length]);
      this.app.uiSound('uiMove');
      return true;
    }
    const tiles = [...this.screenEl.querySelectorAll<HTMLButtonElement>('.tile')];
    if (!tiles.length) return true;
    let i = tiles.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) i = Math.max(0, tiles.findIndex((t) => t.classList.contains('on')));
    const next = tiles[(i + (dir === 'left' ? -1 : 1) + tiles.length) % tiles.length];
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest' });
    this.app.uiSound('uiMove');
    return true;
  }

  // ---------- Level-up ----------
  showLevelUp(level: number, offers: Offer[], ownedLevels: (o: Offer) => number, slots: { weapons: number; passives: number }): void {
    const cards = offers
      .map((o, i) => {
        let tag = '';
        let name = '';
        let line = '';
        let sub = '';
        let color = '#ffffff';
        let kind: 'weapon' | 'passive' | 'pickup' = 'weapon';
        let iconId = '';
        let pips = '';
        if (o.kind === OFFER_WEAPON) {
          const d = ALL_WEAPONS[o.id];
          const owned = ownedLevels(o);
          tag = owned ? `Arme · niveau ${owned} → ${o.toLevel}` : `Nouvelle arme · ${slots.weapons + 1}/${MAX_WEAPON_SLOTS}`;
          name = d.name;
          line = d.levelText[Math.max(0, o.toLevel - 1)];
          sub = owned ? (o.toLevel === 5 ? 'Niveau max : fusion possible avec son partenaire.' : '') : d.desc;
          color = d.color;
          iconId = d.id;
          pips = this.pips(o.toLevel, 5);
        } else if (o.kind === OFFER_PASSIVE) {
          const d = PASSIVES[o.id];
          const owned = ownedLevels(o);
          tag = owned ? `Passif · niveau ${owned} → ${o.toLevel}` : `Nouveau passif · ${slots.passives + 1}/${MAX_PASSIVE_SLOTS}`;
          name = d.name;
          line = d.effect;
          sub = owned ? `Total : ${passiveTotal(d, o.toLevel)}` : d.desc;
          color = d.color;
          kind = 'passive';
          iconId = d.id;
          pips = this.pips(o.toLevel, 5);
        } else if (o.kind === OFFER_FUSION) {
          const f = FUSION_TABLE[o.id];
          const r = weaponDef(f.result);
          tag = 'Fusion';
          name = r.name;
          line = r.levelText[0];
          sub = `${weaponDef(f.weapon).name} + ${fusionPartner(o.id).name}`;
          color = r.color;
          iconId = r.id;
        } else {
          tag = 'Équipement complet';
          name = PICKUPS[0].name;
          line = PICKUPS[0].desc;
          color = PICKUPS[0].color;
          kind = 'pickup';
          iconId = 'heal';
        }
        return `<button class="card offer ${o.kind === OFFER_FUSION ? 'fusion' : ''}" data-i="${i}" style="--c:${color}">
          <span class="key">${i + 1}</span>
          <span class="icon" data-kind="${kind}" data-id="${iconId}"></span>
          <span class="card-tag">${esc(tag)}</span>
          <span class="card-title">${esc(name)}</span>
          ${pips}
          <span class="card-line">${esc(line)}</span>
          ${sub ? `<span class="card-text">${esc(sub)}</span>` : ''}
        </button>`;
      })
      .join('');
    const el = this.mount(
      'levelup',
      `<header class="head"><h2>Niveau ${level}</h2><p class="sub">Choisis une amélioration : <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>, flèches + <kbd>Entrée</kbd> ou clic</p></header>
       <div class="cards">${cards}</div>`,
      true,
    );
    el.querySelectorAll<HTMLElement>('.icon').forEach((s) => {
      if (s.dataset.id) s.appendChild(iconCanvas(s.dataset.kind as 'weapon' | 'passive' | 'pickup', s.dataset.id, 60));
    });
    el.querySelectorAll<HTMLButtonElement>('.card').forEach((b) => {
      b.addEventListener('click', () => this.app.pickOffer(Number(b.dataset.i)));
      b.addEventListener('mouseenter', () => this.focusCard(Number(b.dataset.i)));
    });
    this.levelCount = offers.length;
    this.levelOpenedAt = performance.now();
    this.focusCard(0);
  }

  private pips(level: number, max: number): string {
    let h = '<span class="pips">';
    for (let k = 1; k <= max; k++) h += `<i class="${k < level ? 'on' : k === level ? 'new' : ''}"></i>`;
    return `${h}</span>`;
  }

  focusCard(i: number): void {
    if (this.current !== 'levelup') return;
    this.levelFocus = (i + this.levelCount) % this.levelCount;
    this.screenEl?.querySelectorAll<HTMLElement>('.card').forEach((c, k) => c.classList.toggle('focus', k === this.levelFocus));
  }
  moveCard(d: number): void {
    this.app.uiSound('uiMove');
    this.focusCard(this.levelFocus + d);
  }
  confirmCard(): void {
    // Garde-fou : une touche tenue au moment où l'écran s'ouvre ne choisit pas à la place du joueur.
    if (this.current === 'levelup' && performance.now() - this.levelOpenedAt > 350) this.app.pickOffer(this.levelFocus);
  }

  private buildHtml(b: BuildInfo, detailed: boolean): string {
    const w = b.weapons
      .map((x) => {
        const d = ALL_WEAPONS.find((y) => y.id === x.id)!;
        const lvl = x.fusion ? '<span class="lv max">Fusion</span>' : `<span class="lv ${x.level >= 5 ? 'max' : ''}">niv. ${x.level}/5</span>`;
        const info = detailed
          ? `<small>${esc(x.fusion ? d.levelText[0] : d.levelText[x.level - 1])}</small><small class="num">${esc(weaponNumbers(x.id, x.level, b.might, b.cooldownMul))}</small>`
          : '';
        return `<div class="item" style="--c:${d.color}"><span class="icon" data-kind="weapon" data-id="${x.id}"></span><span class="txt"><b>${esc(d.name)}</b>${lvl}${info}</span></div>`;
      })
      .join('');
    const p = b.passives
      .map((x) => {
        const d = PASSIVES.find((y) => y.id === x.id)!;
        const info = detailed ? `<small>${esc(passiveTotal(d, x.level))}</small>` : '';
        return `<div class="item" style="--c:${d.color}"><span class="icon" data-kind="passive" data-id="${x.id}"></span><span class="txt"><b>${esc(d.name)}</b><span class="lv ${x.level >= 5 ? 'max' : ''}">niv. ${x.level}/5</span>${info}</span></div>`;
      })
      .join('');
    return `<div class="items">${w}${p}</div>`;
  }

  private fillIcons(el: HTMLElement, size: number): void {
    el.querySelectorAll<HTMLElement>('.item .icon').forEach((s) => s.appendChild(iconCanvas(s.dataset.kind as 'weapon' | 'passive', s.dataset.id!, size)));
  }

  // ---------- Pause ----------
  showPause(build: BuildInfo): void {
    const stats = build.stats
      .map(
        (st) =>
          `<div class="${st.on ? 'on' : ''}" title="${esc(st.hint)}"><span>${esc(st.label)}</span><b>${esc(st.value)}</b><small>${st.sources.map(esc).join(' · ')}</small></div>`,
      )
      .join('');
    const el = this.mount(
      'pause',
      `
      <header class="head"><h2>Pause</h2></header>
      <div class="split">
        <div class="panel build"><h3>Équipement</h3>${this.buildHtml(build, true)}</div>
        <div class="panel statlist"><h3>Stats</h3>${stats}</div>
      </div>
      <footer class="actions">
        <button class="btn nav primary go" id="resume">Reprendre</button>
        <button class="btn nav" id="codex">Bestiaire</button>
        <button class="btn nav" id="settings">Options</button>
        <button class="btn nav danger" id="quit">Abandonner</button>
      </footer>
    `,
      true,
    );
    this.fillIcons(el, 36);
    el.querySelector('#resume')!.addEventListener('click', () => this.app.resume());
    el.querySelector('#codex')!.addEventListener('click', () => this.showCodex('armes', 0, () => this.showPause(build)));
    el.querySelector('#settings')!.addEventListener('click', () => this.showSettings(() => this.showPause(build)));
    el.querySelector('#quit')!.addEventListener('click', () => this.app.quit());
  }

  // ---------- Fin de partie ----------
  /**
   * Un bandeau en pente traverse l'écran de gauche à droite (rouge, doré si record), le score défile
   * une fois le bandeau posé, puis le reste de l'écran apparaît en cascade.
   */
  showDeath(d: DeathInfo): void {
    const r = d.record;
    const diff = DIFFICULTIES[r.difficulty];
    const record = !d.isReplay && d.rank === 1;
    const variant = d.isReplay ? 'replay' : record ? 'record' : '';
    const badge = d.isReplay || record
      ? ''
      : d.rank > 0
        ? `<span class="badge">${d.rank}<sup>e</sup> meilleure partie</span>`
        : `<span class="badge">Record : ${pad7(d.bestBefore)}</span>`;
    const reveal = (i: number) => `reveal" style="--i:${i}`;
    const el = this.mount(
      'death',
      `
      <div class="banner ${variant}">
        <div class="banner-band"></div>
        <div class="banner-content">
          <h2 class="go">${d.isReplay ? 'Relecture terminée' : 'Game over'}</h2>
          <div class="go-score"><small>Score · <span style="color:${diff.color}">${esc(diff.name)}</span></small><b id="count">${pad7(0)}</b></div>
        </div>
        ${record ? '<span class="stamp">Nouveau record</span>' : ''}
      </div>
      <p class="sub ${reveal(0)}">${esc(deathLine(d))}</p>
      ${badge ? `<div class="${reveal(1)}">${badge}</div>` : ''}
      <div class="stats ${reveal(2)}">
        <div><small>Temps</small><b>${formatTime(r.tempsSurvecu)}</b></div>
        <div><small>Éliminés</small><b>${num(r.kills)}</b></div>
        <div><small>Niveau</small><b>${r.level}</b></div>
        <div><small>Boss vaincus</small><b>${d.bossKills}</b></div>
      </div>
      <div class="panel build wide ${reveal(3)}"><h3>Équipement final</h3>${this.buildHtml(d.build, false)}</div>
      <footer class="actions ${reveal(4)}">
        <button class="btn nav primary" id="retry">Rejouer</button>
        ${d.canReplay ? '<button class="btn nav" id="watch">Revoir la partie</button>' : ''}
        <button class="btn nav" id="menu">Menu</button>
      </footer>
    `,
      true,
    );
    this.fillIcons(el, 32);
    el.querySelector('#retry')!.addEventListener('click', () => this.app.retry());
    el.querySelector('#watch')?.addEventListener('click', () => this.app.watchLastRun());
    el.querySelector('#menu')!.addEventListener('click', () => this.app.toMenu());
    // Le score défile comme sur une borne, une fois le bandeau posé.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const out = el.querySelector<HTMLElement>('#count')!;
    const delay = reduced ? 0 : 620;
    const dur = reduced ? 1 : Math.min(1400, 300 + r.score / 8);
    el.querySelector<HTMLElement>('.stamp')?.style.setProperty('animation-delay', `${delay + dur}ms`);
    const t0 = performance.now() + delay;
    const tick = (now: number) => {
      const f = Math.max(0, Math.min(1, (now - t0) / dur));
      out.textContent = pad7(r.score * (1 - (1 - f) ** 3));
      if (f < 1) this.countAnim = requestAnimationFrame(tick);
    };
    this.countAnim = requestAnimationFrame(tick);
  }
}
