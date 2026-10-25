/**
 * Game over screen: the sloped banner, the counting score, a one-line comment on the run, figures,
 * the final build and retry / edit / replay / menu buttons.
 */
import { ALL_WEAPONS } from '../../data/weapons';
import { PASSIVES } from '../../data/passives';
import { DIFFICULTIES } from '../../data/difficulty';
import { formatTime, pad7 } from '../../render/hud';
import { FIRST_BOSS } from '../describe';
import { esc, fillIcons, num } from '../html';
import { t } from '../../i18n';
import { difficultyName, passiveName, weaponName } from '../../i18n/content';
import type { BuildInfo, DeathInfo } from '../types';
import type { UI } from '../ui';

/** A short line about the run, picked from what happened. */
function deathLine(d: DeathInfo): string {
  const time = d.record.survivedSec;
  const k = d.record.kills;
  if (d.isReplay) return t('death.lines.replay');
  if (d.sandbox) return t('death.lines.sandbox');
  if (d.won) return t('death.lines.won');
  if (d.rank === 1 && d.bestBefore > 0) return t('death.lines.newRecord');
  if (time < 60) return t('death.lines.underMinute');
  if (d.bossKills >= 2) return t('death.lines.bosses', { n: d.bossKills });
  if (d.bossKills === 1) return t('death.lines.firstBoss');
  if (k >= 1000) return t('death.lines.kills', { n: num(k) });
  if (time >= FIRST_BOSS - 20 && time < FIRST_BOSS) return t('death.lines.nearBoss');
  return t('death.lines.overwhelmed', { time: formatTime(time) });
}

/** Gear in a row, bare icons (end of run). */
function buildHtml(b: BuildInfo): string {
  const w = b.weapons
    .map((x) => {
      const d = ALL_WEAPONS.find((y) => y.id === x.id)!;
      const lvl = x.fusion
        ? `<span class="lv max">${t('common.evolution')}</span>`
        : `<span class="lv ${x.level >= 5 ? 'max' : ''}">${t('common.lvl', { n: `${x.level}/5` })}</span>`;
      return `<div class="item" style="--c:${d.color}"><span class="icon" data-kind="weapon" data-id="${x.id}"></span><span class="txt"><b>${esc(weaponName(d.id))}</b>${lvl}</span></div>`;
    })
    .join('');
  const p = b.passives
    .map((x) => {
      const d = PASSIVES.find((y) => y.id === x.id)!;
      return `<div class="item" style="--c:${d.color}"><span class="icon" data-kind="passive" data-id="${x.id}"></span><span class="txt"><b>${esc(passiveName(d.id))}</b><span class="lv ${x.level >= 5 ? 'max' : ''}">${t('common.lvl', { n: `${x.level}/5` })}</span></span></div>`;
    })
    .join('');
  return `<div class="items">${w}${p}</div>`;
}

// ---------- End of run ----------
/**
 * A sloped banner comes in from the left (red, gold on a record), then the text comes in from the right;
 * the score counts up once the text is in place, then the rest of the screen cascades in.
 */
export function showDeath(ui: UI, d: DeathInfo): void {
  const r = d.record;
  const diff = DIFFICULTIES[r.difficulty];
  const record = !d.isReplay && !d.sandbox && d.rank === 1;
  const variant = d.isReplay ? 'replay' : d.sandbox ? 'sandbox' : record ? 'record' : '';
  const badge = d.isReplay || record
    ? ''
    : d.sandbox
      ? `<span class="badge">${t('death.unranked')}</span>`
    : d.rank > 0
      ? `<span class="badge">${t('death.rank', { n: d.rank })}</span>`
      : `<span class="badge">${t('death.toBeat', { score: pad7(d.bestBefore) })}</span>`;
  const reveal = (i: number) => `reveal" style="--i:${i}`;
  const el = ui.mount(
    'death',
    `
    <div class="banner ${variant}">
      <div class="banner-band"></div>
      <div class="banner-content">
        <h2 class="go">${t(d.isReplay ? 'death.replayDone' : d.sandbox && d.survived ? 'death.testDone' : d.won ? 'death.victory' : 'death.gameOver')}</h2>
        <div class="go-score"><small>${t('run.score')} · ${d.sandbox ? `${t('common.sandbox')} · ` : ''}<span style="color:${diff.color}">${esc(difficultyName(diff.id))}</span></small><b id="count">${pad7(0)}</b></div>
      </div>
      ${record ? `<span class="stamp">${t('death.stamp')}</span>` : ''}
    </div>
    <p class="sub ${reveal(0)}">${esc(deathLine(d))}</p>
    ${badge ? `<div class="${reveal(1)}">${badge}</div>` : ''}
    <div class="stats ${reveal(2)}">
      <div><small>${t('run.time')}</small><b>${formatTime(r.survivedSec)}</b></div>
      <div><small>${t('run.kills')}</small><b>${num(r.kills)}</b></div>
      <div><small>${t('run.level')}</small><b>${r.level}</b></div>
      <div><small>${t('run.bossKills')}</small><b>${d.bossKills}</b></div>
    </div>
    <div class="build final-build ${reveal(3)}"><h3>${t('death.finalBuild')}</h3>${buildHtml(d.build)}</div>
    <footer class="actions ${reveal(4)}">
      <button class="btn nav primary" id="retry">${t('death.retry')}</button>
      ${d.sandbox ? `<button class="btn nav" id="edit">${t('death.edit')}</button>` : ''}
      ${d.canReplay ? `<button class="btn nav" id="watch">${t('death.watch')}</button>` : ''}
      <button class="btn nav" id="menu">${t('common.menu')}</button>
    </footer>
  `,
    true,
  );
  fillIcons(el, 32);
  el.querySelector('#retry')!.addEventListener('click', () => ui.app.retry());
  el.querySelector('#edit')?.addEventListener('click', () => ui.app.toMenu('sandbox'));
  el.querySelector('#watch')?.addEventListener('click', () => ui.app.watchLastRun());
  el.querySelector('#menu')!.addEventListener('click', () => ui.app.toMenu());
  // The score counts up like on an arcade cabinet, once the banner is in place.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const out = el.querySelector<HTMLElement>('#count')!;
  // once the text has arrived (it follows the banner, see content-in in styles/death.css)
  const delay = reduced ? 0 : 1050;
  const dur = reduced ? 1 : Math.min(1400, 300 + r.score / 8);
  el.querySelector<HTMLElement>('.stamp')?.style.setProperty('animation-delay', `${delay + dur}ms`);
  const t0 = performance.now() + delay;
  const tick = (now: number) => {
    const f = Math.max(0, Math.min(1, (now - t0) / dur));
    out.textContent = pad7(r.score * (1 - (1 - f) ** 3));
    if (f < 1) ui.countAnim = requestAnimationFrame(tick);
  };
  ui.countAnim = requestAnimationFrame(tick);
}
