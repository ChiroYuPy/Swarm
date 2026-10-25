/**
 * HUD drawn in the canvas, same font and sizes as the DOM UI.
 * Top left: the score and the mode (difficulty, sandbox). Top center: the strip of upcoming waves (one
 * line: waves, pauses, boss portraits) or the current boss's health, then the timer.
 * Bottom center: a single bar with HP, XP + level, weapons, active item (Space) and passives;
 * active timed bonuses right above it. Detailed stats are on the pause screen.
 */
import { ENEMIES } from '../data/enemies';
import { HERO } from '../data/hero';
import { PASSIVES } from '../data/passives';
import { LOOT, PICKUPS, type PickupIdOf } from '../data/loot';
import { WAVES } from '../data/waves';
import type { DifficultyDef } from '../data/difficulty';
import {
  MAX_PASSIVE_SLOTS,
  MAX_WEAPON_SLOTS,
  PK_CLOCK,
  PK_CLONE,
  PK_FEVER,
  PK_FRENZY,
  PK_RAGE,
  PK_TOTEM,
  PK_TURBO,
  TICK_RATE,
  BOSS_TYPES,
  MIX_TICKS,
  WAVE_TICKS,
  mixAt,
  spawnRate,
  waveInfo,
  computeScore,
  findBoss,
  weaponDef,
  weaponMaxLevel,
  type Enemy,
  type GameState,
  type Player,
  type PlayerStats,
  type SandboxRules,
} from '../sim';
import { t } from '../i18n';
import { difficultyName, passiveName, pickupName } from '../i18n/content';
import { COLORS } from './palette';
import { iconCanvas } from './icons';
import { enemyPreview } from './sprites';

export const FONT = '"Chakra Petch", "Trebuchet MS", sans-serif';
/** Shared size scale (same as the CSS) */
const LABEL = `600 12px ${FONT}`;
const TEXT = `600 13px ${FONT}`;

export interface HudOptions {
  showFps: boolean;
  fps: number;
  /** fraction of the native resolution (dynamic resolution) */
  resolution?: number;
  replay: { speed: number; progress: number } | null;
  /** best score recorded in this difficulty (0 if none) */
  best: number;
  /** sandbox run: no record, possibly no bosses */
  sandbox: SandboxRules | null;
  difficulty: DifficultyDef;
  /** real time (animations) */
  time: number;
}

// Icons converted to ImageBitmap: drawing a source canvas every frame forces a costly GPU copy.
const iconCache = new Map<string, CanvasImageSource>();
function icon(kind: 'weapon' | 'passive' | 'pickup', id: string): CanvasImageSource {
  const key = `${kind}:${id}`;
  let c = iconCache.get(key);
  if (!c) {
    const cv = iconCanvas(kind, id, 48);
    c = cv;
    iconCache.set(key, cv);
    if (typeof createImageBitmap === 'function') {
      createImageBitmap(cv).then(
        (bmp) => iconCache.set(key, bmp),
        () => {},
      );
    }
  }
  return c;
}

const foeCache = new Map<number, CanvasImageSource>();
function foeIcon(type: number): CanvasImageSource {
  let c = foeCache.get(type);
  if (!c) {
    const cv = enemyPreview(ENEMIES[type].id, 40);
    c = cv;
    foeCache.set(type, cv);
    if (typeof createImageBitmap === 'function') {
      createImageBitmap(cv).then(
        (bmp) => foeCache.set(type, bmp),
        () => {},
      );
    }
  }
  return c;
}

/** Duration (wave clock seconds) covered by the strip, and the room a boss takes in it. */
const STRIP_SECONDS = 190;
const BOSS_BLOCK = 30;
/** Top band (wave strip or boss health): its height, and the line in the middle. */
const BAND_Y = 6;
const BAND_H = 42;
const LINE_Y = BAND_Y + 30;
/** position of "now" on the line (to its left: what just passed, fading) */
const NOW_X = 28;
/** width of the left and right fades */
const FADE_L = 26;
const FADE_R = 60;

/** A wave's color by difficulty (spawn rate): from green to magenta. */
const WAVE_TIERS: [number, string][] = [
  [0, '#39ff7a'],
  [3, '#b8ff3d'],
  [4.5, '#ffe14d'],
  [6.5, '#ff8a1f'],
  [9, '#ff3366'],
  [12, '#ff3df5'],
];

function waveColor(s: GameState, slot: number): string {
  const tick = slot * MIX_TICKS + WAVE_TICKS / 2;
  const danger = spawnRate(tick, s.difficulty).rate;
  let col = WAVE_TIERS[0][1];
  for (const [at, c] of WAVE_TIERS) if (danger >= at) col = c;
  return col;
}

function bandWidth(W: number): number {
  return Math.min(520, W * 0.46);
}

/** The (at most) 3 main enemies of a wave, from most to least frequent. */
function mainFoes(types: number[], weights?: Float64Array): number[] {
  const out = [...types];
  if (weights) out.sort((a, b) => weights[b] - weights[a]);
  return out.slice(0, 3);
}

/** Strip layer: drawn separately so its edges fade out (no background or frame). */
let layer: HTMLCanvasElement | null = null;

/**
 * Wave strip: a line scrolling to the left. Each wave is a segment in its difficulty color,
 * with its main enemies above it; each boss is its portrait sitting on the line.
 */
function drawWaveStrip(ctx: Ctx, s: GameState, W: number, opt: HudOptions, blink: boolean): void {
  const bw = bandWidth(W);
  const x0 = W / 2 - bw / 2;
  const dpr = ctx.getTransform().a || 1;
  if (!layer) layer = document.createElement('canvas');
  const cw = Math.ceil(bw * dpr);
  const ch = Math.ceil(BAND_H * dpr);
  if (layer.width !== cw || layer.height !== ch) {
    layer.width = cw;
    layer.height = ch;
  }
  const g = layer.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, bw, BAND_H);
  g.lineCap = 'round';

  const now = s.clock / TICK_RATE;
  const slotSec = MIX_TICKS / TICK_RATE;
  const waveSec = WAVE_TICKS / TICK_RATE;
  const bossOn = !opt.sandbox || opt.sandbox.bosses;
  const pool = s.sandbox?.enemies ?? null;
  const scale = (bw - NOW_X) / STRIP_SECONDS;
  const X = (t: number) => NOW_X + t * scale;
  const ly = LINE_Y - BAND_Y;
  const w = waveInfo(s.clock);
  const toBoss = (w.toBoss + Math.max(0, s.calmUntil - s.tick)) / TICK_RATE;

  // The thin background line.
  g.beginPath();
  g.moveTo(0, ly);
  g.lineTo(bw, ly);
  g.strokeStyle = 'rgba(154, 143, 192, 0.35)';
  g.lineWidth = 1;
  g.stroke();

  const first = Math.max(0, Math.floor(Math.max(0, s.clock - 1) / MIX_TICKS) - 1);
  // index of the next boss (the following ones come in order); each boss shifts what follows
  let k = s.bossSpawned;
  let shift = 0;
  for (let j = first; j < first + 7; j++) {
    const ws = j * slotSec - now + shift;
    const a = X(ws);
    if (a > bw) break;
    const b = X(ws + waveSec);
    if (b > 0) {
      const mix = pool ? null : mixAt(s.seed, j);
      const col = waveColor(s, j);
      const current = j === w.slot && w.inWave;
      g.beginPath();
      g.moveTo(a + 2, ly);
      g.lineTo(b - 2, ly);
      g.strokeStyle = col;
      g.globalAlpha = current ? 1 : 0.7;
      g.lineWidth = current ? 4 : 3;
      g.stroke();
      g.globalAlpha = 1;
      // Its main enemies above the segment, centered on the part still to come.
      const foes = mainFoes(pool ?? mix!.types, mix?.weights);
      const step = 19;
      const span = (foes.length - 1) * step;
      const cx = Math.min(b - span / 2 - 8, Math.max((a + b) / 2, NOW_X + span / 2 + 6));
      foes.forEach((t, i) => g.drawImage(foeIcon(t), cx - span / 2 + i * step - 14, ly - 31, 28, 28));
    }
    // Boss: at the end of the pause after the cycle's last wave, its portrait on the line.
    if (bossOn && (j + 1) % WAVES.wavesPerBoss === 0 && j + 1 > s.bossSpawned * WAVES.wavesPerBoss) {
      const type = BOSS_TYPES[k % BOSS_TYPES.length];
      const col = ENEMIES[type].color;
      const bx = X((j + 1) * slotSec - now + shift + BOSS_BLOCK / 2);
      const soon = k === s.bossSpawned && toBoss <= 10;
      g.beginPath();
      g.arc(bx, ly, 15, 0, Math.PI * 2);
      g.fillStyle = col;
      g.globalAlpha = soon && blink ? 0.45 : 0.18;
      g.fill();
      g.globalAlpha = 1;
      g.drawImage(foeIcon(type), bx - 26, ly - 26, 52, 52);
      k++;
      shift += BOSS_BLOCK;
    }
  }
  // "Now": a white dot.
  g.beginPath();
  g.arc(NOW_X, ly, 3, 0, Math.PI * 2);
  g.fillStyle = '#ffffff';
  g.fill();

  // Fades: the strip fades out at the edges (the layer is erased, the game stays visible behind).
  g.globalCompositeOperation = 'destination-out';
  const gl = g.createLinearGradient(0, 0, FADE_L, 0);
  gl.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gl.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = gl;
  g.fillRect(0, 0, FADE_L, BAND_H);
  const gr = g.createLinearGradient(bw - FADE_R, 0, bw, 0);
  gr.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gr.addColorStop(1, 'rgba(0, 0, 0, 1)');
  g.fillStyle = gr;
  g.fillRect(bw - FADE_R, 0, FADE_R, BAND_H);
  g.globalCompositeOperation = 'source-over';
  ctx.drawImage(layer, x0, BAND_Y, bw, BAND_H);
}

/** During a boss: its portrait and health, on the same line as the strip. */
function drawBossBand(ctx: Ctx, boss: Enemy, W: number): void {
  const bw = bandWidth(W);
  const x0 = W / 2 - bw / 2;
  const col = ENEMIES[boss.type].color;
  ctx.drawImage(foeIcon(boss.type), x0 + NOW_X - 23, LINE_Y - 27, 46, 46);
  const bx = x0 + NOW_X + 22;
  const len = bw - NOW_X - 22 - 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bx, LINE_Y - 4);
  ctx.lineTo(bx + len, LINE_Y - 4);
  ctx.strokeStyle = 'rgba(154, 143, 192, 0.3)';
  ctx.lineWidth = 6;
  ctx.stroke();
  const f = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
  if (f > 0) {
    ctx.beginPath();
    ctx.moveTo(bx, LINE_Y - 4);
    ctx.lineTo(bx + len * f, LINE_Y - 4);
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.lineCap = 'butt';
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function pad7(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(7, '0');
}

type Ctx = CanvasRenderingContext2D;

/** Text with a light colored halo (wide translucent stroke), for important numbers only. */
export function glowText(ctx: Ctx, text: string, x: number, y: number, color: string, fill = '#ffffff'): void {
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.globalAlpha = 1;
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function panel(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fillStyle = 'rgba(7,6,15,0.66)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,130,255,0.22)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function label(ctx: Ctx, text: string, x: number, y: number, align: CanvasTextAlign = 'left', color: string = COLORS.muted): void {
  ctx.font = LABEL;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(text.toUpperCase(), x, y);
}

function bar(ctx: Ctx, x: number, y: number, w: number, h: number, f: number, color: string, text: string): void {
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, f)), h);
  if (text) {
    ctx.font = TEXT;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(7,6,15,0.85)';
    ctx.strokeText(text, x + w / 2, y + h / 2 + 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
  }
}

function slot(ctx: Ctx, x: number, y: number, size: number, color: string | null): void {
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, size - 1, size - 1, 5);
  ctx.fillStyle = 'rgba(7,6,15,0.66)';
  ctx.fill();
  ctx.strokeStyle = color ?? 'rgba(150,130,255,0.22)';
  ctx.globalAlpha = color ? 0.75 : 1;
  ctx.lineWidth = 1;
  if (!color) ctx.setLineDash([3, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function pips(ctx: Ctx, x: number, y: number, w: number, level: number, max: number, color: string): void {
  const pw = (w - (max - 1) * 2) / max;
  for (let k = 0; k < max; k++) {
    ctx.fillStyle = k < level ? (level >= max ? COLORS.gold : color) : 'rgba(255,255,255,0.15)';
    ctx.fillRect(x + k * (pw + 2), y, pw, 4);
  }
}

/** Number without useless zeros, with the locale's decimal separator (fr: 0,35 / 1,5 / 2). */
export function dec(v: number, digits = 2): string {
  return String(Number(v.toFixed(digits))).replace('.', t('format.decimal'));
}

/** "45 %" (fr) / "45%" (en). */
export const percent = (n: number | string) => t('format.percent', { n });
/** "8 s" (fr) / "8s" (en). */
export const seconds = (n: number | string) => t('format.seconds', { n });

const rate = (v: number) => percent(Math.round(v * 100));
const hpPerSec = (n: string) => t('stats.hpPerSec', { n });

type StatKey = 'might' | 'cooldown' | 'area' | 'speed' | 'magnet' | 'armor' | 'luck' | 'regen' | 'maxHp';

/** Hero stats, in display order (label and hint: stats.<key> in the locales). */
const STATS: { key: StatKey; value: (st: PlayerStats) => string; on: (st: PlayerStats) => boolean }[] = [
  { key: 'might', value: (st) => rate(st.might), on: (st) => st.might !== 1 },
  { key: 'cooldown', value: (st) => rate(st.cooldownMul), on: (st) => st.cooldownMul !== 1 },
  { key: 'area', value: (st) => rate(st.area), on: (st) => st.area !== 1 },
  { key: 'speed', value: (st) => String(Math.round(st.speed)), on: (st) => st.speed !== HERO.speed },
  { key: 'magnet', value: (st) => String(Math.round(st.magnet)), on: (st) => st.magnet !== HERO.magnet },
  { key: 'armor', value: (st) => rate(st.armor), on: (st) => st.armor > 0 },
  { key: 'luck', value: (st) => rate(st.luck), on: (st) => st.luck !== 1 },
  { key: 'regen', value: (st) => hpPerSec(dec(st.regen)), on: (st) => st.regen > HERO.regen + 1e-6 },
  { key: 'maxHp', value: (st) => String(Math.round(st.maxHp)), on: (st) => st.maxHp > HERO.maxHp },
];

export interface StatDetail {
  label: string;
  value: string;
  on: boolean;
  hint: string;
  /** where the value comes from: base, passives, timed bonuses, caps */
  sources: string[];
}

/** Detailed stats for the pause screen: real value and where each bonus comes from. */
export function statDetails(p: Player, tick: number): StatDetail[] {
  const secs = (until: number) => seconds(Math.ceil((until - tick) / TICK_RATE));
  const buff = (pickup: number, n: string | number, until: number) => t('stats.buff', { name: pickupName(PICKUPS[pickup].id), n, left: secs(until) });
  return STATS.map((d) => {
    const sources: string[] = [];
    if (d.key === 'speed') sources.push(t('stats.base', { n: HERO.speed }));
    if (d.key === 'magnet') sources.push(t('stats.base', { n: HERO.magnet }));
    if (d.key === 'regen') sources.push(t('stats.base', { n: hpPerSec(dec(HERO.regen)) }));
    if (d.key === 'maxHp') sources.push(t('stats.base', { n: HERO.maxHp }));
    for (const inst of p.passives) {
      const def = PASSIVES[inst.def];
      const v = def.perLevel[d.key];
      if (!v) continue;
      const total = v * inst.level;
      const amount =
        d.key === 'maxHp'
          ? `+${total}`
          : d.key === 'regen'
            ? `+${hpPerSec(dec(total))}`
            : d.key === 'cooldown'
              ? `−${percent(Math.round(total * 100))}`
              : `+${percent(Math.round(total * 100))}`;
      sources.push(t('stats.passive', { name: passiveName(def.id), level: inst.level, amount }));
    }
    if (d.key === 'might' && p.mightMul !== 1) sources.push(t('stats.sandbox', { n: dec(p.mightMul) }));
    if (d.key === 'might' && p.rageUntil > tick) sources.push(buff(PK_RAGE, 2, p.rageUntil));
    if (d.key === 'cooldown' && p.frenzyUntil > tick) sources.push(buff(PK_FRENZY, dec(0.5), p.frenzyUntil));
    if (d.key === 'speed' && p.turboUntil > tick) sources.push(buff(PK_TURBO, dec(1.5), p.turboUntil));
    if (d.key === 'magnet' && p.feverUntil > tick) sources.push(buff(PK_FEVER, LOOT.feverMagnet, p.feverUntil));
    if (d.key === 'cooldown' && p.base.cooldownMul <= 0.35) sources.push(t('stats.capCooldown'));
    if (d.key === 'armor' && p.base.armor >= 0.6) sources.push(t('stats.capArmor'));
    if (!sources.length) sources.push(t('stats.none'));
    return { label: t(`stats.${d.key}.label`), value: d.value(p.stats), on: d.on(p.stats), hint: t(`stats.${d.key}.hint`), sources };
  });
}

type BuffField = Extract<keyof Player, `${string}Until`>;
/** End-time field of each timed bonus (typed from the data: a new timed pickup fails to typecheck until it has its entry). */
const BUFF_FIELDS: Record<PickupIdOf<'timed'>, BuffField> = {
  rage: 'rageUntil',
  frenzy: 'frenzyUntil',
  turbo: 'turboUntil',
  shield: 'shieldUntil',
  fever: 'feverUntil',
};
/** Timed bonuses shown above the bar, in PICKUPS order. */
const BUFFS: { kind: number; field: BuffField }[] = PICKUPS.flatMap((d, kind) =>
  d.kind === 'timed' ? [{ kind, field: BUFF_FIELDS[d.id as PickupIdOf<'timed'>] }] : [],
);

/** Ongoing effects shown above the bar: player buffs, Clock, clone, stored Totem. */
function activeEffects(s: GameState, p: Player): { kind: number; left: number; total: number }[] {
  const out = BUFFS.filter((b) => p[b.field] > s.tick).map((b) => ({
    kind: b.kind,
    left: p[b.field] - s.tick,
    total: (PICKUPS[b.kind].duration ?? 5) * TICK_RATE,
  }));
  if (s.clockUntil > s.tick) out.push({ kind: PK_CLOCK, left: s.clockUntil - s.tick, total: LOOT.clockSeconds * TICK_RATE });
  const clone = s.players.find((c) => c.alive && c.master === p.index);
  if (clone) out.push({ kind: PK_CLONE, left: clone.expires - s.tick, total: LOOT.cloneSeconds * TICK_RATE });
  if (p.totem > 0) out.push({ kind: PK_TOTEM, left: -1, total: 1 });
  return out;
}

export function drawHud(ctx: Ctx, s: GameState, W: number, H: number, opt: HudOptions): void {
  const p = s.players[0];
  const score = computeScore(s);
  const blink = Math.floor(opt.time * 3) % 2 === 0;
  ctx.textBaseline = 'middle';

  // ---------- Top center: band (wave strip or boss), timer below ----------
  const boss = findBoss(s);
  if (boss) drawBossBand(ctx, boss, W);
  else drawWaveStrip(ctx, s, W, opt, blink);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 28px ${FONT}`;
  glowText(ctx, formatTime(score.survivedSec), W / 2, BAND_Y + BAND_H + 24, COLORS.player);

  // ---------- Top left: the score, and the mode ----------
  const lx = 18;
  ctx.font = `700 34px ${FONT}`;
  ctx.textAlign = 'left';
  glowText(ctx, pad7(score.score), lx, 30, '#ffe14d');
  ctx.font = `700 14px ${FONT}`;
  ctx.fillStyle = opt.difficulty.color;
  const mode = difficultyName(opt.difficulty.id);
  ctx.fillText(mode, lx + 1, 60);
  if (opt.sandbox) {
    ctx.fillStyle = COLORS.sandbox;
    ctx.fillText(t(opt.sandbox.invincible ? 'hud.sandboxInvincible' : 'hud.sandbox'), lx + ctx.measureText(mode).width + 8, 60);
  }

  // ---------- Bottom center: main bar (HP, XP, weapons, item, passives) ----------
  const ws = 46; // weapon slot
  const ps = 40; // passive slot
  const as = 52; // active item
  const gap = 6;
  const sep = 24;
  const weaponsW = MAX_WEAPON_SLOTS * ws + (MAX_WEAPON_SLOTS - 1) * gap;
  const passivesW = MAX_PASSIVE_SLOTS * ps + (MAX_PASSIVE_SLOTS - 1) * gap;
  const rowW = weaponsW + sep + as + sep + passivesW;
  const PW = rowW + 32;
  const PH = 146;
  const x0 = Math.round(W / 2 - PW / 2);
  const top = H - PH - 12;
  panel(ctx, x0, top, PW, PH);

  // HP: the most visible bar on screen.
  const hpF = p.hp / p.stats.maxHp;
  const low = hpF < 0.3;
  const barX = x0 + 50;
  const barW = PW - 50 - 16;
  label(ctx, t('hud.hp'), x0 + 16, top + 22, 'left', COLORS.hp);
  bar(ctx, barX, top + 12, barW, 20, hpF, low && blink ? '#ffffff' : COLORS.hp, `${Math.ceil(p.hp)} / ${Math.round(p.stats.maxHp)}`);
  // XP + level
  label(ctx, t('common.lvlCap', { n: p.level }), x0 + 16, top + 46, 'left', COLORS.xp);
  bar(ctx, barX + 8, top + 40, barW - 8, 12, p.xp / p.xpNext, COLORS.xp, '');

  const ry = top + 76;
  let x = x0 + 16;
  // Weapons
  label(ctx, t('hud.weapons', { n: p.weapons.length, max: MAX_WEAPON_SLOTS }), x, ry - 10);
  for (let i = 0; i < MAX_WEAPON_SLOTS; i++) {
    const sx = x + i * (ws + gap);
    const w = p.weapons[i];
    const def = w ? weaponDef(w.def) : null;
    slot(ctx, sx, ry, ws, def ? def.color : null);
    if (!w || !def) continue;
    ctx.drawImage(icon('weapon', def.id), sx + 3, ry + 3, ws - 6, ws - 6);
    if (def.fusion) {
      ctx.fillStyle = COLORS.gold;
      ctx.fillRect(sx, ry + ws + 4, ws, 4);
    } else pips(ctx, sx, ry + ws + 4, ws, w.level, weaponMaxLevel(w.def), def.color);
  }
  x += weaponsW + sep;
  // Activable item (Space), in the center
  const act = p.activeItem;
  const ay = ry - 3;
  slot(ctx, x, ay, as, act >= 0 ? PICKUPS[act].color : null);
  if (act >= 0) ctx.drawImage(icon('pickup', PICKUPS[act].id), x + 4, ay + 4, as - 8, as - 8);
  label(ctx, act >= 0 ? pickupName(PICKUPS[act].id) : t('hud.item'), x + as / 2, ry - 10, 'center', act >= 0 ? PICKUPS[act].color : COLORS.muted);
  label(ctx, t('keys.space'), x + as / 2, ay + as + 8, 'center', act >= 0 ? '#ffffff' : COLORS.muted);
  x += as + sep;
  // Passives
  const py = ry + (ws - ps);
  label(ctx, t('hud.passives', { n: p.passives.length, max: MAX_PASSIVE_SLOTS }), x, ry - 10);
  for (let i = 0; i < MAX_PASSIVE_SLOTS; i++) {
    const sx = x + i * (ps + gap);
    const it = p.passives[i];
    const def = it ? PASSIVES[it.def] : null;
    slot(ctx, sx, py, ps, def ? def.color : null);
    if (!it || !def) continue;
    ctx.drawImage(icon('passive', def.id), sx + 3, py + 3, ps - 6, ps - 6);
    pips(ctx, sx, py + ps + 4, ps, it.level, 5, def.color);
  }

  // ---------- Active timed bonuses: right above the bar ----------
  const active = activeEffects(s, p);
  const bs = 40;
  let bx = W / 2 - (active.length * (bs + 8) - 8) / 2;
  const by = top - bs - 14;
  for (const b of active) {
    const def = PICKUPS[b.kind];
    slot(ctx, bx, by, bs, def.color);
    ctx.drawImage(icon('pickup', def.id), bx + 3, by + 3, bs - 6, bs - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(bx, by + bs + 4, bs, 4);
    ctx.fillStyle = def.color;
    ctx.fillRect(bx, by + bs + 4, b.left < 0 ? bs : bs * Math.min(1, b.left / b.total), 4);
    ctx.font = TEXT;
    ctx.textAlign = 'center';
    ctx.fillStyle = b.left < 0 ? def.color : '#ffffff';
    ctx.fillText(b.left < 0 ? t('hud.ready') : seconds(Math.ceil(b.left / TICK_RATE)), bx + bs / 2, by - 10);
    bx += bs + 8;
  }

  // Replay
  if (opt.replay) {
    label(ctx, t('hud.replay', { speed: opt.replay.speed }), W / 2, top - 92, 'center', '#ffe14d');
    bar(ctx, W / 2 - 200, top - 80, 400, 4, opt.replay.progress, '#ffe14d', '');
  }

  if (opt.showFps) {
    ctx.textAlign = 'right';
    ctx.font = '12px monospace';
    ctx.fillStyle = opt.fps >= 55 ? '#39ff7a' : opt.fps >= 40 ? '#ffe14d' : '#ff3d6e';
    const fps = { fps: opt.fps.toFixed(0), res: Math.round((opt.resolution ?? 1) * 100), enemies: s.enemyCount, proj: s.projCount, gems: s.gemCount };
    ctx.fillText(t('hud.fps', fps), W - 16, H - 12);
  }
}
