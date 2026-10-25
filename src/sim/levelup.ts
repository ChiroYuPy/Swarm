/**
 * Level-up offers, applying choices, evolutions.
 *
 * Reproducibility: the offers of level L are drawn with a PRNG derived from (seed, LEVELUP, L), among
 * candidates listed in data order from the player's build only. Two players with the same build at the
 * same level of a seed therefore see exactly the same offers, whatever the path to get there.
 * The rules (early free draw, then upgrades with at most one new item, sometimes a heal) are in LOOT.offers.
 */
import { ALL_WEAPONS, BASE_WEAPONS } from '../data/weapons';
import { PASSIVES } from '../data/passives';
import { LOOT } from '../data/loot';
import { INPUT_SWAP_BASE, INPUT_SWAP_CANCEL, MAX_ITEM_LEVEL, MAX_PASSIVE_SLOTS, MAX_WEAPON_SLOTS } from './constants';
import { Rng, STREAM, deriveSeed } from './rng';
import { FUSION_TABLE, weaponMaxLevel } from './registry';
import { computeStats } from './player';
import { healPlayer } from './combat';
import {
  EV_CHEST,
  EV_CHOICE,
  EV_FUSION,
  OFFER_FUSION,
  OFFER_PASSIVE,
  OFFER_HEAL,
  OFFER_SWAP,
  OFFER_WEAPON,
  PassiveInst,
  WeaponInst,
  emit,
  type GameState,
  type Offer,
  type Player,
} from './state';

/** Cards per level-up. */
const OFFER_COUNT = 3;

interface Candidate {
  offer: Offer;
  weight: number;
}

const weaponWeight = (id: number): number => BASE_WEAPONS[id].weight ?? 1;
const passiveWeight = (id: number): number => PASSIVES[id].weight ?? 0.85;

function findWeapon(p: Player, def: number): WeaponInst | undefined {
  for (const w of p.weapons) if (w.def === def) return w;
  return undefined;
}
function findPassive(p: Player, def: number): PassiveInst | undefined {
  for (const x of p.passives) if (x.def === def) return x;
  return undefined;
}

/** Indices of the evolutions available to this player: their weapon is at max level (data priority order). */
export function availableFusions(p: Player): number[] {
  const out: number[] = [];
  for (let i = 0; i < FUSION_TABLE.length; i++) {
    const f = FUSION_TABLE[i];
    const w = findWeapon(p, f.weapon);
    if (!w || w.level < weaponMaxLevel(f.weapon)) continue;
    out.push(i);
  }
  return out;
}

/** What the player could be offered: upgrades of what they hold (evolutions included), new weapons, new passives. */
function candidates(p: Player): { ups: Candidate[]; newWeapons: Candidate[]; newPassives: Candidate[] } {
  const ups: Candidate[] = [];
  const newWeapons: Candidate[] = [];
  const newPassives: Candidate[] = [];
  const fusions = availableFusions(p);
  for (let id = 0; id < BASE_WEAPONS.length; id++) {
    const weight = weaponWeight(id);
    const owned = findWeapon(p, id);
    if (owned) {
      if (owned.level < weaponMaxLevel(id)) ups.push({ offer: { kind: OFFER_WEAPON, id, toLevel: owned.level + 1 }, weight });
      else {
        // The upgrade of a max-level weapon is its evolution, if it has one.
        const f = fusions.find((k) => FUSION_TABLE[k].weapon === id);
        if (f !== undefined) ups.push({ offer: { kind: OFFER_FUSION, id: f, toLevel: 1 }, weight });
      }
    } else if (!p.banned.includes(id) && p.weapons.length < MAX_WEAPON_SLOTS) {
      newWeapons.push({ offer: { kind: OFFER_WEAPON, id, toLevel: 1 }, weight });
    }
  }
  for (let id = 0; id < PASSIVES.length; id++) {
    const weight = passiveWeight(id);
    const owned = findPassive(p, id);
    if (owned) {
      if (owned.level < MAX_ITEM_LEVEL) ups.push({ offer: { kind: OFFER_PASSIVE, id, toLevel: owned.level + 1 }, weight });
    } else if (p.passives.length < MAX_PASSIVE_SLOTS) {
      newPassives.push({ offer: { kind: OFFER_PASSIVE, id, toLevel: 1 }, weight });
    }
  }
  return { ups, newWeapons, newPassives };
}

/** Weighted draw of one candidate, removed from the pool. */
function draw(rng: Rng, pool: Candidate[]): Offer {
  let total = 0;
  for (const c of pool) total += c.weight;
  let r = rng.next() * total;
  let pick = pool.length - 1;
  for (let k = 0; k < pool.length; k++) {
    r -= pool[k].weight;
    if (r < 0) {
      pick = k;
      break;
    }
  }
  return pool.splice(pick, 1)[0].offer;
}

export function rollOffers(s: GameState, p: Player): void {
  p.swapSlot = -1;
  const level = p.level - p.pendingLevels + 1;
  p.offerLevel = level;
  const cfg = LOOT.offers;
  const rng = new Rng(deriveSeed(s.seed, STREAM.LEVELUP, level));
  const { ups, newWeapons, newPassives } = candidates(p);
  const offers: Offer[] = [];
  let heal = false;
  if (level <= 1 + cfg.earlyLevels) {
    // First level-ups: new items and upgrades mixed freely.
    const all = [...ups, ...newWeapons, ...newPassives];
    while (offers.length < OFFER_COUNT && all.length > 0) offers.push(draw(rng, all));
  } else {
    const r = rng.next();
    let fresh: Candidate[] = [];
    if (r < cfg.newWeapon) fresh = newWeapons.length > 0 ? newWeapons : newPassives;
    else if (r < cfg.newWeapon + cfg.newPassive) fresh = newPassives.length > 0 ? newPassives : newWeapons;
    heal = rng.chance(ups.length <= cfg.fewUpgrades ? cfg.healFew : cfg.heal);
    const cards = OFFER_COUNT - (heal ? 1 : 0);
    const upCards = cards - (fresh.length > 0 ? 1 : 0);
    while (offers.length < upCards && ups.length > 0) offers.push(draw(rng, ups));
    // The new item takes a random place among the upgrades.
    if (fresh.length > 0) offers.splice(rng.int(offers.length + 1), 0, draw(rng, fresh));
    // Not enough upgrades left: more new items fill in.
    const rest = [...newWeapons, ...newPassives];
    while (offers.length < cards && rest.length > 0) offers.push(draw(rng, rest));
  }
  if (heal || offers.length < OFFER_COUNT) offers.push({ kind: OFFER_HEAL, id: 0, toLevel: 0 });
  p.offers = offers;
}

export function addWeapon(p: Player, def: number): WeaponInst {
  const w = new WeaponInst();
  w.def = def;
  w.level = 1;
  w.timer = 30;
  p.weapons.push(w);
  return w;
}

export function applyFusion(s: GameState, p: Player, fusionIndex: number): boolean {
  const f = FUSION_TABLE[fusionIndex];
  const w = findWeapon(p, f.weapon);
  if (!w) return false;
  w.def = f.result;
  w.level = 1;
  w.timer = 0;
  w.shots = 0;
  w.burstLeft = 0;
  w.activeTicks = 0;
  w.tickTimer = 0;
  p.banned.push(f.weapon);
  emit(s, EV_FUSION, p.x, p.y, f.result, 0, 0, 0, p.index);
  return true;
}

function applyOfferEffect(s: GameState, p: Player, o: Offer): void {
  switch (o.kind) {
    case OFFER_WEAPON: {
      const w = findWeapon(p, o.id);
      if (w) w.level = Math.min(w.level + 1, weaponMaxLevel(o.id));
      else addWeapon(p, o.id);
      break;
    }
    case OFFER_PASSIVE: {
      const ps = findPassive(p, o.id);
      if (ps) ps.level = Math.min(ps.level + 1, MAX_ITEM_LEVEL);
      else {
        const n = new PassiveInst();
        n.def = o.id;
        n.level = 1;
        p.passives.push(n);
      }
      break;
    }
    case OFFER_FUSION:
      applyFusion(s, p, o.id);
      break;
    case OFFER_HEAL:
      healPlayer(s, p, p.stats.maxHp * LOOT.healAmount);
      break;
    case OFFER_SWAP:
      // Applied by applyChoice (applySwap), never here.
      break;
    default:
      // Exhaustive: an OfferKind without its case fails to typecheck here.
      o.kind satisfies never;
  }
  computeStats(p);
}

// ---------- Weapon swap ----------

/** Weapons the weapon in slot `slot` can be swapped for (base ↔ base, evolution ↔ evolution). */
function swapCandidates(p: Player, slot: number): number[] {
  const w = p.weapons[slot];
  if (!w) return [];
  const out: number[] = [];
  if (!ALL_WEAPONS[w.def].fusion) {
    for (let id = 0; id < BASE_WEAPONS.length; id++) if (!findWeapon(p, id) && !p.banned.includes(id)) out.push(id);
  } else {
    for (const f of FUSION_TABLE) {
      // An evolution whose base weapon is still held would be a duplicate: excluded.
      if (findWeapon(p, f.result) || findWeapon(p, f.weapon)) continue;
      if (!out.includes(f.result)) out.push(f.result);
    }
  }
  return out;
}

/** Can the player swap the weapon in this slot now? */
export function canSwap(p: Player, slot: number): boolean {
  return p.alive && p.pendingLevels > 0 && p.swaps > 0 && swapCandidates(p, slot).length > 0;
}

/** Opens the swap: the offers become 3 weapons of the same level (order fixed by seed, level, slot). */
function startSwap(s: GameState, p: Player, slot: number): void {
  if (!canSwap(p, slot)) return;
  const cands = swapCandidates(p, slot);
  const rng = new Rng(deriveSeed(s.seed, STREAM.LEVELUP, 0x5000 + p.offerLevel * 8 + slot));
  for (let i = cands.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = cands[i];
    cands[i] = cands[j];
    cands[j] = t;
  }
  const level = p.weapons[slot].level;
  p.swapSlot = slot;
  p.offers = cands.slice(0, 3).map((id) => ({ kind: OFFER_SWAP, id, toLevel: Math.min(level, weaponMaxLevel(id)) }));
}

function applySwap(s: GameState, p: Player, o: Offer): void {
  const w = p.weapons[p.swapSlot];
  p.swapSlot = -1;
  if (!w) return;
  // The given-back weapon never comes back; neither does the base weapon of a received evolution.
  p.banned.push(w.def);
  for (const f of FUSION_TABLE) if (f.result === o.id) p.banned.push(f.weapon);
  w.def = o.id;
  w.level = o.toLevel;
  w.timer = 30;
  w.shots = 0;
  w.burstLeft = 0;
  w.activeTicks = 0;
  w.tickTimer = 0;
  p.swaps--;
  computeStats(p);
  emit(s, EV_CHOICE, p.x, p.y, o.id, o.kind, o.toLevel, 0, p.index);
}

/** Swap code received at level-up: open (220..224) or cancel (229). */
export function handleSwapCode(s: GameState, p: Player, code: number): void {
  if (!p.alive || p.pendingLevels === 0) return;
  if (code === INPUT_SWAP_CANCEL) {
    if (p.swapSlot >= 0) rollOffers(s, p);
    return;
  }
  if (p.swapSlot < 0) startSwap(s, p, code - INPUT_SWAP_BASE);
}

export function applyChoice(s: GameState, p: Player, choice: number): void {
  if (p.offers.length === 0) return;
  const o = p.offers[Math.max(0, Math.min(choice, p.offers.length - 1))];
  if (o.kind === OFFER_SWAP) {
    // The swap does not consume the level: go back to this level's offers.
    applySwap(s, p, o);
    rollOffers(s, p);
    return;
  }
  applyOfferEffect(s, p, o);
  emit(s, EV_CHOICE, p.x, p.y, o.id, o.kind, o.toLevel, 0, p.index);
  p.offers = [];
  p.pendingLevels--;
  if (p.pendingLevels > 0) rollOffers(s, p);
}

/** Boss chest: guaranteed evolution if possible, otherwise several random upgrades + heal. */
export function openChest(s: GameState, p: Player): void {
  s.chestCount++;
  const fusions = availableFusions(p);
  if (fusions.length > 0) {
    const f = FUSION_TABLE[fusions[0]];
    emit(s, EV_CHEST, p.x, p.y, 1, 1, 0, 0, p.index);
    applyFusion(s, p, fusions[0]);
    computeStats(p);
    emit(s, EV_CHOICE, p.x, p.y, fusions[0], OFFER_FUSION, f.result, 1, p.index);
    healPlayer(s, p, p.stats.maxHp * LOOT.chestHeal);
    return;
  }
  let given = 0;
  for (let u = 0; u < LOOT.chestUpgrades; u++) {
    const cands: Offer[] = [];
    for (const w of p.weapons) {
      if (w.level < weaponMaxLevel(w.def)) cands.push({ kind: OFFER_WEAPON, id: w.def, toLevel: w.level + 1 });
    }
    for (const ps of p.passives) {
      if (ps.level < MAX_ITEM_LEVEL) cands.push({ kind: OFFER_PASSIVE, id: ps.def, toLevel: ps.level + 1 });
    }
    if (cands.length === 0) break;
    const o = cands[s.rngLoot.int(cands.length)];
    applyOfferEffect(s, p, o);
    emit(s, EV_CHOICE, p.x, p.y, o.id, o.kind, o.toLevel, 1, p.index);
    given++;
  }
  emit(s, EV_CHEST, p.x, p.y, given, 0, 0, 0, p.index);
  healPlayer(s, p, p.stats.maxHp * LOOT.chestHeal);
}
