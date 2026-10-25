# Working on SWARM

Guide for anyone (human or AI agent) changing the game. Read [ARCHITECTURE.md](ARCHITECTURE.md) first for the layer map, determinism and the data → registry pipeline.

## Ground rules

- **Language.** Code, ids, comments, test names and commit messages are in English. Player-facing text lives only in `src/i18n/locales/`: write `fr.ts` first (source of truth), then `en.ts`. Both are required; `en.ts` is typed `LocaleShape`, so a missing or extra key fails `npm run typecheck`. `tests/english-code.test.ts` rejects French text anywhere else.
- **Ids.** A content id is the plain English translation of its French display name (`Lame` → `blade`, `Propulseurs` → `thrusters`, `Étoile ricochet` → `ricochet_star`). Keep the French display names; no creative renames. Renaming a shipped id needs an entry in `src/storage/legacy-ids.ts` and a save migration, because sandbox setups store ids.
- **Order.** Never reorder the content arrays (`BASE_WEAPONS`, `FUSED_WEAPONS`, `FUSIONS`, `PASSIVES`, `PICKUPS`, `ENEMIES`, `BOSS_ORDER`, `DIFFICULTIES`, `WAVES.mixes`) unless you mean to change gameplay. Indices drive the sim, the offer draw, replays, saved scores (difficulty index) and the golden test. Add new content at the end of its array.
- **Determinism.** Nothing in `src/sim` or `src/data` may use `Math.random`, `Date`, `performance`, `Math.sin/cos/atan2/pow/...`, the DOM or `localStorage`. Use `src/sim/dmath.ts` (`dsin`, `dcos`, `datan2`) and the seeded streams of `src/sim/rng.ts`. `src/sim` and `src/data` never import `i18n`, `render`, `ui` or `app`. Enforced by `tsconfig.sim.json`, `tests/purity.test.ts`, `tests/i18n.test.ts`.
- **Check before you stop.** Always run `npm run typecheck && npm test`. For UI, render or CSS changes also run `npm run build`, and look at the result in `npm run dev`.
- **Golden test.** A pure refactor keeps `tests/golden.test.ts` green without touching `tests/golden.json`. An intended gameplay change (numbers, behaviour, new content) regenerates it with `npm run golden:update`, and the commit message says so. If the golden test breaks on a change you thought was a refactor, find out why before regenerating.
- **`SIM_VERSION`** (`src/sim/constants.ts`): "bump it as soon as a change breaks replay compatibility", i.e. whenever the same seed and inputs no longer give the same game. That is any gameplay change, including new content. It is part of `hashState`, so a bump also needs `npm run golden:update`. Pure refactors, render, UI, audio and text changes do not bump it.
- **Save format.** Changing the shape of `SaveData` (`src/storage/storage.ts`) needs `SAVE_VERSION` + 1, a new `if (version === N)` step in `migrate()`, and a case in `tests/storage.test.ts`. A new setting or sandbox field with a default needs no bump: missing fields read as the default.
- **Text tracks numbers.** Many locale descriptions repeat data values ("300 damage", "8 s", "+6%"). When you retune a number in `src/data`, update the matching text in both locales; no test catches a stale number.
- **Fixed enemy stats.** An enemy's HP, damage and speed are the numbers in `src/data/enemies.ts`, always: no scaling with time, difficulty or boss rank (Mk II). Difficulty and progression only change density (spawn rates, packs, caps, summons).
- **Taste.** The maintainer balances by playing: do not loop on `npm run balance` benches unless asked. Audio and music changes are taste-driven: keep to the existing synthesized style and let the maintainer listen before committing. Waves stay readable: 2 or 3 enemy types at once.
- **Git.** Work on `master`. Commit only when asked, never push unless asked: every push to `master` deploys to GitHub Pages.

## Recipes

Each recipe lists the files to touch, in order. Every recipe that changes gameplay ends with: bump `SIM_VERSION`, `npm run golden:update`, `npm run typecheck && npm test`. Then try it in the Sandbox (see [Trying content in the Sandbox](#trying-content-in-the-sandbox)).

### A weapon with an existing behaviour

1. `src/data/weapons.ts`: append to `BASE_WEAPONS`. Exactly 5 levels, built with `prog()` (levels are cumulative deltas). Use only the `WeaponLevel` fields the behaviour reads: open its updater in `src/sim/weapons/` (`projectile.ts`, `orbit.ts`, `aura.ts`, `blade.ts`...).
   ```ts
   {
     id: 'nail_gun', // example only
     behavior: 'projectile',
     color: '#a0ffea',
     levels: prog(
       { damage: 8, cooldown: 0.8, count: 1, speed: 520, pierce: 0, life: 1.0, size: 5, spread: 0.12 },
       { count: 2 },
       { count: 3, damage: 9 },
       { count: 4 },
       { count: 5, pierce: 1 },
     ),
   },
   ```
   Optional `weight` changes how often it is offered (default 1).
2. `src/i18n/locales/fr.ts` then `en.ts`: `weapons.<id>` with `name`, `desc`, `levels` (5 lines, index 0 = when obtained).
3. `src/render/icons.ts`: a painter in `WEAPON_PAINTERS` keyed by the id.
4. Optional: an evolution (next recipe).

Caught automatically: missing text or level lines (`i18n.test.ts`), missing icon (`icons.test.ts`), not 5 levels (`content.test.ts`), unknown behaviour (typecheck), no damage at level 1 or max (`weapons.test.ts` runs every weapon of the data: no list to update). Projectile drawing, shot sound and level-up / codex / HUD / sandbox entries come from the behaviour and the data.

### A new weapon behaviour

1. `src/data/weapons.ts`: add the name to the `Behavior` union; add any new `WeaponLevel` fields with a doc comment.
2. `src/sim/weapons/<name>.ts`: export an updater `(s, p, w, slot, L) => void`. Reuse `src/sim/weapons/common.ts` (`cdTicks`, `aim` / `AIM`, `target`, `inCone`, `facing`, `ticks`, `RETRY_TICKS`), deal damage through `src/sim/combat.ts`, emit `EV_SHOOT` when it fires (drives the sound). Keep state in the `WeaponInst` (`timer`, `activeTicks`, `angles`, `vN`, `vLen`, `vW`...) or in projectiles.
3. `src/sim/weapons/index.ts`: import it and add it to `UPDATER_BY_BEHAVIOR` (typecheck fails until you do).
4. If it spawns its own kind of projectile: a new `PJ_*` constant in `src/sim/state.ts`, added to the `ProjectileKind` union next to it (`Projectile.kind` has that type, so spawning it fails to typecheck until you do). Typecheck then fails until it has a `case` in `updateProjectiles` (`src/sim/projectiles.ts`) and a draw pass in `PASSES` (`src/render/draw-projectiles.ts`, back-to-front order).
5. Visuals around the player (lashes, jets, beams): `src/render/draw-weapon-fx.ts`, keyed on `def.behavior`.
6. `src/render/effects.ts`: an entry in `SHOT_SFX` (typecheck fails until you do).
7. Then the weapon itself: previous recipe. Add a behaviour test in `tests/weapons.test.ts` (see the `arena()` helper there).

### An evolution (fusion)

An evolution is what a base weapon becomes once it is at max level: an "Evolution" card at the next level-up (or the boss chest). It replaces the weapon in the same slot. Passives play no part. At most one evolution per base weapon.

1. `src/data/weapons.ts`: append to `FUSED_WEAPONS` with `fusion: true` and a single level.
2. `src/data/fusions.ts`: append `{ result, weapon }`. List order is the priority when several evolutions are possible.
3. Locales: `evolutions.<id>` with `name`, `desc`, `levels` (1 line), in `fr.ts` then `en.ts`.
4. `src/render/icons.ts`: a painter in `WEAPON_PAINTERS`.
Caught: `fusion.test.ts` (recipe uses a base weapon, one evolution per weapon, every evolution has a recipe, it deals damage), `weapons.test.ts` (every evolution of the data deals damage and is offered once its weapon is maxed), `i18n.test.ts`, `icons.test.ts`. The golden `weapons-N` scenarios include it automatically.

### A passive

1. `src/data/passives.ts`: append to `PASSIVES` with `perLevel` using the existing stat keys (`cooldown`, `speed`, `magnet`, `might`, `area`, `maxHp`, `regen`, `armor`, `luck`). Passives have 5 levels (`MAX_ITEM_LEVEL`).
2. Locales: `passives.<id>` with `name`, `desc`, `effect` (one level).
3. `src/render/icons.ts`: a painter in `PASSIVE_PAINTERS`.

A **new stat** touches more: `PassiveDef.perLevel` (`src/data/passives.ts`), `PlayerStats` and `baseStats()` (`src/sim/state.ts`), `computeStats()` and `applyBuffs()` (`src/sim/player.ts`), the sim code that reads it, `passiveTotal()` (`src/ui/describe.ts`) with a `describe.<stat>` string, and `StatKey` / `STATS` / `statDetails()` (`src/render/hud.ts`) with `stats.<stat>.label` / `.hint` strings.

### An item / pickup

Kinds (`PickupKind` in `src/data/loot.ts`): `instant` (heal), `timed` (rage, frenzy, turbo, shield, fever), `active` (stored, used with Space: vacuum, freeze, bomb, clock, clone, eradicate), `relic` (totem), `chest` (boss reward). Instant, timed and relic drop in the "bonus" family, actives in the "active" family; `weight` is the draw weight within the family.

1. `src/data/loot.ts`: append to `PICKUPS`, whatever its kind; tuning values go in `LOOT`. A pickup's code is its index and the sim reads the kind per code (`PICKUP_KIND`, `isActiveItem()`, `ACTIVE_PICKUPS` in `src/sim/state.ts`), so nothing needs renumbering.
2. Effect. These tables are keyed by the ids typed from `PICKUPS` (`PickupId`, `PickupIdOf<kind>`): typecheck fails until the new id has its entry.
   - Active: an entry in `ACTIVE_EFFECTS` (`src/sim/player.ts`), and its activation visuals and sound in `ACTIVATE_FX` (`src/render/effects.ts`).
   - Timed: a `<name>Until` field on `Player` (`src/sim/state.ts`), an entry in `PICKUP_EFFECTS` (`src/sim/pickups.ts`) that extends it with `buffUntil()`, its effect in `applyBuffs()` (`src/sim/player.ts`) or where it applies, and an entry in `BUFF_FIELDS` in `src/render/hud.ts` (plus `statDetails()` there if it changes a stat).
   - Instant or relic: an entry in `PICKUP_EFFECTS` (`src/sim/pickups.ts`).
3. `src/sim/state.ts`: only if engine code needs the item by name, a `PK_<ID> = pickupCode('<id>')` constant (`pickupCode` only accepts existing ids).
4. Locales: `pickups.<id>` with `name`, `desc`.
5. `src/render/icons.ts`: a painter in `PICKUP_PAINTERS` (typecheck fails until it exists). Pickup toasts are automatic.

Caught: typecheck (effect, activation visuals, HUD buff field, icon), `registry.test.ts` (every `PK_*` name matches its id, kind tables match the data), `icons.test.ts`, `i18n.test.ts`. A new active item also gets its own golden scenario (`item-N`) and appears in the Sandbox "item" choice.

### An enemy with an existing behaviour

1. `src/data/enemies.ts`: append to `ENEMIES` (`id`, `behavior`, `shape`, `color`, `hp`, `speed`, `damage`, `radius`, `xp`, `kbResist`, plus the fields its behaviour reads, see `EnemyBase`). `hidden: true` keeps it out of the codex and the sandbox (for enemies that only come from another one, like `shard`). Optional: `cap` (most alive at once from the waves), `pack` (spawned in packs), `accel` (steering).
2. Locales: `enemies.<id>` with `name`, `desc`.
3. To put it in the waves: `src/data/waves.ts`, a wave of `plan` that features it (the first planned wave containing it is its arrival, announced, in every difficulty) and, for the endless mode, an entry in `mixes`. Keep 2 or 3 types per wave, the new type a minority.
4. The sprite, codex entry (and its live preview), sandbox tile and "new enemy" toast come from the data.

Caught: `i18n.test.ts`; `enemies.test.ts` (at most 3 types at once, every enemy arrives in the plan, caps).

Several types may share a behaviour: the sim, the telegraphs (`src/render/draw-enemies.ts`: fuse flash, blast zones, Jumper landing marks, splitter cracks) and the bot check `ENEMY_BEHAVIOR[e.type] === BEHAVIOR.X` and read that type's own fields (`blastRadius`, `fuse`, `fly`, `hop`...). Movement is shared too: a behaviour only sets the direction it wants (`DX`, `DY` in `updateEnemies`); the enemy accelerates toward it, turns its facing progressively and collides with its neighbours along its shape's outline (`OUTLINE` in `src/sim/enemies.ts`, one entry per `EnemyShape`). `prop`, `wall` and `egg` stay unique by design (`uniqueType()` throws): they are spawned and matched by type. The wall's `rise` and the egg's `hatchInto` / `hatchCount` / `hatchHp` live on those types, not on the boss.

### A new enemy behaviour

1. `src/data/enemies.ts`: add it to `EnemyBehavior`, and its parameters to `EnemyBase`.
2. `src/sim/registry.ts`: a code in `BEHAVIOR` (typecheck fails until you do).
3. `src/sim/enemies.ts`: a `case` in the `switch (beh)` of `updateEnemies()` (exhaustive: typecheck fails until you do). Use `dmath`, `pathDir()` / `keepAway()`, `emit()` for anything render or audio must show.
4. Locales: `codex.behaviors.<behavior>` (the codex tag; typecheck fails until it exists in `fr.ts`).
5. Optional: telegraphs in `src/render/draw-enemies.ts`, ability rows in the enemy sheet in `src/ui/codex-data.ts`, dodging in `src/ai/bot.ts`.
6. A new **shape**: add it to `EnemyShape`, draw it in the exhaustive switches of `src/render/sprites.ts` and `src/render/draw-bosses.ts`, and give it a collision outline in `OUTLINE` (`src/sim/enemies.ts`).
7. Then the enemy itself (previous recipe), and a test in `tests/enemies.test.ts`.

### A boss

1. `src/data/enemies.ts`: a config constant like `LASER_EYE_BOSS = bossConfig({ pattern, ...groups })`. `pattern` is the looping list of `{ kind, duration }` phases (no `as BossPhase[]` cast: `bossConfig()` infers the kinds). Then one parameter group per phase family, as listed in `PHASE_PARAMS`:

   | Phases | Groups |
   |---|---|
   | `chase` | none (uses the enemy `speed`) |
   | `spiral` | `spiral`, `bullets` |
   | `charge` | `charge` |
   | `summon` | `summon` |
   | `build` | `cage` (the wall rise time is the `wall` type's `rise`) |
   | `volley` | `volley`, `bullets` |
   | `aim`, `dash` | `dash` |
   | `burst` | `burst`, `bullets` |
   | `watch` | `watch`, `bullets` |
   | `focus`, `sweep` | `laser` |
   | `flee` | `flee` |
   | `lay` | `lay`, `bullets` (what hatches is the `egg` type's `hatchInto` / `hatchCount` / `hatchHp`) |

   Every phase reads the groups of the boss running it (`BOSS_CONFIGS[e.type]` in the sim, the telegraphs and the bot), so phases can be mixed freely between bosses. `bullets` is shared by all the shooting phases of a boss.
2. Same file: append to `ENEMIES` with `behavior: 'boss', boss: YOUR_CONFIG` and a shape that `enemyPath()` in `src/render/draw-bosses.ts` draws (bosses are drawn as paths; `rock`, `sun`, `ring`, `dart`, `block`, `egg` draw nothing there).
3. Append the id to `BOSS_ORDER` (arrival order; the cycle then repeats as Mk II...).
4. Locales: `enemies.<id>` with `name`, `short` (tiles and hints) and `desc`.
5. New phase kinds: add to `BossPhaseKind` and `PHASE_PARAMS` (typecheck fails until you do); a new parameter group goes in `BossParams` with its interface. Handle the kind in `updateBoss()` and `enterPhase()` in `src/sim/enemies.ts` (exhaustive) reading `cfg.<group>!`, draw its telegraph in `drawBoss()` (`src/render/draw-bosses.ts`) from `BOSS_CONFIGS[boss.type]`, and adjust `bossContactMul()` if contact damage changes.
6. Test in `tests/bosses.test.ts`.

Caught: typecheck (`bossConfig()` rejects a missing group, or a group none of the phases reads); at load, the registry throws if a boss lacks a group its phases need (`missingBossParams()`, for configs not built with `bossConfig()`); `registry.test.ts` (pattern, `BOSS_ORDER`, parameter groups, summon type), `i18n.test.ts` (`short`). The golden test gains a `boss-N` duel; the sandbox gains a duel tile.

### Waves and spawns

- Numbers live in `WAVES` (`src/data/waves.ts`): spawn `rates` and `lateGrowth`, the rhythm (`waveLength`, `pause`, `wavesPerBoss`, `afterBoss`), the run wave by wave (`plan`, whole blocks of `wavesPerBoss` waves: the boss after the last block wins the run) and the endless mode's `mixes`, highlights (`swarm`, `horde`, `ring`, from `firstWave`), the boss `arena`, bonus crates (`props`), caps (`fluxCap`, `enemyCap`, `lostDistance`). Per-type caps and packs are on the enemies (`cap`, `pack`).
- The registry compiles them (`RATES_BY_DIFFICULTY`, `PLAN_MIXES`, `ENDLESS_MIXES`, `UNLOCK_SLOT`, `VICTORY_BOSS`, `MIX_TICKS`, `BOSS_TICKS`); the logic is in `src/sim/spawner.ts` (`spawnRate`, `mixAt`, `waveInfo`). The waves are the same in every difficulty (it only changes enemy numbers and item drops). The wave clock (`s.clock`) stops during bosses; composition never depends on the player.
- The codex rules and some HUD/sandbox strings read these numbers through placeholders; descriptions with literal numbers need a manual update.
- Caught: `enemies.test.ts` (readable waves, caps), `bosses.test.ts` (wave / pause / boss rhythm), `content.test.ts` (arrival times per difficulty).

### A difficulty

1. `src/data/difficulty.ts`: append to `DIFFICULTIES` (`rate`, `loot`, `color`). Its index is what scores, the save and `?difficulty=` store. `DEFAULT_DIFFICULTY` is an index.
2. Locales: `difficulties.<id>` with `name`, `desc`.
3. `src/styles/difficulty.css`: the picker grid is `repeat(3, ...)`; widen it.
4. Spawn curves, arrivals, codex arrival table, records tabs and sandbox choice follow from the data. The golden test gains a `bot-N` run.

### A UI string

1. Add the key in the right section of `fr.ts`, then `en.ts`. Use `{name}` placeholders; for plurals use `{ one, other }` and `tn()`.
2. Use it with `t('section.key', { name })`. Content names go through `src/i18n/content.ts` helpers.
3. Strings are inserted into HTML: escape dynamic values with `esc()` from `src/ui/html.ts`. Some locale strings contain markup (`<kbd>`, `<b>`) on purpose.

Caught: typecheck (unknown key, `en.ts` mismatch), `i18n.test.ts` (empty strings, placeholder mismatch), `english-code.test.ts`.

### A UI screen

1. `src/ui/screens/<name>.ts`: `export function showName(ui: UI, ...): void` that builds the HTML with the helpers in `src/ui/html.ts` (`heading`, `keys`, `cascade`, `esc`, `statTiles`...) and calls `ui.mount('<name>', html)`; wire buttons on the returned element.
2. `src/ui/screens/index.ts`: export it. `src/ui/ui.ts`: a public method that delegates to it, and an entry in `DEPTH` for the slide direction (`TAB_SCREENS` if it redraws in place).
3. App callbacks it needs: `AppApi` in `src/ui/types.ts`, implemented in `src/app/app.ts`. Back / Esc handling per mode is in `App.onAction`.
4. Styles: `src/styles/<name>.css`, imported in `src/style.css` (order matters).
5. Strings: previous recipe. Check with `npm run build` and in the browser (mouse, keyboard and gamepad navigation).

### A new language

1. `src/i18n/locales/<code>.ts`: `export const <code>: LocaleShape = { ... }` (copy `en.ts` and translate every leaf).
2. `src/i18n/index.ts`: add the code to `Locale` and `LOCALES`, and entries in `LOCALE_NAMES`, `INTL_TAGS` and `TABLES`.
3. `tests/i18n.test.ts`: add it to `TABLES` and to the expected `LOCALES`.
4. The Options language choice, `?lang=<code>` and save loading (`isLocale`) follow. The bundled Chakra Petch font covers Latin, Latin Extended, Vietnamese and Thai only.

### Icons, sprites and sounds for new content

- Icons (HUD bar, level-up cards, codex, sandbox): `src/render/icons.ts`, painters keyed by id in `WEAPON_PAINTERS`, `PASSIVE_PAINTERS`, `PICKUP_PAINTERS`. A painter gets the context with the path already begun and the origin at the icon center, builds its path, then strokes it with `neon(ctx, c, lw)`. A missing painter shows a placeholder (or just the frame, for pickups) at runtime. `tests/icons.test.ts` requires exactly one painter per id.
- Enemy sprites and previews: generated from `shape` and `color` (`src/render/sprites.ts`); bosses are drawn as paths in `src/render/draw-bosses.ts`.
- Sounds: synthesized in `AudioEngine.play()` (`src/audio/audio.ts`). A new sound needs a name in `SfxName` (`src/render/effects.ts`) and a `case` in `play()`; the switch is exhaustive, so a name without its sound fails typecheck. Effects trigger sounds from sim events in `Effects.consume`.
- Sim events: a new `EV_*` constant in `src/sim/state.ts` goes into the `EventType` union next to it (`emit()` only takes those); `Effects.consume` (`src/render/effects.ts`) then fails to typecheck until it has a `case` for it (or lists it with the ignored ones).

### A sandbox option

1. `src/sim/sandbox.ts`: the field in `SandboxConfig`. If the sim reads it during the run, also add it to `SandboxRules` (`src/sim/state.ts`) and `compileSandbox()`; if it only sets up the start, use it in `applySandbox()` / `applyLoadout()`.
2. Its default in `defaultSandbox()` (`src/storage/storage.ts`); `readSandbox()` validates it against that default.
3. Typed literals that must list it: `DEMO_SANDBOX` (`src/app/demo.ts`), `sandbox()` in `tests/golden.ts`, the `arena()` helper in `tests/weapons.test.ts` if `SandboxRules` changed.
4. `src/ui/screens/sandbox.ts`: a `SandboxKey` and an item in `sandboxUi()`. Strings under `sandbox.*`.
5. Test in `tests/sandbox.test.ts`.

## Trying content in the Sandbox

Menu → **Sandbox**. Everything in the data arrays shows up there automatically:

- Loadout tiles for every base weapon and passive: click to add or raise a level, right click to lower it. A weapon with an evolution gets it one click after level 5.
- Game: difficulty, start wave (1 to 40), and a boss duel tile per `BOSS_ORDER` entry (the boss arrives at once, alone).
- Hero: invincible, starting level, damage and XP multipliers, stored item (active items only).
- Enemies: count multiplier, and "custom types" with a tile per enemy (bosses, the bonus crate and hidden types excluded).
- Boss: duel Mk, reinforcements on or off, regular bosses on or off.

Sandbox runs are deterministic and replayable, never ranked. The last setup is saved. From the browser console you can start one directly:

```js
__swarm.playSandbox({ difficulty: 1, rules: { ...__swarm.save.sandbox.rules, weapons: [{ id: 'blade', level: 5 }], enemies: ['hexagon'] } })
```

## Dev tools

URL parameters (read in `src/app/app.ts`):

| Param | Effect |
|---|---|
| `?lang=en` | Language override (`fr`, `en`). |
| `?autostart=1` | Skip intro and menu, start a run at once. |
| `?seed=TEXT` | Seed of that first run (with `autostart`, `bot` or `stress`). |
| `?difficulty=N` | Difficulty index of that first run (0 easy, 1 normal, 2 hard). |
| `?bot=1` | The bot plays (starts at once, unranked). |
| `?stress=1` | Starts at once with a big build and an 800-enemy horde (`src/sim/debug.ts`), unranked. |
| `?fps=1` | Show the FPS counter (also F3 in game). |
| `?nopause=1` | No auto pause when the window loses focus. |

- `window.__swarm`: the `App` instance. `__swarm.state` is the live `GameState`, `__swarm.save` the save; `playSandbox()`, `toMenu()` and the other `AppApi` methods are callable.
- `npm run balance -- <seeds> <minutes> <difficulty>` (`scripts/balance.ts`, defaults 6, 15, 1): headless bot runs, one line per seed (survival, kills, level, first boss kill time, peak enemy count, ms per step, final build, hash) and the median survival.
- `npm run golden:update` (`scripts/update-golden.ts`): regenerates `tests/golden.json` and prints each scenario's final hash.

## Commits

Observed in `git log`:

- Plain English, one summary line, imperative or descriptive (`Split ui/ui.ts into ...`, `Fix double App instantiation ...`). A longer change may add a short bullet body.
- Gameplay releases start with the version: `v0.8.5: Reine minions and eggs have much less HP; ...`, with `package.json` / `package-lock.json` version and `SIM_VERSION` bumped in the same commit.
- Say when the golden file was regenerated, or that it stayed green for a refactor.
- No co-author or tool trailers.
