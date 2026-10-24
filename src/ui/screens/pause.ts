/**
 * Pause screen: summary of the current run in the game over style (figures, detailed gear with real
 * weapon numbers and evolution progress, hero stats), with resume / codex / options / quit.
 */
import { ALL_WEAPONS } from '../../data/weapons';
import { PASSIVES } from '../../data/passives';
import { FUSIONS } from '../../data/fusions';
import { DIFFICULTIES } from '../../data/difficulty';
import { MAX_PASSIVE_SLOTS, MAX_WEAPON_SLOTS } from '../../sim';
import { formatTime, pad7 } from '../../render/hud';
import { passiveTotal, weaponNumbers } from '../describe';
import { SCREEN_COLOR, cascade, esc, fillIcons, heading, levelPips, num, statTiles } from '../html';
import type { BuildInfo, RunInfo } from '../types';
import type { UI } from '../ui';

/**
 * Équipement détaillé (pause) : niveau en pastilles, vrais chiffres, et où en est chaque évolution
 * (prête au prochain level-up, ou le passif qu'il lui manque).
 */
function gearHtml(b: BuildInfo): { weapons: string; passives: string } {
  const owned = new Map(b.passives.map((x) => [x.id, x.level]));
  const armed = new Set(b.weapons.map((x) => x.id));
  const row = (kind: 'weapon' | 'passive', id: string, color: string, name: string, lvl: string, lines: string[]) =>
    `<div class="gear" style="--c:${color}"><span class="icon" data-kind="${kind}" data-id="${id}"></span><div class="gear-txt"><div class="gear-top"><b>${esc(name)}</b>${lvl}</div>${lines.map((l) => `<small>${l}</small>`).join('')}</div></div>`;
  const weapons = b.weapons
    .map((x) => {
      const d = ALL_WEAPONS.find((y) => y.id === x.id)!;
      const lines = [esc(weaponNumbers(x.id, x.level, b.might, b.cooldownMul))];
      for (const f of FUSIONS.filter((f) => f.weapon === x.id)) {
        const res = ALL_WEAPONS.find((y) => y.id === f.result)!.name;
        const pl = owned.get(f.with) ?? 0;
        lines.push(
          x.level >= 5 && pl >= 5
            ? `<em class="evo ready">✦ ${esc(res)} : évolution prête</em>`
            : `<em class="evo">Évolue en ${esc(res)} · ${esc(PASSIVES.find((p) => p.id === f.with)!.name)} ${pl ? `${pl}/5` : 'à prendre'}</em>`,
        );
      }
      return row('weapon', x.id, d.color, d.name, x.fusion ? '<span class="tag">Évolution</span>' : levelPips(x.level, 5), lines);
    })
    .join('');
  const passives = b.passives
    .map((x) => {
      const d = PASSIVES.find((y) => y.id === x.id)!;
      const lines = [esc(passiveTotal(d, x.level))];
      for (const f of FUSIONS.filter((f) => f.with === x.id && armed.has(f.weapon)))
        lines.push(`<em class="evo">Fait évoluer ${esc(ALL_WEAPONS.find((y) => y.id === f.weapon)!.name)}</em>`);
      return row('passive', x.id, d.color, d.name, levelPips(x.level, 5), lines);
    })
    .join('');
  return { weapons, passives };
}

// ---------- Pause ----------
/**
 * Résumé de la partie en cours, au style de la fin de partie : chiffres, équipement détaillé, stats.
 * `instant` : pause automatique (fenêtre quittée), l'écran est déjà en place au retour.
 */
export function showPause(ui: UI, build: BuildInfo, run: RunInfo, instant = false): void {
  const r = run.record;
  const diff = DIFFICULTIES[r.difficulty];
  const dname = `<span style="color:${diff.color}">${esc(diff.name)}</span>`;
  const sub = run.sandbox
    ? `Sandbox · ${dname}`
    : `${dname} · ${
        !run.best ? 'Premier record en jeu' : r.score > run.best ? '<b class="gold">Record battu !</b>' : `Record à battre : <b class="gold">${pad7(run.best)}</b>`
      }`;
  const gear = gearHtml(build);
  const stats = build.stats
    .map(
      (st) =>
        `<div class="${st.on ? 'on' : ''}" title="${esc(st.hint)}"><span>${esc(st.label)}</span><b>${esc(st.value)}</b>${st.on ? `<small>${st.sources.map(esc).join(' · ')}</small>` : ''}</div>`,
    )
    .join('');
  const el = ui.mount(
    'pause',
    `
    ${heading('Pause', SCREEN_COLOR.pause, sub)}
    ${statTiles(
      [
        ['Score', `<span class="gold">${pad7(r.score)}</span>`],
        ['Temps', formatTime(r.tempsSurvecu)],
        ['Éliminés', num(r.kills)],
        ['Niveau', String(r.level)],
        ['Boss vaincus', String(run.bossKills)],
      ],
      `run ${cascade(1)}`,
    )}
    <div class="pause-gear ${cascade(2)}">
      <section><h3 class="rule">Armes <small>${build.weapons.length}/${MAX_WEAPON_SLOTS}</small></h3>${gear.weapons}</section>
      <section><h3 class="rule">Passifs <small>${build.passives.length}/${MAX_PASSIVE_SLOTS}</small></h3>${gear.passives || '<p class="empty">Aucun passif pour l’instant.</p>'}</section>
    </div>
    <section class="pause-stats ${cascade(3)}"><h3 class="rule">Stats</h3><div class="statgrid">${stats}</div></section>
    <footer class="actions ${cascade(4)}">
      <button class="btn nav primary go" id="resume">Reprendre</button>
      <button class="btn nav" id="codex">Codex</button>
      <button class="btn nav" id="settings">Options</button>
      <button class="btn nav danger" id="quit">Abandonner</button>
    </footer>
  `,
    true,
    instant,
  );
  fillIcons(el, 34);
  el.querySelector('#resume')!.addEventListener('click', () => ui.app.resume());
  el.querySelector('#codex')!.addEventListener('click', () => ui.showCodex('armes', 0, () => ui.showPause(build, run)));
  el.querySelector('#settings')!.addEventListener('click', () => ui.showSettings(() => ui.showPause(build, run)));
  el.querySelector('#quit')!.addEventListener('click', () => ui.app.quit());
}
