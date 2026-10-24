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

// ---------- Shared screen template ----------
/** Each screen's color: its title and the rule under it, nothing else. */
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
 * Screen header: a neon title in the screen's color, underlined by a rule stretching out from the
 * center; `sub` (HTML) below. The rest of the screen follows in a cascade (.reveal).
 */
export function heading(title: string, color: string, sub = ''): string {
  return `<header class="head" style="--c:${color}"><div class="ttl"><h2>${esc(title)}</h2><span class="line"></span></div>${sub ? `<p class="sub">${sub}</p>` : ''}</header>`;
}

/** Class + delay of an element in the entrance cascade (to put in a class attribute). */
export const cascade = (i: number) => `reveal" style="--i:${i}`;

/** "Label / value" figures separated by rules, as on the end-of-run screen. `v` is HTML. */
export function statTiles(list: [string, string][], cls = ''): string {
  return `<div class="stats ${cls}">${list.map(([k, v]) => `<div><small>${esc(k)}</small><b>${v}</b></div>`).join('')}</div>`;
}

/** Key hints, as keyboard keys: [[keys], action]. */
export function keys(list: [string[], string][]): string {
  return `<p class="foot keys">${list.map(([k, a]) => `<span>${k.map((x) => `<kbd>${esc(x)}</kbd>`).join('')} ${esc(a)}</span>`).join('')}</p>`;
}

/** Level gauge (pips); `fresh`: the last one, the one about to be gained, in white (level-up). */
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
 * Scrolls the first scrollable ancestor vertically to show `el`. Never scrolls horizontally:
 * `scrollIntoView` would shift #ui sideways while a screen slides in.
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
