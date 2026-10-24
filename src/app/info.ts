/** Snapshots of the run handed to the UI: build, run summary, level-up owned levels and weapon swap state. */
import {
  makeScoreRecord,
  computeScore,
  canSwap,
  weaponDef,
  OFFER_WEAPON,
  OFFER_PASSIVE,
  type GameState,
  type Offer,
  type Player,
} from '../sim';
import { PASSIVES } from '../data/passives';
import { statDetails } from '../render/hud';
import { weaponName } from '../i18n/content';
import { bestScore, type SaveData } from '../storage/storage';
import type { BuildInfo, RunInfo } from '../ui/ui';

export function runInfo(s: GameState, save: SaveData, sandbox: boolean): RunInfo {
  return {
    record: makeScoreRecord(s, ''),
    bossKills: computeScore(s).bossKills,
    best: bestScore(save, s.difficulty),
    sandbox,
  };
}

export function buildInfo(s: GameState): BuildInfo {
  const p = s.players[0];
  const tick = s.tick;
  return {
    weapons: p.weapons.map((w) => ({ id: weaponDef(w.def).id, level: w.level, fusion: !!weaponDef(w.def).fusion })),
    passives: p.passives.map((x) => ({ id: PASSIVES[x.def].id, level: x.level })),
    // Getter: built when read, in the current language (the pause screen is redrawn after a language change).
    get stats() {
      return statDetails(p, tick);
    },
    might: p.stats.might,
    cooldownMul: p.stats.cooldownMul,
  };
}

/** Current level of the weapon or passive an offer upgrades (0 if new). */
export function ownedLevel(p: Player, o: Offer): number {
  if (o.kind === OFFER_WEAPON) return p.weapons.find((w) => w.def === o.id)?.level ?? 0;
  if (o.kind === OFFER_PASSIVE) return p.passives.find((x) => x.def === o.id)?.level ?? 0;
  return 0;
}

/** Weapon swap state shown on the level-up screen. */
export function swapInfo(p: Player) {
  return {
    charges: p.swaps,
    slot: p.swapSlot,
    weapons: p.weapons.map((w, k) => {
      const d = weaponDef(w.def);
      return { id: d.id, name: weaponName(d.id), color: d.color, can: canSwap(p, k) };
    }),
  };
}
