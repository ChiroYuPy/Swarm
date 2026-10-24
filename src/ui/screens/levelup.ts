/**
 * Level-up screen: the offer cards (weapon, passive, swap, evolution, heal), the weapon swap bar, and
 * card focus / confirm for keyboard and gamepad (ui.levelFocus, ui.levelCount, ui.levelOpenedAt).
 */
import { ALL_WEAPONS } from '../../data/weapons';
import { PASSIVES } from '../../data/passives';
import { PICKUPS } from '../../data/loot';
import {
  FUSION_TABLE,
  MAX_PASSIVE_SLOTS,
  MAX_WEAPON_SLOTS,
  OFFER_FUSION,
  OFFER_PASSIVE,
  OFFER_SWAP,
  OFFER_WEAPON,
  weaponDef,
  type Offer,
} from '../../sim';
import { iconCanvas } from '../../render/icons';
import { evolutionHint, fusionPartner, passiveTotal } from '../describe';
import { SCREEN_COLOR, esc, heading, levelPips } from '../html';
import type { LevelUpSwap } from '../types';
import type { UI } from '../ui';

// ---------- Level-up ----------
export function showLevelUp(
  ui: UI,
  level: number,
  offers: Offer[],
  ownedLevels: (o: Offer) => number,
  slots: { weapons: number; passives: number },
  swap: LevelUpSwap,
): void {
  const swapping = swap.slot >= 0 ? swap.weapons[swap.slot] : null;
  const cards = offers
    .map((o, i) => {
      let tag = '';
      let name = '';
      let line = '';
      let sub = '';
      let color = '#ffffff';
      let kind: 'weapon' | 'passive' | 'pickup' = 'weapon';
      let iconId = '';
      let pips = '';
      if (o.kind === OFFER_WEAPON) {
        const d = ALL_WEAPONS[o.id];
        const owned = ownedLevels(o);
        tag = owned ? `Arme · niveau ${owned} → ${o.toLevel}` : `Nouvelle arme · ${slots.weapons + 1}/${MAX_WEAPON_SLOTS}`;
        name = d.name;
        line = d.levelText[Math.max(0, o.toLevel - 1)];
        sub = owned ? (o.toLevel === 5 ? evolutionHint(d.id) : '') : d.desc;
        color = d.color;
        iconId = d.id;
        pips = levelPips(o.toLevel, 5, true);
      } else if (o.kind === OFFER_PASSIVE) {
        const d = PASSIVES[o.id];
        const owned = ownedLevels(o);
        tag = owned ? `Passif · niveau ${owned} → ${o.toLevel}` : `Nouveau passif · ${slots.passives + 1}/${MAX_PASSIVE_SLOTS}`;
        name = d.name;
        line = d.effect;
        sub = owned ? `Total : ${passiveTotal(d, o.toLevel)}` : d.desc;
        color = d.color;
        kind = 'passive';
        iconId = d.id;
        pips = levelPips(o.toLevel, 5, true);
      } else if (o.kind === OFFER_SWAP) {
        const d = ALL_WEAPONS[o.id];
        tag = d.fusion ? 'Échange · évolution' : `Échange · niveau ${o.toLevel}`;
        name = d.name;
        line = d.fusion ? d.levelText[0] : d.levelText[Math.max(0, o.toLevel - 1)];
        sub = swapping ? `Remplace ${swapping.name}` : '';
        color = d.color;
        iconId = d.id;
        if (!d.fusion) pips = levelPips(o.toLevel, 5, true);
      } else if (o.kind === OFFER_FUSION) {
        const f = FUSION_TABLE[o.id];
        const r = weaponDef(f.result);
        tag = 'Évolution';
        name = r.name;
        line = r.levelText[0];
        sub = `${weaponDef(f.weapon).name} + ${fusionPartner(o.id).name}`;
        color = r.color;
        iconId = r.id;
      } else {
        tag = 'Équipement complet';
        name = PICKUPS[0].name;
        line = PICKUPS[0].desc;
        color = PICKUPS[0].color;
        kind = 'pickup';
        iconId = 'heal';
      }
      return `<button class="card offer pick ${o.kind === OFFER_FUSION ? 'fusion' : ''}" data-i="${i}" data-offer="${i}" style="--c:${color}">
        <span class="key">${i + 1}</span>
        <span class="icon" data-kind="${kind}" data-id="${iconId}"></span>
        <span class="card-tag">${esc(tag)}</span>
        <span class="card-title">${esc(name)}</span>
        ${pips}
        <span class="card-line">${esc(line)}</span>
        ${sub ? `<span class="card-text">${esc(sub)}</span>` : ''}
      </button>`;
    })
    .join('');
  let n = offers.length;
  let bar = '';
  if (swapping) {
    bar = `<div class="swapbar"><button class="swap-cancel pick" data-i="${n++}">Annuler l’échange</button></div>`;
  } else if (swap.weapons.length > 0) {
    const btns = swap.weapons
      .map((w, k) => {
        const ok = swap.charges > 0 && w.can;
        return `<button class="swap-btn ${ok ? 'pick' : ''}" ${ok ? `data-i="${n++}"` : 'disabled'} data-slot="${k}" style="--c:${w.color}" title="${esc(w.name)}">
          <span class="icon" data-kind="weapon" data-id="${w.id}"></span></button>`;
      })
      .join('');
    const label =
      swap.charges > 0
        ? `Échanger une arme · <b>${swap.charges}</b> charge${swap.charges > 1 ? 's' : ''}`
        : 'Échanger une arme · bats un boss pour gagner une charge';
    bar = `<div class="swapbar ${swap.charges > 0 ? '' : 'empty'}"><span class="swap-label">${label}</span>${btns}</div>`;
  }
  const head = swapping
    ? heading(`Échanger ${swapping.name}`, SCREEN_COLOR.swap, 'Choisis l’arme qui la remplace, au même niveau.')
    : heading(`Niveau ${level}`, SCREEN_COLOR.levelup, 'Choisis une amélioration : <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>, flèches + <kbd>Entrée</kbd> ou clic');
  const el = ui.mount('levelup', `${head}<div class="cards">${cards}</div>${bar}`, true);
  el.querySelectorAll<HTMLElement>('.icon').forEach((s) => {
    const px = s.closest('.swap-btn') ? 34 : 60;
    if (s.dataset.id) s.appendChild(iconCanvas(s.dataset.kind as 'weapon' | 'passive' | 'pickup', s.dataset.id, px));
  });
  el.querySelectorAll<HTMLButtonElement>('.card').forEach((b) => {
    b.addEventListener('click', () => ui.app.pickOffer(Number(b.dataset.offer)));
  });
  el.querySelectorAll<HTMLButtonElement>('.swap-btn.pick').forEach((b) => {
    b.addEventListener('click', () => ui.app.startSwap(Number(b.dataset.slot)));
  });
  el.querySelector<HTMLButtonElement>('.swap-cancel')?.addEventListener('click', () => ui.app.cancelSwap());
  ui.levelCount = n;
  ui.levelOpenedAt = performance.now();
  if (ui.kbd) ui.focusCard(0);
  else ui.syncPointer(document.elementFromPoint(ui.pointer.x, ui.pointer.y));
}

/** Carte sélectionnée au level-up (-1 : aucune, la souris est ailleurs). */
export function focusCard(ui: UI, i: number): void {
  if (ui.current !== 'levelup') return;
  ui.levelFocus = i < 0 ? -1 : (i + ui.levelCount) % ui.levelCount;
  ui.screenEl?.querySelectorAll<HTMLElement>('.pick').forEach((c, k) => c.classList.toggle('focus', k === ui.levelFocus));
}

export function moveCard(ui: UI, d: number): void {
  ui.setKbd(true);
  ui.app.uiSound('uiMove');
  ui.focusCard(ui.levelFocus < 0 ? 0 : ui.levelFocus + d);
}

export function confirmCard(ui: UI): void {
  ui.setKbd(true);
  if (ui.current !== 'levelup') return;
  // Rien de sélectionné : la touche fait d'abord apparaître la sélection.
  if (ui.levelFocus < 0) {
    ui.app.uiSound('uiMove');
    ui.focusCard(0);
    return;
  }
  // Garde-fou : une touche tenue au moment où l'écran s'ouvre ne choisit pas à la place du joueur.
  if (performance.now() - ui.levelOpenedAt <= 350) return;
  ui.screenEl?.querySelectorAll<HTMLButtonElement>('.pick')[ui.levelFocus]?.click();
}
