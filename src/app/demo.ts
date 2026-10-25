/** Menu attract demo: the bot-driven sandbox game shown behind the menus, warmed up and swapped in small slices. */
import { createGame, step, TICK_RATE, sandboxStartTick, type GameState, type SandboxConfig } from '../sim';
import { botInput } from '../ai/bot';

/**
 * Demo behind the menu: the bot plays a sandbox game that is already under way (minute 6, more
 * enemies, hero equipped and invincible) so a real swarm is on screen right away.
 * Kept moderate: it runs behind the menus, which must stay smooth (the cursor depends on it).
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
    { id: 'force_field', level: 4 },
    { id: 'boomerang', level: 4 },
    { id: 'railgun', level: 3 },
    { id: 'blaster', level: 4 },
  ],
  passives: [
    { id: 'magnet', level: 3 },
    { id: 'thrusters', level: 2 },
  ],
  item: null,
};
/** the demo is first advanced by 15 s (off screen, in small slices) so the swarm is already there */
const DEMO_WARMUP = 15 * TICK_RATE;
/** past this, the swarm gets too dense: a new one is prepared */
const DEMO_LIFETIME = 3 * 60 * TICK_RATE;
/** compute time granted per frame to preparing a demo (ms) */
const DEMO_BUDGET_MS = 4;

const newDemo = (seed: string): GameState => createGame({ seed, difficulty: 1, sandbox: DEMO_SANDBOX });

export class MenuDemo {
  /** demo game (kept during runs: the menu resumes it where it left off) */
  state: GameState;
  /** demo being prepared and the simulation steps it has left before being shown */
  next: { state: GameState; left: number } | null;
  private swapping = false;

  /** `onSwap`: called once a freshly prepared demo replaces the current one. */
  constructor(seed: string, private readonly onSwap: (state: GameState) => void) {
    this.state = newDemo(seed);
    this.next = { state: this.state, left: DEMO_WARMUP };
  }

  /**
   * Prepares the demo in small slices (a few ms per frame): the first one during the intro, then a
   * new one when the current demo's swarm gets too dense. The replacement fades in.
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
    // Swap: the demo fades out (#game opacity transition), we swap, it fades back in.
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
