/**
 * Chain: instant lightning from the player to the nearest enemy, then `jumps` hops of `branch` arcs each
 * (optional `stun`). No projectile; emits EV_LINE per arc. Already-hit ids go in the shared HITS buffer.
 */
import type { WeaponLevel } from '../../data/weapons';
import { TICK_RATE } from '../constants';
import { damageEnemy } from '../combat';
import { EF_BOSS, EV_LINE, EV_SHOOT, emit, type GameState, type Player, type WeaponInst } from '../state';
import { HITS, RETRY_TICKS, cdTicks, hitN, pushHit, resetHits } from './common';

const FRONT_A = new Int32Array(64);
const FRONT_B = new Int32Array(64);

export function chain(s: GameState, p: Player, w: WeaponInst, _slot: number, L: WeaponLevel): void {
  w.timer -= 1;
  if (w.timer > 0) return;
  const g = s.grid;
  const enemies = s.enemies;
  const dmg = L.damage * p.stats.might;
  const range = L.range ?? 280;
  const jumpR = L.jumpRange ?? 150;
  const jumps = L.jumps ?? 2;
  const branch = L.branch ?? 1;
  const stun = Math.round((L.stun ?? 0) * TICK_RATE);
  const count = L.count ?? 1;
  resetHits();
  let fired = false;
  for (let c = 0; c < count; c++) {
    const first = g.nearest(enemies, p.x, p.y, range, HITS, hitN, true);
    if (first < 0) break;
    fired = true;
    zap(s, p, p.x, p.y, first, dmg, stun, w.def);
    let front = FRONT_A;
    let next = FRONT_B;
    let fn = 1;
    front[0] = first;
    for (let depth = 0; depth < jumps && fn > 0; depth++) {
      let nn = 0;
      for (let f = 0; f < fn; f++) {
        const src = enemies[front[f]];
        for (let b = 0; b < branch; b++) {
          if (hitN >= HITS.length - 1 || nn >= next.length) break;
          const t = g.nearest(enemies, src.x, src.y, jumpR, HITS, hitN, true);
          if (t < 0) break;
          zap(s, p, src.x, src.y, t, dmg, stun, w.def);
          next[nn++] = t;
        }
      }
      const tmp = front;
      front = next;
      next = tmp;
      fn = nn;
    }
  }
  if (!fired) {
    w.timer = RETRY_TICKS;
    return;
  }
  w.timer += cdTicks(L, p);
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}

function zap(s: GameState, p: Player, fx: number, fy: number, idx: number, dmg: number, stun: number, def: number): void {
  const e = s.enemies[idx];
  pushHit(e.id);
  emit(s, EV_LINE, fx, fy, 0, def, e.x, e.y, p.index);
  if (stun > 0 && !(e.flags & EF_BOSS)) e.stunUntil = Math.max(e.stunUntil, s.tick + stun);
  damageEnemy(s, idx, dmg, p.index, 0, 0);
}
