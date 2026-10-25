/**
 * Railgun: charges for `duration` while aiming at the biggest enemy in `range` (by max HP), then fires an
 * instant line of `length` x `width` that pierces everything (`count` 2: a second line straight behind).
 * Optional `burn` on everything the line hits. No projectile; visuals read w.angles / w.vLen / w.vW / w.vN,
 * w.burstLeft (charging), w.burstTimer / w.vS (charge left / total) and w.activeTicks (shot flash).
 */
import type { WeaponLevel } from '../../data/weapons';
import { INPUT_DIRS, TICK_RATE } from '../constants';
import { PI, TWO_PI, datan2, dcos, dsin } from '../dmath';
import { damageEnemy, ignite } from '../combat';
import { clearShotsOnLine } from '../shots';
import { EV_SHOOT, emit, type GameState, type Player, type WeaponInst } from '../state';
import { RETRY_TICKS, biggest, cdTicks, ticks } from './common';

/** duration of the shot flash (ticks) */
export const RAIL_FX_TICKS = 21;
/** the aim stops following the target this long before the shot (ticks): it can be dodged */
const RAIL_LOCK = Math.round(0.25 * TICK_RATE);

/** Direction of the rail: the manual aim, otherwise the biggest enemy in range. False if nobody. */
function railAim(s: GameState, p: Player, range: number, w: WeaponInst): boolean {
  if (p.aim >= 0) {
    w.angle = (p.aim * TWO_PI) / INPUT_DIRS;
    return true;
  }
  const t = biggest(s, p.x, p.y, range);
  if (t < 0) return false;
  const e = s.enemies[t];
  w.angle = datan2(e.y - p.y, e.x - p.x);
  return true;
}

export function rail(s: GameState, p: Player, w: WeaponInst, _slot: number, L: WeaponLevel): void {
  const len = L.length ?? 900;
  const width = (L.width ?? 8) * p.stats.area;
  const n = Math.min(2, L.count ?? 1);
  w.vLen = len;
  w.vW = width;
  w.vN = n;
  if (w.activeTicks > 0) w.activeTicks--;
  if (w.burstLeft > 0) {
    // Charging: the aim follows its target until just before the shot.
    w.burstTimer -= 1;
    if (w.burstTimer > RAIL_LOCK) railAim(s, p, L.range ?? 480, w);
    for (let b = 0; b < n; b++) w.angles[b] = w.angle + b * PI;
    if (w.burstTimer > 0) return;
    w.burstLeft = 0;
    for (let b = 0; b < n; b++) fireLine(s, p, w.angles[b], len, width, L);
    w.activeTicks = RAIL_FX_TICKS;
    w.timer = cdTicks(L, p);
    emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
    return;
  }
  w.timer -= 1;
  if (w.timer > 0) return;
  if (!railAim(s, p, L.range ?? 480, w)) {
    w.timer = RETRY_TICKS;
    return;
  }
  for (let b = 0; b < n; b++) w.angles[b] = w.angle + b * PI;
  w.burstLeft = 1;
  w.burstTimer = w.vS = Math.max(1, Math.round(ticks(L.duration, 1.2) * p.stats.cooldownMul));
}

function fireLine(s: GameState, p: Player, a: number, len: number, width: number, L: WeaponLevel): void {
  const ux = dcos(a);
  const uy = dsin(a);
  const dmg = L.damage * p.stats.might;
  const knock = L.knockback ?? 140;
  clearShotsOnLine(s, p.x, p.y, ux, uy, len, width);
  const g = s.grid;
  const m = g.query(s.enemies, p.x + (ux * len) / 2, p.y + (uy * len) / 2, len / 2 + width);
  // Copied: a kill can split an enemy (which does not touch the grid) but the burn must see the same list.
  let c = 0;
  for (let q = 0; q < m && c < LINE.length; q++) {
    const idx = g.out[q];
    const e = s.enemies[idx];
    if (!e.alive) continue;
    const rx = e.x - p.x;
    const ry = e.y - p.y;
    const t = rx * ux + ry * uy;
    if (t < -e.r || t > len + e.r) continue;
    if (Math.abs(rx * uy - ry * ux) > width + e.r) continue;
    LINE[c++] = idx;
  }
  for (let k = 0; k < c; k++) {
    const idx = LINE[k];
    if (L.burn) ignite(s, idx, L.burn * p.stats.might, L.burnTime ?? 2.5, p.index);
    damageEnemy(s, idx, dmg, p.index, ux * knock, uy * knock);
  }
}
const LINE = new Int32Array(512);
