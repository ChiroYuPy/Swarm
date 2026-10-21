/** Relecture : rejoue une partie à partir de sa configuration (seed, difficulté) et du journal d'entrées. */
import { createGame, step, type GameConfig } from './game';
import type { GameState } from './state';

/** Rejoue tout le journal sans interface et renvoie l'état final. */
export function replayToEnd(cfg: GameConfig, codes: Uint8Array): GameState {
  const s = createGame(cfg);
  const input = [0];
  for (let i = 0; i < codes.length; i++) {
    input[0] = codes[i];
    step(s, input);
  }
  return s;
}

/** Lecteur pas à pas, utilisé par le mode relecture du client. */
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
  /** Avance d'un code. Renvoie le code joué (ou -1 si fini). */
  next(): number {
    if (this.done) return -1;
    const c = this.codes[this.i++];
    this.input[0] = c;
    step(this.state, this.input);
    return c;
  }
}
