/** Compares the golden scenarios (see tests/golden.ts) with the hashes recorded in tests/golden.json. */
import { describe, expect, it } from 'vitest';
import { CHECKPOINT_SECONDS, readGolden, runScenario, scenarios } from './golden';

describe('golden replays', () => {
  const golden = readGolden();
  const all = scenarios();

  it('golden.json covers exactly the current scenarios (npm run golden:update)', () => {
    expect(Object.keys(golden).sort()).toEqual(all.map((s) => s.name).sort());
  });

  for (const sc of all) {
    it(`${sc.name} replays identically`, () => {
      const got = runScenario(sc);
      const want = golden[sc.name] ?? [];
      const at = got.findIndex((h, k) => h !== want[k]);
      expect(at, `${sc.name} diverges at checkpoint ${at} (~${(at + 1) * CHECKPOINT_SECONDS} s)`).toBe(-1);
      expect(got.length).toBe(want.length);
    });
  }
});
