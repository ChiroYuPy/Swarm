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
import { t, tn } from '../../i18n';
import { passiveDesc, passiveEffect, passiveName, pickupDesc, pickupName, weaponDesc, weaponLevelText, weaponName } from '../../i18n/content';
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
        tag = owned ? t('levelup.weaponUp', { from: owned, to: o.toLevel }) : t('levelup.newWeapon', { n: slots.weapons + 1, max: MAX_WEAPON_SLOTS });
        name = weaponName(d.id);
        line = weaponLevelText(d.id, o.toLevel);
        sub = owned ? (o.toLevel === 5 ? evolutionHint(d.id) : '') : weaponDesc(d.id);
        color = d.color;
        iconId = d.id;
        pips = levelPips(o.toLevel, 5, true);
      } else if (o.kind === OFFER_PASSIVE) {
        const d = PASSIVES[o.id];
        const owned = ownedLevels(o);
        tag = owned ? t('levelup.passiveUp', { from: owned, to: o.toLevel }) : t('levelup.newPassive', { n: slots.passives + 1, max: MAX_PASSIVE_SLOTS });
        name = passiveName(d.id);
        line = passiveEffect(d.id);
        sub = owned ? t('levelup.total', { total: passiveTotal(d, o.toLevel) }) : passiveDesc(d.id);
        color = d.color;
        kind = 'passive';
        iconId = d.id;
        pips = levelPips(o.toLevel, 5, true);
      } else if (o.kind === OFFER_SWAP) {
        const d = ALL_WEAPONS[o.id];
        tag = d.fusion ? t('levelup.swapEvolution') : t('levelup.swapLevel', { n: o.toLevel });
        name = weaponName(d.id);
        line = weaponLevelText(d.id, d.fusion ? 1 : o.toLevel);
        sub = swapping ? t('levelup.replaces', { name: swapping.name }) : '';
        color = d.color;
        iconId = d.id;
        if (!d.fusion) pips = levelPips(o.toLevel, 5, true);
      } else if (o.kind === OFFER_FUSION) {
        const f = FUSION_TABLE[o.id];
        const r = weaponDef(f.result);
        tag = t('common.evolution');
        name = weaponName(r.id);
        line = weaponLevelText(r.id, 1);
        sub = `${weaponName(weaponDef(f.weapon).id)} + ${passiveName(fusionPartner(o.id).id)}`;
        color = r.color;
        iconId = r.id;
      } else {
        tag = t('levelup.full');
        name = pickupName(PICKUPS[0].id);
        line = pickupDesc(PICKUPS[0].id);
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
    bar = `<div class="swapbar"><button class="swap-cancel pick" data-i="${n++}">${t('levelup.cancelSwap')}</button></div>`;
  } else if (swap.weapons.length > 0) {
    const btns = swap.weapons
      .map((w, k) => {
        const ok = swap.charges > 0 && w.can;
        return `<button class="swap-btn ${ok ? 'pick' : ''}" ${ok ? `data-i="${n++}"` : 'disabled'} data-slot="${k}" style="--c:${w.color}" title="${esc(w.name)}">
          <span class="icon" data-kind="weapon" data-id="${w.id}"></span></button>`;
      })
      .join('');
    const label = swap.charges > 0 ? tn('levelup.swapCharges', swap.charges) : t('levelup.swapNoCharge');
    bar = `<div class="swapbar ${swap.charges > 0 ? '' : 'empty'}"><span class="swap-label">${label}</span>${btns}</div>`;
  }
  const head = swapping
    ? heading(t('levelup.swapTitle', { name: swapping.name }), SCREEN_COLOR.swap, t('levelup.swapSub'))
    : heading(t('levelup.title', { n: level }), SCREEN_COLOR.levelup, t('levelup.sub'));
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

/** Selected card on level-up (-1: none, the mouse is elsewhere). */
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
  // Nothing selected: the key first makes the selection appear.
  if (ui.levelFocus < 0) {
    ui.app.uiSound('uiMove');
    ui.focusCard(0);
    return;
  }
  // Safeguard: a key held down when the screen opens does not choose for the player.
  if (performance.now() - ui.levelOpenedAt <= 350) return;
  ui.screenEl?.querySelectorAll<HTMLButtonElement>('.pick')[ui.levelFocus]?.click();
}
