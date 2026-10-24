/**
 * Sandbox screen: the free-play settings (definitions, left / right stepping, painting) and the
 * starting loadout tiles, foe and boss duel tiles. Values live in ui.app.save.sandbox.
 */
import { ALL_WEAPONS, BASE_WEAPONS, FUSED_WEAPONS } from '../../data/weapons';
import { PASSIVES } from '../../data/passives';
import { BOSS_ORDER, ENEMIES } from '../../data/enemies';
import { PICKUPS } from '../../data/loot';
import { DIFFICULTIES } from '../../data/difficulty';
import { WAVES } from '../../data/waves';
import { MAX_DUEL_MARK, MAX_PASSIVE_SLOTS, MAX_START_WAVE, MAX_WEAPON_SLOTS } from '../../sim';
import { defaultSandbox } from '../../storage/storage';
import { t } from '../../i18n';
import { difficultyName, enemyName, enemyShortName, passiveName, pickupName, weaponName } from '../../i18n/content';
import { SCREEN_COLOR, cascade, esc, heading, keys, paintIcons } from '../html';
import type { UI } from '../ui';

type SandboxKey =
  | 'difficulty'
  | 'startWave'
  | 'invincible'
  | 'level'
  | 'might'
  | 'xp'
  | 'item'
  | 'enemyMul'
  | 'custom'
  | 'duelMark'
  | 'summons'
  | 'bosses';
type SandboxValue = number | boolean | string | null;
type SandboxDef = { key: SandboxKey; label: string; hint?: string } & ({ kind: 'toggle' } | { kind: 'choice'; options: [SandboxValue, string][] });

const times = (v: number) => `×${String(v).replace('.', t('format.decimal'))}`;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const enemyDef = (id: string) => ENEMIES.find((e) => e.id === id)!;

/** Sandbox screen: run settings, in display order (built on demand, in the current language). */
function sandboxUi(): { title: string; items: SandboxDef[] }[] {
  return [
    {
      title: t('sandbox.groups.game'),
      items: [
        { key: 'difficulty', kind: 'choice', label: t('sandbox.difficulty'), options: DIFFICULTIES.map((d, i) => [i, difficultyName(d.id)]) },
        {
          key: 'startWave',
          kind: 'choice',
          label: t('sandbox.startWave'),
          // text updated from the wave and the duel (see paintSandbox); the bosses follow, as tiles
          hint: ' ',
          options: Array.from({ length: MAX_START_WAVE }, (_, i): [number, string] => [i + 1, t('sandbox.wave', { n: i + 1 })]),
        },
      ],
    },
    {
      title: t('sandbox.groups.hero'),
      items: [
        { key: 'invincible', kind: 'toggle', label: t('sandbox.invincible') },
        { key: 'level', kind: 'choice', label: t('sandbox.level'), options: [1, 5, 10, 15, 20, 30, 40, 50].map((l) => [l, t('common.lvlCap', { n: l })]) },
        { key: 'might', kind: 'choice', label: t('sandbox.might'), options: [0.5, 1, 2, 5, 10, 50].map((v) => [v, times(v)]) },
        {
          key: 'xp',
          kind: 'choice',
          label: t('sandbox.xp'),
          hint: t('sandbox.xpHint'),
          options: [0, 0.5, 1, 2, 5, 10].map((v) => [v, v ? times(v) : t('sandbox.xpNone')]),
        },
        {
          key: 'item',
          kind: 'choice',
          label: t('sandbox.item'),
          options: [[null, t('sandbox.none')], ...PICKUPS.filter((k) => k.kind === 'active').map((k): [string, string] => [k.id, pickupName(k.id)])],
        },
      ],
    },
    {
      title: t('sandbox.groups.enemies'),
      items: [
        { key: 'enemyMul', kind: 'choice', label: t('sandbox.enemyMul'), options: [0, 0.25, 0.5, 1, 2, 3, 5].map((v) => [v, v ? times(v) : t('sandbox.none')]) },
        {
          key: 'custom',
          kind: 'choice',
          label: t('sandbox.types'),
          options: [
            [false, t('sandbox.typesNormal')],
            [true, t('sandbox.typesCustom')],
          ],
        },
      ],
    },
    {
      title: t('sandbox.groups.boss'),
      items: [
        {
          key: 'duelMark',
          kind: 'choice',
          label: t('sandbox.duelMark'),
          hint: t('sandbox.duelMarkHint'),
          options: Array.from({ length: MAX_DUEL_MARK }, (_, i): [number, string] => [i + 1, `Mk ${ROMAN[i]}`]),
        },
        { key: 'summons', kind: 'toggle', label: t('sandbox.summons'), hint: t('sandbox.summonsHint') },
        { key: 'bosses', kind: 'toggle', label: t('sandbox.bosses', { n: WAVES.wavesPerBoss }) },
      ],
    },
  ];
}
const sandboxDef = (row: HTMLElement): SandboxDef => sandboxUi().flatMap((g) => g.items).find((x) => x.key === row.dataset.sb)!;
/** Ennemis qu'on peut choisir dans le bac à sable (ni boss, ni caisse bonus). */
const SANDBOX_FOES = ENEMIES.filter((e) => e.behavior !== 'boss' && e.behavior !== 'prop' && !e.hidden);

/** A short line under "Start at": the chosen duel, or the next boss of the run. */
function waveHint(wave: number, bosses: boolean, duel: string | null): string {
  if (duel) return t('sandbox.duelHint', { name: enemyShortName(duel) });
  const per = WAVES.wavesPerBoss;
  const k = Math.floor((wave - 1) / per);
  return bosses ? t('sandbox.nextBoss', { name: enemyShortName(BOSS_ORDER[k % BOSS_ORDER.length]), wave: per * (k + 1) }) : t('sandbox.noBoss');
}

// ---------- Sandbox ----------
/**
 * Partie libre pour tester : réglages à gauche (mêmes contrôles que les Options), équipement de
 * départ à droite (chaque tuile monte d'un niveau par clic). Rien n'est enregistré dans les records.
 */
export function showSandbox(ui: UI): void {
  // Commencer face à un boss : un clic le choisit (il arrive dès le début, seul), un autre l'enlève.
  const duelTiles = `<div class="tiles duels">${BOSS_ORDER.map((id) => {
    const d = enemyDef(id);
    return `<button class="tile duel nav" data-duel="${id}" style="--c:${d.color}" title="${esc(t('sandbox.duelTitle', { name: enemyName(id) }))}"><span class="ico" data-icon="enemy:${id}" data-size="34"></span><span class="nm">${esc(enemyShortName(id))}</span></button>`;
  }).join('')}</div>`;
  const foes = `<div class="tiles foes">${SANDBOX_FOES.map(
    (e) =>
      `<button class="tile foe nav" data-foe="${e.id}" style="--c:${e.color}" title="${esc(enemyName(e.id))}"><span class="ico" data-icon="enemy:${e.id}" data-size="34"></span><span class="nm">${esc(enemyName(e.id))}</span></button>`,
  ).join('')}</div>`;
  const rowsHtml = sandboxUi().map(
    (g) =>
      `<h3 class="rule">${g.title}</h3>${g.items
        .map(
          (it) =>
            `<button class="set nav" data-sb="${it.key}" data-kind="${it.kind}"><span class="set-label">${esc(it.label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</span><span class="ctl"></span></button>${it.key === 'startWave' ? duelTiles : it.key === 'custom' ? foes : ''}`,
        )
        .join('')}`,
  ).join('');
  const kit = (kind: 'w' | 'p', id: string, name: string, color: string, icon: string) =>
    `<button class="tile kit nav" data-kit="${kind}:${id}" style="--c:${color}" title="${esc(name)}"><span class="ico" data-icon="${icon}" data-size="40"></span><span class="nm">${esc(name)}</span><span class="lv"></span></button>`;
  const el = ui.mount(
    'sandbox',
    `
    ${heading(t('sandbox.title'), SCREEN_COLOR.sandbox, t('sandbox.sub'))}
    <div class="sandbox-grid ${cascade(1)}">
      <div class="panel form">${rowsHtml}</div>
      <div class="panel loadout">
        <h3 class="rule">${t('common.weapons')} <small class="slots" data-slots="w"></small></h3>
        <div class="tiles">${BASE_WEAPONS.map((w) => kit('w', w.id, weaponName(w.id), w.color, `weapon:${w.id}`)).join('')}</div>
        <h3 class="rule">${t('common.evolutions')}</h3>
        <div class="tiles">${FUSED_WEAPONS.map((w) => kit('w', w.id, weaponName(w.id), w.color, `weapon:${w.id}`)).join('')}</div>
        <h3 class="rule">${t('common.passives')} <small class="slots" data-slots="p"></small></h3>
        <div class="tiles">${PASSIVES.map((x) => kit('p', x.id, passiveName(x.id), x.color, `passive:${x.id}`)).join('')}</div>
      </div>
    </div>
    ${keys([
      [['←', '→'], t('hints.adjust')],
      [[t('keys.click')], t('hints.nextLevel')],
      [[t('keys.rightClick')], t('hints.prevLevel')],
      [[t('keys.esc')], t('hints.back')],
    ])}
    <footer class="actions ${cascade(2)}">
      <button class="btn nav primary go" id="start">${t('sandbox.start')}</button>
      <button class="btn nav" id="reset">${t('common.reset')}</button>
      <button class="btn nav" id="back">${t('common.back')}</button>
    </footer>
  `,
  );
  paintIcons(el, 40);
  el.querySelectorAll<HTMLButtonElement>('.set').forEach((row) =>
    row.addEventListener('click', (e) => stepSandbox(ui, row, (e.target as HTMLElement).closest('.arrow.prev') ? -1 : 1)),
  );
  el.querySelectorAll<HTMLButtonElement>('.kit').forEach((t) => {
    t.addEventListener('click', () => stepKit(ui, t, 1));
    t.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      stepKit(ui, t, -1);
      ui.app.uiSound('ui');
    });
  });
  el.querySelectorAll<HTMLButtonElement>('.foe').forEach((t) => t.addEventListener('click', () => toggleFoe(ui, t)));
  el.querySelectorAll<HTMLButtonElement>('.duel').forEach((t) => t.addEventListener('click', () => toggleDuel(ui, t)));
  el.querySelector('#start')!.addEventListener('click', () => ui.app.playSandbox(ui.app.save.sandbox));
  el.querySelector('#reset')!.addEventListener('click', () => {
    ui.app.save.sandbox = defaultSandbox();
    paintSandbox(ui);
  });
  el.querySelector('#back')!.addEventListener('click', () => ui.showMenu());
  paintSandbox(ui);
}

function sandboxValue(ui: UI, key: SandboxKey): SandboxValue {
  const sb = ui.app.save.sandbox;
  if (key === 'difficulty') return sb.difficulty;
  if (key === 'custom') return sb.rules.enemies !== null;
  return sb.rules[key];
}

/** Gauche / droite (ou clic) sur une ligne : choix suivant / précédent, interrupteur inversé. */
function stepSandbox(ui: UI, row: HTMLElement, delta: number): void {
  const def = sandboxDef(row);
  const sb = ui.app.save.sandbox;
  const cur = sandboxValue(ui, def.key);
  let v: SandboxValue;
  if (def.kind === 'toggle') v = !cur;
  else {
    // Valeur inconnue (vieille sauvegarde) : on repart du premier choix.
    const opts = def.options;
    const i = opts.findIndex(([o]) => o === cur);
    v = opts[i < 0 ? 0 : (i + delta + opts.length) % opts.length][0];
  }
  if (def.key === 'difficulty') sb.difficulty = v as number;
  // « Sur mesure » part de tous les types : il n'y a plus qu'à retirer ceux dont on ne veut pas.
  else if (def.key === 'custom') sb.rules.enemies = v ? SANDBOX_FOES.map((e) => e.id) : null;
  else (sb.rules as unknown as Record<string, SandboxValue>)[def.key] = v;
  paintSandbox(ui);
}

/** Tuile d'équipement : niveau suivant (ou précédent), retour à « absent » après le niveau max. */
function stepKit(ui: UI, tile: HTMLElement, delta: number): void {
  const r = ui.app.save.sandbox.rules;
  const [kind, id] = tile.dataset.kit!.split(':');
  const list = kind === 'w' ? r.weapons : r.passives;
  const max = kind === 'w' ? ALL_WEAPONS.find((w) => w.id === id)!.levels.length : 5;
  const cap = kind === 'w' ? MAX_WEAPON_SLOTS : MAX_PASSIVE_SLOTS;
  const cur = list.find((x) => x.id === id);
  const next = ((cur?.level ?? 0) + delta + max + 1) % (max + 1);
  if (!cur && next > 0 && list.length >= cap) {
    // Emplacements pleins : le compteur clignote, rien ne change.
    const slots = ui.screenEl?.querySelector<HTMLElement>(`[data-slots="${kind}"]`);
    slots?.classList.remove('full');
    void slots?.offsetWidth;
    slots?.classList.add('full');
    return;
  }
  if (cur && next === 0) list.splice(list.indexOf(cur), 1);
  else if (cur) cur.level = next;
  else list.push({ id, level: next });
  paintSandbox(ui);
}

function toggleFoe(ui: UI, tile: HTMLElement): void {
  const r = ui.app.save.sandbox.rules;
  if (!r.enemies) return;
  const id = tile.dataset.foe!;
  r.enemies = r.enemies.includes(id) ? r.enemies.filter((x) => x !== id) : [...r.enemies, id];
  paintSandbox(ui);
}

function toggleDuel(ui: UI, tile: HTMLElement): void {
  const r = ui.app.save.sandbox.rules;
  r.duel = r.duel === tile.dataset.duel ? null : tile.dataset.duel!;
  paintSandbox(ui);
}

export function adjustSandbox(ui: UI, delta: number): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el || !ui.screenEl?.contains(el)) return false;
  if (el.classList.contains('set')) stepSandbox(ui, el, delta);
  else if (el.classList.contains('kit')) stepKit(ui, el, delta);
  else if (el.classList.contains('foe')) toggleFoe(ui, el);
  else if (el.classList.contains('duel')) toggleDuel(ui, el);
  else return false;
  ui.app.uiSound('uiMove');
  return true;
}

/** Redessine toutes les valeurs de l'écran Sandbox à partir des réglages en mémoire. */
function paintSandbox(ui: UI): void {
  const el = ui.screenEl;
  if (ui.current !== 'sandbox' || !el) return;
  const r = ui.app.save.sandbox.rules;
  el.querySelectorAll<HTMLButtonElement>('.set').forEach((row) => {
    const def = sandboxDef(row);
    const v = sandboxValue(ui, def.key);
    const ctl = row.querySelector<HTMLElement>('.ctl')!;
    const hint = row.querySelector<HTMLElement>('.set-label small');
    if (def.key === 'startWave' && hint) hint.textContent = waveHint(r.startWave, r.bosses, r.duel);
    // La force ne compte que pour un duel.
    if (def.key === 'duelMark') row.disabled = !r.duel;
    if (def.kind === 'toggle') {
      ctl.innerHTML = `<span class="switch"><i></i></span><b class="val">${t(v ? 'common.yes' : 'common.no')}</b>`;
      row.classList.toggle('on', !!v);
      row.setAttribute('role', 'switch');
      row.setAttribute('aria-checked', String(!!v));
    } else {
      const label = def.options.find(([o]) => o === v)?.[1] ?? String(v);
      ctl.innerHTML = `<span class="arrow prev">‹</span><b class="val">${esc(label)}</b><span class="arrow next">›</span>`;
    }
  });
  el.querySelector('.foes')!.classList.toggle('off', !r.enemies);
  el.querySelectorAll<HTMLElement>('.duel').forEach((t) => t.classList.toggle('on', t.dataset.duel === r.duel));
  el.querySelectorAll<HTMLButtonElement>('.foe').forEach((t) => {
    t.disabled = !r.enemies;
    t.classList.toggle('on', !!r.enemies?.includes(t.dataset.foe!));
  });
  el.querySelectorAll<HTMLElement>('.kit').forEach((tile) => {
    const [kind, id] = tile.dataset.kit!.split(':');
    const it = (kind === 'w' ? r.weapons : r.passives).find((x) => x.id === id);
    const fusion = kind === 'w' && !!ALL_WEAPONS.find((w) => w.id === id)!.fusion;
    tile.classList.toggle('on', !!it);
    tile.querySelector('.lv')!.textContent = it ? (fusion ? t('sandbox.equipped') : t('common.lvlCap', { n: it.level })) : '—';
  });
  el.querySelector('[data-slots="w"]')!.textContent = `${r.weapons.length}/${MAX_WEAPON_SLOTS}`;
  el.querySelector('[data-slots="p"]')!.textContent = `${r.passives.length}/${MAX_PASSIVE_SLOTS}`;
}
