# SWARM

A neon survivor-like for the browser: survive an endless tide of geometric enemies in an infinite open world.

**Play: https://chiroyupy.github.io/Swarm/**

## How to play

Move; your weapons fire on their own. Collect XP, and at each level pick 1 upgrade out of 3 (up to 5 weapons and 4 passives, 5 levels each). A maxed weapon plus its maxed passive evolves into a stronger weapon. Enemies drop timed bonuses and usable items (one stored at a time). Every 4 waves a boss arrives. There are three difficulties, a Sandbox mode for free setups (never ranked), a Codex with every weapon, item and enemy, and a local leaderboard per difficulty.

## Controls

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Move | WASD / ZQSD / arrows | Left stick / D-pad |
| Aim manually (optional) | Hold left click on the game | Right stick |
| Use stored item | Space (or Enter) | A or X |
| Pick upgrade | 1 2 3, or arrows + Enter | D-pad + A |
| Cancel weapon swap | "Cancel swap" button | B |
| Pause | Esc / P | Start |
| Mute / FPS counter | M / F3 | |
| Replay speed | 1 / 2 / 4 | |

## Languages

French by default, English available. Switch in **Options**, or open the game with `?lang=en`.

## Development

```bash
npm install
npm run dev            # dev server, http://localhost:5173
npm test               # Vitest (includes the golden replay test)
npm run typecheck      # app, sim-without-DOM, and tests/scripts
npm run build          # typecheck + production build in dist/
npm run balance        # headless bot runs: npm run balance -- <seeds> <minutes> <difficulty>
npm run golden:update  # regenerate tests/golden.json (intended gameplay changes only)
```

TypeScript + Vite, Canvas 2D for the game, plain DOM for the menus, no framework. The simulation is deterministic (seeded PRNG, fixed 60 Hz step), so any run replays exactly from its seed and input log.

- [ARCHITECTURE.md](ARCHITECTURE.md): how the code is organised.
- [AGENTS.md](AGENTS.md): rules and step-by-step recipes for changing the game (for people and AI agents).

## Deployment

`.github/workflows/deploy.yml` runs the tests, builds and publishes `dist/` to GitHub Pages on every push to `main` or `master` (or manually from the Actions tab). One-time setup: **Settings → Pages → Source: GitHub Actions**.
