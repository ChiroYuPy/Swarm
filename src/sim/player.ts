/** Hero: stats, timed buffs, active item, movement, regeneration, XP. */
import { HERO, xpForLevel } from '../data/hero';
import { PASSIVES } from '../data/passives';
import { LOOT, PICKUPS, type PickupIdOf } from '../data/loot';
import { DT, INPUT_DIRS, TICK_RATE } from './constants';
import { DIR_X, DIR_Y } from './dmath';
import { moveCircle } from './map';
import { damageEnemy, explode, healPlayer } from './combat';
import {
  EF_BOSS,
  EF_PROP,
  EV_ACTIVATE,
  EV_LEVELUP,
  PassiveInst,
  Player,
  WeaponInst,
  emit,
  type GameState,
} from './state';

/** Stats coming from passives (p.base). Effective stats (p.stats) add the timed buffs on top. */
export function computeStats(p: Player): void {
  let cd = 0;
  let spd = 0;
  let mag = 0;
  let might = 0;
  let area = 0;
  let hp = 0;
  let regen = 0;
  let armor = 0;
  let luck = 0;
  for (const inst of p.passives) {
    const d = PASSIVES[inst.def].perLevel;
    const l = inst.level;
    cd += (d.cooldown ?? 0) * l;
    spd += (d.speed ?? 0) * l;
    mag += (d.magnet ?? 0) * l;
    might += (d.might ?? 0) * l;
    area += (d.area ?? 0) * l;
    hp += (d.maxHp ?? 0) * l;
    regen += (d.regen ?? 0) * l;
    armor += (d.armor ?? 0) * l;
    luck += (d.luck ?? 0) * l;
  }
  const oldMax = p.base.maxHp;
  const b = p.base;
  b.maxHp = HERO.maxHp + hp;
  b.speed = HERO.speed * (1 + spd);
  b.magnet = HERO.magnet * (1 + mag);
  b.regen = HERO.regen + regen;
  b.might = 1 + might;
  b.area = 1 + area;
  b.cooldownMul = Math.max(0.35, 1 - cd);
  b.armor = Math.min(0.6, armor);
  b.luck = 1 + luck;
  if (b.maxHp > oldMax) p.hp += b.maxHp - oldMax;
  if (p.hp > b.maxHp) p.hp = b.maxHp;
  applyBuffs(p, 0);
}

/** Effective stats = passives × active timed buffs. */
export function applyBuffs(p: Player, tick: number): void {
  const b = p.base;
  const st = p.stats;
  st.maxHp = b.maxHp;
  st.magnet = b.magnet * (p.feverUntil > tick ? LOOT.feverMagnet : 1);
  st.regen = b.regen;
  st.area = b.area;
  st.armor = b.armor;
  st.luck = b.luck;
  st.might = b.might * p.mightMul * (p.rageUntil > tick ? 2 : 1);
  st.cooldownMul = b.cooldownMul * (p.frenzyUntil > tick ? 0.5 : 1);
  st.speed = b.speed * (p.turboUntil > tick ? 1.5 : 1);
}

/** Decodes an input code into a direction. Returns the magnitude (0, 0.5 or 1) and writes the direction into `out`. */
export function decodeMove(code: number, out: { x: number; y: number }): number {
  if (code >= 1 && code <= INPUT_DIRS) {
    out.x = DIR_X[code - 1];
    out.y = DIR_Y[code - 1];
    return 1;
  }
  if (code > INPUT_DIRS && code <= INPUT_DIRS * 2) {
    out.x = DIR_X[code - 1 - INPUT_DIRS];
    out.y = DIR_Y[code - 1 - INPUT_DIRS];
    return 0.5;
  }
  out.x = 0;
  out.y = 0;
  return 0;
}

const MOVE = { x: 0, y: 0 };

export function updatePlayer(s: GameState, p: Player, code: number): void {
  p.px = p.x;
  p.py = p.y;
  if (!p.alive) return;
  applyBuffs(p, s.tick);
  const mag = decodeMove(code, MOVE);
  p.moveX = MOVE.x * mag;
  p.moveY = MOVE.y * mag;
  if (mag > 0) {
    p.faceX = MOVE.x;
    p.faceY = MOVE.y;
    const speed = p.stats.speed;
    moveCircle(s.map, p, p.moveX * speed * DT, p.moveY * speed * DT, p.r);
  }
  if (p.stats.regen > 0) healPlayer(s, p, p.stats.regen * DT, false);
}

type ActiveEffect = (s: GameState, p: Player) => void;

/** Effect of each active item, by id. Typed from the data: a new active item fails to typecheck until it has its entry. */
const ACTIVE_EFFECTS: Record<PickupIdOf<'active'>, ActiveEffect> = {
  vacuum: (s) => {
    for (let i = 0; i < s.gemCount; i++) s.gems[i].magnet = true;
    for (let i = 0; i < s.pickupCount; i++) s.pickups[i].magnet = true;
  },
  freeze: (s, p) => {
    // Freeze: only around the player, and never the boss.
    const until = s.tick + Math.round(LOOT.freezeSeconds * TICK_RATE);
    const R = LOOT.freezeRadius;
    for (let i = 0; i < s.enemyCount; i++) {
      const e = s.enemies[i];
      if (!e.alive || e.flags & (EF_BOSS | EF_PROP)) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * dx + dy * dy > (R + e.r) * (R + e.r)) continue;
      e.frozenUntil = until;
      e.kbx = e.kby = 0;
    }
  },
  bomb: (s, p) => explode(s, p.x, p.y, LOOT.bombRadius, LOOT.bombDamage * p.stats.might, p.index, 300),
  clock: (s) => {
    s.clockUntil = Math.max(s.clockUntil, s.tick) + Math.round(LOOT.clockSeconds * TICK_RATE);
  },
  clone: (s, p) => spawnClone(s, p),
  eradicate: (s, p) => {
    for (let i = 0; i < s.enemyCount; i++) {
      const e = s.enemies[i];
      if (!e.alive || e.flags & EF_PROP) continue;
      if (e.flags & EF_BOSS) damageEnemy(s, i, e.maxHp * LOOT.eradicateBoss, p.index, 0, 0);
      else damageEnemy(s, i, e.hp + 1, p.index, 0, 0);
    }
  },
};
/** ACTIVE_EFFECTS by pickup code (null for the other pickups). */
const ACTIVE_BY_CODE: (ActiveEffect | null)[] = PICKUPS.map((d) => (d.kind === 'active' ? ACTIVE_EFFECTS[d.id as PickupIdOf<'active'>] : null));

/** Triggers the held active item ("zero-time" step, input code 210). */
export function useActivable(s: GameState, p: Player): void {
  const kind = p.activeItem;
  if (kind < 0) return;
  p.activeItem = -1;
  emit(s, EV_ACTIVATE, p.x, p.y, 0, kind, 0, 0, p.index);
  ACTIVE_BY_CODE[kind]?.(s, p);
}

/**
 * Clone: a motionless double of the player (same weapons, same passives) that shoots on its own for
 * a few seconds and lures nearby enemies. Only one at a time: using another replaces it.
 */
function spawnClone(s: GameState, p: Player): void {
  let c = s.players.find((q) => q.master === p.index);
  if (!c) {
    c = new Player();
    c.index = s.players.length;
    s.players.push(c);
  }
  c.master = p.index;
  c.alive = true;
  c.deathTick = -1;
  c.r = p.r;
  c.x = c.px = p.x;
  c.y = c.py = p.y;
  c.faceX = p.faceX;
  c.faceY = p.faceY;
  c.weapons = p.weapons.map((w, k) => {
    const n = new WeaponInst();
    n.def = w.def;
    n.level = w.level;
    n.timer = 6 + k * 4;
    return n;
  });
  c.passives = p.passives.map((x) => {
    const n = new PassiveInst();
    n.def = x.def;
    n.level = x.level;
    return n;
  });
  c.mightMul = p.mightMul;
  computeStats(c);
  c.hp = c.stats.maxHp;
  c.expires = s.tick + Math.round(LOOT.cloneSeconds * TICK_RATE);
  const R = LOOT.cloneLure;
  for (let i = 0; i < s.enemyCount; i++) {
    const e = s.enemies[i];
    if (!e.alive || e.flags & (EF_BOSS | EF_PROP)) continue;
    const dx = e.x - c.x;
    const dy = e.y - c.y;
    if (dx * dx + dy * dy < R * R) e.target = c.index;
  }
}

export function addXp(s: GameState, p: Player, v: number): void {
  if (p.feverUntil > s.tick) v *= LOOT.feverXp;
  p.xp += s.sandbox ? v * s.sandbox.xp : v;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level++;
    p.xpNext = xpForLevel(p.level);
    p.pendingLevels++;
    emit(s, EV_LEVELUP, p.x, p.y, p.level, 0, 0, 0, p.index);
  }
}
