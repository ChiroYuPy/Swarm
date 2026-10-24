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
import type { BuildInfo, DeathInfo } from '../types';
import type { UI } from '../ui';

/** Une phrase courte sur la partie, choisie selon ce qui s'est passé. */
function deathLine(d: DeathInfo): string {
  const t = d.record.survivedSec;
  const k = d.record.kills;
  if (d.isReplay) return 'Fin de la relecture.';
  if (d.sandbox) return 'Partie sandbox : rien n’est enregistré dans les records.';
  if (d.rank === 1 && d.bestBefore > 0) return 'Nouveau record. Tu progresses.';
  if (t < 60) return 'Moins d’une minute… on respire et on y retourne.';
  if (d.bossKills >= 2) return `${d.bossKills} boss vaincus. Respect.`;
  if (d.bossKills === 1) return 'Le Trapèze est tombé. Pas toi… enfin, pas tout de suite.';
  if (k >= 1000) return `${num(k)} formes éliminées avant de céder.`;
  if (t >= FIRST_BOSS - 20 && t < FIRST_BOSS) return 'Si près du boss…';
  return `Submergé après ${formatTime(t)}. La prochaine sera la bonne.`;
}

/** Équipement en ligne, icônes à nu (fin de partie). */
function buildHtml(b: BuildInfo): string {
  const w = b.weapons
    .map((x) => {
      const d = ALL_WEAPONS.find((y) => y.id === x.id)!;
      const lvl = x.fusion ? '<span class="lv max">Évolution</span>' : `<span class="lv ${x.level >= 5 ? 'max' : ''}">niv. ${x.level}/5</span>`;
      return `<div class="item" style="--c:${d.color}"><span class="icon" data-kind="weapon" data-id="${x.id}"></span><span class="txt"><b>${esc(d.name)}</b>${lvl}</span></div>`;
    })
    .join('');
  const p = b.passives
    .map((x) => {
      const d = PASSIVES.find((y) => y.id === x.id)!;
      return `<div class="item" style="--c:${d.color}"><span class="icon" data-kind="passive" data-id="${x.id}"></span><span class="txt"><b>${esc(d.name)}</b><span class="lv ${x.level >= 5 ? 'max' : ''}">niv. ${x.level}/5</span></span></div>`;
    })
    .join('');
  return `<div class="items">${w}${p}</div>`;
}

// ---------- Fin de partie ----------
/**
 * Un bandeau en pente arrive de la gauche (rouge, doré si record), puis le texte arrive de la droite ;
 * le score défile une fois le texte posé, puis le reste de l'écran apparaît en cascade.
 */
export function showDeath(ui: UI, d: DeathInfo): void {
  const r = d.record;
  const diff = DIFFICULTIES[r.difficulty];
  const record = !d.isReplay && !d.sandbox && d.rank === 1;
  const variant = d.isReplay ? 'replay' : d.sandbox ? 'sandbox' : record ? 'record' : '';
  const badge = d.isReplay || record
    ? ''
    : d.sandbox
      ? '<span class="badge">Sandbox · non classé</span>'
    : d.rank > 0
      ? `<span class="badge">${d.rank}<sup>e</sup> meilleure partie</span>`
      : `<span class="badge">Record à battre : <b>${pad7(d.bestBefore)}</b></span>`;
  const reveal = (i: number) => `reveal" style="--i:${i}`;
  const el = ui.mount(
    'death',
    `
    <div class="banner ${variant}">
      <div class="banner-band"></div>
      <div class="banner-content">
        <h2 class="go">${d.isReplay ? 'Relecture terminée' : d.sandbox && d.survived ? 'Fin du test' : 'Game over'}</h2>
        <div class="go-score"><small>Score · ${d.sandbox ? 'Sandbox · ' : ''}<span style="color:${diff.color}">${esc(diff.name)}</span></small><b id="count">${pad7(0)}</b></div>
      </div>
      ${record ? '<span class="stamp">Nouveau record</span>' : ''}
    </div>
    <p class="sub ${reveal(0)}">${esc(deathLine(d))}</p>
    ${badge ? `<div class="${reveal(1)}">${badge}</div>` : ''}
    <div class="stats ${reveal(2)}">
      <div><small>Temps</small><b>${formatTime(r.survivedSec)}</b></div>
      <div><small>Éliminés</small><b>${num(r.kills)}</b></div>
      <div><small>Niveau</small><b>${r.level}</b></div>
      <div><small>Boss vaincus</small><b>${d.bossKills}</b></div>
    </div>
    <div class="build final-build ${reveal(3)}"><h3>Équipement final</h3>${buildHtml(d.build)}</div>
    <footer class="actions ${reveal(4)}">
      <button class="btn nav primary" id="retry">Rejouer</button>
      ${d.sandbox ? '<button class="btn nav" id="edit">Modifier</button>' : ''}
      ${d.canReplay ? '<button class="btn nav" id="watch">Revoir la partie</button>' : ''}
      <button class="btn nav" id="menu">Menu</button>
    </footer>
  `,
    true,
  );
  fillIcons(el, 32);
  el.querySelector('#retry')!.addEventListener('click', () => ui.app.retry());
  el.querySelector('#edit')?.addEventListener('click', () => ui.app.toMenu('sandbox'));
  el.querySelector('#watch')?.addEventListener('click', () => ui.app.watchLastRun());
  el.querySelector('#menu')!.addEventListener('click', () => ui.app.toMenu());
  // Le score défile comme sur une borne, une fois le bandeau posé.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const out = el.querySelector<HTMLElement>('#count')!;
  // une fois le texte arrivé (il suit le bandeau, voir content-in dans style.css)
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
