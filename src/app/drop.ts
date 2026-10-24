/** Drop-in intro at the start of a run: camera zoom curve and the landing effects. */
import type { Player } from '../sim';
import type { Effects } from '../render/effects';

/** caméra au début de la chute (fraction du zoom normal) */
const DROP_ZOOM = 0.28;

/** Camera zoom: from high above, diving faster and faster onto the hero. `drop` = fall progress (0 → 1), -1 outside the fall. */
export function cameraZoom(drop: number, demo: boolean): number {
  return drop >= 0 ? DROP_ZOOM + (1 - DROP_ZOOM) * drop * drop * drop : demo ? 0.8 : 1;
}

/** Landing burst: shake, shockwave rings, sparks and a cyan flash around the hero. */
export function landingFx(fx: Effects, p: Player): void {
  fx.addShake(12);
  fx.ring(p.x, p.y, 70, 1, 0.4);
  fx.ring(p.x, p.y, 200, 1, 0.65);
  fx.ring(p.x, p.y, 340, 0, 0.8);
  fx.burst(p.x, p.y, 40, 1, 620, 0.6, 3);
  fx.burst(p.x, p.y, 18, 0, 380, 0.45, 2);
  fx.flash = 0.2;
  fx.flashColor = '#38f6ff';
}
