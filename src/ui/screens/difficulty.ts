/** Difficulty picker: one card per difficulty with threat level, comparison meters and its record. */
import { DIFFICULTIES } from '../../data/difficulty';
import { dec, formatTime, pad7 } from '../../render/hud';
import { topScores } from '../../storage/storage';
import { t } from '../../i18n';
import { difficultyDesc, difficultyName } from '../../i18n/content';
import { SCREEN_COLOR, cascade, esc, heading, keys, num } from '../html';
import type { UI } from '../ui';

type Meter = 'hp' | 'dmg' | 'rate' | 'loot';

// ---------- Difficulty picker ----------
/**
 * One card per difficulty: threat level, description, compared meters (toughness, damage, numbers, items)
 * and the record of the difficulty if there is one.
 */
export function showDifficulty(ui: UI): void {
  const save = ui.app.save;
  // 5-step meters, relative to the hardest difficulty on each criterion.
  const crit: [Meter, (d: (typeof DIFFICULTIES)[number]) => number][] = [
    ['hp', (d) => d.hp],
    ['dmg', (d) => d.dmg],
    ['rate', (d) => d.rate],
    ['loot', (d) => d.loot],
  ];
  const meter = (d: (typeof DIFFICULTIES)[number], [key, f]: (typeof crit)[number]) => {
    const max = Math.max(...DIFFICULTIES.map(f));
    const n = Math.max(1, Math.round((f(d) / max) * 5));
    const title = t('difficulty.meterTitle', { hint: t(`difficulty.meters.${key}.hint`), value: dec(f(d)) });
    return `<span class="meter" title="${esc(title)}"><span>${t(`difficulty.meters.${key}.label`)}</span><span class="segs">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span></span>`;
  };
  const cards = DIFFICULTIES.map((d, i) => {
    const best = topScores(save, i)[0];
    const tile = (k: string, v: string) => `<span><small>${k}</small><b>${v}</b></span>`;
    const record = best
      ? `<small>${t('run.record')}</small><b>${pad7(best.score)}</b><span class="stats mini">${tile(t('run.time'), formatTime(best.survivedSec))}${tile(t('run.level'), String(best.level || '—'))}${tile(t('run.kills'), num(best.kills))}</span>`
      : `<small>${t('run.record')}</small><em>${t('difficulty.noRecord')}</em>`;
    return `<button class="diff nav ${i === save.difficulty ? 'primary' : ''}" data-d="${i}" style="--c:${d.color};--i:${i}">
      <span class="diff-top">
        <span class="threat">${DIFFICULTIES.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</span>
      </span>
      <span class="diff-name">${esc(difficultyName(d.id))}</span>
      <span class="diff-desc">${esc(difficultyDesc(d.id))}</span>
      <span class="meters">${crit.map((c) => meter(d, c)).join('')}</span>
      <span class="diff-record">${record}</span>
    </button>`;
  }).join('');
  const el = ui.mount(
    'difficulty',
    `
    ${heading(t('difficulty.title'), SCREEN_COLOR.difficulty, t('difficulty.sub'))}
    <div class="diffs">${cards}</div>
    ${keys([[['←', '→'], t('hints.choose')], [[t('keys.enter')], t('hints.play')], [[t('keys.esc')], t('hints.back')]])}
    <footer class="actions ${cascade(2)}"><button class="btn nav" id="back">${t('common.back')}</button></footer>
  `,
  );
  el.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => b.addEventListener('click', () => ui.app.play(Number(b.dataset.d))));
  el.querySelector('#back')!.addEventListener('click', () => ui.showMenu());
}
