/** Difficulty picker: one card per difficulty with threat level, comparison meters and its record. */
import { DIFFICULTIES } from '../../data/difficulty';
import { dec, formatTime, pad7 } from '../../render/hud';
import { topScores } from '../../storage/storage';
import { SCREEN_COLOR, cascade, esc, heading, keys, num } from '../html';
import type { UI } from '../ui';

// ---------- Choix de la difficulté ----------
/**
 * Une carte par difficulté : niveau de menace, description, jauges comparées (résistance, dégâts,
 * nombre, rythme d'arrivée des nouveaux types) et le record de la difficulté s'il existe.
 */
export function showDifficulty(ui: UI): void {
  const save = ui.app.save;
  // Jauges sur 5 crans, relatives à la difficulté la plus dure de chaque critère.
  const crit: [string, (d: (typeof DIFFICULTIES)[number]) => number, string][] = [
    ['Résistance', (d) => d.hp, 'PV des ennemis'],
    ['Dégâts', (d) => d.dmg, 'Dégâts que tu reçois'],
    ['Nombre', (d) => d.rate, 'Quantité d’ennemis'],
    ['Rythme', (d) => 1 / d.pace, 'Vitesse d’arrivée des nouveaux types'],
  ];
  const meter = (d: (typeof DIFFICULTIES)[number], [label, f, hint]: (typeof crit)[number]) => {
    const max = Math.max(...DIFFICULTIES.map(f));
    const n = Math.max(1, Math.round((f(d) / max) * 5));
    return `<span class="meter" title="${esc(hint)} : ×${dec(f(d))}"><span>${label}</span><span class="segs">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span></span>`;
  };
  const cards = DIFFICULTIES.map((d, i) => {
    const best = topScores(save, i)[0];
    const tile = (k: string, v: string) => `<span><small>${k}</small><b>${v}</b></span>`;
    const record = best
      ? `<small>Record</small><b>${pad7(best.score)}</b><span class="stats mini">${tile('Temps', formatTime(best.tempsSurvecu))}${tile('Niveau', String(best.level || '—'))}${tile('Éliminés', num(best.kills))}</span>`
      : '<small>Record</small><em>Aucune partie pour l’instant</em>';
    return `<button class="diff nav ${i === save.difficulty ? 'primary' : ''}" data-d="${i}" style="--c:${d.color};--i:${i}">
      <span class="diff-top">
        <span class="threat">${DIFFICULTIES.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</span>
      </span>
      <span class="diff-name">${esc(d.name)}</span>
      <span class="diff-desc">${esc(d.desc)}</span>
      <span class="meters">${crit.map((c) => meter(d, c)).join('')}</span>
      <span class="diff-record">${record}</span>
    </button>`;
  }).join('');
  const el = ui.mount(
    'difficulty',
    `
    ${heading('Difficulté', SCREEN_COLOR.difficulty, 'Change la résistance des ennemis et la vitesse à laquelle les nouveaux types arrivent.')}
    <div class="diffs">${cards}</div>
    ${keys([[['←', '→'], 'choisir'], [['Entrée'], 'jouer'], [['Échap'], 'retour']])}
    <footer class="actions ${cascade(2)}"><button class="btn nav" id="back">Retour</button></footer>
  `,
  );
  el.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => b.addEventListener('click', () => ui.app.play(Number(b.dataset.d))));
  el.querySelector('#back')!.addEventListener('click', () => ui.showMenu());
}
