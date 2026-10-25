/**
 * Render-side visual effects: particles, damage numbers, lightning, rings, screen shake.
 * Fed by sim events. They use the COSMETIC stream: they never touch the sim.
 */
import { ENEMIES } from '../data/enemies';
import { ALL_WEAPONS, type Behavior } from '../data/weapons';
import { PASSIVES } from '../data/passives';
import { LOOT, PICKUPS, type PickupDef, type PickupIdOf, type PickupKind } from '../data/loot';
import { t, tn } from '../i18n';
import { bossName, enemyName, passiveName, pickupName, weaponName } from '../i18n/content';
import {
  Rng,
  STREAM,
  deriveSeed,
  FUSION_TABLE,
  weaponDef,
  EV_BOSS_DEAD,
  EV_BOSS_SPAWN,
  EV_CHEST,
  EV_CHOICE,
  EV_DEATH,
  EV_ENEMY_SHOT,
  EV_EXPLOSION,
  EV_FUSE,
  EV_LAND,
  EV_VICTORY,
  EV_ARENA,
  EV_DASH,
  EV_MAP_ITEM,
  EV_FUSION,
  EV_GEM,
  EV_HEAL,
  EV_HIT,
  EV_HURT,
  EV_KILL,
  EV_LEVELUP,
  EV_LINE,
  EV_ACTIVATE,
  EV_NEW_ENEMY,
  EV_PICKUP,
  EV_RING,
  EV_RING_WAVE,
  EV_SHOOT,
  EV_SWARM,
  EV_WALL_HIT,
  EV_SHOT_DOWN,
  EV_SHATTER,
  EV_REVIVE,
  EV_CLONE_END,
  EV_FLEE,
  EV_WAVE,
  EV_HATCH,
  EV_LASER,
  EV_CAGE,
  OFFER_FUSION,
  OFFER_PASSIVE,
  OFFER_WEAPON,
  EV_PROP,
  EV_BOMB,
  EV_MAGNET,
  PK_CHEST,
  type GameState,
  type SimEvent,
} from '../sim';
import { FX_COLORS, fxColorIndex } from './palette';

export type SfxName =
  | 'shoot'
  | 'laser'
  | 'mine'
  | 'boomerang'
  | 'zap'
  | 'ring'
  | 'hit'
  | 'kill'
  | 'gem'
  | 'hurt'
  | 'levelup'
  | 'explosion'
  | 'boss'
  | 'bossDead'
  | 'chest'
  | 'heal'
  | 'pickup'
  | 'death'
  | 'enemyShot'
  | 'fusion'
  | 'bomb'
  | 'magnet'
  | 'fuse'
  | 'alert'
  | 'shotDown'
  | 'shatter'
  | 'clock'
  | 'clone'
  | 'revive'
  | 'blink'
  | 'wave'
  | 'hatch'
  | 'bossLaser'
  | 'cage'
  | 'dash';

export interface FxHooks {
  sfx(name: SfxName, v?: number): void;
  toast(text: string, color?: string): void;
}

const MAXP = 1800;
const MAXT = 36;
const MAXL = 128;
const MAXR = 48;
const MAXB = 48;

/** Pickup message: bonus = instant effect, usable = stored (Space to use it). Built on the fly, in the current locale. */
const PICKUP_TOAST: Record<PickupKind, (d: PickupDef) => string> = {
  active: (d) => t('toasts.pickupActive', { name: pickupName(d.id) }),
  timed: (d) => t('toasts.pickupTimed', { name: pickupName(d.id), duration: d.duration ?? 0 }),
  instant: (d) => t('toasts.pickupInstant', { name: pickupName(d.id) }),
  relic: (d) => t('toasts.pickupRelic', { name: pickupName(d.id) }),
  chest: () => '',
};
const pickupToast = (k: number) => (PICKUPS[k] ? PICKUP_TOAST[PICKUPS[k].kind](PICKUPS[k]) : '');

/** firing sound of each weapon behavior */
const SHOT_SFX: Record<Behavior, SfxName> = {
  projectile: 'shoot',
  spiral: 'shoot',
  orbit: 'shoot',
  aura: 'shoot',
  rail: 'laser',
  mine: 'mine',
  boomerang: 'boomerang',
  arc: 'zap',
  pulse: 'shoot',
  blade: 'boomerang',
  flame: 'laser',
  swarm: 'shoot',
  shuriken: 'boomerang',
  mortar: 'mine',
};

type ActivateFx = (fx: Effects, e: SimEvent, h: FxHooks) => void;

/** Visuals and sound of each active item when used (typed from the data: a new active item fails to typecheck until it has its entry). */
const ACTIVATE_FX: Record<PickupIdOf<'active'>, ActivateFx> = {
  vacuum: (fx, e, h) => {
    fx.ring(e.x, e.y, 500, 1, 0.7);
    h.sfx('magnet');
  },
  freeze: (fx, e, h) => {
    fx.flash = 0.3;
    fx.flashColor = '#9feaff';
    fx.ring(e.x, e.y, LOOT.freezeRadius, 16, 0.6);
    fx.burst(e.x, e.y, 40, 16, 420, 0.6, 3);
    h.sfx('shatter');
  },
  bomb: (fx, _e, h) => {
    fx.flash = 0.5;
    fx.flashColor = '#ffffff';
    fx.addShake(12);
    h.sfx('bomb');
  },
  clock: (fx, e, h) => {
    fx.flash = 0.3;
    fx.flashColor = '#7f9cff';
    fx.ring(e.x, e.y, 900, 18, 1.0);
    h.sfx('clock');
  },
  clone: (fx, e, h) => {
    fx.ring(e.x, e.y, 120, 17, 0.5);
    fx.burst(e.x, e.y, 30, 17, 220, 0.6, 3);
    h.sfx('clone');
  },
  eradicate: (fx, e, h) => {
    fx.flash = 0.6;
    fx.flashColor = '#ff3df5';
    fx.ring(e.x, e.y, 900, 10, 1.0);
    fx.addShake(14);
    h.sfx('bomb');
  },
};
/** ACTIVATE_FX by pickup code (null for the other pickups). */
const ACTIVATE_FX_BY_CODE: (ActivateFx | null)[] = PICKUPS.map((d) => (d.kind === 'active' ? ACTIVATE_FX[d.id as PickupIdOf<'active'>] : null));

const ENEMY_COL = ENEMIES.map((e) => fxColorIndex(e.color));
const WEAPON_COL = ALL_WEAPONS.map((w) => fxColorIndex(w.color));
const PICKUP_COL = PICKUPS.map((p) => fxColorIndex(p.color));

/** how long a railgun beam stays visible (s), and how long its slug takes to cross the line */
export const BEAM_LIFE = 0.32;
export const BEAM_TRAVEL = 0.07;

export class Effects {
  // Particles (structure of arrays)
  readonly px = new Float32Array(MAXP);
  readonly py = new Float32Array(MAXP);
  readonly pvx = new Float32Array(MAXP);
  readonly pvy = new Float32Array(MAXP);
  readonly plife = new Float32Array(MAXP);
  readonly pmax = new Float32Array(MAXP);
  readonly psize = new Float32Array(MAXP);
  readonly pcol = new Uint8Array(MAXP);
  pCount = 0;
  // Damage numbers
  readonly tx = new Float32Array(MAXT);
  readonly ty = new Float32Array(MAXT);
  readonly tlife = new Float32Array(MAXT);
  readonly tval = new Float32Array(MAXT);
  readonly tbig = new Uint8Array(MAXT);
  /** damage type (DMG_*): the colour of the number */
  readonly ttype = new Uint8Array(MAXT);
  tCount = 0;
  // Lightning
  readonly lx1 = new Float32Array(MAXL);
  readonly ly1 = new Float32Array(MAXL);
  readonly lx2 = new Float32Array(MAXL);
  readonly ly2 = new Float32Array(MAXL);
  readonly llife = new Float32Array(MAXL);
  readonly lcol = new Uint8Array(MAXL);
  readonly lseed = new Uint32Array(MAXL);
  lCount = 0;
  // Visual shockwave rings
  readonly rx = new Float32Array(MAXR);
  readonly ry = new Float32Array(MAXR);
  readonly rr = new Float32Array(MAXR);
  readonly rlife = new Float32Array(MAXR);
  readonly rmax = new Float32Array(MAXR);
  readonly rcol = new Uint8Array(MAXR);
  rCount = 0;
  // Railgun beams (fixed where they were fired)
  readonly bx1 = new Float32Array(MAXB);
  readonly by1 = new Float32Array(MAXB);
  readonly bx2 = new Float32Array(MAXB);
  readonly by2 = new Float32Array(MAXB);
  readonly bw = new Float32Array(MAXB);
  readonly blife = new Float32Array(MAXB);
  /** weapon def index (its own colour, not the particle palette) */
  readonly bdef = new Uint16Array(MAXB);
  bCount = 0;

  shake = 0;
  flash = 0;
  flashColor = '#ffffff';
  hurtFlash = 0;
  damageNumbers = true;
  lowQuality = false;
  shakeEnabled = true;
  private rng = new Rng(1);
  private gemCombo = 0;
  private gemTimer = 0;
  private hitBudget = 0;
  private textBudget = 0;

  constructor(private readonly hooks: FxHooks) {}

  reset(seed: number): void {
    this.rng = new Rng(deriveSeed(seed, STREAM.COSMETIC));
    this.pCount = this.tCount = this.lCount = this.rCount = this.bCount = 0;
    this.shake = this.flash = this.hurtFlash = 0;
  }

  addShake(v: number): void {
    // Gentle and capped: the screen must stay readable even when everything explodes.
    if (this.shakeEnabled) this.shake = Math.min(7, this.shake + v * 0.6);
  }

  burst(x: number, y: number, n: number, col: number, speed: number, life = 0.45, size = 3): void {
    if (this.lowQuality) n = Math.ceil(n / 2);
    const r = this.rng;
    for (let i = 0; i < n && this.pCount < MAXP; i++) {
      const k = this.pCount++;
      const a = r.next() * Math.PI * 2;
      const sp = speed * (0.35 + r.next() * 0.65);
      this.px[k] = x;
      this.py[k] = y;
      this.pvx[k] = Math.cos(a) * sp;
      this.pvy[k] = Math.sin(a) * sp;
      this.plife[k] = this.pmax[k] = life * (0.6 + r.next() * 0.4);
      this.psize[k] = size;
      this.pcol[k] = col;
    }
  }

  ring(x: number, y: number, radius: number, col: number, life = 0.35): void {
    if (this.rCount >= MAXR) return;
    const k = this.rCount++;
    this.rx[k] = x;
    this.ry[k] = y;
    this.rr[k] = radius;
    this.rlife[k] = this.rmax[k] = life;
    this.rcol[k] = col;
  }

  private text(x: number, y: number, v: number, big: boolean, type: number): void {
    if (!this.damageNumbers || this.tCount >= MAXT) return;
    const k = this.tCount++;
    this.tx[k] = x + (this.rng.next() - 0.5) * 14;
    this.ty[k] = y;
    this.tlife[k] = big ? 0.9 : 0.55;
    this.tval[k] = v;
    this.tbig[k] = big ? 1 : 0;
    this.ttype[k] = type;
  }

  private line(x1: number, y1: number, x2: number, y2: number, col: number): void {
    if (this.lCount >= MAXL) return;
    const k = this.lCount++;
    this.lx1[k] = x1;
    this.ly1[k] = y1;
    this.lx2[k] = x2;
    this.ly2[k] = y2;
    this.llife[k] = 0.18;
    this.lcol[k] = col;
    this.lseed[k] = (this.rng.next() * 4294967296) >>> 0;
  }

  /** Turns the events of the last sim step into effects, sounds and messages. */
  consume(s: GameState): void {
    const h = this.hooks;
    this.hitBudget = this.lowQuality ? 6 : 14;
    // Damage numbers: only a few per step, to stay readable.
    this.textBudget = 4;
    for (let i = 0; i < s.eventCount; i++) {
      const e = s.events[i];
      switch (e.type) {
        case EV_HIT:
          // Burn (x2 = 1): no sparks or sound on every tick, just the numbers (coloured by damage type, y2).
          if (e.x2 !== 1 && this.hitBudget-- > 0) {
            this.burst(e.x, e.y + 6, 2, 0, 140, 0.18, 2);
            h.sfx('hit');
          }
          if (e.v >= 1 && (this.textBudget-- > 0 || e.v >= 100)) this.text(e.x, e.y, e.v, e.v >= 100, e.y2);
          break;
        case EV_KILL: {
          const def = ENEMIES[e.k];
          const big = e.v > 16;
          this.burst(e.x, e.y, big ? 18 : 7, ENEMY_COL[e.k], big ? 260 : 170, big ? 0.6 : 0.4, big ? 4 : 3);
          if (big) this.addShake(2);
          if (def.behavior === 'prop') h.sfx('chest');
          else h.sfx('kill', e.v);
          break;
        }
        case EV_GEM:
          this.gemCombo = this.gemTimer > 0 ? this.gemCombo + 1 : 0;
          this.gemTimer = 0.5;
          h.sfx('gem', Math.min(this.gemCombo, 24));
          break;
        case EV_HURT:
          if (e.k === 1) {
            this.burst(e.x, e.y, 4, 14, 90, 0.4, 3);
            h.sfx('hurt', 0.4);
          } else {
            this.addShake(5);
            this.hurtFlash = 0.25;
            this.burst(e.x, e.y, 6, 6, 160, 0.3, 3);
            h.sfx('hurt', 1);
          }
          break;
        case EV_LEVELUP:
          this.ring(e.x, e.y, 120, 8, 0.5);
          this.burst(e.x, e.y, 24, 8, 220, 0.6, 3);
          h.sfx('levelup');
          break;
        case EV_SHOOT: {
          const beh = weaponDef(e.k).behavior;
          h.sfx(SHOT_SFX[beh]);
          if (beh === 'rail' && this.bCount < MAXB) {
            // Railgun: the line from the shot's start (x, y) to its end (x2, y2), v = width.
            const k = this.bCount++;
            this.bx1[k] = e.x;
            this.by1[k] = e.y;
            this.bx2[k] = e.x2;
            this.by2[k] = e.y2;
            this.bw[k] = e.v;
            this.blife[k] = BEAM_LIFE;
            this.bdef[k] = e.k;
          }
          break;
        }
        case EV_EXPLOSION:
          this.ring(e.x, e.y, e.v, e.k === 1 ? 6 : 13, 0.3);
          this.burst(e.x, e.y, 14, e.k === 1 ? 6 : 13, 300, 0.45, 3);
          // Only explosions aimed at the player shake the screen (not the player's mines).
          if (e.k === 1) this.addShake(4);
          h.sfx('explosion', e.v);
          break;
        case EV_LINE:
          this.line(e.x, e.y, e.x2, e.y2, WEAPON_COL[e.k]);
          this.burst(e.x2, e.y2, 3, WEAPON_COL[e.k], 120, 0.2, 2);
          break;
        case EV_RING:
          h.sfx('ring');
          break;
        case EV_BOSS_SPAWN:
          h.toast(t('toasts.boss', { name: bossName(e.v) }), ENEMIES[e.k].color);
          h.sfx('boss');
          this.addShake(6);
          this.flash = 0.25;
          this.flashColor = ENEMIES[e.k].color;
          break;
        case EV_FLEE:
          // Normal enemies make way for the boss: a small puff in their color.
          this.burst(e.x, e.y, 4, ENEMY_COL[e.k], 150, 0.5, 2);
          break;
        case EV_WAVE:
          h.toast(t('toasts.wave', { n: e.v }), '#f2eaff');
          h.sfx('wave');
          break;
        case EV_HATCH:
          this.burst(e.x, e.y, 10, 7, 160, 0.4, 3);
          h.sfx('hatch');
          break;
        case EV_LASER:
          h.sfx('bossLaser');
          break;
        case EV_CAGE:
          this.ring(e.x, e.y, e.v, ENEMY_COL[e.k], 0.5);
          h.sfx('cage');
          break;
        case EV_BOSS_DEAD:
          this.burst(e.x, e.y, 70, 10, 420, 1.0, 5);
          this.ring(e.x, e.y, 260, 10, 0.7);
          this.addShake(14);
          this.flash = 0.35;
          this.flashColor = '#ffffff';
          h.toast(t('toasts.bossDead'), '#ffd23a');
          h.sfx('bossDead');
          break;
        case EV_CHEST:
          h.sfx('chest');
          this.burst(e.x, e.y, 40, 11, 300, 0.8, 4);
          if (e.k !== 1) h.toast(e.v > 0 ? tn('toasts.chest', e.v) : t('toasts.chestHeal'), '#ffd23a');
          break;
        case EV_CHOICE:
          if (e.y2 === 1) h.toast(t('toasts.bonusOffer', { label: offerLabel(e.k, e.v, e.x2) }), '#ffd23a');
          break;
        case EV_FUSION:
          this.flash = 0.5;
          this.flashColor = '#ffffff';
          this.ring(e.x, e.y, 220, 0, 0.8);
          this.burst(e.x, e.y, 60, WEAPON_COL[e.v] ?? 0, 380, 0.9, 4);
          h.toast(t('toasts.fusion', { name: weaponName(weaponDef(e.v).id) }), '#ffffff');
          h.sfx('fusion');
          break;
        case EV_HEAL:
          if (e.v > 0 || e.k === 1) {
            this.burst(e.x, e.y, e.k === 1 ? 2 : 10, 8, 80, 0.6, 3);
            if (e.v > 5) h.sfx('heal');
          }
          break;
        case EV_PICKUP:
          h.sfx('pickup');
          if (e.k !== PK_CHEST) h.toast(pickupToast(e.k), PICKUPS[e.k]?.color ?? '#ffffff');
          break;
        case EV_MAP_ITEM:
          this.ring(e.x, e.y, 70, PICKUP_COL[e.k], 0.6);
          break;
        case EV_NEW_ENEMY:
          h.toast(t('toasts.newEnemy', { name: enemyName(ENEMIES[e.k].id) }), ENEMIES[e.k].color);
          h.sfx('alert');
          break;
        case EV_ACTIVATE:
          h.toast(pickupName(PICKUPS[e.k].id), PICKUPS[e.k].color);
          ACTIVATE_FX_BY_CODE[e.k]?.(this, e, h);
          break;
        case EV_DEATH:
          // The hero bursts into neon shards, two rings, a short flash: clean and readable.
          this.burst(e.x, e.y, 70, 1, 420, 1.4, 4);
          this.burst(e.x, e.y, 40, 0, 260, 1.1, 3);
          this.ring(e.x, e.y, 160, 1, 0.7);
          this.ring(e.x, e.y, 320, 0, 1.1);
          this.flash = 0.35;
          this.flashColor = '#ffffff';
          this.addShake(12);
          h.sfx('death');
          break;
        case EV_ENEMY_SHOT:
          h.sfx('enemyShot', e.v);
          break;
        case EV_SHOT_DOWN:
          this.burst(e.x, e.y, 5, 5, 120, 0.25, 2);
          h.sfx('shotDown');
          break;
        case EV_SHATTER:
          this.burst(e.x, e.y, 9, 16, 240, 0.45, 3);
          this.ring(e.x, e.y, e.v, 16, 0.25);
          h.sfx('shatter');
          break;
        case EV_REVIVE:
          this.flash = 0.55;
          this.flashColor = '#ffb347';
          this.ring(e.x, e.y, e.v, 13, 0.7);
          this.ring(e.x, e.y, e.v * 1.6, 11, 1.0);
          this.burst(e.x, e.y, 60, 13, 380, 1.0, 4);
          this.addShake(10);
          h.toast(t('toasts.revive'), '#ffb347');
          h.sfx('revive');
          break;
        case EV_LAND:
          // a Jumper lands: an impact ring when it attacks (v = radius), a small puff otherwise
          this.burst(e.x, e.y, e.v > 0 ? 14 : 6, ENEMY_COL[e.k], 200, 0.4, 3);
          if (e.v > 0) {
            this.ring(e.x, e.y, e.v, ENEMY_COL[e.k], 0.3);
            this.addShake(2);
            h.sfx('blink');
          }
          break;
        case EV_ARENA:
          // the boss arena closes (v = radius) or opens again (v = 0): drawn by draw-world.ts
          if (e.v > 0) this.addShake(4);
          break;
        case EV_VICTORY:
          this.flash = 0.5;
          this.flashColor = '#ffd23a';
          this.ring(e.x, e.y, 420, 11, 1.2);
          this.burst(e.x, e.y, 90, 11, 460, 1.2, 5);
          h.toast(t('toasts.victory'), '#ffd23a');
          break;
        case EV_DASH:
          // a puff left behind, sparks thrown backwards
          this.burst(e.x, e.y, 10, 1, 160, 0.3, 2);
          this.burst(e.x - e.v * 10, e.y - e.k * 10, 6, 0, 240, 0.25, 2);
          h.sfx('dash');
          break;
        case EV_CLONE_END:
          this.burst(e.x, e.y, 18, 17, 160, 0.5, 3);
          break;
        case EV_WALL_HIT:
          this.burst(e.x, e.y, 2, e.v === 1 ? 6 : 15, 90, 0.15, 2);
          break;
        case EV_SWARM:
          // k > 0: horde (k = type + 1)
          if (e.k > 0) h.toast(t('toasts.horde', { name: enemyName(ENEMIES[e.k - 1].id) }), ENEMIES[e.k - 1].color);
          h.sfx('alert');
          break;
        case EV_RING_WAVE:
          h.toast(t('toasts.ring'), '#ff3366');
          h.sfx('alert');
          break;
        case EV_FUSE:
          h.sfx('fuse');
          break;
        case EV_PROP: // the crate's own sprite is enough
        case EV_BOMB: // not emitted
        case EV_MAGNET: // not emitted
          break;
        default:
          // Exhaustive: an EventType without its case fails to typecheck here.
          e.type satisfies never;
      }
    }
  }

  update(dt: number): void {
    this.gemTimer -= dt;
    this.shake *= Math.exp(-dt * 9);
    if (this.shake < 0.05) this.shake = 0;
    this.flash = Math.max(0, this.flash - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    const damp = Math.exp(-dt * 4);
    for (let i = this.pCount - 1; i >= 0; i--) {
      this.plife[i] -= dt;
      if (this.plife[i] <= 0) {
        const l = --this.pCount;
        this.px[i] = this.px[l];
        this.py[i] = this.py[l];
        this.pvx[i] = this.pvx[l];
        this.pvy[i] = this.pvy[l];
        this.plife[i] = this.plife[l];
        this.pmax[i] = this.pmax[l];
        this.psize[i] = this.psize[l];
        this.pcol[i] = this.pcol[l];
        continue;
      }
      this.px[i] += this.pvx[i] * dt;
      this.py[i] += this.pvy[i] * dt;
      this.pvx[i] *= damp;
      this.pvy[i] *= damp;
    }
    for (let i = this.tCount - 1; i >= 0; i--) {
      this.tlife[i] -= dt;
      this.ty[i] -= dt * 40;
      if (this.tlife[i] <= 0) {
        const l = --this.tCount;
        this.tx[i] = this.tx[l];
        this.ty[i] = this.ty[l];
        this.tlife[i] = this.tlife[l];
        this.tval[i] = this.tval[l];
        this.tbig[i] = this.tbig[l];
        this.ttype[i] = this.ttype[l];
      }
    }
    for (let i = this.lCount - 1; i >= 0; i--) {
      this.llife[i] -= dt;
      if (this.llife[i] <= 0) {
        const l = --this.lCount;
        this.lx1[i] = this.lx1[l];
        this.ly1[i] = this.ly1[l];
        this.lx2[i] = this.lx2[l];
        this.ly2[i] = this.ly2[l];
        this.llife[i] = this.llife[l];
        this.lcol[i] = this.lcol[l];
        this.lseed[i] = this.lseed[l];
      }
    }
    for (let i = this.bCount - 1; i >= 0; i--) {
      this.blife[i] -= dt;
      if (this.blife[i] <= 0) {
        const l = --this.bCount;
        this.bx1[i] = this.bx1[l];
        this.by1[i] = this.by1[l];
        this.bx2[i] = this.bx2[l];
        this.by2[i] = this.by2[l];
        this.bw[i] = this.bw[l];
        this.blife[i] = this.blife[l];
        this.bdef[i] = this.bdef[l];
      }
    }
    for (let i = this.rCount - 1; i >= 0; i--) {
      this.rlife[i] -= dt;
      if (this.rlife[i] <= 0) {
        const l = --this.rCount;
        this.rx[i] = this.rx[l];
        this.ry[i] = this.ry[l];
        this.rr[i] = this.rr[l];
        this.rlife[i] = this.rlife[l];
        this.rmax[i] = this.rmax[l];
        this.rcol[i] = this.rcol[l];
      }
    }
  }

  /** Camera offset from screen shake (cosmetic randomness). */
  shakeOffset(): { x: number; y: number } {
    if (this.shake <= 0) return { x: 0, y: 0 };
    return { x: (this.rng.next() - 0.5) * 2 * this.shake, y: (this.rng.next() - 0.5) * 2 * this.shake };
  }
}

export function offerLabel(kind: number, id: number, toLevel: number): string {
  if (kind === OFFER_WEAPON) return t('toasts.offerLevel', { name: weaponName(ALL_WEAPONS[id].id), n: toLevel });
  if (kind === OFFER_PASSIVE) return t('toasts.offerLevel', { name: passiveName(PASSIVES[id].id), n: toLevel });
  if (kind === OFFER_FUSION) return t('toasts.offerEvolution', { name: weaponName(ALL_WEAPONS[FUSION_TABLE[id].result].id) });
  return pickupName(PICKUPS[0].id);
}

export { FX_COLORS };
