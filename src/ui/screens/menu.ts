/** Main menu screen: the SWARM logo, the menu buttons (play, sandbox, codex, records, options) and the version. */
import { GAME_VERSION } from '../../sim';
import { t } from '../../i18n';
import type { UI } from '../ui';

// ---------- Main menu ----------
export function showMenu(ui: UI): void {
  const el = ui.mount(
    'menu',
    `
    <header class="brand">
      <h1 class="title">${[...'SWARM'].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</h1>
    </header>
    <nav class="stack">
      <button class="btn nav primary" id="play">${t('menu.play')}</button>
      <button class="btn nav" id="sandbox">${t('menu.sandbox')}</button>
      <button class="btn nav" id="codex">${t('menu.codex')}</button>
      <button class="btn nav" id="scores">${t('menu.records')}</button>
      <button class="btn nav" id="settings">${t('menu.options')}</button>
    </nav>
    <p class="version">v${GAME_VERSION}</p>
  `,
  );
  el.querySelector('#play')!.addEventListener('click', () => ui.showDifficulty());
  el.querySelector('#sandbox')!.addEventListener('click', () => ui.showSandbox());
  el.querySelector('#codex')!.addEventListener('click', () => ui.showCodex(ui.codexTab, undefined, () => ui.showMenu()));
  el.querySelector('#scores')!.addEventListener('click', () => ui.showScores(ui.app.save.difficulty));
  el.querySelector('#settings')!.addEventListener('click', () => ui.showSettings(() => ui.showMenu()));
}
