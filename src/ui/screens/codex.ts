/**
 * Codex screen: one tab per part of the game (entities, items, weapons, passives), the item grid and the
 * sheet of the selected item: its header and, for weapons and passives, a level picker (a weapon's
 * evolution is its last level) always on top, the live preview under it, then the details. An item is
 * selected by clicking it or with the keyboard / gamepad, never by hovering; a newly selected item shows
 * its level 1. The content itself comes from codex-data.ts.
 */
import { CODEX_TABS, codexDetail, codexItems, previewSubject, type CodexTab } from '../codex-data';
import { codexPreview } from '../codex-preview';
import { SCREEN_COLOR, cascade, esc, heading, keys, paintIcons, reveal } from '../html';
import { t } from '../../i18n';
import type { NavDir } from '../types';
import type { UI } from '../ui';

const TAB_COLOR: Record<CodexTab, string> = {
  entities: '#ff3d6e',
  weapons: '#38f6ff',
  items: '#ff9b3d',
  passives: '#39ff7a',
};

/** Selected item of each tab, kept while the codex is open. */
const picked: Record<CodexTab, number> = { entities: 0, items: 0, weapons: 0, passives: 0 };

// ---------- Codex ----------
/** Tabs on top; icon grid on the left; the selected item's sheet (preview first) on the right. */
export function showCodex(ui: UI, tab: CodexTab, sel = picked[tab], onBack?: () => void): void {
  if (onBack) {
    ui.codexReturn = onBack;
    ui.codexOverlay = ui.current === 'pause';
  }
  ui.codexTab = tab;
  const tabs = CODEX_TABS.map(
    (id) =>
      `<button class="tab dtab cat nav ${id === tab ? 'on' : ''}" data-tab="${id}" style="--c:${TAB_COLOR[id]}"><span>${t(`codex.tabs.${id}`)}</span><small>${codexItems(id).length}</small></button>`,
  ).join('');
  const items = codexItems(tab);
  let grid = '';
  let group = '';
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if ((it.group ?? '') !== group || i === 0) {
      if (i) grid += '</div>';
      group = it.group ?? '';
      grid += `${group ? `<h3 class="rule">${esc(group)}</h3>` : ''}<div class="tiles">`;
    }
    grid += `<button class="tile nav" data-i="${i}" style="--c:${it.color}" title="${esc(it.name)}"><span class="ico" data-icon="${it.icon}"></span><span class="nm">${esc(it.name)}</span></button>`;
  }
  grid += '</div>';
  const el = ui.mount(
    'codex',
    `
    ${heading(t('codex.title'), SCREEN_COLOR.codex)}
    <nav class="tabs cats ${cascade(1)}">${tabs}</nav>
    <div class="codex ${cascade(2)}">
      <div class="panel list">${grid}</div>
      <article class="panel detail"><div class="top"></div><div class="pv"></div><div class="sheet"></div></article>
    </div>
    ${keys([[['↑', '↓'], t('hints.category')], [['←', '→'], t('hints.item')], [[t('keys.enter')], t('hints.nextLevel')], [[t('keys.esc')], t('hints.back')]])}
    <footer class="actions ${cascade(3)}"><button class="btn nav" id="back">${t('common.back')}</button></footer>
  `,
    ui.codexOverlay,
  );
  paintIcons(el, 52);
  const top = el.querySelector<HTMLElement>('.top')!;
  const sheet = el.querySelector<HTMLElement>('.sheet')!;
  const pv = el.querySelector<HTMLElement>('.pv')!;
  const tiles = [...el.querySelectorAll<HTMLButtonElement>('.tile')];

  const render = (i: number, level: number, fade: boolean) => {
    const it = items[i];
    const d = codexDetail(it, level);
    top.innerHTML = d.top;
    sheet.innerHTML = d.body;
    if (fade) {
      // restarts the small fade on every item change
      for (const part of [top, sheet]) {
        part.classList.remove('swap');
        void part.offsetWidth;
        part.classList.add('swap');
      }
    }
    paintIcons(top.querySelector('.dhead')!, 72);
    const lvls = top.querySelector<HTMLElement>('.lvls');
    if (lvls) paintIcons(lvls, 24);
    paintIcons(sheet, 72);
    codexPreview().show(pv, previewSubject(it, level));
    top.querySelectorAll<HTMLButtonElement>('[data-lvl]').forEach((b) =>
      b.addEventListener('click', () => {
        ui.app.uiSound('uiMove');
        render(i, Number(b.dataset.lvl), false);
      }),
    );
  };
  const select = (i: number) => {
    if (!items[i]) return;
    picked[tab] = i;
    tiles.forEach((b, k) => b.classList.toggle('on', k === i));
    render(i, 1, true);
  };
  tiles.forEach((tile) => tile.addEventListener('click', () => select(Number(tile.dataset.i))));
  el.querySelectorAll<HTMLButtonElement>('.cat').forEach((b) =>
    b.addEventListener('click', () => {
      ui.showCodex(b.dataset.tab as CodexTab);
      ui.home(ui.screenEl?.querySelector<HTMLButtonElement>('.cat.on'));
    }),
  );
  el.querySelector('#back')!.addEventListener('click', () => ui.codexReturn());
  const i = Math.min(Math.max(0, sel), items.length - 1);
  select(i);
  ui.home(tiles[i]);
  reveal(tiles[i]);
}

/**
 * Codex with keyboard / gamepad: up and down change tab, left and right select the previous / next item,
 * confirm shows the next level (weapons: up to the evolution). All of them wrap around.
 */
export function codexNav(ui: UI, dir: NavDir | 'confirm'): boolean {
  const root = ui.screenEl;
  if (!root) return false;
  const tab = ui.codexTab;
  if (dir === 'up' || dir === 'down') {
    const i = CODEX_TABS.indexOf(tab);
    ui.showCodex(CODEX_TABS[(i + (dir === 'up' ? -1 : 1) + CODEX_TABS.length) % CODEX_TABS.length]);
    ui.app.uiSound('uiMove');
    return true;
  }
  const tiles = [...root.querySelectorAll<HTMLButtonElement>('.tile')];
  if (!tiles.length) return true;
  const cur = Math.max(0, tiles.findIndex((b) => b.classList.contains('on')));
  if (dir === 'confirm') {
    // a focused button other than a tile (back, tabs) keeps its own action
    const ae = document.activeElement as HTMLElement | null;
    if (ae && root.contains(ae) && !ae.classList.contains('tile')) return false;
    const lv = [...root.querySelectorAll<HTMLButtonElement>('[data-lvl]')];
    if (!lv.length) return true;
    const on = lv.findIndex((b) => b.classList.contains('on'));
    lv[(on + 1) % lv.length].click();
    return true;
  }
  const next = tiles[(cur + (dir === 'left' ? -1 : 1) + tiles.length) % tiles.length];
  next.focus({ preventScroll: true });
  next.click();
  reveal(next);
  ui.app.uiSound('uiMove');
  return true;
}
