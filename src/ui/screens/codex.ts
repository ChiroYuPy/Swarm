/**
 * Codex screen: category tabs, the item grid and the detail sheet of the selected item, plus its
 * keyboard / gamepad navigation. The content itself comes from codex-data.ts.
 */
import { BASE_WEAPONS } from '../../data/weapons';
import { PASSIVES } from '../../data/passives';
import { FUSIONS } from '../../data/fusions';
import { codexDetail, codexItems, codexRules, type CodexTab } from '../codex-data';
import { SCREEN_COLOR, cascade, esc, heading, keys, paintIcons, reveal } from '../html';
import type { NavDir } from '../types';
import type { UI } from '../ui';

// ---------- Codex ----------
/** Catégories : à gauche. Grille d'icônes au centre. Fiche détaillée de l'élément sélectionné à droite. */
export function showCodex(ui: UI, tab: CodexTab, sel = 0, onBack?: () => void): void {
  if (onBack) {
    ui.codexReturn = onBack;
    ui.codexOverlay = ui.current === 'pause';
  }
  ui.codexTab = tab;
  const cats: [CodexTab, string, number, string][] = [
    ['rules', 'Comment jouer', 0, '#f2eaff'],
    ['weapons', 'Armes', BASE_WEAPONS.length, '#38f6ff'],
    ['evolutions', 'Évolutions', FUSIONS.length, '#ffd23a'],
    ['passives', 'Passifs', PASSIVES.length, '#39ff7a'],
    ['items', 'Objets', codexItems('items').length, '#ff9b3d'],
    ['enemies', 'Ennemis', codexItems('enemies').length, '#ff3d6e'],
  ];
  // Onglets soulignés, comme les records : la catégorie ouverte prend sa couleur.
  const side = cats
    .map(
      ([id, label, n, c]) =>
        `<button class="tab dtab cat nav ${id === tab ? 'on' : ''}" data-tab="${id}" style="--c:${c}"><span>${label}</span><small>${n || '—'}</small></button>`,
    )
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
        center += `<h3 class="rule">${esc(group)}</h3><div class="tiles">`;
      } else if (i === 0) center += '<div class="tiles">';
      center += `<button class="tile nav" data-i="${i}" style="--c:${it.color}" title="${esc(it.name)}"><span class="ico" data-icon="${it.icon}"></span><span class="nm">${esc(it.name)}</span></button>`;
    }
    center += '</div>';
  }
  const el = ui.mount(
    'codex',
    `
    ${heading('Codex', SCREEN_COLOR.codex)}
    <nav class="tabs cats ${cascade(1)}">${side}</nav>
    <div class="codex ${items.length ? '' : 'solo'} ${cascade(2)}">
      ${items.length ? `<div class="panel list">${center}</div>` : ''}
      <article class="panel detail">${items.length ? '' : codexRules()}</article>
    </div>
    ${keys([[['↑', '↓'], 'catégorie'], [['←', '→'], 'élément'], [['Échap'], 'retour']])}
    <footer class="actions ${cascade(3)}"><button class="btn nav" id="back">Retour</button></footer>
  `,
    ui.codexOverlay,
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
        ui.showCodex(t as CodexTab, Math.max(0, idx));
      }),
    );
  };
  tiles.forEach((t) => t.addEventListener('focus', () => select(Number(t.dataset.i))));
  el.querySelectorAll<HTMLButtonElement>('.cat').forEach((b) =>
    b.addEventListener('click', () => {
      ui.showCodex(b.dataset.tab as CodexTab);
      ui.home(ui.screenEl?.querySelector<HTMLButtonElement>('.cat.on'));
    }),
  );
  el.querySelector('#back')!.addEventListener('click', () => ui.codexReturn());
  if (items.length) {
    const i = Math.min(sel, items.length - 1);
    select(i);
    ui.home(tiles[i]);
    reveal(tiles[i]);
  } else ui.home(el.querySelector<HTMLButtonElement>('.cat.on'));
}

/**
 * Codex au clavier / à la manette : haut et bas changent de catégorie, gauche et droite
 * changent d'élément. Les deux bouclent.
 */
export function codexNav(ui: UI, dir: NavDir): boolean {
  if (!ui.screenEl) return false;
  const cats = [...ui.screenEl.querySelectorAll<HTMLButtonElement>('.cat')].map((b) => b.dataset.tab as CodexTab);
  if (dir === 'up' || dir === 'down') {
    const i = cats.indexOf(ui.codexTab);
    ui.showCodex(cats[(i + (dir === 'up' ? -1 : 1) + cats.length) % cats.length]);
    ui.app.uiSound('uiMove');
    return true;
  }
  const tiles = [...ui.screenEl.querySelectorAll<HTMLButtonElement>('.tile')];
  if (!tiles.length) return true;
  let i = tiles.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) i = Math.max(0, tiles.findIndex((t) => t.classList.contains('on')));
  const next = tiles[(i + (dir === 'left' ? -1 : 1) + tiles.length) % tiles.length];
  next.focus({ preventScroll: true });
  reveal(next);
  ui.app.uiSound('uiMove');
  return true;
}
