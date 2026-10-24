/** Replay: replays a game from its configuration (seed, difficulty) and its input log. */
import { createGame, step, type GameConfig } from './game';
import type { GameState } from './state';

/** Replays the whole log headless and returns the final state. */
export function replayToEnd(cfg: GameConfig, codes: Uint8Array): GameState {
  const s = createGame(cfg);
  const input = [0];
  for (let i = 0; i < codes.length; i++) {
    input[0] = codes[i];
    step(s, input);
  }
  return s;
}

/** Step-by-step player, used by the client's replay mode. */
export class ReplayCursor {
  readonly state: GameState;
  private i = 0;
  private readonly input = [0];
  constructor(
    cfg: GameConfig,
    private readonly codes: Uint8Array,
  ) {
    this.state = createGame(cfg);
  }
  get done(): boolean {
    return this.i >= this.codes.length || this.state.over;
  }
  get progress(): number {
    return this.codes.length ? this.i / this.codes.length : 1;
  }
  /** Advances by one code. Returns the code played (or -1 when finished). */
  next(): number {
    if (this.done) return -1;
    const c = this.codes[this.i++];
    this.input[0] = c;
    step(this.state, this.input);
    return c;
  }
}
