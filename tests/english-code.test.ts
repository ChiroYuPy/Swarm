/**
 * Guardrail: code, ids and comments are in English; French player text lives in src/i18n/locales only.
 * Flags any line of src/ (.ts, .css) or index.html that contains a French accented letter.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const FRENCH_LETTER = /[àâçéèêëîïôûùüÿœÀÂÇÉÈÊËÎÏÔÛÙÜŸŒ]/;
/** Paths (relative to the repo root, forward slashes) allowed to hold French text. */
const ALLOWED = ['src/i18n/locales/', 'src/storage/legacy-ids.ts'];

function scannedFiles(): string[] {
  const src = (readdirSync(join(ROOT, 'src'), { recursive: true }) as string[])
    .map((f) => `src/${f.replace(/\\/g, '/')}`)
    .filter((f) => f.endsWith('.ts') || f.endsWith('.css'));
  return [...src, 'index.html'].filter((f) => !ALLOWED.some((a) => f === a || f.startsWith(a))).sort();
}

describe('English code', () => {
  it('no French accented letter outside src/i18n/locales (and the legacy id table)', () => {
    const hits: string[] = [];
    for (const file of scannedFiles()) {
      readFileSync(join(ROOT, file), 'utf8')
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (FRENCH_LETTER.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(hits.length, `French text found outside src/i18n/locales:\n${hits.join('\n')}\n`).toBe(0);
  });
});
