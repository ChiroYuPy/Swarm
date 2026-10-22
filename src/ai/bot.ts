/**
 * Pilote automatique. Ce n'est PAS la simulation : c'est une source d'entrées comme le clavier.
 * Il lit l'état et renvoie un code d'entrée. Sert aux tests, au script d'équilibrage et au mode démo.
 * Volontairement « joueur moyen » : il esquive et ramasse, sans connaître les patterns.
 */
import { FUSIONS } from '../data/fusions';
import { BASE_WEAPONS } from '../data/weapons';
import { PASSIVES } from '../data/passives';
import { ENEMIES, OEIL } from '../data/enemies';
import {
  OFFER_FUSION,
  OFFER_PASSIVE,
  OFFER_WEAPON,
  EF_BOSS,
  INPUT_USE,
  PK_CHEST,
  PK_HEAL,
  PJ_EBULLET,
  PJ_FIRE,
  BOSS_PATTERNS,
  circleHitsObstacle,
  choiceCode,
  encodeMove,
  isAwaitingChoice,
  type GameState,
  type Offer,
  type Player,
} from '../sim';

const N_DIR = 16;
const KAMIKAZE_TYPE = ENEMIES.findIndex((e) => e.behavior === 'kamikaze');
const CX = new Float64Array(N_DIR);
const CY = new Float64Array(N_DIR);
for (let i = 0; i < N_DIR; i++) {
  CX[i] = Math.cos((i / N_DIR) * Math.PI * 2);
  CY[i] = Math.sin((i / N_DIR) * Math.PI * 2);
}

const NEAR_X = new Float64Array(2048);
const NEAR_Y = new Float64Array(2048);
const NEAR_W = new Float64Array(2048);

function offerScore(p: Player, o: Offer): number {
  // Stratégie « joueur raisonnable » : 3-4 armes montées à fond, des passifs utiles, les évolutions dès que possible.
  if (o.kind === OFFER_FUSION) return 100;
  if (o.kind === OFFER_WEAPON) {
    const owned = p.weapons.some((w) => w.def === o.id);
    if (owned) return 60 + o.toLevel;
    return p.weapons.length < 3 ? 55 : p.weapons.length === 3 ? 35 : 15;
  }
  if (o.kind === OFFER_PASSIVE) {
    const id = PASSIVES[o.id].id;
    // Bonus si ce passif ouvre une évolution d'une arme possédée.
    const ownedIds = p.weapons.map((w) => BASE_WEAPONS[w.def]?.id);
    const helps = FUSIONS.some((f) => f.with === id && ownedIds.includes(f.weapon));
    const base = o.toLevel > 1 ? 40 : 38;
    return base + (helps ? 12 : 0) + (id === 'soupe' || id === 'biceps' || id === 'blindage' ? 6 : 0);
  }
  return 1;
}

export function botChoice(p: Player): number {
  let best = 0;
  let bestS = -Infinity;
  p.offers.forEach((o, i) => {
    const sc = offerScore(p, o);
    if (sc > bestS) {
      bestS = sc;
      best = i;
    }
  });
  return best;
}

export function botInput(s: GameState, pi = 0): number {
  const p = s.players[pi];
  if (!p || !p.alive) return 0;
  if (isAwaitingChoice(s, pi)) return choiceCode(botChoice(p));
  // Objet activable : utilisé quand la pression devient forte (ou contre le boss).
  if (p.activable >= 0 && s.tick % 30 === 0) {
    let close = 0;
    for (let i = 0; i < s.enemyCount; i++) {
      const e = s.enemies[i];
      if (!e.alive || e.speed === 0) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * dx + dy * dy < 200 * 200) close++;
    }
    if (close >= 18 || p.hp < p.stats.maxHp * 0.35 || s.bossId >= 0) return INPUT_USE;
  }

  // Charge du Trapèze ou ruée de l'Étoile annoncée : on évite son axe (la ligne d'avertissement est
  // visible à l'écran). Cône de l'Œil : on sort de sa portée.
  let chargeX = 0;
  let chargeY = 0;
  let chargeUx = 0;
  let chargeUy = 0;
  let charging = false;
  let beam = false;
  if (s.bossId >= 0) {
    for (let i = 0; i < s.enemyCount; i++) {
      const e = s.enemies[i];
      if (!e.alive || !(e.flags & EF_BOSS)) continue;
      const kind = BOSS_PATTERNS[e.type][e.ai]?.kind;
      chargeX = e.x;
      chargeY = e.y;
      if (kind === 'charge' || kind === 'aim') {
        charging = true;
        chargeUx = Math.cos(e.aux);
        chargeUy = Math.sin(e.aux);
      }
      beam = kind === 'focus' || kind === 'sweep';
      break;
    }
  }

  // Menaces proches (ennemis + balles ennemies)
  let n = 0;
  const R = 340;
  for (let i = 0; i < s.enemyCount && n < NEAR_X.length; i++) {
    const e = s.enemies[i];
    if (!e.alive || e.speed === 0) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    if (dx * dx + dy * dy > R * R) continue;
    NEAR_X[n] = e.x;
    NEAR_Y[n] = e.y;
    // Les Bulles kamikazes n'ont pas de dégâts de contact mais explosent : on les craint beaucoup.
    const kamikaze = e.type === KAMIKAZE_TYPE;
    NEAR_W[n] = kamikaze ? (e.ai === 1 ? 90 : 28) : (e.dmg + 4) * (e.r > 30 ? 4 : 1);
    n++;
  }
  for (let i = 0; i < s.projCount && n < NEAR_X.length; i++) {
    const b = s.projectiles[i];
    if (b.kind !== PJ_EBULLET && b.kind !== PJ_FIRE) continue;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    if (dx * dx + dy * dy > 200 * 200) continue;
    NEAR_X[n] = b.x;
    NEAR_Y[n] = b.y;
    NEAR_W[n] = b.kind === PJ_FIRE ? 14 : b.damage + 6;
    n++;
  }

  // Cible attractive : gemme la plus proche, ou objet utile.
  let gx = 0;
  let gy = 0;
  let gw = 0;
  let bestG = 420 * 420;
  for (let i = 0; i < s.gemCount; i++) {
    const g = s.gems[i];
    const dx = g.x - p.x;
    const dy = g.y - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestG) {
      bestG = d;
      gx = dx;
      gy = dy;
      gw = 14;
    }
  }
  for (let i = 0; i < s.pickupCount; i++) {
    const it = s.pickups[i];
    if (it.kind === PK_HEAL && p.hp > p.stats.maxHp * 0.7) continue;
    const dx = it.x - p.x;
    const dy = it.y - p.y;
    const d = dx * dx + dy * dy;
    if (d < 900 * 900 && (it.kind === PK_CHEST || d < bestG * 2)) {
      gx = dx;
      gy = dy;
      gw = it.kind === PK_CHEST ? 40 : 25;
      break;
    }
  }
  // Boss : on va le chercher (sans se coller) quand rien n'est annoncé, comme un joueur qui veut le tuer.
  if (s.bossId >= 0 && !charging && !beam && gw < 40) {
    const bx = chargeX - p.x;
    const by = chargeY - p.y;
    if (bx * bx + by * by > 230 * 230) {
      gx = bx;
      gy = by;
      gw = 30;
    }
  }
  const gl = Math.sqrt(gx * gx + gy * gy) || 1;


  let best = -1;
  let bestScore = -Infinity;
  for (let k = 0; k < N_DIR; k++) {
    const dx = CX[k];
    const dy = CY[k];
    const x1 = p.x + dx * 34;
    const y1 = p.y + dy * 34;
    const x2 = p.x + dx * 90;
    const y2 = p.y + dy * 90;
    if (circleHitsObstacle(s.map, x1, y1, p.r)) continue;
    let score = 0;
    if (circleHitsObstacle(s.map, x2, y2, p.r)) score -= 25;
    if (circleHitsObstacle(s.map, p.x + dx * 170, p.y + dy * 170, p.r)) score -= 8;
    let threat = 0;
    for (let i = 0; i < n; i++) {
      // Menace évaluée à deux distances : le pas immédiat compte plus.
      let ex = NEAR_X[i] - x1;
      let ey = NEAR_Y[i] - y1;
      let d = Math.max(8, Math.sqrt(ex * ex + ey * ey) - 14);
      threat += (NEAR_W[i] * 700) / (d * d);
      ex = NEAR_X[i] - x2;
      ey = NEAR_Y[i] - y2;
      d = Math.max(10, Math.sqrt(ex * ex + ey * ey) - 10);
      threat += (NEAR_W[i] * 400) / (d * d);
    }
    if (charging) {
      const rx = x2 - chargeX;
      const ry = y2 - chargeY;
      const along = rx * chargeUx + ry * chargeUy;
      const perp = Math.abs(rx * chargeUy - ry * chargeUx);
      if (along > -40 && perp < 90) threat += 80 * (1 - perp / 90) + 20;
    }
    if (beam) {
      const rx = x2 - chargeX;
      const ry = y2 - chargeY;
      const d = Math.sqrt(rx * rx + ry * ry);
      if (d < OEIL.beamLength + 40) threat += 60 * (1 - d / (OEIL.beamLength + 40)) + 10;
    }
    score -= threat;
    score += (gw * (dx * gx + dy * gy)) / gl / (1 + threat * 0.3);
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  if (best < 0) return 0;
  return encodeMove(CX[best], CY[best]);
}
