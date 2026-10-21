/**
 * Maths déterministes.
 *
 * Math.sin / cos / atan2 / pow / hypot ne sont PAS garantis identiques au bit près d'un moteur JS
 * à l'autre. On n'utilise donc que + - * / et Math.sqrt / floor / abs / min / max (exacts en IEEE 754)
 * pour construire nos propres approximations polynomiales.
 */

export const PI = 3.141592653589793;
export const TWO_PI = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

const S3 = -1 / 6;
const S5 = 1 / 120;
const S7 = -1 / 5040;
const S9 = 1 / 362880;
const S11 = -1 / 39916800;
const S13 = 1 / 6227020800;

export function dsin(x: number): number {
  x = x - TWO_PI * Math.floor((x + PI) / TWO_PI);
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  return x * (1 + x2 * (S3 + x2 * (S5 + x2 * (S7 + x2 * (S9 + x2 * (S11 + x2 * S13))))));
}

export function dcos(x: number): number {
  return dsin(x + HALF_PI);
}

/** atan2 approché (erreur < 1e-5 rad). */
export function datan2(y: number, x: number): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax === 0 && ay === 0) return 0;
  const swap = ay > ax;
  const z = swap ? ax / ay : ay / ax;
  const z2 = z * z;
  let r =
    z *
    (0.99997726 +
      z2 * (-0.33262347 + z2 * (0.19354346 + z2 * (-0.11643287 + z2 * (0.05265332 + z2 * -0.0117212)))));
  if (swap) r = HALF_PI - r;
  if (x < 0) r = PI - r;
  if (y < 0) r = -r;
  return r;
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

/** Tables de directions pour les codes d'entrée (64 directions, 0 = droite, sens horaire écran). */
export const DIR_COUNT = 64;
export const DIR_X = new Float64Array(DIR_COUNT);
export const DIR_Y = new Float64Array(DIR_COUNT);
for (let i = 0; i < DIR_COUNT; i++) {
  const a = (i * TWO_PI) / DIR_COUNT;
  DIR_X[i] = dcos(a);
  DIR_Y[i] = dsin(a);
}
