/** The hero and the XP curve. Values can be tweaked freely. */
export const HERO = {
  maxHp: 100,
  /** world units / second (one cell = 64 units) */
  speed: 150,
  /** gem pickup radius */
  magnet: 72,
  /** HP / second */
  regen: 0.2,
  radius: 14,
  /** invulnerability after a hit (seconds) */
  iframes: 0.2,
  /** dash (Shift, right click, gamepad RB): distance (units) covered in `seconds`, invulnerable for `invuln` s, then `cooldown` s before the next one */
  dash: { distance: 96, seconds: 0.15, invuln: 0.25, cooldown: 1.1 },
  /** shots leave from this far in front of the hero's centre (just outside its body) */
  muzzle: 18,
  /** manual aim assist: the shot goes to the nearest enemy within this half-angle (degrees) of the aimed direction */
  aimAssist: 20,
  startWeapon: 'blaster',
};

/** XP needed to go from level `level` to the next one. */
export function xpForLevel(level: number): number {
  const n = level - 1;
  return Math.floor(5 + n * 2.5 + n * n * 0.15);
}

/** Score = seconds survived × 10 + kills + bonus per boss defeated. */
export const SCORE = {
  perSecond: 10,
  perKill: 1,
  perBoss: 250,
};
