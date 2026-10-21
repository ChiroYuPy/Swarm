/**
 * Équilibrage headless : le bot joue plusieurs seeds sans interface, on mesure la survie.
 *   npm run balance            (6 seeds, 15 min max)
 *   npm run balance -- 10 20   (10 seeds, 20 min max)
 *   npm run balance -- 6 15 0  (difficulté : 0 facile, 1 normal, 2 difficile)
 */
import { createGame, step, computeScore, findBoss, hashState, weaponDef, TICK_RATE, type GameState } from '../src/sim';
import { botInput } from '../src/ai/bot';
import { PASSIVES } from '../src/data/passives';

const seeds = Number(process.argv[2] ?? 6);
const maxMinutes = Number(process.argv[3] ?? 15);
const difficulty = Number(process.argv[4] ?? 1);

function build(s: GameState): string {
  const p = s.players[0];
  const w = p.weapons.map((x) => `${weaponDef(x.def).id}${weaponDef(x.def).fusion ? '*' : x.level}`).join(' ');
  const ps = p.passives.map((x) => `${PASSIVES[x.def].id}${x.level}`).join(' ');
  return `${w} | ${ps}`;
}

const results: number[] = [];
let totalTicks = 0;
let totalMs = 0;
for (let k = 0; k < seeds; k++) {
  const seed = `BALANCE-${k}`;
  const s = createGame({ seed, difficulty });
  const input = [0];
  let maxEnemies = 0;
  let firstBossKilledAt = -1;
  let bossSeenAt = -1;
  const t0 = performance.now();
  let steps = 0;
  while (!s.over && s.tick < maxMinutes * 60 * TICK_RATE) {
    input[0] = botInput(s, 0);
    step(s, input);
    steps++;
    if (s.enemyCount > maxEnemies) maxEnemies = s.enemyCount;
    const boss = findBoss(s);
    if (boss && bossSeenAt < 0) bossSeenAt = s.tick;
    if (bossSeenAt >= 0 && firstBossKilledAt < 0 && s.players[0].bossKills > 0) firstBossKilledAt = s.tick;
  }
  const ms = performance.now() - t0;
  totalMs += ms;
  totalTicks += s.tick;
  const r = computeScore(s);
  results.push(r.tempsSurvecu);
  const mm = Math.floor(r.tempsSurvecu / 60);
  const ss = Math.floor(r.tempsSurvecu % 60).toString().padStart(2, '0');
  console.log(
    `${seed.padEnd(11)} ${s.over ? 'mort ' : 'vivant'} ${mm}:${ss}  kills ${String(r.kills).padStart(5)}  niv ${String(r.level).padStart(2)}  ` +
      `boss1 ${firstBossKilledAt > 0 ? ((firstBossKilledAt - bossSeenAt) / 60).toFixed(0) + 's' : '—'}  max ennemis ${maxEnemies}  ` +
      `${(ms / steps).toFixed(3)} ms/pas  [${build(s)}]  hash ${hashState(s).slice(0, 8)}`,
  );
}
results.sort((a, b) => a - b);
const med = results[Math.floor(results.length / 2)];
console.log(`\nSurvie médiane : ${Math.floor(med / 60)}:${String(Math.floor(med % 60)).padStart(2, '0')}  — coût moyen ${(totalMs / totalTicks).toFixed(3)} ms/tick`);
