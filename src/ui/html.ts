/**
 * Shared HTML builders and small DOM helpers used by every screen: escaping and number formatting,
 * the common screen template pieces (neon heading, cascade, stat tiles, key hints, level pips, rows),
 * icon painting, vertical reveal of a focused element and the reduced-motion check.
 */
import { iconCanvas } from '../render/icons';
import { enemyPreview } from '../render/sprites';
import { intlTag } from '../i18n';

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** Integer with the locale's digit grouping. */
export const num = (n: number) => n.toLocaleString(intlTag());

export function rows(list: [string, string][]): string {
  return `<dl class="rows">${list.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

// ---------- Gabarit commun des écrans ----------
/** Couleur de chaque écran : son titre et le filet dessous, rien d'autre. */
export const SCREEN_COLOR = {
  pause: '#38f6ff',
  codex: '#ff3df5',
  scores: '#ffd23a',
  settings: '#6fa8ff',
  sandbox: '#b48cff',
  difficulty: '#38f6ff',
  levelup: '#39ff7a',
  swap: '#ffd23a',
};

/**
 * En-tête d'écran : un titre néon à la couleur de l'écran, souligné d'un filet qui s'étire depuis le
 * centre ; `sub` (HTML) dessous. Le reste de l'écran suit en cascade (.reveal).
 */
export function heading(title: string, color: string, sub = ''): string {
  return `<header class="head" style="--c:${color}"><div class="ttl"><h2>${esc(title)}</h2><span class="line"></span></div>${sub ? `<p class="sub">${sub}</p>` : ''}</header>`;
}

/** Classe + délai d'un élément de la cascade d'arrivée (à poser dans un attribut class). */
export const cascade = (i: number) => `reveal" style="--i:${i}`;

/** Chiffres « libellé / valeur » séparés par des filets, comme à la fin de partie. `v` est du HTML. */
export function statTiles(list: [string, string][], cls = ''): string {
  return `<div class="stats ${cls}">${list.map(([k, v]) => `<div><small>${esc(k)}</small><b>${v}</b></div>`).join('')}</div>`;
}

/** Rappel des touches, en touches de clavier : [[touches], action]. */
export function keys(list: [string[], string][]): string {
  return `<p class="foot keys">${list.map(([k, a]) => `<span>${k.map((x) => `<kbd>${esc(x)}</kbd>`).join('')} ${esc(a)}</span>`).join('')}</p>`;
}

/** Jauge de niveau (pastilles) ; `fresh` : la dernière, celle qu'on va gagner, en blanc (level-up). */
export function levelPips(level: number, max: number, fresh = false): string {
  let h = '<span class="pips">';
  for (let k = 1; k <= max; k++) h += `<i class="${k < level || (k === level && !fresh) ? 'on' : k === level ? 'new' : ''}"></i>`;
  return `${h}</span>`;
}

export function paintIcons(root: HTMLElement, size: number): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((s) => {
    if (s.firstChild) return;
    const [kind, id] = s.dataset.icon!.split(':');
    const px = Number(s.dataset.size ?? size);
    s.appendChild(kind === 'enemy' ? enemyPreview(id, px) : iconCanvas(kind as 'weapon' | 'passive' | 'pickup', id, px));
  });
}

export function fillIcons(el: HTMLElement, size: number): void {
  el.querySelectorAll<HTMLElement>('.icon[data-id]').forEach((s) => s.appendChild(iconCanvas(s.dataset.kind as 'weapon' | 'passive', s.dataset.id!, size)));
}

/**
 * Fait défiler verticalement le premier conteneur défilant pour montrer `el`. Jamais de défilement
 * horizontal : `scrollIntoView` décalerait #ui de côté pendant qu'un écran arrive en glissant.
 */
export function reveal(el: HTMLElement): void {
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

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
