import { version } from '../../package.json';
import { MAP_GEN } from '../data/map';

/** Simulation version: bump it as soon as a change breaks replay compatibility. */
export const SIM_VERSION = 19;
/** Displayed game version, stored in scores. */
export const GAME_VERSION: string = version;

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

/** Size of a world chunk (obstacles generated on demand). */
export const CHUNK = MAP_GEN.chunk;

export const MAX_PLAYERS = 4;
export const MAX_WEAPON_SLOTS = 5;
export const MAX_PASSIVE_SLOTS = 4;
export const MAX_ITEM_LEVEL = 5;

export const MAX_ENEMIES = 1200;
export const MAX_PROJECTILES = 1600;
export const MAX_GEMS = 1200;
export const MAX_PICKUPS = 96;
export const MAX_EVENTS = 4096;

/** One immunity slot per (player, weapon slot). */
export const IMMUNE_SLOTS = MAX_PLAYERS * MAX_WEAPON_SLOTS;

export const GRID_CELL = 64;
/** The grid covers GRID_SIZE × GRID_SIZE cells centred on the player (infinite world). */
export const GRID_SIZE = 96;
/** Max radius of "normal" enemies stored in the grid. Bigger ones go into the big-enemy list. */
export const NORMAL_MAX_RADIUS = 24;

/**
 * Input code: 0 = idle, 1..64 = full-speed direction, 65..128 = half speed,
 * 130 = auto aim, 131..194 = aim in direction (code-131) × 360°/64,
 * 200..202 = level-up choice, 210 = use the active item, 220..224 / 229 = weapon swap. Codes ≥ 130 are "zero-time" steps.
 */
export const INPUT_IDLE = 0;
export const INPUT_DIRS = 64;
export const INPUT_AIM_AUTO = 130;
export const INPUT_AIM_BASE = 131;
export const INPUT_CHOICE_BASE = 200;
export const INPUT_USE = 210;
/** 220..224 = swap the weapon in slot (code-220) at level-up, 229 = cancel the swap ("zero-time" steps) */
export const INPUT_SWAP_BASE = 220;
export const INPUT_SWAP_CANCEL = 229;

/** Lifetime of an item on the ground (ticks). */
export const PICKUP_LIFE = 45 * 60;
