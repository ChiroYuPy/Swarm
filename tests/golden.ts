/**
 * Golden regression test: replays a fixed set of scenarios and compares state hashes against
 * `tests/golden.json`. Any change to gameplay (or to the order of content in src/data) breaks it.
 *
 * - Pure refactor: this test MUST stay green without touching golden.json.
 * - Intended gameplay change: regenerate with `npm run golden:update` and say so in the commit.
 *
 * This module holds the scenarios; tests/golden.test.ts compares, scripts/update-golden.ts writes.
 *
 * Scenarios are built from the data arrays (by index, not by id), so renaming content ids keeps
 * the hashes, while reordering content changes them.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createGame,
  step,
  hashState,
  isAwaitingChoice,
  choiceCode,
  INPUT_USE,
  MAX_PASSIVE_SLOTS,
  MAX_WEAPON_SLOTS,
  TICK_RATE,
  type GameConfig,
  type SandboxConfig,
} from '../src/sim';
import { botInput } from '../src/ai/bot';
import { ALL_WEAPONS } from '../src/data/weapons';
import { PASSIVES } from '../src/data/passives';
import { PICKUPS } from '../src/data/loot';
import { BOSS_ORDER } from '../src/data/enemies';
import { DIFFICULTIES } from '../src/data/difficulty';

const GOLDEN_FILE = fileURLToPath(new URL('./golden.json', import.meta.url));
/** A hash is recorded every CHECKPOINT_SECONDS of game time, to locate where a run diverges. */
export const CHECKPOINT_SECONDS = 15;
const CHECKPOINT = CHECKPOINT_SECONDS * TICK_RATE;

export interface Scenario {
  name: string;
  cfg: GameConfig;
  seconds: number;
  driver: 'bot' | 'scripted';
  /** game tick (relative to the start) at which the stored item is used */
  useItemAt?: number;
}

function sandbox(over: Partial<SandboxConfig>): SandboxConfig {
  return {
    invincible: true,
    level: 20,
    startWave: 10,
    enemyMul: 1.5,
    enemies: null,
    bosses: false,
    duel: null,
    duelMark: 1,
    summons: true,
    might: 1,
    xp: 1,
    weapons: [],
    passives: PASSIVES.slice(0, MAX_PASSIVE_SLOTS).map((p) => ({ id: p.id, level: 3 })),
    item: null,
    ...over,
  };
}

const maxed = (w: (typeof ALL_WEAPONS)[number]) => ({ id: w.id, level: w.levels.length });

export function scenarios(): Scenario[] {
  const out: Scenario[] = [];
  // Full games driven by the bot, on every difficulty.
  DIFFICULTIES.forEach((_d, i) =>
    out.push({ name: `bot-${i}`, cfg: { seed: `GOLDEN-BOT-${i}`, difficulty: i }, seconds: i === 1 ? 300 : 150, driver: 'bot' }),
  );
  // Every weapon (base and evolved) at max level, MAX_WEAPON_SLOTS at a time.
  for (let i = 0; i < ALL_WEAPONS.length; i += MAX_WEAPON_SLOTS) {
    const group = ALL_WEAPONS.slice(i, i + MAX_WEAPON_SLOTS);
    out.push({
      name: `weapons-${i / MAX_WEAPON_SLOTS}`,
      cfg: { seed: `GOLDEN-WEAPONS-${i}`, sandbox: sandbox({ weapons: group.map(maxed) }) },
      seconds: 40,
      driver: 'scripted',
    });
  }
  // Every boss in a duel, with its reinforcements.
  BOSS_ORDER.forEach((id, i) =>
    out.push({
      name: `boss-${i}`,
      cfg: { seed: `GOLDEN-BOSS-${i}`, sandbox: sandbox({ duel: id, duelMark: 1 + (i % 2), weapons: ALL_WEAPONS.slice(0, 3).map(maxed) }) },
      seconds: 40,
      driver: 'scripted',
    }),
  );
  // Every active item, used once in a crowd.
  PICKUPS.forEach((k, i) => {
    if (k.kind !== 'active') return;
    out.push({
      name: `item-${i}`,
      cfg: { seed: `GOLDEN-ITEM-${i}`, sandbox: sandbox({ item: k.id, enemyMul: 2.5, weapons: [maxed(ALL_WEAPONS[0])] }) },
      seconds: 20,
      driver: 'scripted',
      useItemAt: 6 * TICK_RATE,
    });
  });
  return out;
}

/** Deterministic input without the bot: slow spiral walk, first offer at each level-up. */
function scriptedInput(i: number): number {
  return 1 + (Math.floor(i / 90) % 64);
}

export function runScenario(sc: Scenario): string[] {
  const s = createGame(sc.cfg);
  const start = s.tick;
  const end = start + sc.seconds * TICK_RATE;
  const hashes: string[] = [];
  let used = sc.useItemAt === undefined;
  let next = start + CHECKPOINT;
  let i = 0;
  const input = [0];
  while (s.tick < end && !s.over && i < sc.seconds * TICK_RATE * 4) {
    if (!used && s.tick - start >= sc.useItemAt! && !isAwaitingChoice(s)) {
      input[0] = INPUT_USE;
      used = true;
    } else if (sc.driver === 'bot') input[0] = botInput(s, 0);
    else input[0] = isAwaitingChoice(s) ? choiceCode(i % 3) : scriptedInput(i);
    step(s, input);
    i++;
    if (s.tick >= next) {
      hashes.push(hashState(s));
      next += CHECKPOINT;
    }
  }
  hashes.push(`end@${s.tick}:${hashState(s)}`);
  return hashes;
}

export type Golden = Record<string, string[]>;

export function readGolden(): Golden {
  return existsSync(GOLDEN_FILE) ? JSON.parse(readFileSync(GOLDEN_FILE, 'utf8')) : {};
}

export function writeGolden(g: Golden): void {
  writeFileSync(GOLDEN_FILE, JSON.stringify(g, null, 2) + '\n');
}
