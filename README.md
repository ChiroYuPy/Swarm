# NÉON STOP

A neon survivor-like: survive an endless tide of geometric enemies in an infinite open world.

**▶ Play: https://chiroyuki.github.io/Swarm/**

Weapons fire on their own. Pick an upgrade at each level, combine maxed weapons into fusions, grab temporary boosts and keep one active item for emergencies. Three difficulty levels, local leaderboard, in-game codex. The game UI is in French.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Move | WASD / ZQSD / arrows | Stick / D-pad |
| Use stored item | Space | X |
| Pick upgrade | 1 2 3, or arrows + Enter | D-pad + A |
| Pause / mute | Esc / M | Start |

## Development

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # Vitest
npm run build     # type-check + production build in dist/
npm run balance   # headless bot balance runs
```

TypeScript + Vite, Canvas 2D, no game framework. The simulation (`src/sim`) is deterministic (seeded PRNG, fixed 60 Hz step), so any run can be replayed exactly from its input log.

## Deployment

`.github/workflows/deploy.yml` tests, builds and publishes to GitHub Pages on every push to `main`. One-time setup: **Settings → Pages → Source: GitHub Actions**.
