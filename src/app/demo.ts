/** Menu attract demo: the bot-driven sandbox game shown behind the menus, warmed up and swapped in small slices. */
import { createGame, step, TICK_RATE, sandboxStartTick, type GameState, type SandboxConfig } from '../sim';
import { botInput } from '../ai/bot';

/**
 * Démo derrière le menu : le bot joue une partie « bac à sable » déjà lancée (minute 6, ennemis plus
 * nombreux, héros équipé et invincible) pour qu'il y ait tout de suite un vrai essaim à l'écran.
 * Sans excès : elle tourne derrière les menus, qui doivent rester fluides (le curseur en dépend).
 */
const DEMO_SANDBOX: SandboxConfig = {
  invincible: true,
  level: 14,
  startWave: 9,
  enemyMul: 1.5,
  enemies: null,
  bosses: false,
  duel: null,
  duelMark: 1,
  summons: true,
  might: 1,
  xp: 1,
  weapons: [
    { id: 'aura', level: 4 },
    { id: 'boomerang', level: 4 },
    { id: 'laser', level: 3 },
    { id: 'confetti', level: 4 },
  ],
  passives: [
    { id: 'aimant', level: 3 },
    { id: 'chaussettes', level: 2 },
  ],
  item: null,
};
/** la démo est d'abord avancée de 15 s (hors écran, par petits bouts) pour que l'essaim soit déjà là */
const DEMO_WARMUP = 15 * TICK_RATE;
/** au-delà, l'essaim devient trop dense : on en prépare une nouvelle */
const DEMO_LIFETIME = 3 * 60 * TICK_RATE;
/** temps de calcul accordé par image à la préparation d'une démo (ms) */
const DEMO_BUDGET_MS = 4;

const newDemo = (seed: string): GameState => createGame({ seed, difficulty: 1, sandbox: DEMO_SANDBOX });

export class MenuDemo {
  /** partie de démonstration (gardée pendant les parties : le menu la reprend où elle en était) */
  state: GameState;
  /** démo en préparation et pas de simulation qu'il lui reste avant d'être montrée */
  next: { state: GameState; left: number } | null;
  private swapping = false;

  /** `onSwap`: called once a freshly prepared demo replaces the current one. */
  constructor(seed: string, private readonly onSwap: (state: GameState) => void) {
    this.state = newDemo(seed);
    this.next = { state: this.state, left: DEMO_WARMUP };
  }

  /**
   * Prépare la démo par petits bouts (quelques ms par image) : la première pendant l'intro, puis une
   * nouvelle quand l'essaim de la démo en cours devient trop dense. La relève arrive en fondu.
   */
  prepare(time: number): void {
    const cur = this.state;
    if (!this.next && cur.tick - sandboxStartTick(DEMO_SANDBOX) > DEMO_LIFETIME + DEMO_WARMUP)
      this.next = { state: newDemo(`DEMO-${Math.floor(time)}`), left: DEMO_WARMUP };
    const next = this.next;
    if (!next || this.swapping) return;
    const t0 = performance.now();
    while (next.left > 0 && performance.now() - t0 < DEMO_BUDGET_MS) {
      step(next.state, [botInput(next.state, 0)]);
      next.left--;
    }
    if (next.left > 0) return;
    if (next.state === cur) {
      this.next = null;
      return;
    }
    // Relève : la démo s'efface (transition d'opacité de #game), on échange, elle revient.
    this.swapping = true;
    document.body.classList.add('demo-swap');
    setTimeout(() => {
      this.swapping = false;
      this.next = null;
      this.state = next.state;
      this.onSwap(next.state);
      document.body.classList.remove('demo-swap');
    }, 1000);
  }
}
