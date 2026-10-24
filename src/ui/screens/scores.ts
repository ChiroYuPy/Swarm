/** Records screen: difficulty tabs, podium for the top three, best performances and the rest of the top 10. */
import { DIFFICULTIES } from '../../data/difficulty';
import { formatTime, pad7 } from '../../render/hud';
import { TOP_PER_DIFFICULTY, bestScore, topScores } from '../../storage/storage';
import { SCREEN_COLOR, cascade, esc, heading, keys, num } from '../html';
import type { UI } from '../ui';

// ---------- Records ----------
/**
 * Hall des records : onglets par difficulté (avec leur record), podium pour les trois premières
 * parties, les meilleures performances sur une ligne, puis la suite du top 10 en liste.
 * Gauche / droite changent de difficulté.
 */
export function showScores(ui: UI, difficulty: number): void {
  const save = ui.app.save;
  const diff = DIFFICULTIES[difficulty];
  const list = topScores(save, difficulty);
  const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  // Podium : 2e à gauche, 1er au centre, 3e à droite.
  const podium = [1, 0, 2]
    .filter((i) => list[i])
    .map((i) => {
      const r = list[i];
      return `<div class="pod p${i + 1}">
        <span class="medal">${i + 1}</span>
        <b class="pod-score">${pad7(r.score)}</b>
        <span class="pod-meta">${formatTime(r.tempsSurvecu)} · niv. ${r.level || '—'} · ${num(r.kills)} éliminés <span class="pod-date">· ${date(r.date)}</span></span>
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
        <td class="num">${formatTime(r.tempsSurvecu)}</td>
        <td class="num">${r.level || '—'}</td>
        <td class="num">${num(r.kills)}</td>
        <td class="date">${date(r.date)}</td>
      </tr>`,
    )
    .join('');
  const tabs = DIFFICULTIES.map((d, i) => {
    const best = bestScore(save, i);
    return `<button class="tab dtab nav ${i === difficulty ? 'on' : ''}" data-d="${i}" style="--c:${d.color}"><span>${esc(d.name)}</span><small>${best ? pad7(best) : '—'}</small></button>`;
  }).join('');
  const top = <K extends 'score' | 'tempsSurvecu' | 'level' | 'kills'>(k: K) => Math.max(...list.map((r) => r[k] || 0));
  const bests = `<div class="stats rec-bests">
      <div><small>Plus longue survie</small><b>${formatTime(top('tempsSurvecu'))}</b></div>
      <div><small>Plus haut niveau</small><b>${top('level') || '—'}</b></div>
      <div><small>Plus d’éliminés</small><b>${num(top('kills'))}</b></div>
    </div>`;
  const body = list.length
    ? `<div class="podium">${podium}</div>
      ${bests}
      ${rows ? `<table class="scores"><thead><tr><th>#</th><th class="num">Score</th><th class="num">Temps</th><th class="num">Niveau</th><th class="num">Éliminés</th><th class="num">Date</th></tr></thead><tbody>${rows}</tbody></table>` : ''}`
    : `<div class="empty-state"><p class="empty">Aucune partie en ${esc(diff.name)} pour l’instant.</p><button class="btn nav tint" id="go">Jouer en ${esc(diff.name)}</button></div>`;
  const el = ui.mount(
    'scores',
    `
    ${heading('Records', SCREEN_COLOR.scores, `Tes ${TOP_PER_DIFFICULTY} meilleures parties, par difficulté.`)}
    <div class="tabs ${cascade(1)}">${tabs}</div>
    <div class="records ${cascade(2)}" style="--c:${diff.color}">${body}</div>
    ${keys([[['←', '→'], 'difficulté'], [['Échap'], 'retour']])}
    <footer class="actions ${cascade(3)}"><button class="btn nav" id="back">Retour</button></footer>
  `,
  );
  el.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) => b.addEventListener('click', () => ui.showScores(Number(b.dataset.d))));
  el.querySelector('#go')?.addEventListener('click', () => ui.app.play(difficulty));
  el.querySelector('#back')!.addEventListener('click', () => ui.showMenu());
  ui.home(el.querySelector<HTMLButtonElement>('.tab.on'));
}
