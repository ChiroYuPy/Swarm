/**
 * Pickups.
 * - instant: immediate effect (heal);
 * - timed: bonus active for a few seconds (rage, frenzy, turbo, shield);
 * - active: stored in the single item slot, triggered with Space. A new one replaces the old one;
 * - relic: kept aside and triggered on its own (Totem).
 * The order of PICKUPS gives the simulation's pickup codes (index; PK_* in sim/state.ts): do not reorder
 * without bumping SIM_VERSION. A new pickup of any kind is appended at the end.
 */

export type PickupKind = 'instant' | 'timed' | 'active' | 'relic' | 'chest';

export interface PickupDef {
  /** Name and description live in src/i18n/locales, keyed by this id. */
  id: string;
  kind: PickupKind;
  color: string;
  /** duration (s) of timed bonuses */
  duration?: number;
  /** draw weight within its family */
  weight: number;
}

const PICKUP_LIST = [
  { id: 'heal', kind: 'instant', color: '#39ff7a', weight: 3 },
  { id: 'rage', kind: 'timed', duration: 8, color: '#ff3d6e', weight: 2 },
  { id: 'frenzy', kind: 'timed', duration: 8, color: '#ffe14d', weight: 2 },
  { id: 'turbo', kind: 'timed', duration: 8, color: '#38f6ff', weight: 2 },
  { id: 'shield', kind: 'timed', duration: 5, color: '#a0b4ff', weight: 1 },
  { id: 'fever', kind: 'timed', duration: 15, color: '#b8ff3d', weight: 1.5 },
  { id: 'totem', kind: 'relic', color: '#ffb347', weight: 0.25 },
  { id: 'vacuum', kind: 'active', color: '#ff5a5a', weight: 8 },
  { id: 'freeze', kind: 'active', color: '#9feaff', weight: 3 },
  { id: 'bomb', kind: 'active', color: '#ffd23a', weight: 3 },
  { id: 'clock', kind: 'active', color: '#7f9cff', weight: 2 },
  { id: 'clone', kind: 'active', color: '#5cf2d6', weight: 2 },
  { id: 'eradicate', kind: 'active', color: '#ff3df5', weight: 1 },
  { id: 'chest', kind: 'chest', color: '#ffd23a', weight: 0 },
] as const satisfies readonly PickupDef[];

export const PICKUPS: readonly PickupDef[] = PICKUP_LIST;

/** Every pickup id, typed from the list: tables keyed by it fail to typecheck until a new pickup has its entry. */
export type PickupId = (typeof PICKUP_LIST)[number]['id'];
/** Ids of the pickups of one kind (e.g. `PickupIdOf<'active'>`). */
export type PickupIdOf<K extends PickupKind> = Extract<(typeof PICKUP_LIST)[number], { kind: K }>['id'];

export const LOOT = {
  /** chance per enemy killed to drop a bonus (heal or timed), multiplied by Luck */
  bonusChance: 0.006,
  /** chance per enemy killed to drop an active item */
  activeChance: 0.002,
  /** Swarms drop less (there are very many of them) */
  swarmMul: 0.3,
  swarmGemChance: 0.6,
  healAmount: 0.3,
  bombDamage: 300,
  bombRadius: 460,
  /** Freeze: radius, duration, damage taken ×fragile; a frozen enemy that dies shatters (base damage + share of its max HP) */
  freezeRadius: 420,
  freezeSeconds: 5,
  freezeFragile: 1.5,
  shatterRadius: 70,
  shatterDamage: 18,
  shatterHp: 0.25,
  /** Clock: duration and speed of the rest of the world */
  clockSeconds: 8,
  clockFactor: 0.33,
  /** Clone: duration, radius within which it lures enemies */
  cloneSeconds: 10,
  cloneLure: 450,
  /** Totem: HP restored, invulnerability, knockback wave */
  totemHeal: 0.5,
  totemInvuln: 2,
  totemRadius: 300,
  /** XP Fever */
  feverXp: 2,
  feverMagnet: 2,
  /** share of max HP removed from the boss by Eradicate */
  eradicateBoss: 0.2,
  /**
   * Items that appear on their own in the arena, near the player (every `every` s, even during a boss):
   * most often a Vacuum, otherwise a random active item or bonus. At most `maxVacuums` Vacuums on the ground.
   */
  mapItems: { every: 28, minDist: 320, maxDist: 620, vacuumChance: 0.6, activeChance: 0.5, maxVacuums: 2 },
  /** Weapon swap at level-up: starting charges, gained per boss defeated, maximum */
  swaps: { start: 1, perBoss: 1, max: 3 },
  /** bonus crate: probability of an active item (otherwise a bonus) */
  propActiveChance: 0.4,
  /** boss chest: evolution if possible, otherwise N upgrades + heal */
  chestUpgrades: 3,
  chestHeal: 0.3,
  bossGems: { count: 12, value: 12 },
};
