/**
 * Phoenix: keeps `count` PJ_PHOENIX firebirds flying straight through the horde along the line crossing the
 * most enemy HP (vx/vy = unit direction, c = last hit id; see projectiles.ts).
 */
import type { WeaponLevel } from '../../data/weapons';
import { TWO_PI, dcos, dsin } from '../dmath';
import { spawnProjectile } from '../entities';
import { EV_SHOOT, PJ_PHOENIX, emit, type GameState, type Player, type WeaponInst } from '../state';
import { AIM, RETRY_TICKS, aim, setAim, ticks } from './common';

/** portée prise en compte pour choisir la ligne du Phénix, et nombre de caps essayés autour du joueur */
const PHOENIX_REACH = 650;
const PHOENIX_DIRS = 48;

/**
 * Cap du Phénix (dans AIM) : parmi PHOENIX_DIRS directions autour du joueur, celle dont la bande de
 * largeur 2 × `band` traverse le plus de PV ennemis sur `reach` : le plus gros groupe, ou le plus gros
 * sac à PV (boss compris). Faux si personne n'est à portée.
 */
function phoenixLine(s: GameState, p: Player, band: number, reach: number): boolean {
  const g = s.grid;
  const m = g.query(s.enemies, p.x, p.y, reach);
  let best = 0;
  for (let k = 0; k < PHOENIX_DIRS; k++) {
    const a = (k * TWO_PI) / PHOENIX_DIRS;
    const ux = dcos(a);
    const uy = dsin(a);
    let sum = 0;
    for (let q = 0; q < m; q++) {
      const e = s.enemies[g.out[q]];
      if (!e.alive) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * ux + dy * uy <= 0) continue;
      if (Math.abs(dx * uy - dy * ux) > band + e.r) continue;
      sum += e.hp;
    }
    if (sum > best) {
      best = sum;
      setAim(a);
    }
  }
  return best > 0;
}

/**
 * Phénix : des oiseaux de feu qui filent tout droit à travers la horde sans revenir (voir projectiles.ts).
 * Comme les drones, l'arme complète l'effectif : un oiseau éteint renaît près de toi après `respawn` s.
 */
export function phoenix(s: GameState, p: Player, w: WeaponInst, slot: number, L: WeaponLevel): void {
  const n = L.count ?? 1;
  let alive = 0;
  for (let i = 0; i < s.projCount; i++) {
    const b = s.projectiles[i];
    if (b.kind === PJ_PHOENIX && b.owner === p.index && b.weapon === w.def && b.life > 0) alive++;
  }
  if (alive >= n) {
    w.timer = ticks(L.respawn, 0.8);
    return;
  }
  w.timer -= 1;
  if (w.timer > 0) return;
  const band = (L.size ?? 26) * p.stats.area;
  const reach = Math.min(PHOENIX_REACH, (L.speed ?? 470) * (L.life ?? 2));
  // Visée manuelle : il part là où tu vises ; sinon, sur la ligne qui traverse le plus de PV ennemis.
  if (p.aim >= 0) aim(s, p, reach);
  else if (!phoenixLine(s, p, band, reach)) {
    w.timer = RETRY_TICKS;
    return;
  }
  const b = spawnProjectile(s);
  if (!b) return;
  // Le deuxième oiseau (s'il y en a un) part un peu de biais, pour ne pas suivre le premier.
  const a = AIM + (alive & 1 ? 0.35 : 0);
  b.kind = PJ_PHOENIX;
  b.owner = p.index;
  b.slot = slot;
  b.weapon = w.def;
  b.x = b.px = p.x;
  b.y = b.py = p.y;
  b.vx = dcos(a);
  b.vy = dsin(a);
  b.c = -1;
  b.r = (L.size ?? 26) * p.stats.area;
  b.damage = L.damage * p.stats.might;
  b.knock = L.knockback ?? 40;
  b.pierce = -1;
  b.life = ticks(L.life, 4);
  w.timer = 15; // le suivant ne part pas dans la même image
  emit(s, EV_SHOOT, p.x, p.y, 0, w.def, 0, 0, p.index);
}
