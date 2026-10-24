/**
 * Regenerates tests/golden.json. Only run this when a gameplay change is intended
 * (a pure refactor must keep the golden test green without it).
 *   npm run golden:update
 */
import { runScenario, scenarios, writeGolden, type Golden } from '../tests/golden';

const out: Golden = {};
for (const sc of scenarios()) {
  const t0 = performance.now();
  out[sc.name] = runScenario(sc);
  console.log(`${sc.name.padEnd(12)} ${out[sc.name].at(-1)}  (${Math.round(performance.now() - t0)} ms)`);
}
writeGolden(out);
console.log(`tests/golden.json: ${Object.keys(out).length} scenarios`);
