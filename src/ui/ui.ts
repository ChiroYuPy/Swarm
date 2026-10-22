/**
 * Écrans DOM. Tous suivent le même gabarit (en-tête, contenu, actions) et les mêmes composants
 * (.btn, .tabs, .card, .panel), avec une seule police et une échelle de tailles commune (style.css).
 */
import { ALL_WEAPONS, BASE_WEAPONS, FUSED_WEAPONS } from '../data/weapons';
import { PASSIVES, type PassiveDef } from '../data/passives';
import { FUSIONS } from '../data/fusions';
import { BOSS_ORDER, ENEMIES } from '../data/enemies';
import { PICKUPS } from '../data/loot';
import { DIFFICULTIES } from '../data/difficulty';
import { WAVES } from '../data/waves';
import { SCORE } from '../data/hero';
import { MIX_TICKS, UNLOCK_SLOT } from '../sim/registry';
import { TICK_RATE } from '../sim/constants';
import {
  FUSION_TABLE,
  GAME_VERSION,
  MAX_PASSIVE_SLOTS,
  MAX_WEAPON_SLOTS,
  OFFER_FUSION,
  OFFER_PASSIVE,
  OFFER_SWAP,
  OFFER_WEAPON,
  weaponDef,
  weaponLevel,
  type Offer,
  type ScoreRecord,
} from '../sim';
import { iconCanvas } from '../render/icons';
import { enemyPreview } from '../render/sprites';
import { dec, formatTime, pad7, type StatDetail } from '../render/hud';
import { INTRO_TIMING } from '../audio/audio';
import type { SandboxSetup, SaveData, Settings } from '../storage/storage';
import { DEFAULT_SETTINGS, TOP_PER_DIFFICULTY, bestScore, defaultSandbox, topScores } from '../storage/storage';
import { initCursor } from './cursor';

/** Échange d'arme au level-up : charges, emplacement en cours d'échange (-1), armes du joueur. */
export interface LevelUpSwap {
  charges: number;
  slot: number;
  weapons: { id: string; name: string; color: string; can: boolean }[];
}

export interface AppApi {
  save: SaveData;
  play(difficulty: number): void;
  playSandbox(setup: SandboxSetup): void;
  retry(): void;
  pickOffer(i: number): void;
  /** échange d'arme au level-up : ouvrir pour l'emplacement `slot`, ou annuler */
  startSwap(slot: number): void;
  cancelSwap(): void;
  resume(): void;
  quit(): void;
  toMenu(screen?: 'menu' | 'sandbox'): void;
  watchLastRun(): void;
  applySettings(s: Settings): void;
  uiSound(kind: 'ui' | 'uiMove' | 'uiBack'): void;
  introPowerOn(): void;
  introDone(): void;
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
  /** partie de bac à sable (non classée) ; `survived` : terminée sans mourir */
  sandbox: boolean;
  survived: boolean;
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

type SandboxKey = 'difficulty' | 'startMinute' | 'invincible' | 'level' | 'might' | 'xp' | 'item' | 'enemyMul' | 'bosses' | 'custom';
type SandboxValue = number | boolean | string | null;
type SandboxDef = { key: SandboxKey; label: string; hint?: string } & ({ kind: 'toggle' } | { kind: 'choice'; options: [SandboxValue, string][] });

const times = (v: number) => `×${String(v).replace('.', ',')}`;

/** Écran Sandbox : réglages de la partie, dans l'ordre d'affichage. */
const SANDBOX_UI: { title: string; items: SandboxDef[] }[] = [
  {
    title: 'Partie',
    items: [
      { key: 'difficulty', kind: 'choice', label: 'Difficulté de base', options: DIFFICULTIES.map((d, i) => [i, d.name]) },
      {
        key: 'startMinute',
        kind: 'choice',
        label: 'Commencer à',
        hint: 'Ennemis aussi forts qu’à ce moment de la partie.',
        options: [0, 1, 2, 3, 5, 8, 10, 15, 20, 30].map((m) => [m, m ? formatTime(m * 60) : 'Début']),
      },
    ],
  },
  {
    title: 'Héros',
    items: [
      { key: 'invincible', kind: 'toggle', label: 'Invincible' },
      { key: 'level', kind: 'choice', label: 'Niveau de départ', options: [1, 5, 10, 15, 20, 30, 40, 50].map((l) => [l, `Niv. ${l}`]) },
      { key: 'might', kind: 'choice', label: 'Dégâts', options: [0.5, 1, 2, 5, 10, 50].map((v) => [v, times(v)]) },
      { key: 'xp', kind: 'choice', label: 'XP gagnée', hint: 'Aucune : pas de level-up.', options: [0, 0.5, 1, 2, 5, 10].map((v) => [v, v ? times(v) : 'Aucune']) },
      {
        key: 'item',
        kind: 'choice',
        label: 'Objet en réserve',
        options: [[null, 'Aucun'], ...PICKUPS.filter((k) => k.kind === 'active').map((k): [string, string] => [k.id, k.name])],
      },
    ],
  },
  {
    title: 'Ennemis',
    items: [
      { key: 'enemyMul', kind: 'choice', label: 'Quantité', options: [0, 0.25, 0.5, 1, 2, 3, 5].map((v) => [v, v ? times(v) : 'Aucun']) },
      { key: 'bosses', kind: 'toggle', label: `Boss toutes les ${WAVES.wavesPerBoss} vagues` },
      { key: 'custom', kind: 'choice', label: 'Types', options: [[false, 'Progression normale'], [true, 'Sur mesure']] },
    ],
  },
];
const sandboxDef = (row: HTMLElement): SandboxDef => SANDBOX_UI.flatMap((g) => g.items).find((x) => x.key === row.dataset.sb)!;
/** Ennemis qu'on peut choisir dans le bac à sable (ni boss, ni caisse bonus). */
const SANDBOX_FOES = ENEMIES.filter((e) => e.behavior !== 'boss' && e.behavior !== 'prop' && !e.hidden);

const settingDef = (row: HTMLElement): SettingDef => SETTINGS_UI.flatMap((g) => g.items).find((x) => x.key === row.dataset.key)!;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const num = (n: number) => n.toLocaleString('fr-FR');

/** Une phrase courte sur la partie, choisie selon ce qui s'est passé. */
function deathLine(d: DeathInfo): string {
  const t = d.record.tempsSurvecu;
  const k = d.record.kills;
  if (d.isReplay) return 'Fin de la relecture.';
  if (d.sandbox) return 'Partie sandbox : rien n’est enregistré dans les records.';
  if (d.rank === 1 && d.bestBefore > 0) return 'Nouveau record. Tu progresses.';
  if (t < 60) return 'Moins d’une minute… on respire et on y retourne.';
  if (d.bossKills >= 2) return `${d.bossKills} boss vaincus. Respect.`;
  if (d.bossKills === 1) return 'Le Trapèze est tombé. Pas toi… enfin, pas tout de suite.';
  if (k >= 1000) return `${num(k)} formes éliminées avant de céder.`;
  if (t >= FIRST_BOSS - 20 && t < FIRST_BOSS) return 'Si près du boss…';
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
  const out = [L.damage > 0 ? `Dégâts ${dec(L.damage * might, 1)}` : 'Sans dégâts'];
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

const BEHAVIOR_LABEL: Record<string, string> = {
  chaser: 'Poursuivant',
  shooter: 'À distance',
  kamikaze: 'Explosif',
  swarm: 'En groupe',
  boss: 'Boss',
  leader: 'Soutien',
  blinker: 'Téléportation',
  orbiter: 'Tournoyant',
  wall: 'Mur',
  egg: 'Œuf',
};

/** Le premier boss arrive après `wavesPerBoss` vagues et leurs pauses (secondes). */
const FIRST_BOSS = (WAVES.waveLength + WAVES.pause) * WAVES.wavesPerBoss;

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
        ['Autres', ['instant', 'relic', 'chest']],
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
      return ENEMIES.filter((e) => e.behavior !== 'prop' && !e.hidden)
        .map((e) => ({ e, at: e.behavior === 'boss' ? 1e9 + BOSS_ORDER.indexOf(e.id) : enemyArrival(e.id)[Math.max(0, normal)] }))
        .sort((a, b) => a.at - b.at)
        .map(({ e }) => ({ tab, id: e.id, name: e.name, color: e.color, icon: `enemy:${e.id}` }));
    }
  }
}

/** Petit lien vers une autre fiche du codex. */
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
      } else if (p.kind === 'relic') {
        tag = 'Relique · automatique';
        body = `<p class="hint">Gardée à part (elle n’occupe pas l’emplacement « Objet ») et affichée au-dessus de ta barre. Une seule à la fois. Très rare : lâchée par les ennemis et les caisses bonus.</p>`;
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
      if (e.behavior === 'blinker') st.push(['Atterrissage', `${e.blastDamage ?? 0} dégâts`]);
      if (e.behavior === 'leader') st.push(['Aura', `+${Math.round((e.auraSpeed ?? 0) * 100)} % de vitesse aux voisins`]);
      if (e.capMax) st.push(['Nombre', `${e.capStart} à son arrivée, jusqu’à ${e.capMax} en même temps`]);
      if (e.splitInto) {
        const f = ENEMIES.find((x) => x.id === e.splitInto)!;
        const g = f.splitInto ? ENEMIES.find((x) => x.id === f.splitInto) : undefined;
        st.push(['À sa mort', `${e.splitCount ?? 2} × ${f.name} (${f.hp} PV)${g ? `, puis ${(e.splitCount ?? 2) * (f.splitCount ?? 2)} × ${g.name} (${g.hp} PV)` : ''}`]);
      }
      if (e.behavior !== 'boss') st.push(['XP', String(e.xp)]);
      body = `<h3>Statistiques de base</h3>${rows(st)}<p class="hint">Les PV augmentent avec le temps et selon la difficulté.</p>`;
      const at = enemyArrival(e.id);
      body +=
        e.behavior === 'boss'
          ? `<h3>Arrivée</h3><p>Boss n°${BOSS_ORDER.indexOf(e.id) + 1}, après la vague ${(BOSS_ORDER.indexOf(e.id) + 1) * WAVES.wavesPerBoss}, quelle que soit la difficulté. Les boss reviennent ensuite dans le même ordre, plus forts (Mk II…).</p>`
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
        <p>Les ennemis arrivent par vagues de ${WAVES.waveLength} s (2 ou 3 types à la fois), séparées de ${WAVES.pause} s de calme. Toutes les ${WAVES.wavesPerBoss} vagues, un boss : les autres ennemis s’enfuient, il ne reste que lui et ses renforts ; les vagues reprennent à sa mort. La frise en haut de l’écran montre ce qui arrive.</p>
      </section>
      <section><h3>Objets</h3>
        <p><b>Bonus</b> (dans un cercle) : effet immédiat ou temporaire. <b>Activables</b> (dans un losange) : gardés en réserve, un seul à la fois. <b>Reliques</b> (dans un hexagone) : se déclenchent toutes seules.</p>
        <p>Les boules violettes des Tireurs se cassent : tes tirs, explosions, ondes, orbes, aura et laser les détruisent.</p>
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
const DEPTH: Record<string, number> = { difficulty: 1, sandbox: 1, codex: 1, scores: 1, settings: 1 };
const depth = (name: string) => DEPTH[name] ?? 0;
/** Durée de sortie de chaque écran (ms), alignée sur style.css. */
const LEAVE_MS: Record<string, number> = { default: 460, death: 560 };
/** Durée de l'allumage cathodique (ms), alignée sur style.css. */
const CRT_MS = 1100;
/** début de l'allumage des lettres (ms après l'allumage de l'écran), aligné sur letter-on dans style.css */
const LETTERS_AT = INTRO_TIMING.crt + INTRO_TIMING.swarm;
/** l'intro se termine seule une fois le logo allumé (dernière lettre + un temps de pose) */
const INTRO_END_MS = LETTERS_AT + 4 * INTRO_TIMING.letterGap + 600 + 600;
/** inactivité sur le menu avant de passer en mode démo (ms) */
const ATTRACT_MS = 20000;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Son joué au clic d'un bouton : « retour » pour revenir, rien pour lancer une partie (elle a le sien). */
function clickSound(b: HTMLButtonElement): 'ui' | 'uiBack' | null {
  if (b.id === 'back' || b.id === 'menu') return 'uiBack';
  if (b.id === 'start' || b.id === 'go' || b.id === 'retry' || b.matches('.diff[data-d]')) return null;
  return 'ui';
}

/**
 * Fait défiler verticalement le premier conteneur défilant pour montrer `el`. Jamais de défilement
 * horizontal : `scrollIntoView` décalerait #ui de côté pendant qu'un écran arrive en glissant.
 */
function reveal(el: HTMLElement): void {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy !== 'auto' && oy !== 'scroll') || p.scrollHeight <= p.clientHeight) continue;
    const r = el.getBoundingClientRect();
    const pr = p.getBoundingClientRect();
    if (r.top < pr.top) p.scrollTop -= pr.top - r.top + 8;
    else if (r.bottom > pr.bottom) p.scrollTop += r.bottom - pr.bottom + 8;
    return;
  }
}

export class UI {
  private readonly root: HTMLElement;
  private readonly toasts: HTMLElement;
  private current = '';
  private levelFocus = 0;
  private levelCount = 0;
  private settingsReturn: () => void = () => {};
  private codexReturn: () => void = () => this.showMenu();
  /** codex ouvert depuis la pause : affiché par-dessus la partie */
  private codexOverlay = false;
  private codexTab: CodexTab = 'armes';
  private countAnim = 0;
  private levelOpenedAt = 0;
  /** écran affiché (ceux qui sortent restent un instant dans #ui, inertes) */
  private screenEl: HTMLElement | null = null;
  private closeTimer = 0;
  /** intro en cours : en veille, la prochaine touche allume l'écran ; ensuite, elle passe l'intro */
  private intro: { stage: 'standby' | 'on'; ready: Promise<unknown>; timers: number[]; stop: () => void } | null = null;
  /** mode démo (inactivité sur le menu) */
  private attract = false;
  private lastActivity = performance.now();
  /**
   * Qui pilote la sélection : la souris (est sélectionné ce qui est sous le pointeur, rien sinon) ou
   * le clavier / la manette (le pointeur est ignoré tant qu'il ne bouge pas vraiment).
   */
  private kbd = false;
  /** Point de départ du clavier quand rien n'est sélectionné : dernier bouton sélectionné de l'écran. */
  private navHome: HTMLElement | null = null;
  private pointer = { x: -1, y: -1 };

  constructor(private readonly app: AppApi) {
    this.root = document.getElementById('ui')!;
    this.toasts = document.getElementById('toasts')!;
    initCursor();
    // Garde-fou : #ui ne défile jamais de côté (les écrans qui glissent dépassent volontairement).
    this.root.addEventListener('scroll', () => {
      if (this.root.scrollLeft) this.root.scrollLeft = 0;
    });
    // Activité du joueur : repousse le mode démo, et en sort (ce geste-là ne fait rien d'autre).
    const swallow = (e: Event) => {
      this.noteActivity();
      if (!this.attract) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'pointerdown') {
        const block = (c: Event) => {
          c.preventDefault();
          c.stopPropagation();
        };
        window.addEventListener('click', block, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', block, true), 600);
      }
      this.exitAttract();
    };
    window.addEventListener('keydown', swallow, true);
    window.addEventListener('pointerdown', swallow, true);
    window.addEventListener('wheel', () => this.noteActivity(), { capture: true, passive: true });
    window.addEventListener('pointermove', (e) => {
      if (Math.abs(e.movementX) + Math.abs(e.movementY) < 3) return;
      this.noteActivity();
      if (this.attract) this.exitAttract();
    });
    // Souris ou clavier : c'est le dernier des deux qui a servi qui pilote la sélection.
    window.addEventListener(
      'keydown',
      (e) => {
        if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) this.setKbd(true);
      },
      true,
    );
    const onPointer = (e: PointerEvent) => {
      this.pointer = { x: e.clientX, y: e.clientY };
      // Un écran qui glisse sous un pointeur immobile envoie aussi des mouvements, mais nuls.
      if (e.type === 'pointerdown' || e.movementX || e.movementY) this.setKbd(false);
      if (!this.kbd) this.syncPointer(e.target);
    };
    window.addEventListener('pointermove', onPointer);
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('mouseover', (e) => {
      if (!this.kbd) this.syncPointer(e.target);
    });
    document.documentElement.addEventListener('mouseleave', () => {
      if (!this.kbd) this.syncPointer(null);
    });
  }

  private setKbd(on: boolean): void {
    this.kbd = on;
    document.body.classList.toggle('kbd', on);
  }

  /** Souris aux commandes : est sélectionné le bouton sous le pointeur, et rien s'il n'y en a pas. */
  private syncPointer(target: EventTarget | null): void {
    const el = this.screenEl;
    if (!el || this.attract) return;
    const t = target instanceof Element ? target : null;
    if (this.current === 'levelup') {
      const card = t?.closest<HTMLElement>('.pick');
      this.focusCard(card && el.contains(card) ? Number(card.dataset.i) : -1);
      return;
    }
    const b = t?.closest<HTMLButtonElement>('.nav');
    const ae = document.activeElement as HTMLElement | null;
    if (b && el.contains(b) && !b.disabled) {
      if (ae !== b) b.focus({ preventScroll: true });
    } else if (ae && el.contains(ae) && ae.matches('.nav')) ae.blur();
  }

  /**
   * Sélection de départ d'un écran : affichée d'emblée au clavier ; à la souris, c'est ce qui est
   * sous le pointeur qui compte, et le clavier repartira de là.
   */
  private home(b: HTMLElement | null | undefined): void {
    if (!b) return;
    this.navHome = b;
    if (this.kbd) b.focus({ preventScroll: true });
    else this.syncPointer(document.elementFromPoint(this.pointer.x, this.pointer.y));
  }

  /** Rien de sélectionné (la souris était ailleurs) : la première touche fait juste réapparaître la sélection. */
  private wake(): boolean {
    const el = this.screenEl;
    if (!el || this.current === 'levelup') return false;
    const ae = document.activeElement;
    if (ae && el.contains(ae) && ae.matches('.nav')) return false;
    const b = this.navHome && el.contains(this.navHome) ? this.navHome : (el.querySelector<HTMLElement>('.nav.primary') ?? el.querySelector<HTMLElement>('.nav'));
    if (!b) return false;
    b.focus({ preventScroll: true });
    reveal(b);
    this.app.uiSound('uiMove');
    return true;
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
    this.root.className = `visible ${overlay ? 'overlay' : 'menu'} on-${name}`;
    document.body.classList.toggle('menu-home', name === 'menu');
    const el = document.createElement('div');
    el.className = `screen screen-${name}`;
    el.innerHTML = html;
    if (prev && prevName === name && TAB_SCREENS.has(name)) {
      // Même écran, autre onglet (codex, records) : seul le contenu change.
      el.classList.add('same');
      // Si l'écran est encore en train d'arriver, le nouveau reprend le glissement là où il en était.
      const run = prev.getAnimations().find((an) => an.playState === 'running');
      const enter = [...prev.classList].find((c) => c.startsWith('enter-'));
      if (run && enter && typeof run.currentTime === 'number') {
        el.classList.add(enter);
        el.style.animationDelay = `${-run.currentTime}ms`;
      }
      prev.replaceWith(el);
    } else {
      // Tout circule de droite à gauche ; revenir en arrière (ou quitter la fin de partie, dont le
      // bandeau file vers la droite) inverse le sens.
      const dir = depth(name) < depth(prevName) || prevName === 'death' ? 'back' : 'fwd';
      if (prev) this.leave(prev, prevName, dir);
      // La fin de partie n'arrive pas en glissant : c'est son bandeau qui fait l'entrée.
      el.classList.add(name === 'death' ? 'enter-none' : `enter-${dir}`);
      this.root.appendChild(el);
    }
    this.screenEl = el;
    el.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        const sfx = clickSound(b);
        if (sfx) this.app.uiSound(sfx);
      }),
    );
    el.addEventListener('focusin', (e) => {
      if ((e.target as Element).matches('.nav')) this.navHome = e.target as HTMLElement;
    });
    this.home(el.querySelector<HTMLButtonElement>('.nav.primary') ?? el.querySelector<HTMLButtonElement>('.nav'));
    return el;
  }

  /** Fait sortir un écran : figé à sa place, inerte (ni focus ni clic), retiré à la fin de son animation. */
  private leave(el: HTMLElement, name: string, dir: 'fwd' | 'back'): void {
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
    el.classList.remove('enter-fwd', 'enter-back', 'enter-none', 'same');
    el.classList.add('leaving', `leave-${dir}`);
    setTimeout(() => el.remove(), LEAVE_MS[name] ?? LEAVE_MS.default);
  }

  hide(): void {
    cancelAnimationFrame(this.countAnim);
    document.body.classList.remove('menu-home');
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
    this.leave(prev, prevName, prevName === 'death' ? 'back' : 'fwd');
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
    this.setKbd(true);
    if (this.wake()) return;
    if (this.current === 'codex' && this.codexNav(dir)) return;
    if (this.current === 'scores' && (dir === 'left' || dir === 'right')) {
      // Records : gauche / droite passent d'une difficulté à l'autre (en boucle).
      const cur = Number(this.screenEl?.querySelector<HTMLElement>('.tab.on')?.dataset.d ?? 0);
      const n = DIFFICULTIES.length;
      this.showScores((cur + (dir === 'left' ? -1 : 1) + n) % n);
      this.app.uiSound('uiMove');
      return;
    }
    if (this.current === 'settings' && (dir === 'left' || dir === 'right') && this.adjustSetting(dir === 'left' ? -1 : 1)) return;
    if (this.current === 'sandbox' && (dir === 'left' || dir === 'right') && this.adjustSandbox(dir === 'left' ? -1 : 1)) return;
    const d = dir === 'left' || dir === 'up' ? -1 : 1;
    if (!this.screenEl) return;
    const items = [...this.screenEl.querySelectorAll<HTMLButtonElement>('.nav')].filter((b) => !b.disabled);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = items[(i < 0 ? 0 : i + d + items.length) % items.length];
    next.focus({ preventScroll: true });
    reveal(next);
    this.app.uiSound('uiMove');
  }

  /** Valide le bouton sélectionné (bouton A de la manette). */
  activate(): boolean {
    this.setKbd(true);
    if (this.wake()) return true;
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
        <h1 class="title">${[...'SWARM'].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</h1>
      </header>
      <nav class="stack">
        <button class="btn nav primary" id="play">Jouer</button>
        <button class="btn nav" id="sandbox">Sandbox</button>
        <button class="btn nav" id="codex">Codex</button>
        <button class="btn nav" id="scores">Records</button>
        <button class="btn nav" id="settings">Options</button>
      </nav>
      <p class="version">v${GAME_VERSION}</p>
    `,
    );
    el.querySelector('#play')!.addEventListener('click', () => this.showDifficulty());
    el.querySelector('#sandbox')!.addEventListener('click', () => this.showSandbox());
    el.querySelector('#codex')!.addEventListener('click', () => this.showCodex('armes', 0, () => this.showMenu()));
    el.querySelector('#scores')!.addEventListener('click', () => this.showScores(this.app.save.difficulty));
    el.querySelector('#settings')!.addEventListener('click', () => this.showSettings(() => this.showMenu()));
  }

  // ---------- Intro (premier chargement) ----------
  get introActive(): boolean {
    return this.intro !== null;
  }

  /**
   * Intro en trois temps :
   * 0. veille : écran noir, un voyant au centre, « Appuie pour allumer ». Ce geste autorise le son :
   *    toute l'intro est sonorisée ;
   * 1. allumage façon vieux téléviseur : le voyant devient un point lumineux qui s'étire en trait,
   *    puis l'image s'ouvre jusqu'à plein écran ;
   * 2. un essaim de particules arrive en tourbillon de tous les bords et forme le logo, dont les
   *    lettres s'allument ensuite une par une comme des néons ;
   * 3. le logo remonte à sa place et les boutons du menu se déroulent (seul, ou dès qu'on appuie).
   */
  showIntro(): void {
    const body = document.body;
    if (reducedMotion()) {
      body.classList.remove('booting');
      this.showMenu();
      return;
    }
    // Capturées avant InputManager : pendant l'intro, une touche ou un clic ne fait rien d'autre.
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.introInput();
    };
    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Le clic qui suit ce geste ne doit rien déclencher d'autre (un bouton du menu, etc.).
      const block = (c: Event) => {
        c.preventDefault();
        c.stopPropagation();
      };
      window.addEventListener('click', block, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', block, true), 600);
      this.introInput();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    // Fond uni pendant l'intro : la partie de démonstration n'apparaît qu'avec le menu.
    body.classList.add('intro-bg');
    // Écran noir tant que la police du titre n'est pas là (sinon on verrait le logo changer de police).
    const fontReady = document.fonts?.load('700 88px "Chakra Petch"') ?? Promise.resolve();
    const ready = Promise.race([fontReady, new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
    const intro: NonNullable<UI['intro']> = {
      stage: 'standby',
      ready,
      timers: [],
      stop: () => {
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('pointerdown', onPointer, true);
        intro.timers.forEach((t) => clearTimeout(t));
      },
    };
    this.intro = intro;
    void ready.then(() => {
      if (this.intro !== intro || intro.stage !== 'standby') return;
      const sb = document.createElement('div');
      sb.className = 'standby';
      sb.innerHTML = '<i class="led"></i><p>Appuie pour allumer</p>';
      body.appendChild(sb);
    });
  }

  /** Une touche, un clic ou un bouton de manette pendant l'intro : allume l'écran, ou passe la suite. */
  introInput(): void {
    const intro = this.intro;
    if (!intro) return;
    if (intro.stage === 'on') {
      this.finishIntro();
      return;
    }
    intro.stage = 'on';
    // Dans le geste lui-même : c'est ce qui autorise le navigateur à jouer du son.
    this.app.introPowerOn();
    void intro.ready.then(() => {
      if (this.intro !== intro) return;
      const body = document.body;
      document.querySelector('.standby')?.remove();
      this.showMenu();
      const el = this.screenEl!;
      // Pas de glissement : l'écran est déjà en place quand l'image s'allume.
      el.classList.remove('enter-fwd');
      el.classList.add('intro');
      // Le point qui devient trait, puis les deux lignes qui s'écartent (voir style.css).
      const lines = ['crt-line', 'crt-edge up', 'crt-edge down'].map((c) => {
        const d = document.createElement('div');
        d.className = c;
        body.appendChild(d);
        return d;
      });
      body.classList.remove('booting');
      body.classList.add('crt-on');
      const later = (fn: () => void, ms: number) => intro.timers.push(window.setTimeout(fn, ms));
      later(() => {
        lines.forEach((d) => d.remove());
        body.classList.remove('crt-on');
      }, CRT_MS);
      later(() => {
        const stopSwarm = this.swarmLogo(el);
        const stop = intro.stop;
        intro.stop = () => {
          stop();
          stopSwarm();
        };
      }, INTRO_TIMING.crt);
      later(() => this.finishIntro(), INTRO_END_MS);
    });
  }

  /**
   * L'essaim qui forme le logo : des particules aux couleurs des ennemis arrivent en spirale de
   * tous les bords et se posent sur le dessin des lettres, puis s'effacent quand chaque lettre
   * s'allume. Retourne de quoi tout arrêter.
   */
  private swarmLogo(screen: HTMLElement): () => void {
    const title = screen.querySelector<HTMLElement>('.title');
    const spans = [...(title?.querySelectorAll<HTMLElement>('span') ?? [])];
    if (!title || !spans.length) return () => {};
    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = document.createElement('canvas');
    cv.className = 'swarm-intro';
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d')!;

    // Cibles : le dessin des lettres, à leur place et à leur taille à l'écran (logo agrandi compris).
    const zoom = title.getBoundingClientRect().width / title.offsetWidth || 1;
    const size = parseFloat(getComputedStyle(title).fontSize) * zoom;
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const oc = off.getContext('2d', { willReadFrequently: true })!;
    oc.font = `700 ${size}px "Chakra Petch"`;
    oc.textBaseline = 'alphabetic';
    oc.fillStyle = '#fff';
    const rects = spans.map((sp) => sp.getBoundingClientRect());
    for (let i = 0; i < spans.length; i++) {
      const ascent = oc.measureText(spans[i].textContent ?? '').fontBoundingBoxAscent;
      oc.fillText(spans[i].textContent ?? '', rects[i].left, rects[i].top + ascent);
    }
    const x0 = Math.max(0, Math.floor(rects[0].left - 10));
    const y0 = Math.max(0, Math.floor(rects[0].top - 10));
    const x1 = Math.min(W, Math.ceil(rects[rects.length - 1].right + 10));
    const y1 = Math.min(H, Math.ceil(Math.max(...rects.map((r) => r.bottom)) + 10));
    const img = oc.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    const gap = Math.max(3, Math.round(size / 26));
    type P = { tx: number; ty: number; a: number; r: number; d: number; c: number; l: number };
    const ps: P[] = [];
    let seed = 7;
    const rnd = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed / 4294967296;
    };
    const reach = Math.hypot(W, H) * 0.6;
    for (let y = 0; y < y1 - y0; y += gap)
      for (let x = 0; x < x1 - x0; x += gap) {
        if (img[(y * (x1 - x0) + x) * 4 + 3] < 128) continue;
        const tx = x0 + x;
        const l = Math.max(0, rects.findIndex((r) => tx < r.right));
        ps.push({ tx, ty: y0 + y, a: rnd() * Math.PI * 2, r: reach * (1 + rnd() * 0.35), d: rnd() * 0.35, c: Math.floor(rnd() * 5), l });
      }
    const colors = ['#38f6ff', '#ff3df5', '#39ff7a', '#ffd23a', '#b48cff'];
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const T = INTRO_TIMING.swarm / 1000;
    const letterGap = INTRO_TIMING.letterGap / 1000;
    const start = performance.now();
    let raf = 0;
    const frame = () => {
      const t = (performance.now() - start) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Traînées : l'image précédente s'efface en partie.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${t < T ? 0.32 : 0.6})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of ps) {
        const k = Math.min(1, Math.max(0, (t - p.d) / (T - p.d)));
        const e = k * k * (3 - 2 * k);
        // Chaque lettre s'éteint côté essaim quand le néon prend le relais (fin de son allumage).
        const lit = T + p.l * letterGap + 0.35;
        const alpha = t < lit ? 1 : Math.max(0, 1 - (t - lit) / 0.3);
        if (alpha <= 0) continue;
        const rad = p.r * Math.pow(1 - e, 1.4);
        const ang = p.a + 5 * (1 - e);
        const x = p.tx + Math.cos(ang) * rad;
        const y = p.ty + Math.sin(ang) * rad;
        ctx.globalAlpha = alpha * (0.35 + 0.65 * Math.min(1, k * 3));
        ctx.fillStyle = e > 0.85 ? '#eafdff' : colors[p.c];
        const sz = e > 0.85 ? gap * 0.7 : 2;
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
      // Onde de choc quand l'essaim se pose (en même temps que l'impact sonore).
      if (t > T && t < T + 0.5) {
        const k = (t - T) / 0.5;
        ctx.globalAlpha = 0.6 * (1 - k);
        ctx.strokeStyle = '#38f6ff';
        ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, (x1 - x0) * (0.4 + k * 0.9), (y1 - y0) * (0.4 + k * 1.6), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (t < T + spans.length * letterGap + 1) raf = requestAnimationFrame(frame);
      else cv.remove();
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      cv.remove();
    };
  }

  /** Termine l'intro (ou la passe si elle est encore en cours) et révèle le menu. */
  finishIntro(): void {
    const intro = this.intro;
    if (!intro) return;
    this.intro = null;
    intro.stop();
    const body = document.body;
    // Passée pendant l'allumage : l'image se remet d'un coup, sans écran noir. La démo apparaît en fondu.
    body.classList.remove('booting', 'crt-on', 'intro-bg');
    document.querySelectorAll('.crt-line, .crt-edge, .standby, .swarm-intro').forEach((d) => d.remove());
    this.noteActivity();
    const el = this.screenEl;
    if (this.current !== 'menu' || !el?.classList.contains('intro')) {
      if (!this.current) this.showMenu();
      this.app.introDone();
      return;
    }
    const brand = el.querySelector<HTMLElement>('.brand')!;
    const first = brand.getBoundingClientRect();
    el.classList.remove('intro');
    el.classList.add('intro-out');
    // Le logo glisse du centre jusqu'à sa place (FLIP : on part de l'ancienne position).
    const last = brand.getBoundingClientRect();
    const dy = first.top + first.height / 2 - (last.top + last.height / 2);
    const sc = first.width / last.width;
    brand.animate([{ transform: `translateY(${dy}px) scale(${sc})` }, { transform: 'none' }], {
      duration: 650,
      easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
    });
    this.home(el.querySelector<HTMLButtonElement>('.nav.primary'));
    this.app.introDone();
  }

  // ---------- Mode démo (inactivité sur le menu) ----------
  get attractActive(): boolean {
    return this.attract;
  }

  noteActivity(): void {
    this.lastActivity = performance.now();
  }

  /** Appelé à chaque image sur le menu : passé un moment sans rien toucher, la démo prend tout l'écran. */
  idleTick(now: number): void {
    if (this.attract || this.intro || this.current !== 'menu' || reducedMotion()) return;
    if (now - this.lastActivity < ATTRACT_MS) return;
    this.attract = true;
    (document.activeElement as HTMLElement | null)?.blur();
    const hud = document.createElement('div');
    hud.className = 'attract-hud';
    hud.innerHTML = '<p class="attract-tag">Démo · appuie sur une touche</p>';
    document.body.appendChild(hud);
    document.body.classList.add('attract');
  }

  exitAttract(): void {
    if (!this.attract) return;
    this.attract = false;
    this.noteActivity();
    document.body.classList.remove('attract');
    document.querySelector('.attract-hud')?.remove();
    this.home(this.screenEl?.querySelector<HTMLButtonElement>('.nav.primary'));
  }

  // ---------- Choix de la difficulté ----------
  /**
   * Une carte par difficulté : niveau de menace, description, jauges comparées (résistance, dégâts,
   * nombre, rythme d'arrivée des nouveaux types) et le record de la difficulté s'il existe.
   */
  showDifficulty(): void {
    const save = this.app.save;
    // Jauges sur 5 crans, relatives à la difficulté la plus dure de chaque critère.
    const crit: [string, (d: (typeof DIFFICULTIES)[number]) => number, string][] = [
      ['Résistance', (d) => d.hp, 'PV des ennemis'],
      ['Dégâts', (d) => d.dmg, 'Dégâts que tu reçois'],
      ['Nombre', (d) => d.rate, 'Quantité d’ennemis'],
      ['Rythme', (d) => 1 / d.pace, 'Vitesse d’arrivée des nouveaux types'],
    ];
    const meter = (d: (typeof DIFFICULTIES)[number], [label, f, hint]: (typeof crit)[number]) => {
      const max = Math.max(...DIFFICULTIES.map(f));
      const n = Math.max(1, Math.round((f(d) / max) * 5));
      return `<span class="meter" title="${esc(hint)} : ×${dec(f(d))}"><span>${label}</span><span class="segs">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span></span>`;
    };
    const cards = DIFFICULTIES.map((d, i) => {
      const best = topScores(save, i)[0];
      const record = best
        ? `<small>Record</small><b>${pad7(best.score)}</b><em>${formatTime(best.tempsSurvecu)} · niv. ${best.level || '—'} · ${num(best.kills)} éliminés</em>`
        : '<small>Record</small><em>Aucun record</em>';
      return `<button class="diff nav ${i === save.difficulty ? 'primary' : ''}" data-d="${i}" style="--c:${d.color};--i:${i}">
        <span class="diff-top">
          <span class="threat">${DIFFICULTIES.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</span>
        </span>
        <span class="diff-name">${esc(d.name)}</span>
        <span class="diff-desc">${esc(d.desc)}</span>
        <span class="meters">${crit.map((c) => meter(d, c)).join('')}</span>
        <span class="diff-record">${record}</span>
      </button>`;
    }).join('');
    const el = this.mount(
      'difficulty',
      `
      <header class="head"><h2>Difficulté</h2><p class="sub">Change la résistance des ennemis et la vitesse à laquelle les nouveaux types arrivent.</p></header>
      <div class="diffs">${cards}</div>
      <p class="foot">← → : choisir · Entrée : jouer · Échap : retour</p>
      <footer class="actions"><button class="btn nav" id="back">Retour</button></footer>
    `,
    );
    el.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => b.addEventListener('click', () => this.app.play(Number(b.dataset.d))));
    el.querySelector('#back')!.addEventListener('click', () => this.showMenu());
  }

  // ---------- Sandbox ----------
  /**
   * Partie libre pour tester : réglages à gauche (mêmes contrôles que les Options), équipement de
   * départ à droite (chaque tuile monte d'un niveau par clic). Rien n'est enregistré dans les records.
   */
  showSandbox(): void {
    const rowsHtml = SANDBOX_UI.map(
      (g) =>
        `<h3>${g.title}</h3>${g.items
          .map(
            (it) =>
              `<button class="set nav" data-sb="${it.key}" data-kind="${it.kind}"><span class="set-label">${esc(it.label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</span><span class="ctl"></span></button>`,
          )
          .join('')}`,
    ).join('');
    const foes = SANDBOX_FOES.map(
      (e) =>
        `<button class="tile foe nav" data-foe="${e.id}" style="--c:${e.color}" title="${esc(e.name)}"><span class="ico" data-icon="enemy:${e.id}" data-size="34"></span><span class="nm">${esc(e.name)}</span></button>`,
    ).join('');
    const kit = (kind: 'w' | 'p', id: string, name: string, color: string, icon: string) =>
      `<button class="tile kit nav" data-kit="${kind}:${id}" style="--c:${color}" title="${esc(name)}"><span class="ico" data-icon="${icon}" data-size="40"></span><span class="nm">${esc(name)}</span><span class="lv"></span></button>`;
    const el = this.mount(
      'sandbox',
      `
      <header class="head"><h2>Sandbox</h2><p class="sub">Compose ta partie et teste ce que tu veux. Rien n’est enregistré dans les records.</p></header>
      <div class="sandbox-grid">
        <div class="panel form">${rowsHtml}<div class="tiles foes">${foes}</div></div>
        <div class="panel loadout">
          <h3>Armes <small class="slots" data-slots="w"></small></h3>
          <div class="tiles">${BASE_WEAPONS.map((w) => kit('w', w.id, w.name, w.color, `weapon:${w.id}`)).join('')}</div>
          <h3>Fusions</h3>
          <div class="tiles">${FUSED_WEAPONS.map((w) => kit('w', w.id, w.name, w.color, `weapon:${w.id}`)).join('')}</div>
          <h3>Passifs <small class="slots" data-slots="p"></small></h3>
          <div class="tiles">${PASSIVES.map((x) => kit('p', x.id, x.name, x.color, `passive:${x.id}`)).join('')}</div>
        </div>
      </div>
      <p class="foot">← → : régler · Clic : niveau suivant · Clic droit : niveau précédent · Échap : retour</p>
      <footer class="actions">
        <button class="btn nav primary go" id="start">Lancer</button>
        <button class="btn nav" id="reset">Réinitialiser</button>
        <button class="btn nav" id="back">Retour</button>
      </footer>
    `,
    );
    paintIcons(el, 40);
    el.querySelectorAll<HTMLButtonElement>('.set').forEach((row) =>
      row.addEventListener('click', (e) => this.stepSandbox(row, (e.target as HTMLElement).closest('.arrow.prev') ? -1 : 1)),
    );
    el.querySelectorAll<HTMLButtonElement>('.kit').forEach((t) => {
      t.addEventListener('click', () => this.stepKit(t, 1));
      t.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.stepKit(t, -1);
        this.app.uiSound('ui');
      });
    });
    el.querySelectorAll<HTMLButtonElement>('.foe').forEach((t) => t.addEventListener('click', () => this.toggleFoe(t)));
    el.querySelector('#start')!.addEventListener('click', () => this.app.playSandbox(this.app.save.sandbox));
    el.querySelector('#reset')!.addEventListener('click', () => {
      this.app.save.sandbox = defaultSandbox();
      this.paintSandbox();
    });
    el.querySelector('#back')!.addEventListener('click', () => this.showMenu());
    this.paintSandbox();
  }

  private sandboxValue(key: SandboxKey): SandboxValue {
    const sb = this.app.save.sandbox;
    if (key === 'difficulty') return sb.difficulty;
    if (key === 'custom') return sb.rules.enemies !== null;
    return sb.rules[key];
  }

  /** Gauche / droite (ou clic) sur une ligne : choix suivant / précédent, interrupteur inversé. */
  private stepSandbox(row: HTMLElement, delta: number): void {
    const def = sandboxDef(row);
    const sb = this.app.save.sandbox;
    const cur = this.sandboxValue(def.key);
    let v: SandboxValue;
    if (def.kind === 'toggle') v = !cur;
    else {
      // Valeur inconnue (vieille sauvegarde) : on repart du premier choix.
      const opts = def.options;
      const i = opts.findIndex(([o]) => o === cur);
      v = opts[i < 0 ? 0 : (i + delta + opts.length) % opts.length][0];
    }
    if (def.key === 'difficulty') sb.difficulty = v as number;
    // « Sur mesure » part de tous les types : il n'y a plus qu'à retirer ceux dont on ne veut pas.
    else if (def.key === 'custom') sb.rules.enemies = v ? SANDBOX_FOES.map((e) => e.id) : null;
    else (sb.rules as unknown as Record<string, SandboxValue>)[def.key] = v;
    this.paintSandbox();
  }

  /** Tuile d'équipement : niveau suivant (ou précédent), retour à « absent » après le niveau max. */
  private stepKit(tile: HTMLElement, delta: number): void {
    const r = this.app.save.sandbox.rules;
    const [kind, id] = tile.dataset.kit!.split(':');
    const list = kind === 'w' ? r.weapons : r.passives;
    const max = kind === 'w' ? ALL_WEAPONS.find((w) => w.id === id)!.levels.length : 5;
    const cap = kind === 'w' ? MAX_WEAPON_SLOTS : MAX_PASSIVE_SLOTS;
    const cur = list.find((x) => x.id === id);
    const next = ((cur?.level ?? 0) + delta + max + 1) % (max + 1);
    if (!cur && next > 0 && list.length >= cap) {
      // Emplacements pleins : le compteur clignote, rien ne change.
      const slots = this.screenEl?.querySelector<HTMLElement>(`[data-slots="${kind}"]`);
      slots?.classList.remove('full');
      void slots?.offsetWidth;
      slots?.classList.add('full');
      return;
    }
    if (cur && next === 0) list.splice(list.indexOf(cur), 1);
    else if (cur) cur.level = next;
    else list.push({ id, level: next });
    this.paintSandbox();
  }

  private toggleFoe(tile: HTMLElement): void {
    const r = this.app.save.sandbox.rules;
    if (!r.enemies) return;
    const id = tile.dataset.foe!;
    r.enemies = r.enemies.includes(id) ? r.enemies.filter((x) => x !== id) : [...r.enemies, id];
    this.paintSandbox();
  }

  private adjustSandbox(delta: number): boolean {
    const el = document.activeElement as HTMLElement | null;
    if (!el || !this.screenEl?.contains(el)) return false;
    if (el.classList.contains('set')) this.stepSandbox(el, delta);
    else if (el.classList.contains('kit')) this.stepKit(el, delta);
    else if (el.classList.contains('foe')) this.toggleFoe(el);
    else return false;
    this.app.uiSound('uiMove');
    return true;
  }

  /** Redessine toutes les valeurs de l'écran Sandbox à partir des réglages en mémoire. */
  private paintSandbox(): void {
    const el = this.screenEl;
    if (this.current !== 'sandbox' || !el) return;
    const r = this.app.save.sandbox.rules;
    el.querySelectorAll<HTMLElement>('.set').forEach((row) => {
      const def = sandboxDef(row);
      const v = this.sandboxValue(def.key);
      const ctl = row.querySelector<HTMLElement>('.ctl')!;
      if (def.kind === 'toggle') {
        ctl.innerHTML = `<span class="switch"><i></i></span><b class="val">${v ? 'Oui' : 'Non'}</b>`;
        row.classList.toggle('on', !!v);
        row.setAttribute('role', 'switch');
        row.setAttribute('aria-checked', String(!!v));
      } else {
        const label = def.options.find(([o]) => o === v)?.[1] ?? String(v);
        ctl.innerHTML = `<span class="arrow prev">‹</span><b class="val">${esc(label)}</b><span class="arrow next">›</span>`;
      }
    });
    el.querySelector('.foes')!.classList.toggle('off', !r.enemies);
    el.querySelectorAll<HTMLButtonElement>('.foe').forEach((t) => {
      t.disabled = !r.enemies;
      t.classList.toggle('on', !!r.enemies?.includes(t.dataset.foe!));
    });
    el.querySelectorAll<HTMLElement>('.kit').forEach((t) => {
      const [kind, id] = t.dataset.kit!.split(':');
      const it = (kind === 'w' ? r.weapons : r.passives).find((x) => x.id === id);
      const fusion = kind === 'w' && !!ALL_WEAPONS.find((w) => w.id === id)!.fusion;
      t.classList.toggle('on', !!it);
      t.querySelector('.lv')!.textContent = it ? (fusion ? 'Équipée' : `Niv. ${it.level}`) : '—';
    });
    el.querySelector('[data-slots="w"]')!.textContent = `${r.weapons.length}/${MAX_WEAPON_SLOTS}`;
    el.querySelector('[data-slots="p"]')!.textContent = `${r.passives.length}/${MAX_PASSIVE_SLOTS}`;
  }

  // ---------- Records ----------
  /**
   * Hall des records : onglets par difficulté (avec leur record), podium pour les trois premières
   * parties, les meilleures performances sur une ligne, puis la suite du top 10 en liste.
   * Gauche / droite changent de difficulté.
   */
  showScores(difficulty: number): void {
    const save = this.app.save;
    const diff = DIFFICULTIES[difficulty];
    const list = topScores(save, difficulty);
    const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    // Podium : 2e à gauche, 1er au centre, 3e à droite.
    const podium = [1, 0, 2]
      .filter((i) => list[i])
      .map((i) => {
        const r = list[i];
        return `<div class="pod p${i + 1}">
          <span class="medal">${i + 1}</span>
          <b class="pod-score">${pad7(r.score)}</b>
          <span class="pod-meta">${formatTime(r.tempsSurvecu)} · niv. ${r.level || '—'} · ${num(r.kills)} éliminés <span class="pod-date">· ${date(r.date)}</span></span>
          <span class="step"></span>
        </div>`;
      })
      .join('');
    const rows = list
      .slice(3)
      .map(
        (r, i) => `<tr>
          <td class="rank">${i + 4}</td>
          <td class="num score">${pad7(r.score)}</td>
          <td class="num">${formatTime(r.tempsSurvecu)}</td>
          <td class="num">${r.level || '—'}</td>
          <td class="num">${num(r.kills)}</td>
          <td class="date">${date(r.date)}</td>
        </tr>`,
      )
      .join('');
    const tabs = DIFFICULTIES.map((d, i) => {
      const best = bestScore(save, i);
      return `<button class="tab dtab nav ${i === difficulty ? 'on' : ''}" data-d="${i}" style="--c:${d.color}"><span>${esc(d.name)}</span><small>${best ? pad7(best) : '—'}</small></button>`;
    }).join('');
    const top = <K extends 'score' | 'tempsSurvecu' | 'level' | 'kills'>(k: K) => Math.max(...list.map((r) => r[k] || 0));
    const bests = `<div class="stats rec-bests">
        <div><small>Plus longue survie</small><b>${formatTime(top('tempsSurvecu'))}</b></div>
        <div><small>Plus haut niveau</small><b>${top('level') || '—'}</b></div>
        <div><small>Plus d’éliminés</small><b>${num(top('kills'))}</b></div>
      </div>`;
    const body = list.length
      ? `<div class="podium">${podium}</div>
        ${bests}
        ${rows ? `<table class="scores"><thead><tr><th>#</th><th class="num">Score</th><th class="num">Temps</th><th class="num">Niveau</th><th class="num">Éliminés</th><th class="num">Date</th></tr></thead><tbody>${rows}</tbody></table>` : ''}`
      : `<div class="empty-state"><p class="empty">Aucune partie en ${esc(diff.name)} pour l’instant.</p><button class="btn nav tint" id="go">Jouer en ${esc(diff.name)}</button></div>`;
    const el = this.mount(
      'scores',
      `
      <header class="head"><h2>Records</h2><p class="sub">Tes ${TOP_PER_DIFFICULTY} meilleures parties, par difficulté.</p></header>
      <div class="tabs">${tabs}</div>
      <div class="records" style="--c:${diff.color}">${body}</div>
      <p class="foot">← → : difficulté · Échap : retour</p>
      <footer class="actions"><button class="btn nav" id="back">Retour</button></footer>
    `,
    );
    el.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) => b.addEventListener('click', () => this.showScores(Number(b.dataset.d))));
    el.querySelector('#go')?.addEventListener('click', () => this.app.play(difficulty));
    el.querySelector('#back')!.addEventListener('click', () => this.showMenu());
    this.home(el.querySelector<HTMLButtonElement>('.tab.on'));
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
    this.home(el.querySelector<HTMLButtonElement>('.set'));
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

  // ---------- Codex ----------
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
      <header class="head"><h2>Codex</h2></header>
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
        this.home(this.screenEl?.querySelector<HTMLButtonElement>('.cat.on'));
      }),
    );
    el.querySelector('#back')!.addEventListener('click', () => this.codexReturn());
    if (items.length) {
      const i = Math.min(sel, items.length - 1);
      select(i);
      this.home(tiles[i]);
      reveal(tiles[i]);
    } else this.home(el.querySelector<HTMLButtonElement>('.cat.on'));
  }

  /**
   * Codex au clavier / à la manette : haut et bas changent de catégorie, gauche et droite
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
    reveal(next);
    this.app.uiSound('uiMove');
    return true;
  }

  // ---------- Level-up ----------
  showLevelUp(
    level: number,
    offers: Offer[],
    ownedLevels: (o: Offer) => number,
    slots: { weapons: number; passives: number },
    swap: LevelUpSwap,
  ): void {
    const swapping = swap.slot >= 0 ? swap.weapons[swap.slot] : null;
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
        } else if (o.kind === OFFER_SWAP) {
          const d = ALL_WEAPONS[o.id];
          tag = d.fusion ? 'Échange · fusion' : `Échange · niveau ${o.toLevel}`;
          name = d.name;
          line = d.fusion ? d.levelText[0] : d.levelText[Math.max(0, o.toLevel - 1)];
          sub = swapping ? `Remplace ${swapping.name}` : '';
          color = d.color;
          iconId = d.id;
          if (!d.fusion) pips = this.pips(o.toLevel, 5);
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
        return `<button class="card offer pick ${o.kind === OFFER_FUSION ? 'fusion' : ''}" data-i="${i}" data-offer="${i}" style="--c:${color}">
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
    let n = offers.length;
    let bar = '';
    if (swapping) {
      bar = `<div class="swapbar"><button class="swap-cancel pick" data-i="${n++}">Annuler l’échange</button></div>`;
    } else if (swap.weapons.length > 0) {
      const btns = swap.weapons
        .map((w, k) => {
          const ok = swap.charges > 0 && w.can;
          return `<button class="swap-btn ${ok ? 'pick' : ''}" ${ok ? `data-i="${n++}"` : 'disabled'} data-slot="${k}" style="--c:${w.color}" title="${esc(w.name)}">
            <span class="icon" data-kind="weapon" data-id="${w.id}"></span></button>`;
        })
        .join('');
      const label =
        swap.charges > 0
          ? `Échanger une arme · <b>${swap.charges}</b> charge${swap.charges > 1 ? 's' : ''}`
          : 'Échanger une arme · bats un boss pour gagner une charge';
      bar = `<div class="swapbar ${swap.charges > 0 ? '' : 'empty'}"><span class="swap-label">${label}</span>${btns}</div>`;
    }
    const head = swapping
      ? `<h2>Échanger ${esc(swapping.name)}</h2><p class="sub">Choisis l’arme qui la remplace, au même niveau</p>`
      : `<h2>Niveau ${level}</h2><p class="sub">Choisis une amélioration : <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>, flèches + <kbd>Entrée</kbd> ou clic</p>`;
    const el = this.mount('levelup', `<header class="head">${head}</header><div class="cards">${cards}</div>${bar}`, true);
    el.querySelectorAll<HTMLElement>('.icon').forEach((s) => {
      const px = s.closest('.swap-btn') ? 34 : 60;
      if (s.dataset.id) s.appendChild(iconCanvas(s.dataset.kind as 'weapon' | 'passive' | 'pickup', s.dataset.id, px));
    });
    el.querySelectorAll<HTMLButtonElement>('.card').forEach((b) => {
      b.addEventListener('click', () => this.app.pickOffer(Number(b.dataset.offer)));
    });
    el.querySelectorAll<HTMLButtonElement>('.swap-btn.pick').forEach((b) => {
      b.addEventListener('click', () => this.app.startSwap(Number(b.dataset.slot)));
    });
    el.querySelector<HTMLButtonElement>('.swap-cancel')?.addEventListener('click', () => this.app.cancelSwap());
    this.levelCount = n;
    this.levelOpenedAt = performance.now();
    if (this.kbd) this.focusCard(0);
    else this.syncPointer(document.elementFromPoint(this.pointer.x, this.pointer.y));
  }

  private pips(level: number, max: number): string {
    let h = '<span class="pips">';
    for (let k = 1; k <= max; k++) h += `<i class="${k < level ? 'on' : k === level ? 'new' : ''}"></i>`;
    return `${h}</span>`;
  }

  /** Carte sélectionnée au level-up (-1 : aucune, la souris est ailleurs). */
  focusCard(i: number): void {
    if (this.current !== 'levelup') return;
    this.levelFocus = i < 0 ? -1 : (i + this.levelCount) % this.levelCount;
    this.screenEl?.querySelectorAll<HTMLElement>('.pick').forEach((c, k) => c.classList.toggle('focus', k === this.levelFocus));
  }
  moveCard(d: number): void {
    this.setKbd(true);
    this.app.uiSound('uiMove');
    this.focusCard(this.levelFocus < 0 ? 0 : this.levelFocus + d);
  }
  confirmCard(): void {
    this.setKbd(true);
    if (this.current !== 'levelup') return;
    // Rien de sélectionné : la touche fait d'abord apparaître la sélection.
    if (this.levelFocus < 0) {
      this.app.uiSound('uiMove');
      this.focusCard(0);
      return;
    }
    // Garde-fou : une touche tenue au moment où l'écran s'ouvre ne choisit pas à la place du joueur.
    if (performance.now() - this.levelOpenedAt <= 350) return;
    this.screenEl?.querySelectorAll<HTMLButtonElement>('.pick')[this.levelFocus]?.click();
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
        <button class="btn nav" id="codex">Codex</button>
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
    const record = !d.isReplay && !d.sandbox && d.rank === 1;
    const variant = d.isReplay ? 'replay' : d.sandbox ? 'sandbox' : record ? 'record' : '';
    const badge = d.isReplay || record
      ? ''
      : d.sandbox
        ? '<span class="badge">Sandbox · non classé</span>'
      : d.rank > 0
        ? `<span class="badge">${d.rank}<sup>e</sup> meilleure partie</span>`
        : `<span class="badge">Record à battre : <b>${pad7(d.bestBefore)}</b></span>`;
    const reveal = (i: number) => `reveal" style="--i:${i}`;
    const el = this.mount(
      'death',
      `
      <div class="banner ${variant}">
        <div class="banner-band"></div>
        <div class="banner-content">
          <h2 class="go">${d.isReplay ? 'Relecture terminée' : d.sandbox && d.survived ? 'Fin du test' : 'Game over'}</h2>
          <div class="go-score"><small>Score · ${d.sandbox ? 'Sandbox · ' : ''}<span style="color:${diff.color}">${esc(diff.name)}</span></small><b id="count">${pad7(0)}</b></div>
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
      <div class="build final-build ${reveal(3)}"><h3>Équipement final</h3>${this.buildHtml(d.build, false)}</div>
      <footer class="actions ${reveal(4)}">
        <button class="btn nav primary" id="retry">Rejouer</button>
        ${d.sandbox ? '<button class="btn nav" id="edit">Modifier</button>' : ''}
        ${d.canReplay ? '<button class="btn nav" id="watch">Revoir la partie</button>' : ''}
        <button class="btn nav" id="menu">Menu</button>
      </footer>
    `,
      true,
    );
    this.fillIcons(el, 32);
    el.querySelector('#retry')!.addEventListener('click', () => this.app.retry());
    el.querySelector('#edit')?.addEventListener('click', () => this.app.toMenu('sandbox'));
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
