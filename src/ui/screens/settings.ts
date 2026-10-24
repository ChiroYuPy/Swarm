/**
 * Options screen: setting definitions and groups, the custom controls (slider, switch, choice) and
 * their keyboard / pointer stepping. Changes go through ui.app.applySettings. Changing the language
 * redraws the screen in place, in the new language.
 */
import type { Settings } from '../../storage/storage';
import { DEFAULT_SETTINGS } from '../../storage/storage';
import { LOCALES, LOCALE_NAMES, t } from '../../i18n';
import { SCREEN_COLOR, cascade, esc, heading, keys } from '../html';
import type { UI } from '../ui';

type ChoiceKey = 'quality' | 'language';
type ChoiceDef<K extends ChoiceKey> = { key: K; kind: 'choice'; label: string; hint?: string; options: [Settings[K], string][] };
type SettingDef =
  | { key: 'volume' | 'music' | 'sfx'; kind: 'range'; label: string; hint?: string }
  | { key: 'muted' | 'shake' | 'damageNumbers' | 'showFps' | 'autoPause'; kind: 'toggle'; label: string; hint?: string }
  | ChoiceDef<'quality'>
  | ChoiceDef<'language'>;

/** Options page: groups and settings, in display order (built on demand, in the current language). */
function settingsUi(): { title: string; items: SettingDef[] }[] {
  return [
    {
      title: t('settings.groups.sound'),
      items: [
        { key: 'volume', kind: 'range', label: t('settings.volume') },
        { key: 'music', kind: 'range', label: t('settings.music') },
        { key: 'sfx', kind: 'range', label: t('settings.sfx') },
        { key: 'muted', kind: 'toggle', label: t('settings.muted'), hint: 'M' },
      ],
    },
    {
      title: t('settings.groups.display'),
      items: [
        {
          key: 'quality',
          kind: 'choice',
          label: t('settings.quality'),
          options: [
            ['high', t('settings.qualityHigh')],
            ['low', t('settings.qualityLow')],
          ],
        },
        { key: 'shake', kind: 'toggle', label: t('settings.shake') },
        { key: 'damageNumbers', kind: 'toggle', label: t('settings.damageNumbers') },
        { key: 'showFps', kind: 'toggle', label: t('settings.showFps'), hint: 'F3' },
      ],
    },
    {
      title: t('settings.groups.game'),
      items: [
        // Each language is written in its own language, so it can be found whatever the current one.
        { key: 'language', kind: 'choice', label: t('settings.language'), options: LOCALES.map((l): [Settings['language'], string] => [l, LOCALE_NAMES[l]]) },
        { key: 'autoPause', kind: 'toggle', label: t('settings.autoPause') },
      ],
    },
  ];
}

const settingDef = (row: HTMLElement): SettingDef => settingsUi().flatMap((g) => g.items).find((x) => x.key === row.dataset.key)!;

// ---------- Options ----------
/** Custom controls (sliders, switches, choices): same look everywhere, visible values, keyboard-driven. */
export function showSettings(ui: UI, onBack: () => void, focusKey?: keyof Settings): void {
  ui.settingsReturn = onBack;
  // Redrawn in place (language change): keep the backdrop it was opened with.
  if (ui.current !== 'settings') ui.settingsOverlay = ui.current === 'pause';
  const groups = settingsUi().map(
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
    ${heading(t('settings.title'), SCREEN_COLOR.settings)}
    <div class="panel form ${cascade(1)}">${groups.join('')}</div>
    ${keys([[['↑', '↓'], t('hints.choose')], [['←', '→'], t('hints.adjust')], [[t('keys.esc')], t('hints.back')]])}
    <footer class="actions ${cascade(2)}">
      <button class="btn nav primary" id="back">${t('common.back')}</button>
      <button class="btn nav" id="reset">${t('common.reset')}</button>
    </footer>
  `,
    ui.settingsOverlay,
  );
  el.querySelectorAll<HTMLButtonElement>('.set').forEach((row) => {
    const def = settingDef(row);
    paintSetting(ui, row);
    if (def.kind === 'range') {
      // Click or drag on the track: the value follows the pointer.
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
  ui.home(el.querySelector<HTMLButtonElement>(focusKey ? `.set[data-key="${focusKey}"]` : '.set'));
  el.querySelector('#back')!.addEventListener('click', () => ui.settingsReturn());
  el.querySelector('#reset')!.addEventListener('click', () => {
    // Reset keeps the language: resetting to French would strand an English player.
    ui.app.applySettings({ ...DEFAULT_SETTINGS, language: ui.app.save.settings.language });
    ui.refreshMute();
    el.querySelectorAll<HTMLButtonElement>('.set').forEach((row) => paintSetting(ui, row));
  });
}

function setSetting<K extends keyof Settings>(ui: UI, key: K, value: Settings[K]): void {
  if (ui.app.save.settings[key] === value) return;
  ui.app.applySettings({ ...ui.app.save.settings, [key]: value });
  // New language: the whole screen is redrawn in it, the selection stays on the language row.
  if (key === 'language') {
    showSettings(ui, ui.settingsReturn, 'language');
    return;
  }
  ui.refreshMute();
  const row = ui.screenEl?.querySelector<HTMLButtonElement>(`.set[data-key="${key}"]`);
  if (row) paintSetting(ui, row);
}

/** Left / right (or click) on a row: slider ±5 %, switch flipped, next / previous choice. */
function stepSetting(ui: UI, row: HTMLElement, delta: number): void {
  const def = settingDef(row);
  const cur = ui.app.save.settings;
  if (def.kind === 'range') setSetting(ui, def.key, Math.round(Math.max(0, Math.min(1, cur[def.key] + delta * 0.05)) * 20) / 20);
  else if (def.kind === 'toggle') setSetting(ui, def.key, !cur[def.key]);
  else {
    const opts: [Settings[ChoiceKey], string][] = def.options;
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
    ctl.querySelector('.val')!.textContent = t('format.percent', { n: Math.round(n * 100) });
    row.setAttribute('role', 'slider');
    row.setAttribute('aria-valuenow', String(Math.round(n * 100)));
  } else if (def.kind === 'toggle') {
    const on = ui.app.save.settings[def.key];
    ctl.innerHTML = `<span class="switch"><i></i></span><b class="val">${t(on ? 'common.yes' : 'common.no')}</b>`;
    row.classList.toggle('on', on);
    row.setAttribute('role', 'switch');
    row.setAttribute('aria-checked', String(on));
  } else {
    const v = ui.app.save.settings[def.key];
    const opts: [Settings[ChoiceKey], string][] = def.options;
    const label = opts.find(([o]) => o === v)?.[1] ?? '';
    ctl.innerHTML = `<span class="arrow prev">‹</span><b class="val">${esc(label)}</b><span class="arrow next">›</span>`;
    // The language names are in their own language (screen readers should read them as such).
    if (def.key === 'language') ctl.querySelector('.val')!.setAttribute('lang', String(v));
  }
}
