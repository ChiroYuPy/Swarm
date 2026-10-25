/** Drop-in intro at the start of a run: camera zoom curve and the landing effects. */
import type { Player } from '../sim';
import type { Effects } from '../render/effects';

/** camera zoom at the start of the fall (fraction of the normal zoom) */
const DROP_ZOOM = 0.28;

/** Camera zoom: from high above, diving faster and faster onto the hero. `drop` = fall progress (0 → 1), -1 outside the fall. */
export function cameraZoom(drop: number, demo: boolean): number {
  return drop >= 0 ? DROP_ZOOM + (1 - DROP_ZOOM) * drop * drop * drop : demo ? 0.8 : 1;
}

/** Landing burst: light shake, a white shockwave, sparks and a cyan flash around the hero (the arena then lights up, see drawSpotlight). */
export function landingFx(fx: Effects, p: Player): void {
  fx.addShake(6);
  fx.ring(p.x, p.y, 90, 0, 0.4);
  fx.burst(p.x, p.y, 30, 1, 520, 0.55, 3);
  fx.flash = 0.16;
  fx.flashColor = '#38f6ff';
}
