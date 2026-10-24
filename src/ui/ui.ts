/**
 * The UI class: mounts DOM screens into #ui with their enter / leave transitions, tracks whether the
 * mouse or the keyboard / gamepad drives the selection, moves that selection, and shows toasts. Each
 * screen is a function in ./screens taking the UI instance (its state below without `private` is
 * shared with them); the public methods main.ts calls delegate to those. Shared HTML helpers are in
 * html.ts, codex content in codex-data.ts, data shapes in types.ts (re-exported here).
 *
 * Écrans DOM. Tous suivent le gabarit de la fin de partie : un titre néon souligné (heading), du
 * contenu à nu séparé par des filets, des chiffres « libellé / valeur » (statTiles), des onglets
 * soulignés, le rappel des touches (keys) et une arrivée en cascade (cascade). Voir style.css.
 */
import { DIFFICULTIES } from '../data/difficulty';
import { initCursor } from './cursor';
import type { CodexTab } from './codex-data';
import { reducedMotion, reveal } from './html';
import type { AppApi, BuildInfo, DeathInfo, LevelUpSwap, NavDir, RunInfo } from './types';
import type { Offer } from '../sim';
import * as screens from './screens';

export type { AppApi, BuildInfo, DeathInfo, LevelUpSwap, NavDir, RunInfo } from './types';
export { passiveTotal } from './describe';

/** Écrans à onglets : changer d'onglet redessine l'écran sans transition d'écran. */
const TAB_SCREENS = new Set(['codex', 'scores']);
/** Profondeur de navigation : aller plus profond glisse vers la gauche, revenir glisse vers la droite. */
const DEPTH: Record<string, number> = { difficulty: 1, sandbox: 1, codex: 1, scores: 1, settings: 1 };
const depth = (name: string) => DEPTH[name] ?? 0;
/** Durée de sortie de chaque écran (ms), alignée sur style.css. */
const LEAVE_MS: Record<string, number> = { default: 460, death: 560 };

/** Son joué au clic d'un bouton : « retour » pour revenir, rien pour lancer une partie (elle a le sien). */
function clickSound(b: HTMLButtonElement): 'ui' | 'uiBack' | null {
  if (b.id === 'back' || b.id === 'menu') return 'uiBack';
  if (b.id === 'start' || b.id === 'go' || b.id === 'retry' || b.matches('.diff[data-d]')) return null;
  return 'ui';
}

export class UI {
  private readonly root: HTMLElement;
  private readonly toasts: HTMLElement;
  current = '';
  levelFocus = 0;
  levelCount = 0;
  settingsReturn: () => void = () => {};
  codexReturn: () => void = () => this.showMenu();
  /** codex ouvert depuis la pause : affiché par-dessus la partie */
  codexOverlay = false;
  codexTab: CodexTab = 'armes';
  countAnim = 0;
  levelOpenedAt = 0;
  /** écran affiché (ceux qui sortent restent un instant dans #ui, inertes) */
  screenEl: HTMLElement | null = null;
  private closeTimer = 0;
  /** intro en cours : en veille, la prochaine touche allume l'écran ; ensuite, elle passe l'intro */
  intro: { stage: 'standby' | 'on'; ready: Promise<unknown>; timers: number[]; stop: () => void } | null = null;
  /** mode démo (inactivité sur le menu) */
  attract = false;
  lastActivity = performance.now();
  /**
   * Qui pilote la sélection : la souris (est sélectionné ce qui est sous le pointeur, rien sinon) ou
   * le clavier / la manette (le pointeur est ignoré tant qu'il ne bouge pas vraiment).
   */
  kbd = false;
  /** Point de départ du clavier quand rien n'est sélectionné : dernier bouton sélectionné de l'écran. */
  private navHome: HTMLElement | null = null;
  pointer = { x: -1, y: -1 };

  constructor(readonly app: AppApi) {
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

  setKbd(on: boolean): void {
    this.kbd = on;
    document.body.classList.toggle('kbd', on);
  }

  /** Souris aux commandes : est sélectionné le bouton sous le pointeur, et rien s'il n'y en a pas. */
  syncPointer(target: EventTarget | null): void {
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
  home(b: HTMLElement | null | undefined): void {
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
   * `instant` : l'écran est posé d'emblée, sans aucune animation (pause automatique : la page est en
   * arrière-plan, le navigateur retiendrait les animations jusqu'au retour du joueur).
   */
  mount(name: string, html: string, overlay = false, instant = false): HTMLElement {
    cancelAnimationFrame(this.countAnim);
    clearTimeout(this.closeTimer);
    const prev = this.screenEl;
    const prevName = this.current;
    this.current = name;
    this.toasts.replaceChildren(); // les messages de jeu ne doivent pas traîner sur un écran
    this.root.className = `visible ${overlay ? 'overlay' : 'menu'} on-${name}${instant ? ' instant' : ''}`;
    document.body.classList.toggle('menu-home', name === 'menu');
    const el = document.createElement('div');
    el.className = `screen screen-${name}`;
    el.innerHTML = html;
    if (instant) {
      prev?.remove();
      el.classList.add('instant');
      this.root.appendChild(el);
    } else if (prev && prevName === name && TAB_SCREENS.has(name)) {
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
    el.classList.remove('enter-fwd', 'enter-back', 'enter-none', 'same', 'instant');
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
    this.root.classList.remove('visible', 'instant');
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
    if (this.current === 'codex' && screens.codexNav(this, dir)) return;
    if (this.current === 'scores' && (dir === 'left' || dir === 'right')) {
      // Records : gauche / droite passent d'une difficulté à l'autre (en boucle).
      const cur = Number(this.screenEl?.querySelector<HTMLElement>('.tab.on')?.dataset.d ?? 0);
      const n = DIFFICULTIES.length;
      this.showScores((cur + (dir === 'left' ? -1 : 1) + n) % n);
      this.app.uiSound('uiMove');
      return;
    }
    if (this.current === 'settings' && (dir === 'left' || dir === 'right') && screens.adjustSetting(this, dir === 'left' ? -1 : 1)) return;
    if (this.current === 'sandbox' && (dir === 'left' || dir === 'right') && screens.adjustSandbox(this, dir === 'left' ? -1 : 1)) return;
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
    if (row) screens.paintSetting(this, row);
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

  // ---------- Screens (see ./screens) ----------
  showMenu(): void {
    screens.showMenu(this);
  }

  get introActive(): boolean {
    return this.intro !== null;
  }

  showIntro(): void {
    screens.showIntro(this);
  }

  introInput(): void {
    screens.introInput(this);
  }

  finishIntro(): void {
    screens.finishIntro(this);
  }

  get attractActive(): boolean {
    return this.attract;
  }

  noteActivity(): void {
    this.lastActivity = performance.now();
  }

  idleTick(now: number): void {
    screens.idleTick(this, now);
  }

  exitAttract(): void {
    screens.exitAttract(this);
  }

  showDifficulty(): void {
    screens.showDifficulty(this);
  }

  showSandbox(): void {
    screens.showSandbox(this);
  }

  showScores(difficulty: number): void {
    screens.showScores(this, difficulty);
  }

  showSettings(onBack: () => void): void {
    screens.showSettings(this, onBack);
  }

  showCodex(tab: CodexTab, sel = 0, onBack?: () => void): void {
    screens.showCodex(this, tab, sel, onBack);
  }

  showLevelUp(level: number, offers: Offer[], ownedLevels: (o: Offer) => number, slots: { weapons: number; passives: number }, swap: LevelUpSwap): void {
    screens.showLevelUp(this, level, offers, ownedLevels, slots, swap);
  }

  focusCard(i: number): void {
    screens.focusCard(this, i);
  }

  moveCard(d: number): void {
    screens.moveCard(this, d);
  }

  confirmCard(): void {
    screens.confirmCard(this);
  }

  showPause(build: BuildInfo, run: RunInfo, instant = false): void {
    screens.showPause(this, build, run, instant);
  }

  showDeath(d: DeathInfo): void {
    screens.showDeath(this, d);
  }
}
