/** Victory screen: the last boss of the run is down. Go on (endless, for the score) or end the run here. */
import { DIFFICULTIES } from '../../data/difficulty';
import { formatTime, pad7 } from '../../render/hud';
import { cascade, esc, heading, num, statTiles } from '../html';
import { t } from '../../i18n';
import { difficultyName } from '../../i18n/content';
import type { RunInfo } from '../types';
import type { UI } from '../ui';

/** Gold heading, the run so far, and the two ways on: endless (primary) or end the run. */
export function showVictory(ui: UI, run: RunInfo): void {
  const r = run.record;
  const diff = DIFFICULTIES[r.difficulty];
  const el = ui.mount(
    'victory',
    `
    ${heading(t('victory.title'), '#ffd23a', `${t('victory.sub')} · <span style="color:${diff.color}">${esc(difficultyName(diff.id))}</span>`)}
    <div class="${cascade(1)}">${statTiles([
      [t('run.score'), pad7(r.score)],
      [t('run.time'), formatTime(r.survivedSec)],
      [t('run.kills'), num(r.kills)],
      [t('run.level'), String(r.level)],
    ])}</div>
    <p class="sub ${cascade(2)}">${t('victory.endless')}</p>
    <footer class="actions ${cascade(3)}">
      <button class="btn nav primary" id="continue">${t('victory.continue')}</button>
      <button class="btn nav" id="finish">${t('victory.finish')}</button>
    </footer>
  `,
    true,
  );
  el.querySelector('#continue')!.addEventListener('click', () => ui.app.continueEndless());
  el.querySelector('#finish')!.addEventListener('click', () => ui.app.quit());
  ui.home(el.querySelector<HTMLButtonElement>('#continue'));
}
