/**
 * Breakable Shooter bullets: the player's weapons (explosions, waves, aura, orbs, laser) destroy them.
 * A shot-down bullet is marked (life = 0) and removed at the start of the projectile update.
 */
import { EV_SHOT_DOWN, PJ_EBULLET, emit, type GameState, type Projectile } from './state';

const breakable = (b: Projectile) => b.kind === PJ_EBULLET && b.a === 1 && b.life > 0;

function shoot(s: GameState, b: Projectile): void {
  b.life = 0;
  emit(s, EV_SHOT_DOWN, b.x, b.y);
}

/** Destroys breakable bullets inside a disc. */
export function clearShotsIn(s: GameState, x: number, y: number, r: number): void {
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (!breakable(b)) continue;
    const dx = b.x - x;
    const dy = b.y - y;
    const rr = r + b.r;
    if (dx * dx + dy * dy < rr * rr) shoot(s, b);
  }
}

/** Destroys breakable bullets along a ray (origin, unit direction, length, half-width). */
export function clearShotsOnLine(s: GameState, x: number, y: number, ux: number, uy: number, len: number, w: number): void {
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (!breakable(b)) continue;
    const rx = b.x - x;
    const ry = b.y - y;
    const t = rx * ux + ry * uy;
    if (t < -b.r || t > len + b.r) continue;
    if (Math.abs(rx * uy - ry * ux) < w + b.r) shoot(s, b);
  }
}
