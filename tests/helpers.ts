import { createGame, step, InputLog, TICK_RATE, type GameState } from '../src/sim';
import { botInput } from '../src/ai/bot';

/** Plays `seconds` seconds with the bot; returns the final state and the input log. */
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

/** Simple scripted inputs (no bot): a spiral of moves, plus a rotating offer choice at level-ups. */
export function scriptedCode(i: number, awaiting: boolean): number {
  if (awaiting) return 200 + (i % 3);
  const dir = Math.floor(i / 90) % 64;
  return 1 + dir;
}
