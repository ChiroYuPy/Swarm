/**
 * HUD dessiné dans le canvas, même police et mêmes tailles que l'interface DOM.
 * Haut gauche : le score et le mode (difficulté, sandbox). Haut centre : la frise des vagues à venir (une
 * ligne : vagues, pauses, portraits des boss) ou la vie du boss en cours, puis le chrono.
 * Bas centre : une seule barre avec PV, XP + niveau, armes, objet activable (Espace) et passifs ;
 * les bonus temporaires actifs juste au-dessus. Les stats détaillées sont dans l'écran de pause.
 */
import { ENEMIES } from '../data/enemies';
import { HERO } from '../data/hero';
import { PASSIVES } from '../data/passives';
import { LOOT, PICKUPS } from '../data/loot';
import { WAVES } from '../data/waves';
import { DIFFICULTIES, type DifficultyDef } from '../data/difficulty';
import {
  MAX_PASSIVE_SLOTS,
  MAX_WEAPON_SLOTS,
  PK_CLOCK,
  PK_CLONE,
  PK_FEVER,
  PK_FRENZY,
  PK_RAGE,
  PK_SHIELD,
  PK_TOTEM,
  PK_TURBO,
  TICK_RATE,
  BOSS_TYPES,
  MIXES,
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
import { COLORS } from './palette';
import { iconCanvas } from './icons';
import { enemyPreview } from './sprites';

export const FONT = '"Chakra Petch", "Trebuchet MS", sans-serif';
/** Échelle de tailles commune (identique au CSS) */
const LABEL = `600 12px ${FONT}`;
const TEXT = `600 13px ${FONT}`;

export interface HudOptions {
  showFps: boolean;
  fps: number;
  /** part de la résolution native (résolution dynamique) */
  resolution?: number;
  replay: { speed: number; progress: number } | null;
  /** meilleur score enregistré dans cette difficulté (0 si aucun) */
  best: number;
  /** partie de bac à sable : pas de record, éventuellement pas de boss */
  sandbox: SandboxRules | null;
  difficulty: DifficultyDef;
  /** temps réel (animations) */
  time: number;
}

// Icônes converties en ImageBitmap : dessiner un canvas source à chaque image force une copie GPU coûteuse.
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

/** Durée (s d'horloge des vagues) couverte par la frise, et place qu'y prend un boss. */
const STRIP_SECONDS = 190;
const BOSS_BLOCK = 30;
/** Bandeau du haut (frise des vagues ou vie du boss) : sa hauteur, et la ligne au milieu. */
const BAND_Y = 6;
const BAND_H = 42;
const LINE_Y = BAND_Y + 30;
/** position de « maintenant » sur la ligne (à gauche : ce qui vient de passer, en fondu) */
const NOW_X = 28;
/** largeur des fondus gauche et droit */
const FADE_L = 26;
const FADE_R = 60;

/** Couleur d'une vague selon sa difficulté (débit × solidité des ennemis) : du vert au magenta. */
const WAVE_TIERS: [number, string][] = [
  [0, '#39ff7a'],
  [3, '#b8ff3d'],
  [8, '#ffe14d'],
  [18, '#ff8a1f'],
  [40, '#ff3366'],
  [90, '#ff3df5'],
];

function waveColor(s: GameState, slot: number): string {
  const tick = slot * MIX_TICKS + WAVE_TICKS / 2;
  const m = tick / TICK_RATE / 60;
  const danger =
    spawnRate(tick, s.difficulty).rate * (1 + m * WAVES.hpScalePerMinute + m * m * WAVES.hpScalePerMinute2) * DIFFICULTIES[s.difficulty].hp;
  let col = WAVE_TIERS[0][1];
  for (const [at, c] of WAVE_TIERS) if (danger >= at) col = c;
  return col;
}

function bandWidth(W: number): number {
  return Math.min(520, W * 0.46);
}

/** Les (au plus) 3 ennemis principaux d'une vague, du plus fréquent au moins fréquent. */
function mainFoes(types: number[], weights?: Float64Array): number[] {
  const out = [...types];
  if (weights) out.sort((a, b) => weights[b] - weights[a]);
  return out.slice(0, 3);
}

/** Calque de la frise : dessinée à part pour que ses bords s'effacent en fondu (sans fond ni cadre). */
let layer: HTMLCanvasElement | null = null;

/**
 * Frise des vagues : une ligne qui défile vers la gauche. Chaque vague y est un trait à la couleur de
 * sa difficulté, avec ses ennemis principaux au-dessus ; chaque boss, son portrait posé sur la ligne.
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

  // La ligne de fond, fine.
  g.beginPath();
  g.moveTo(0, ly);
  g.lineTo(bw, ly);
  g.strokeStyle = 'rgba(154, 143, 192, 0.35)';
  g.lineWidth = 1;
  g.stroke();

  const first = Math.max(0, Math.floor(Math.max(0, s.clock - 1) / MIX_TICKS) - 1);
  // rang du prochain boss (les suivants viennent dans l'ordre) ; chaque boss décale la suite
  let k = s.bossSpawned;
  let shift = 0;
  for (let j = first; j < first + 7; j++) {
    const ws = j * slotSec - now + shift;
    const a = X(ws);
    if (a > bw) break;
    const b = X(ws + waveSec);
    if (b > 0) {
      const mix = pool ? null : MIXES[mixAt(s.seed, s.difficulty, j)];
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
      // Ses ennemis principaux au-dessus du trait, centrés sur la partie encore à venir.
      const foes = mainFoes(pool ?? mix!.types, mix?.weights);
      const step = 19;
      const span = (foes.length - 1) * step;
      const cx = Math.min(b - span / 2 - 8, Math.max((a + b) / 2, NOW_X + span / 2 + 6));
      foes.forEach((t, i) => g.drawImage(foeIcon(t), cx - span / 2 + i * step - 14, ly - 31, 28, 28));
    }
    // Boss : à la fin de la pause de la dernière vague du cycle, son portrait sur la ligne.
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
  // « Maintenant » : un point blanc.
  g.beginPath();
  g.arc(NOW_X, ly, 3, 0, Math.PI * 2);
  g.fillStyle = '#ffffff';
  g.fill();

  // Fondus : la frise s'efface sur les bords (on gomme le calque, le jeu reste visible derrière).
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

/** Pendant un boss : son portrait et sa vie, sur la même ligne que la frise. */
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

/** Texte avec un léger halo de couleur (trait large translucide), réservé aux chiffres importants. */
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

/** Nombre à la française, sans zéros inutiles (0,35 / 1,5 / 2). */
export function dec(v: number, digits = 2): string {
  return String(Number(v.toFixed(digits))).replace('.', ',');
}

const rate = (v: number) => `${Math.round(v * 100)} %`;

type StatKey = 'might' | 'cooldown' | 'area' | 'speed' | 'magnet' | 'armor' | 'luck' | 'regen' | 'maxHp';

/** Les stats du héros, dans l'ordre d'affichage. */
const STATS: { key: StatKey; label: string; hint: string; value: (st: PlayerStats) => string; on: (st: PlayerStats) => boolean }[] = [
  { key: 'might', label: 'Dégâts', hint: 'Multiplie les dégâts de toutes tes armes.', value: (st) => rate(st.might), on: (st) => st.might !== 1 },
  { key: 'cooldown', label: 'Recharge', hint: 'Temps de recharge des armes (plus bas = tirs plus fréquents).', value: (st) => rate(st.cooldownMul), on: (st) => st.cooldownMul !== 1 },
  { key: 'area', label: 'Zone', hint: 'Taille des projectiles, rayons et explosions.', value: (st) => rate(st.area), on: (st) => st.area !== 1 },
  { key: 'speed', label: 'Vitesse', hint: 'Vitesse de déplacement (unités/s).', value: (st) => String(Math.round(st.speed)), on: (st) => st.speed !== HERO.speed },
  { key: 'magnet', label: 'Collecte', hint: 'Rayon d’attraction de l’XP et des objets.', value: (st) => String(Math.round(st.magnet)), on: (st) => st.magnet !== HERO.magnet },
  { key: 'armor', label: 'Armure', hint: 'Part des dégâts reçus annulée (max 60 %).', value: (st) => rate(st.armor), on: (st) => st.armor > 0 },
  { key: 'luck', label: 'Chance', hint: 'Probabilité que les ennemis lâchent des objets.', value: (st) => rate(st.luck), on: (st) => st.luck !== 1 },
  { key: 'regen', label: 'Régén.', hint: 'PV rendus chaque seconde.', value: (st) => `${dec(st.regen)} PV/s`, on: (st) => st.regen > HERO.regen + 1e-6 },
  { key: 'maxHp', label: 'PV max', hint: 'Points de vie maximum.', value: (st) => String(Math.round(st.maxHp)), on: (st) => st.maxHp > HERO.maxHp },
];

export interface StatDetail {
  label: string;
  value: string;
  on: boolean;
  hint: string;
  /** d'où vient la valeur : base, passifs, bonus temporaires, plafonds */
  sources: string[];
}

/** Stats détaillées pour l'écran de pause : valeur réelle et provenance de chaque bonus. */
export function statDetails(p: Player, tick: number): StatDetail[] {
  const secs = (until: number) => `${Math.ceil((until - tick) / TICK_RATE)} s`;
  return STATS.map((d) => {
    const sources: string[] = [];
    if (d.key === 'speed') sources.push(`Base ${HERO.speed}`);
    if (d.key === 'magnet') sources.push(`Base ${HERO.magnet}`);
    if (d.key === 'regen') sources.push(`Base ${dec(HERO.regen)} PV/s`);
    if (d.key === 'maxHp') sources.push(`Base ${HERO.maxHp}`);
    for (const inst of p.passives) {
      const def = PASSIVES[inst.def];
      const v = def.perLevel[d.key];
      if (!v) continue;
      const total = v * inst.level;
      const amount =
        d.key === 'maxHp' ? `+${total}` : d.key === 'regen' ? `+${dec(total)} PV/s` : d.key === 'cooldown' ? `−${Math.round(total * 100)} %` : `+${Math.round(total * 100)} %`;
      sources.push(`${def.name} niv. ${inst.level} : ${amount}`);
    }
    if (d.key === 'might' && p.mightMul !== 1) sources.push(`Sandbox : ×${dec(p.mightMul)}`);
    if (d.key === 'might' && p.rageUntil > tick) sources.push(`Rage : ×2 (${secs(p.rageUntil)})`);
    if (d.key === 'cooldown' && p.frenzyUntil > tick) sources.push(`Frénésie : ×0,5 (${secs(p.frenzyUntil)})`);
    if (d.key === 'speed' && p.turboUntil > tick) sources.push(`Turbo : ×1,5 (${secs(p.turboUntil)})`);
    if (d.key === 'magnet' && p.feverUntil > tick) sources.push(`Fièvre d’XP : ×${LOOT.feverMagnet} (${secs(p.feverUntil)})`);
    if (d.key === 'cooldown' && p.base.cooldownMul <= 0.35) sources.push('Plafond atteint (−65 %)');
    if (d.key === 'armor' && p.base.armor >= 0.6) sources.push('Plafond atteint (60 %)');
    if (!sources.length) sources.push('Aucun bonus');
    return { label: d.label, value: d.value(p.stats), on: d.on(p.stats), hint: d.hint, sources };
  });
}

const BUFFS: { kind: number; field: 'rageUntil' | 'frenzyUntil' | 'turboUntil' | 'shieldUntil' | 'feverUntil' }[] = [
  { kind: PK_RAGE, field: 'rageUntil' },
  { kind: PK_FRENZY, field: 'frenzyUntil' },
  { kind: PK_TURBO, field: 'turboUntil' },
  { kind: PK_SHIELD, field: 'shieldUntil' },
  { kind: PK_FEVER, field: 'feverUntil' },
];

/** Effets en cours affichés au-dessus de la barre : bonus du joueur, Horloge, clone, Totem en réserve. */
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

  // ---------- Haut centre : bandeau (frise des vagues ou boss), chrono dessous ----------
  const boss = findBoss(s);
  if (boss) drawBossBand(ctx, boss, W);
  else drawWaveStrip(ctx, s, W, opt, blink);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 28px ${FONT}`;
  glowText(ctx, formatTime(score.survivedSec), W / 2, BAND_Y + BAND_H + 24, COLORS.player);

  // ---------- Haut gauche : le score, et le mode ----------
  const lx = 18;
  ctx.font = `700 34px ${FONT}`;
  ctx.textAlign = 'left';
  glowText(ctx, pad7(score.score), lx, 30, '#ffe14d');
  ctx.font = `700 14px ${FONT}`;
  ctx.fillStyle = opt.difficulty.color;
  const mode = opt.difficulty.name;
  ctx.fillText(mode, lx + 1, 60);
  if (opt.sandbox) {
    ctx.fillStyle = COLORS.sandbox;
    ctx.fillText(opt.sandbox.invincible ? '· Sandbox invincible' : '· Sandbox', lx + ctx.measureText(mode).width + 8, 60);
  }

  // ---------- Bas centre : barre principale (PV, XP, armes, objet, passifs) ----------
  const ws = 46; // emplacement d'arme
  const ps = 40; // emplacement de passif
  const as = 52; // objet activable
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

  // PV : la barre la plus visible de l'écran.
  const hpF = p.hp / p.stats.maxHp;
  const low = hpF < 0.3;
  const barX = x0 + 50;
  const barW = PW - 50 - 16;
  label(ctx, 'PV', x0 + 16, top + 22, 'left', COLORS.hp);
  bar(ctx, barX, top + 12, barW, 20, hpF, low && blink ? '#ffffff' : COLORS.hp, `${Math.ceil(p.hp)} / ${Math.round(p.stats.maxHp)}`);
  // XP + niveau
  label(ctx, `Niv. ${p.level}`, x0 + 16, top + 46, 'left', COLORS.xp);
  bar(ctx, barX + 8, top + 40, barW - 8, 12, p.xp / p.xpNext, COLORS.xp, '');

  const ry = top + 76;
  let x = x0 + 16;
  // Armes
  label(ctx, `Armes ${p.weapons.length}/${MAX_WEAPON_SLOTS}`, x, ry - 10);
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
  // Objet activable (Espace), au centre
  const act = p.activable;
  const ay = ry - 3;
  slot(ctx, x, ay, as, act >= 0 ? PICKUPS[act].color : null);
  if (act >= 0) ctx.drawImage(icon('pickup', PICKUPS[act].id), x + 4, ay + 4, as - 8, as - 8);
  label(ctx, act >= 0 ? PICKUPS[act].name : 'Objet', x + as / 2, ry - 10, 'center', act >= 0 ? PICKUPS[act].color : COLORS.muted);
  label(ctx, 'Espace', x + as / 2, ay + as + 8, 'center', act >= 0 ? '#ffffff' : COLORS.muted);
  x += as + sep;
  // Passifs
  const py = ry + (ws - ps);
  label(ctx, `Passifs ${p.passives.length}/${MAX_PASSIVE_SLOTS}`, x, ry - 10);
  for (let i = 0; i < MAX_PASSIVE_SLOTS; i++) {
    const sx = x + i * (ps + gap);
    const it = p.passives[i];
    const def = it ? PASSIVES[it.def] : null;
    slot(ctx, sx, py, ps, def ? def.color : null);
    if (!it || !def) continue;
    ctx.drawImage(icon('passive', def.id), sx + 3, py + 3, ps - 6, ps - 6);
    pips(ctx, sx, py + ps + 4, ps, it.level, 5, def.color);
  }

  // ---------- Bonus temporaires actifs : juste au-dessus de la barre ----------
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
    ctx.fillText(b.left < 0 ? 'Prêt' : `${Math.ceil(b.left / TICK_RATE)} s`, bx + bs / 2, by - 10);
    bx += bs + 8;
  }

  // Relecture
  if (opt.replay) {
    label(ctx, `Relecture ×${opt.replay.speed} · 1 / 2 / 4 : vitesse · Échap : quitter`, W / 2, top - 92, 'center', '#ffe14d');
    bar(ctx, W / 2 - 200, top - 80, 400, 4, opt.replay.progress, '#ffe14d', '');
  }

  if (opt.showFps) {
    ctx.textAlign = 'right';
    ctx.font = '12px monospace';
    ctx.fillStyle = opt.fps >= 55 ? '#39ff7a' : opt.fps >= 40 ? '#ffe14d' : '#ff3d6e';
    ctx.fillText(`${opt.fps.toFixed(0)} fps · rés. ${Math.round((opt.resolution ?? 1) * 100)} % · ${s.enemyCount} ennemis · ${s.projCount} proj · ${s.gemCount} gemmes`, W - 16, H - 12);
  }
}
