/**
 * Codage des entrées et du journal de partie.
 *
 * Une entrée = 1 octet par pas de simulation :
 *   0         immobile
 *   1..64     déplacement plein régime dans la direction (code-1) × 360°/64
 *   65..128   déplacement à mi-régime (stick analogique peu incliné)
 *   130       revenir à la visée automatique (pas « zéro »)
 *   131..194  viser dans la direction (code-131) × 360°/64 (pas « zéro », enregistré quand la visée change)
 *   200..202  choix de la proposition 0, 1 ou 2 au level-up (pas « zéro », le temps n'avance pas)
 *   210       utiliser l'objet activable (pas « zéro »)
 *
 * Journal : RLE (octet valeur + longueur en varint LEB128), puis base64, préfixé par la version du format.
 * Une partie de 10 minutes au clavier tient en quelques Ko.
 */
import { INPUT_AIM_AUTO, INPUT_AIM_BASE, INPUT_CHOICE_BASE, INPUT_DIRS } from './constants';
import { TWO_PI, datan2 } from './dmath';

export const LOG_FORMAT = 'N1';

/** Convertit un vecteur d'entrée (clavier ou stick) en code. */
export function encodeMove(x: number, y: number): number {
  const m2 = x * x + y * y;
  if (m2 < 0.04) return 0;
  let a = datan2(y, x);
  if (a < 0) a += TWO_PI;
  const d = Math.round((a / TWO_PI) * INPUT_DIRS) % INPUT_DIRS;
  return m2 < 0.36 ? INPUT_DIRS + 1 + d : 1 + d;
}

/** Direction de visée (0..63) la plus proche de l'angle `a` (radians). */
export function aimDir(a: number): number {
  const d = Math.round((a / TWO_PI) * INPUT_DIRS) % INPUT_DIRS;
  return d < 0 ? d + INPUT_DIRS : d;
}

/** Code de visée : direction 0..63, ou -1 pour la visée automatique. */
export function aimCode(dir: number): number {
  return dir < 0 ? INPUT_AIM_AUTO : INPUT_AIM_BASE + dir;
}

export function choiceCode(i: number): number {
  return INPUT_CHOICE_BASE + i;
}

export function isChoiceCode(c: number): boolean {
  return c >= INPUT_CHOICE_BASE && c < INPUT_CHOICE_BASE + 3;
}

/** Pas « zéro » : ne fait pas avancer le temps (visée, choix de level-up, objet activable). */
export function isZeroTimeCode(c: number): boolean {
  return c >= INPUT_AIM_AUTO;
}

/** Journal d'entrées extensible (un octet par pas). */
export class InputLog {
  private buf = new Uint8Array(8192);
  length = 0;
  push(code: number): void {
    if (this.length >= this.buf.length) {
      const n = new Uint8Array(this.buf.length * 2);
      n.set(this.buf);
      this.buf = n;
    }
    this.buf[this.length++] = code;
  }
  get(i: number): number {
    return this.buf[i];
  }
  toArray(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
  clear(): void {
    this.length = 0;
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

function fromBase64(str: string): Uint8Array {
  const clean = str.replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1] ?? 'A') << 12) |
      ((i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : 0) << 6) |
      (i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : 0);
    out.push((n >> 16) & 255);
    if (i + 2 < clean.length) out.push((n >> 8) & 255);
    if (i + 3 < clean.length) out.push(n & 255);
  }
  return new Uint8Array(out);
}

export function encodeLog(codes: Uint8Array): string {
  const bytes: number[] = [];
  let i = 0;
  while (i < codes.length) {
    const v = codes[i];
    let run = 1;
    while (i + run < codes.length && codes[i + run] === v) run++;
    bytes.push(v);
    let r = run;
    while (r >= 0x80) {
      bytes.push((r & 0x7f) | 0x80);
      r >>>= 7;
    }
    bytes.push(r);
    i += run;
  }
  return `${LOG_FORMAT}.${codes.length}.${toBase64(bytes)}`;
}

export function decodeLog(str: string): Uint8Array {
  const parts = str.split('.');
  if (parts.length !== 3 || parts[0] !== LOG_FORMAT) throw new Error('Journal de partie invalide');
  const total = Number(parts[1]);
  const bytes = fromBase64(parts[2]);
  const out = new Uint8Array(total);
  let o = 0;
  let i = 0;
  while (i < bytes.length && o < total) {
    const v = bytes[i++];
    let run = 0;
    let shift = 0;
    for (;;) {
      const b = bytes[i++];
      run |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    out.fill(v, o, Math.min(total, o + run));
    o += run;
  }
  if (o !== total) throw new Error('Journal de partie tronqué');
  return out;
}
