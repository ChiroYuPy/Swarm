# Architecture

SWARM is a single-page TypeScript app built with Vite. A deterministic simulation (`src/sim`) runs on plain data (`src/data`); everything else (canvas rendering, DOM screens, input, audio, storage) sits around it and only reads its state or feeds it input codes.

Entry point: `index.html` loads `src/main.ts`, which imports the fonts and `src/style.css`, then creates the `App` (`src/app/app.ts`).

## Layers

| Folder | Owns | May import |
|---|---|---|
| `src/data` | Content definitions: ids, numbers, colors, curves (weapons, fusions, passives, loot, enemies and bosses, waves, difficulty, hero, map). No text, no logic beyond tiny helpers. | nothing |
| `src/sim` | The deterministic game: state, `createGame` / `step`, weapons (`sim/weapons/`), enemies and bosses, spawner, level-up, pickups, RNG, deterministic math, replay, serialization. No DOM, no text. | `data` (and `package.json` for the version) |
| `src/i18n` | Locales (`locales/fr.ts`, `locales/en.ts`), `t()` / `tn()`, content text helpers by id (`content.ts`). | `data` |
| `src/ai` | The bot (`bot.ts`): an input source like the keyboard, used by the menu demo, `?bot=1`, tests and `scripts/balance.ts`. | `sim`, `data` |
| `src/storage` | Versioned localStorage save, migrations, legacy id table. | `sim` (types), `data`, `i18n` |
| `src/render` | Canvas 2D: `renderer.ts` and the `draw-*.ts` layers, sprites, icons, HUD, cosmetic effects fed by sim events (`effects.ts`). | `sim`, `data`, `i18n` |
| `src/audio` | Synthesized WebAudio sound effects and music loops (`audio.ts`). | `render` (the `SfxName` type) |
| `src/input` | Keyboard, mouse and gamepad (`input.ts`): UI actions and per-step sim input codes. | `sim` |
| `src/ui` | DOM screens (`ui.ts` core class, `screens/` one file per screen, `codex-data.ts`, `describe.ts`, `html.ts`). Styles in `src/styles/`. | `sim`, `data`, `i18n`, `render`, `storage`, `audio` |
| `src/app` | `App` (wires everything, main loop, URL params), menu demo, run info for the UI, drop-in intro, loop constants. | everything |

```
app      ──► everything below
ui       ──► render, storage, audio, i18n, sim, data
render   ──► i18n, sim, data            audio ──► render (SfxName type only)
storage  ──► i18n, sim (types), data
input    ──► sim                        ai    ──► sim, data
i18n     ──► data
sim      ──► data
data     ──► nothing
```

Imports only point down this list: nothing imports `app` or `ui`, and `sim` / `data` never import `i18n`, `render`, `ui` or any browser API.

### Guardrails that enforce the layering

- `tsconfig.sim.json` compiles `src/sim` and `src/data` with `lib: ["ES2022"]` and no DOM types: any `window`, `document` or canvas reference fails `npm run typecheck`.
- `tests/purity.test.ts` scans every `.ts` file under `src/sim` and `src/data` (comments stripped) for `Math.random`, `Date.now`, `new Date`, `performance.now`, `Math.sin/cos/tan/atan/atan2/asin/acos/pow/exp/log/hypot/cbrt`, `window`, `document`, `requestAnimationFrame`, `localStorage`.
- `tests/i18n.test.ts` checks that no file in `src/sim` or `src/data` imports `i18n`.
- `tests/english-code.test.ts` fails on any French accented letter in `src/**/*.ts`, `src/**/*.css` or `index.html`, except in `src/i18n/locales/` and `src/storage/legacy-ids.ts`.

## Determinism

The sim is a pure function of `(GameConfig, input codes)`. That gives replays, the golden test, the bot benchmarks and the menu demo for free.

- **RNG**: `src/sim/rng.ts`, mulberry32 seeded from the text seed (`hashString`). Independent streams via `deriveSeed(seed, STREAM.X, ...)`: `MAP`, `WAVES`, `LOOT`, `LEVELUP`, and `COSMETIC` (render only, never read by the sim). Level-up offers depend only on (seed, level) (`offerOrder` in `levelup.ts`); waves never depend on what the player does.
- **Fixed step**: `TICK_RATE = 60` (`src/sim/constants.ts`). One `step(s, inputs)` advances one tick, unless it consumes a zero-time code.
- **Math**: `src/sim/dmath.ts` (`dsin`, `dcos`, `datan2`, direction tables) built from `+ - * /` and `Math.sqrt`, because `Math.sin` and friends are not bit-identical across JS engines.
- **Input codes** (`src/sim/constants.ts`, `src/sim/inputcodec.ts`): one byte per step. `0` idle, `1..64` full-speed direction, `65..128` half speed, `130` auto aim, `131..194` manual aim, `200..202` level-up choice, `210` use item, `220..224` / `229` weapon swap. Codes `>= 130` are zero-time steps (`isZeroTimeCode`).
- **Replays**: `InputLog` records every code the app feeds the sim; `encodeLog` / `decodeLog` (RLE + base64, `LOG_FORMAT = 'N1'`); `replayToEnd` and `ReplayCursor` (`src/sim/replay.ts`) replay them. The end screen can replay the last run (kept in memory only).
- **Snapshots**: `serializeState` / `deserializeState` (`src/sim/serialize.ts`, format `'swarm-snapshot'`) restore a full state; restoring throws if the snapshot's sim version differs. `hashState` fingerprints the whole logical state, `SIM_VERSION` included.
- **`SIM_VERSION`** (`src/sim/constants.ts`): "bump it as soon as a change breaks replay compatibility". In the history, every gameplay change (numbers, behaviour, new or reordered content) bumps it, and gameplay releases also bump the `package.json` version (`GAME_VERSION`, shown in the game and stored in scores).
- **Events**: the sim reports what happened through `emit(s, EV_*, ...)` into `s.events`, reset at the start of every `step`. Render, audio and toasts read them (`Effects.consume`) after each step; the sim never calls them.

## From data to registry

`src/data` refers to content by string id. `src/sim/registry.ts` compiles it once, at module load, into numeric tables so the hot loop never looks up a string:

- `WEAPON_INDEX`, `PASSIVE_INDEX`, `ENEMY_INDEX` and `weaponId()` / `passiveId()` / `enemyId()` (throw on an unknown id).
- `FUSION_TABLE`, `ENEMY_BEHAVIOR` (via the `BEHAVIOR` code table), `SPLIT_INTO`, `HATCH_INTO`, `RATES_BY_DIFFICULTY`, `UNLOCK_SLOT`, `MIXES`, `DEBUT_MIX`, `HORDE_TYPES`, `BOSS_TYPES`, `BOSS_CONFIGS`, `BOSS_PATTERNS`, `BOSS_SUMMONS`.
- Per-type tables are indexed by `e.type`, so code checks an enemy's behaviour (`ENEMY_BEHAVIOR[e.type] === BEHAVIOR.X`) and reads that type's own data; several types may share a behaviour. Boss phases read the parameter groups of the running boss (`BOSS_CONFIGS[e.type]`), and the registry throws at load if a boss lacks a group one of its phases needs (`PHASE_PARAMS` in `src/data/enemies.ts`).
- Single-instance types found by behaviour (`PROP_TYPE`, `WALL_TYPE`, `EGG_TYPE`; exactly one each, or it throws), and the swarm / ring highlight types named in `WAVES` (`SWARM_TYPE`, `RING_TYPE`). `RALLY_SPEED` is the strongest leader aura: a rallied enemy does not store which leader rallied it.
- Ids the engine needs by name (`SQUADRON_WEAPON`, `KAMIKAZE_DRONES_WEAPON`, `BLACK_HOLE_WEAPON`, `BOT_FAVORITE_PASSIVES`), so a renamed id fails at load.

Behaviour dispatch is by table, typed so a missing entry is a compile error:

- Weapons: `UPDATER_BY_BEHAVIOR: Record<Behavior, WeaponUpdater>` in `src/sim/weapons/index.ts`, resolved per weapon index into `WEAPON_UPDATERS`. One file per behaviour family in `src/sim/weapons/`, shared helpers in `common.ts`.
- Enemies: `BEHAVIOR` in `registry.ts` (`satisfies Record<Uppercase<EnemyBehavior>, number>`), then an exhaustive `switch` in `updateEnemies` (`src/sim/enemies.ts`). Boss phases: exhaustive switches in `updateBoss` / `enterPhase`.
- Pickups: a pickup code is its index in `PICKUPS`. The `PK_*` constants in `src/sim/state.ts` are derived from the ids (`pickupCode('vacuum')`) and kinds are read per code (`PICKUP_KIND`, `isActiveItem()`, `ACTIVE_PICKUPS`), so pickups of any kind are appended at the end. Effects are `Record`s keyed by the ids typed from the data (`PickupId`, `PickupIdOf<kind>` in `data/loot.ts`): `PICKUP_EFFECTS` (`sim/pickups.ts`), `ACTIVE_EFFECTS` (`sim/player.ts`), `ACTIVATE_FX` (`render/effects.ts`), `BUFF_FIELDS` (`render/hud.ts`), `PICKUP_PAINTERS` (`render/icons.ts`); the sim ones are resolved once into arrays indexed by code.
- Projectiles: `Projectile.kind` is the `ProjectileKind` union of the `PJ_*` constants; `updateProjectiles` (`sim/projectiles.ts`) switches on it with a `never` default, and `drawProjectiles` (`render/draw-projectiles.ts`) runs one pass per kind from `PASSES`, checked complete at compile time.
- Events and offers: `emit()` takes an `EventType` (union of the `EV_*` codes) and `Effects.consume` switches on it exhaustively; `Offer.kind` is an `OfferKind`, exhaustive in `applyOfferEffect` (`sim/levelup.ts`) and in the level-up cards (`ui/screens/levelup.ts`). `AudioEngine.play()` is exhaustive over `SfxName | UiSfx`.
- Render and UI use exhaustive `switch`es or `Record`s on data unions too (enemy shapes in `render/sprites.ts` and `render/draw-bosses.ts`, `SHOT_SFX: Record<Behavior, SfxName>` in `render/effects.ts`, `codex.behaviors.<behavior>` locale keys).

**Why order matters.** Indices are positions in the data arrays (`ALL_WEAPONS = [...BASE_WEAPONS, ...FUSED_WEAPONS]`, `PASSIVES`, `ENEMIES`, `PICKUPS`, `DIFFICULTIES`, `BOSS_ORDER`). The level-up offer pool is built from `BASE_WEAPONS` then `PASSIVES` by index, `FUSIONS` order is the evolution priority, `BOSS_ORDER` is the arrival order, and saved scores store the difficulty index. Reordering changes gameplay and breaks the golden test (which builds its scenarios by index, so renaming ids does not change the hashes).

## Frame flow

`App.frame(now)` in `src/app/app.ts`, once per `requestAnimationFrame`:

1. **Input**: `InputManager.poll()` reads the gamepad. Keyboard and gamepad buttons fire `UiAction`s to `App.onAction`, which dispatches by mode (`menu`, `playing`, `levelup`, `paused`, `dying`, `dead`, `replay`).
2. **Simulation**: an accumulator runs `simStep()` every `STEP_MS` (`src/app/loop.ts`), at most `PLAY_CATCHUP` steps per frame. Each sim step may first push zero-time codes (stored item if requested, manual aim if it changed), then the movement code (`input.sampleCode()`, or `botInput()` with `?bot=1`). Every code goes into the `InputLog` and into `step()`; `fx.consume(state)` reads the events right after. A pending level-up switches to `levelup` mode and shows the cards; a picked card is one more zero-time step. In `menu` mode the bot plays the `MenuDemo` game; in `replay` mode a `ReplayCursor` feeds the recorded codes.
3. **Render**: `Renderer.render(state, alpha, fx, options)` draws the world with interpolation (`alpha` = fraction of the next step), layer by layer (map, pickups, gems, weapon effects, projectiles, enemies, player, effects, texts, indicators), then the canvas HUD (`render/hud.ts`).
4. **UI**: DOM screens are event-driven, not redrawn per frame. `UI.mount()` swaps screens in `#ui` with transitions; the app calls `ui.showLevelUp`, `ui.showPause`, `ui.showDeath`, and screens call back through `AppApi` (`src/ui/types.ts`).

## i18n

- `src/i18n/locales/fr.ts` is the source of truth for every player-facing string. `en.ts` is typed `LocaleShape` (`src/i18n/index.ts`): a missing or extra key is a type error.
- `t('dot.path', { name })` takes compile-checked keys with `{name}` interpolation; `tn('key', n)` picks `{ one, other }` with `Intl.PluralRules`.
- Content text is keyed by content id under `weapons`, `evolutions`, `passives`, `pickups`, `enemies`, `difficulties` (weapons have one `levels` line per level; bosses also have `short`). Screens use the helpers in `src/i18n/content.ts` (`weaponName`, `weaponLevelText`, `passiveEffect`, `enemyShortName`, `bossName`...), never hand-built keys.
- The language is a setting (`Settings.language`, Options screen). `App.applySettings` calls `setLocale` and sets `document.documentElement.lang`. `?lang=en` overrides it at startup.

## Save

- `src/storage/storage.ts`: one JSON object in localStorage under `swarm.save` (the old `neonawak.save` key is moved on first load). It holds settings, last difficulty, top 10 scores per difficulty and the last sandbox setup.
- `SAVE_VERSION = 3`. `migrate()` upgrades step by step (`version 0 → 1 → 2 → 3`), then validates every field against its default (`readSandbox`, `isScore`). A save from a newer version is ignored and never overwritten.
- `src/storage/legacy-ids.ts`: old French content ids mapped to the current English ids, read only by the v2 → v3 migration.
- Adding a setting or a sandbox field with a default needs no version bump: missing fields read as the default.

## Tests and guardrails

All in `tests/`, run with `npm test` (Vitest, Node environment). `npm run typecheck` also type-checks `tests/` and `scripts/` (`tsconfig.test.json`).

| File | Checks |
|---|---|
| `determinism.test.ts` | Same seed + inputs give the same state; seeds differ; seed normalization; waves ignore player actions. |
| `replay.test.ts` | Log encoding round trip, manual aim codes, replay and cursor reach the same state, snapshot restore mid-game. |
| `golden.test.ts` | Replays the scenarios of `golden.ts` and compares hashes with `golden.json`. |
| `purity.test.ts` | No non-deterministic source or DOM in `src/sim` / `src/data`; `dmath` accuracy. |
| `i18n.test.ts` | Locales have the same keys and placeholders, every content id has its text (one line per weapon level), `t()` / `tn()`, sim/data never import i18n. |
| `english-code.test.ts` | No French text outside the locales and the legacy id table. |
| `icons.test.ts` | Every weapon, passive and pickup has an icon painter, and every painter has content. |
| `registry.test.ts` | Bosses vs `BOSS_ORDER`, boss phases and their parameter groups (`bossConfig()` type errors included), summons, wall rise and egg hatching, `PK_*` codes vs their ids, pickup kind tables, distinct `PJ_*` / `EV_*` / `OFFER_*` codes. |
| `content.test.ts` | Weapon level progression, enemy arrival over time, timed bonuses, active items as zero-time steps, difficulty effect. |
| `weapons.test.ts` | Every weapon and evolution of the data deals damage (level 1 and max), every evolution is offered when due, specific behaviours. |
| `fusion.test.ts` | Evolution recipes are consistent and applied correctly, boss chest grants them. |
| `levelup.test.ts` | Offer order depends only on (seed, level), choices apply, world frozen during choice, fusions first. |
| `swap.test.ts` | Weapon swap at level-up, arena items, gem merging. |
| `enemies.test.ts` | Golem split, Leader, Teleporter, Orbiter, readable waves (at most 3 types), caps, despawn. |
| `bosses.test.ts` | Wave/boss rhythm and each boss's signature attack. |
| `items.test.ts` | Breakable bullets, Freeze, Clock, Totem, Clone, Fever. |
| `sandbox.test.ts` | Sandbox loadout, invincibility, enemy selection, boss duel, reinforcements toggle. |
| `map.test.ts` | Infinite world chunks are seeded, cached identically, valid, and respected by movement. |
| `storage.test.ts` | Save migration (v1, v2, current), legacy id tables, language setting. |

`tests/helpers.ts` has shared drivers (`playWithBot`, `scriptedCode`).

### Golden test

`tests/golden.ts` builds fixed scenarios from the data arrays: one bot run per difficulty (`bot-N`), every weapon at max level in groups of `MAX_WEAPON_SLOTS` (`weapons-N`), every boss in a duel (`boss-N`), every active item used in a crowd (`item-N`). It records `hashState` every 15 s of game time; `tests/golden.json` stores the expected hashes.

- A pure refactor must keep it green without touching `golden.json`.
- An intended gameplay change (including new content and a `SIM_VERSION` bump, which is part of the hash) regenerates it with `npm run golden:update` (`scripts/update-golden.ts`), and the commit says so.
