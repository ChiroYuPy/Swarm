/** Fixed-step loop constants and per-frame helpers: FPS meter, game music intensity. */
import { TICK_RATE, type GameState } from '../sim';

export const STEP_MS = 1000 / TICK_RATE;
/** max simulation steps caught up per frame (in game / menu demo) */
export const PLAY_CATCHUP = 4;
export const MENU_CATCHUP = 2;

/** Game music intensity: rises with time and enemy count, 1 during a boss. */
export function musicIntensity(s: GameState): number {
  if (s.bossId >= 0) return 1;
  const minutes = s.tick / TICK_RATE / 60;
  return Math.min(0.9, Math.max(Math.min(0.7, 0.1 + minutes * 0.06), s.enemyCount / 350));
}

/** Frames per second, averaged over half-second windows. */
export class FpsMeter {
  fps = 60;
  private acc = 0;
  private frames = 0;

  sample(dtMs: number): void {
    this.acc += dtMs;
    this.frames++;
    if (this.acc >= 500) {
      this.fps = (this.frames * 1000) / this.acc;
      this.acc = 0;
      this.frames = 0;
    }
  }
}
