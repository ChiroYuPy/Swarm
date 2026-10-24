/**
 * Options screen: setting definitions and groups, the custom controls (slider, switch, choice) and
 * their keyboard / pointer stepping. Changes go through ui.app.applySettings.
 */
import type { Settings } from '../../storage/storage';
import { DEFAULT_SETTINGS } from '../../storage/storage';
import { SCREEN_COLOR, cascade, esc, heading, keys } from '../html';
import type { UI } from '../ui';

type SettingDef =
  | { key: 'volume' | 'music' | 'sfx'; kind: 'range'; label: string; hint?: string }
  | { key: 'muted' | 'shake' | 'damageNumbers' | 'showFps' | 'autoPause'; kind: 'toggle'; label: string; hint?: string }
  | { key: 'quality'; kind: 'choice'; label: string; hint?: string; options: [Settings['quality'], string][] };

/** Page Options : groupes et réglages, dans l'ordre d'affichage. */
const SETTINGS_UI: { title: string; items: SettingDef[] }[] = [
  {
    title: 'Son',
    items: [
      { key: 'volume', kind: 'range', label: 'Volume général' },
      { key: 'music', kind: 'range', label: 'Musique' },
      { key: 'sfx', kind: 'range', label: 'Effets sonores' },
      { key: 'muted', kind: 'toggle', label: 'Couper le son', hint: 'M' },
    ],
  },
  {
    title: 'Affichage',
    items: [
      { key: 'quality', kind: 'choice', label: 'Qualité graphique', options: [['high', 'Élevée'], ['low', 'Basse']] },
      { key: 'shake', kind: 'toggle', label: 'Secousses d’écran' },
      { key: 'damageNumbers', kind: 'toggle', label: 'Chiffres de dégâts' },
      { key: 'showFps', kind: 'toggle', label: 'Afficher les FPS', hint: 'F3' },
    ],
  },
  {
    title: 'Jeu',
    items: [{ key: 'autoPause', kind: 'toggle', label: 'Pause auto si la fenêtre perd le focus' }],
  },
];

const settingDef = (row: HTMLElement): SettingDef => SETTINGS_UI.flatMap((g) => g.items).find((x) => x.key === row.dataset.key)!;

// ---------- Options ----------
/** Contrôles maison (curseurs, interrupteurs, choix) : même look partout, valeurs visibles, pilotables au clavier. */
export function showSettings(ui: UI, onBack: () => void): void {
  ui.settingsReturn = onBack;
  const overlay = ui.current === 'pause';
  const groups = SETTINGS_UI.map(
    (g) =>
      `<h3 class="rule">${g.title}</h3>${g.items
        .map(
          (it) =>
            `<button class="set nav" data-key="${it.key}" data-kind="${it.kind}"><span class="set-label">${esc(it.label)}${it.hint ? ` <kbd>${it.hint}</kbd>` : ''}</span><span class="ctl"></span></button>`,
        )
        .join('')}`,
  );
  const el = ui.mount(
    'settings',
    `
    ${heading('Options', SCREEN_COLOR.settings)}
    <div class="panel form ${cascade(1)}">${groups.join('')}</div>
    ${keys([[['↑', '↓'], 'choisir'], [['←', '→'], 'régler'], [['Échap'], 'retour']])}
    <footer class="actions ${cascade(2)}">
      <button class="btn nav primary" id="back">Retour</button>
      <button class="btn nav" id="reset">Réinitialiser</button>
    </footer>
  `,
    overlay,
  );
  el.querySelectorAll<HTMLButtonElement>('.set').forEach((row) => {
    const def = settingDef(row);
    paintSetting(ui, row);
    if (def.kind === 'range') {
      // Clic ou glisser sur la piste : la valeur suit le pointeur.
      const track = row.querySelector<HTMLElement>('.track')!;
      const fromPointer = (e: PointerEvent) => {
        const r = track.getBoundingClientRect();
        setSetting(ui, def.key, Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 20) / 20);
      };
      track.addEventListener('pointerdown', (e) => {
        track.setPointerCapture(e.pointerId);
        row.focus({ preventScroll: true });
        row.classList.add('drag');
        fromPointer(e);
      });
      track.addEventListener('pointermove', (e) => {
        if (track.hasPointerCapture(e.pointerId)) fromPointer(e);
      });
      const end = () => row.classList.remove('drag');
      track.addEventListener('pointerup', end);
      track.addEventListener('pointercancel', end);
    } else {
      row.addEventListener('click', (e) => stepSetting(ui, row, (e.target as HTMLElement).closest('.arrow.prev') ? -1 : 1));
    }
  });
  ui.home(el.querySelector<HTMLButtonElement>('.set'));
  el.querySelector('#back')!.addEventListener('click', () => ui.settingsReturn());
  el.querySelector('#reset')!.addEventListener('click', () => {
    ui.app.applySettings({ ...DEFAULT_SETTINGS });
    ui.refreshMute();
    el.querySelectorAll<HTMLButtonElement>('.set').forEach((row) => paintSetting(ui, row));
  });
}

function setSetting<K extends keyof Settings>(ui: UI, key: K, value: Settings[K]): void {
  if (ui.app.save.settings[key] === value) return;
  ui.app.applySettings({ ...ui.app.save.settings, [key]: value });
  ui.refreshMute();
  const row = ui.screenEl?.querySelector<HTMLButtonElement>(`.set[data-key="${key}"]`);
  if (row) paintSetting(ui, row);
}

/** Gauche / droite (ou clic) sur une ligne : curseur ±5 %, interrupteur inversé, choix suivant / précédent. */
function stepSetting(ui: UI, row: HTMLElement, delta: number): void {
  const def = settingDef(row);
  const cur = ui.app.save.settings;
  if (def.kind === 'range') setSetting(ui, def.key, Math.round(Math.max(0, Math.min(1, cur[def.key] + delta * 0.05)) * 20) / 20);
  else if (def.kind === 'toggle') setSetting(ui, def.key, !cur[def.key]);
  else {
    const opts = def.options;
    const i = opts.findIndex(([v]) => v === cur[def.key]);
    setSetting(ui, def.key, opts[(i + delta + opts.length) % opts.length][0]);
  }
}

export function adjustSetting(ui: UI, delta: number): boolean {
  const row = document.activeElement as HTMLElement | null;
  if (!row || !row.classList.contains('set') || !ui.screenEl?.contains(row)) return false;
  stepSetting(ui, row, delta);
  ui.app.uiSound('uiMove');
  return true;
}

export function paintSetting(ui: UI, row: HTMLElement): void {
  const def = settingDef(row);
  const ctl = row.querySelector<HTMLElement>('.ctl')!;
  if (def.kind === 'range') {
    const n = ui.app.save.settings[def.key];
    if (!ctl.firstChild) ctl.innerHTML = '<span class="track"><span class="fill"></span><span class="thumb"></span></span><b class="val"></b>';
    ctl.style.setProperty('--v', String(n));
    ctl.querySelector('.val')!.textContent = `${Math.round(n * 100)} %`;
    row.setAttribute('role', 'slider');
    row.setAttribute('aria-valuenow', String(Math.round(n * 100)));
  } else if (def.kind === 'toggle') {
    const on = ui.app.save.settings[def.key];
    ctl.innerHTML = `<span class="switch"><i></i></span><b class="val">${on ? 'Oui' : 'Non'}</b>`;
    row.classList.toggle('on', on);
    row.setAttribute('role', 'switch');
    row.setAttribute('aria-checked', String(on));
  } else {
    const v = ui.app.save.settings[def.key];
    const label = def.options.find(([o]) => o === v)?.[1] ?? '';
    ctl.innerHTML = `<span class="arrow prev">‹</span><b class="val">${esc(label)}</b><span class="arrow next">›</span>`;
  }
}
