import { createGame, step, InputLog, TICK_RATE, type GameState } from '../src/sim';
import { botInput } from '../src/ai/bot';

/** Joue `seconds` secondes avec le bot, renvoie l'état final et le journal des entrées. */
export function playWithBot(seed: string, seconds: number): { state: GameState; log: InputLog } {
  const s = createGame({ seed });
  const log = new InputLog();
  const input = [0];
  const maxTicks = seconds * TICK_RATE;
  let guard = 0;
  while (!s.over && s.tick < maxTicks && guard++ < maxTicks * 2) {
    const code = botInput(s, 0);
    input[0] = code;
    log.push(code);
    step(s, input);
  }
  return { state: s, log };
}

/** Entrées scriptées simples (sans bot) : spirale de déplacements + choix 0 aux level-ups. */
export function scriptedCode(i: number, awaiting: boolean): number {
  if (awaiting) return 200 + (i % 3);
  const dir = Math.floor(i / 90) % 64;
  return 1 + dir;
}
