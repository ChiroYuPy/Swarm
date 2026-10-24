/** Records screen: difficulty tabs, podium for the top three, best performances and the rest of the top 10. */
import { DIFFICULTIES } from '../../data/difficulty';
import { formatTime, pad7 } from '../../render/hud';
import { TOP_PER_DIFFICULTY, bestScore, topScores } from '../../storage/storage';
import { intlTag, t } from '../../i18n';
import { difficultyName } from '../../i18n/content';
import { SCREEN_COLOR, cascade, esc, heading, keys, num } from '../html';
import type { UI } from '../ui';

// ---------- Records ----------
/**
 * Hall of records: one tab per difficulty (with its record), a podium for the top three runs, the
 * best performances on one line, then the rest of the top 10 as a list. Left / right change difficulty.
 */
export function showScores(ui: UI, difficulty: number): void {
  const save = ui.app.save;
  const diff = DIFFICULTIES[difficulty];
  const diffName = difficultyName(diff.id);
  const list = topScores(save, difficulty);
  const date = (iso: string) => new Date(iso).toLocaleDateString(intlTag(), { day: '2-digit', month: '2-digit', year: '2-digit' });
  // Podium: 2nd on the left, 1st in the middle, 3rd on the right.
  const podium = [1, 0, 2]
    .filter((i) => list[i])
    .map((i) => {
      const r = list[i];
      const meta = t('scores.podMeta', { time: formatTime(r.survivedSec), level: r.level || '—', kills: num(r.kills) });
      return `<div class="pod p${i + 1}">
        <span class="medal">${i + 1}</span>
        <b class="pod-score">${pad7(r.score)}</b>
        <span class="pod-meta">${meta} <span class="pod-date">· ${date(r.date)}</span></span>
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
        <td class="num">${formatTime(r.survivedSec)}</td>
        <td class="num">${r.level || '—'}</td>
        <td class="num">${num(r.kills)}</td>
        <td class="date">${date(r.date)}</td>
      </tr>`,
    )
    .join('');
  const tabs = DIFFICULTIES.map((d, i) => {
    const best = bestScore(save, i);
    return `<button class="tab dtab nav ${i === difficulty ? 'on' : ''}" data-d="${i}" style="--c:${d.color}"><span>${esc(difficultyName(d.id))}</span><small>${best ? pad7(best) : '—'}</small></button>`;
  }).join('');
  const top = <K extends 'score' | 'survivedSec' | 'level' | 'kills'>(k: K) => Math.max(...list.map((r) => r[k] || 0));
  const bests = `<div class="stats rec-bests">
      <div><small>${t('scores.longest')}</small><b>${formatTime(top('survivedSec'))}</b></div>
      <div><small>${t('scores.highest')}</small><b>${top('level') || '—'}</b></div>
      <div><small>${t('scores.mostKills')}</small><b>${num(top('kills'))}</b></div>
    </div>`;
  const head = [t('run.score'), t('run.time'), t('run.level'), t('run.kills'), t('scores.date')].map((h) => `<th class="num">${h}</th>`).join('');
  const body = list.length
    ? `<div class="podium">${podium}</div>
      ${bests}
      ${rows ? `<table class="scores"><thead><tr><th>#</th>${head}</tr></thead><tbody>${rows}</tbody></table>` : ''}`
    : `<div class="empty-state"><p class="empty">${esc(t('scores.empty', { difficulty: diffName }))}</p><button class="btn nav tint" id="go">${esc(t('scores.playIn', { difficulty: diffName }))}</button></div>`;
  const el = ui.mount(
    'scores',
    `
    ${heading(t('scores.title'), SCREEN_COLOR.scores, t('scores.sub', { n: TOP_PER_DIFFICULTY }))}
    <div class="tabs ${cascade(1)}">${tabs}</div>
    <div class="records ${cascade(2)}" style="--c:${diff.color}">${body}</div>
    ${keys([[['←', '→'], t('hints.difficulty')], [[t('keys.esc')], t('hints.back')]])}
    <footer class="actions ${cascade(3)}"><button class="btn nav" id="back">${t('common.back')}</button></footer>
  `,
  );
  el.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) => b.addEventListener('click', () => ui.showScores(Number(b.dataset.d))));
  el.querySelector('#go')?.addEventListener('click', () => ui.app.play(difficulty));
  el.querySelector('#back')!.addEventListener('click', () => ui.showMenu());
  ui.home(el.querySelector<HTMLButtonElement>('.tab.on'));
}
