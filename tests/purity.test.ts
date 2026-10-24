import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dsin, dcos, datan2 } from '../src/sim/dmath';

const SIM_DIR = join(__dirname, '..', 'src', 'sim');
const DATA_DIR = join(__dirname, '..', 'src', 'data');

function sources(dir: string): { file: string; code: string }[] {
  // Recursive: subfolders (e.g. src/sim/weapons/) are checked too; `file` is relative to `dir`.
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((f) => f.endsWith('.ts'))
    .map((f) => f.replace(/\\/g, '/'))
    .map((f) => ({
      file: f,
      // Strip comments so that documentation does not trigger a match.
      code: readFileSync(join(dir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, ''),
    }));
}

describe('simulation purity', () => {
  const forbidden = [
    /Math\.random/,
    /Date\.now/,
    /new Date/,
    /performance\.now/,
    /Math\.(sin|cos|tan|atan2?|asin|acos|pow|exp|log|hypot|cbrt)\b/,
    /\bwindow\b/,
    /\bdocument\b/,
    /requestAnimationFrame/,
    /localStorage/,
  ];
  for (const { file, code } of [...sources(SIM_DIR), ...sources(DATA_DIR)]) {
    it(`${file} uses no non-deterministic source and no DOM`, () => {
      for (const re of forbidden) expect(code, `${file} contains ${re}`).not.toMatch(re);
    });
  }

  it('deterministic math is accurate', () => {
    for (let a = -10; a <= 10; a += 0.37) {
      expect(Math.abs(dsin(a) - Math.sin(a))).toBeLessThan(1e-8);
      expect(Math.abs(dcos(a) - Math.cos(a))).toBeLessThan(1e-8);
    }
    for (let i = 0; i < 100; i++) {
      const y = Math.sin(i * 1.3) * (i + 1);
      const x = Math.cos(i * 0.7) * (i + 2);
      expect(Math.abs(datan2(y, x) - Math.atan2(y, x))).toBeLessThan(2e-5);
    }
  });
});
