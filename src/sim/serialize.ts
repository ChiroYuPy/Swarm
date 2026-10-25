/**
 * State serialization and fingerprint.
 * - `hashState`: compact fingerprint of the whole logical state (used by determinism tests
 *   and, later, to check that a client and a server are in sync).
 * - `serializeState` / `deserializeState`: full, restorable JSON snapshot.
 */
import { createGame } from './game';
import { Enemy, Gem, Pickup, Player, Projectile, PassiveInst, WeaponInst, type GameState, type OfferKind, type SandboxRules } from './state';
import { SHURIKEN_BOX_X, SHURIKEN_BOX_Y } from './weapons';

const ENEMY_KEYS = Object.keys(new Enemy()).filter((k) => k !== 'immune');
const PROJ_KEYS = Object.keys(new Projectile()).filter((k) => k !== 'hitIds');
const GEM_KEYS = Object.keys(new Gem());
const PICKUP_KEYS = Object.keys(new Pickup());
const WEAPON_KEYS = Object.keys(new WeaponInst()).filter((k) => k !== 'angles');
const PLAYER_SCALAR_KEYS = Object.keys(new Player()).filter(
  (k) => !['weapons', 'passives', 'banned', 'offers', 'stats', 'base'].includes(k),
);

type Rec = Record<string, unknown>;

class Hasher {
  private h1 = 0x811c9dc5;
  private h2 = 0x2545f491;
  private readonly view = new DataView(new ArrayBuffer(8));
  int(v: number): void {
    this.h1 = Math.imul(this.h1 ^ (v | 0), 0x01000193) >>> 0;
    this.h2 = (Math.imul(this.h2 ^ (v | 0), 0x5bd1e995) ^ (this.h2 >>> 15)) >>> 0;
  }
  num(v: number): void {
    this.view.setFloat64(0, v, true);
    this.int(this.view.getUint32(0, true));
    this.int(this.view.getUint32(4, true));
  }
  val(v: unknown): void {
    if (typeof v === 'number') this.num(v);
    else if (typeof v === 'boolean') this.int(v ? 1 : 0);
  }
  hex(): string {
    return this.h1.toString(16).padStart(8, '0') + this.h2.toString(16).padStart(8, '0');
  }
}

export function hashState(s: GameState): string {
  const h = new Hasher();
  h.int(s.version);
  h.int(s.seed);
  h.int(s.difficulty);
  h.int(s.clockUntil);
  h.int(s.tick);
  h.int(s.over ? 1 : 0);
  h.int(s.rngWaves.s);
  h.int(s.rngLoot.s);
  h.num(s.spawnBudget);
  h.int(s.bossSpawned);
  h.int(s.bossId);
  h.int(s.clock);
  h.int(s.calmUntil);
  h.num(s.arenaX);
  h.num(s.arenaY);
  h.num(s.arenaR);
  h.int(s.won ? 1 : 0);
  h.num(s.boxX);
  h.num(s.boxY);
  h.int(s.totalKills);
  h.int(s.nextEnemyId);
  for (const p of s.players) {
    for (const k of PLAYER_SCALAR_KEYS) h.val((p as unknown as Rec)[k]);
    for (const w of p.weapons) {
      for (const k of WEAPON_KEYS) h.val((w as unknown as Rec)[k]);
      for (let i = 0; i < w.angles.length; i++) h.num(w.angles[i]);
    }
    for (const ps of p.passives) {
      h.int(ps.def);
      h.int(ps.level);
    }
    for (const o of p.offers) {
      h.int(o.kind);
      h.int(o.id);
      h.int(o.toLevel);
    }
  }
  h.int(s.enemyCount);
  for (let i = 0; i < s.enemyCount; i++) {
    const e = s.enemies[i] as unknown as Rec;
    for (const k of ENEMY_KEYS) h.val(e[k]);
  }
  h.int(s.projCount);
  for (let i = 0; i < s.projCount; i++) {
    const p = s.projectiles[i] as unknown as Rec;
    for (const k of PROJ_KEYS) h.val(p[k]);
  }
  h.int(s.gemCount);
  for (let i = 0; i < s.gemCount; i++) {
    const g = s.gems[i] as unknown as Rec;
    for (const k of GEM_KEYS) h.val(g[k]);
  }
  h.int(s.pickupCount);
  for (let i = 0; i < s.pickupCount; i++) {
    const p = s.pickups[i] as unknown as Rec;
    for (const k of PICKUP_KEYS) h.val(p[k]);
  }
  return h.hex();
}

function pick(o: unknown, keys: string[]): Rec {
  const out: Rec = {};
  const r = o as Rec;
  for (const k of keys) out[k] = r[k];
  return out;
}
function assign(o: unknown, data: Rec, keys: string[]): void {
  const r = o as Rec;
  for (const k of keys) if (k in data) r[k] = data[k];
}

export const SNAPSHOT_FORMAT = 'swarm-snapshot';
/** Format string written before the project was renamed, still accepted when reading. */
const LEGACY_SNAPSHOT_FORMAT = 'neonawak-snapshot';

export interface Snapshot {
  format: typeof SNAPSHOT_FORMAT;
  version: number;
  seedLabel: string;
  difficulty: number;
  playerCount: number;
  sandbox?: SandboxRules | null;
  core: Rec;
  players: Rec[];
  enemies: Rec[];
  projectiles: Rec[];
  gems: Rec[];
  pickups: Rec[];
}

export function serializeState(s: GameState): string {
  const snap: Snapshot = {
    format: SNAPSHOT_FORMAT,
    version: s.version,
    seedLabel: s.seedLabel,
    difficulty: s.difficulty,
    playerCount: s.players.length,
    sandbox: s.sandbox,
    core: {
      tick: s.tick,
      over: s.over,
      nextEnemyId: s.nextEnemyId,
      gemMergeCursor: s.gemMergeCursor,
      rngWaves: s.rngWaves.s,
      rngLoot: s.rngLoot.s,
      spawnBudget: s.spawnBudget,
      bossSpawned: s.bossSpawned,
      bossId: s.bossId,
      clock: s.clock,
      calmUntil: s.calmUntil,
      arenaX: s.arenaX,
      arenaY: s.arenaY,
      arenaR: s.arenaR,
      won: s.won,
      boxX: s.boxX,
      boxY: s.boxY,
      chestCount: s.chestCount,
      totalKills: s.totalKills,
      clockUntil: s.clockUntil,
    },
    players: s.players.map((p) => ({
      ...pick(p, PLAYER_SCALAR_KEYS),
      stats: { ...p.stats },
      base: { ...p.base },
      banned: [...p.banned],
      offers: p.offers.map((o) => ({ ...o })),
      passives: p.passives.map((x) => ({ def: x.def, level: x.level })),
      weapons: p.weapons.map((w) => ({ ...pick(w, WEAPON_KEYS), angles: Array.from(w.angles) })),
    })),
    enemies: s.enemies.slice(0, s.enemyCount).map((e) => ({ ...pick(e, ENEMY_KEYS), immune: Array.from(e.immune) })),
    projectiles: s.projectiles
      .slice(0, s.projCount)
      .map((p) => ({ ...pick(p, PROJ_KEYS), hitIds: Array.from(p.hitIds) })),
    gems: s.gems.slice(0, s.gemCount).map((g) => pick(g, GEM_KEYS)),
    pickups: s.pickups.slice(0, s.pickupCount).map((p) => pick(p, PICKUP_KEYS)),
  };
  return JSON.stringify(snap);
}

export function deserializeState(json: string): GameState {
  const snap = JSON.parse(json) as Snapshot;
  if (snap.format !== SNAPSHOT_FORMAT && (snap.format as string) !== LEGACY_SNAPSHOT_FORMAT) throw new Error('Invalid snapshot');
  const s = createGame({ seed: snap.seedLabel, difficulty: snap.difficulty, players: snap.playerCount });
  if (snap.version !== s.version) throw new Error(`Incompatible sim version (${snap.version} ≠ ${s.version})`);
  const c = snap.core;
  s.tick = c.tick as number;
  s.over = c.over as boolean;
  s.nextEnemyId = c.nextEnemyId as number;
  s.gemMergeCursor = c.gemMergeCursor as number;
  s.rngWaves.s = c.rngWaves as number;
  s.rngLoot.s = c.rngLoot as number;
  s.spawnBudget = c.spawnBudget as number;
  s.bossSpawned = c.bossSpawned as number;
  s.bossId = c.bossId as number;
  s.clock = c.clock as number;
  s.calmUntil = c.calmUntil as number;
  s.arenaX = (c.arenaX as number) ?? 0;
  s.arenaY = (c.arenaY as number) ?? 0;
  s.arenaR = (c.arenaR as number) ?? 0;
  s.won = (c.won as boolean) ?? false;
  s.boxX = (c.boxX as number) ?? SHURIKEN_BOX_X;
  s.boxY = (c.boxY as number) ?? SHURIKEN_BOX_Y;
  s.chestCount = c.chestCount as number;
  s.totalKills = c.totalKills as number;
  s.clockUntil = c.clockUntil as number;
  s.sandbox = snap.sandbox ?? null;
  snap.players.forEach((pd, i) => {
    const p = s.players[i];
    assign(p, pd, PLAYER_SCALAR_KEYS);
    Object.assign(p.stats, pd.stats as Rec);
    Object.assign(p.base, pd.base as Rec);
    p.banned = [...(pd.banned as number[])];
    p.offers = (pd.offers as Rec[]).map((o) => ({ kind: o.kind as OfferKind, id: o.id as number, toLevel: o.toLevel as number }));
    p.passives = (pd.passives as Rec[]).map((x) => {
      const ps = new PassiveInst();
      ps.def = x.def as number;
      ps.level = x.level as number;
      return ps;
    });
    p.weapons = (pd.weapons as Rec[]).map((wd) => {
      const w = new WeaponInst();
      assign(w, wd, WEAPON_KEYS);
      w.angles.set(wd.angles as number[]);
      return w;
    });
  });
  s.enemyCount = snap.enemies.length;
  snap.enemies.forEach((ed, i) => {
    const e = s.enemies[i];
    assign(e, ed, ENEMY_KEYS);
    e.immune.set(ed.immune as number[]);
  });
  s.projCount = snap.projectiles.length;
  snap.projectiles.forEach((pd, i) => {
    const p = s.projectiles[i];
    assign(p, pd, PROJ_KEYS);
    p.hitIds.set(pd.hitIds as number[]);
  });
  s.gemCount = snap.gems.length;
  snap.gems.forEach((gd, i) => assign(s.gems[i], gd, GEM_KEYS));
  s.pickupCount = snap.pickups.length;
  snap.pickups.forEach((pd, i) => assign(s.pickups[i], pd, PICKUP_KEYS));
  return s;
}
