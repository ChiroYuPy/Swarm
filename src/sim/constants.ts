import { MAP_GEN } from '../data/map';

/** Version de la simulation : à incrémenter dès qu'un changement casse la compatibilité des replays. */
export const SIM_VERSION = 7;
/** Version affichée du jeu, stockée dans les scores. */
export const GAME_VERSION = '0.4.3';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

/** Taille d'un morceau de monde (obstacles générés à la demande). */
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

/** Une case d'immunité par (joueur, emplacement d'arme). */
export const IMMUNE_SLOTS = MAX_PLAYERS * MAX_WEAPON_SLOTS;

export const GRID_CELL = 64;
/** La grille couvre GRID_SIZE × GRID_SIZE cases centrées sur le joueur (monde infini). */
export const GRID_SIZE = 96;
/** Rayon max des ennemis « normaux » rangés dans la grille. Les plus gros vont dans la liste des gros. */
export const NORMAL_MAX_RADIUS = 24;

/**
 * Code d'entrée : 0 = immobile, 1..64 = direction pleine vitesse, 65..128 = demi-vitesse,
 * 200..202 = choix de level-up, 210 = utiliser l'objet activable. Les codes ≥ 200 sont des pas « zéro ».
 */
export const INPUT_IDLE = 0;
export const INPUT_DIRS = 64;
export const INPUT_CHOICE_BASE = 200;
export const INPUT_USE = 210;

/** Durée de vie d'un objet au sol (ticks). */
export const PICKUP_LIFE = 45 * 60;
