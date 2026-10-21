/**
 * HUD dessiné dans le canvas, même police et mêmes tailles que l'interface DOM.
 * Haut gauche : vie, XP, niveau. Haut centre : chrono, prochain boss / barre du boss.
 * Haut droite : score, record, éliminés, difficulté. Bas gauche : armes et passifs.
 * Bas centre : objet activable (Espace) et bonus temporaires actifs. Bas droite : stats.
 */
import { BOSS } from '../data/enemies';
import { HERO } from '../data/hero';
import { PASSIVES } from '../data/passives';
import { PICKUPS } from '../data/loot';
import { WAVES } from '../data/waves';
import type { DifficultyDef } from '../data/difficulty';
import {
  MAX_PASSIVE_SLOTS,
  MAX_WEAPON_SLOTS,
  PK_FRENZY,
  PK_RAGE,
  PK_SHIELD,
  PK_TURBO,
  TICK_RATE,
  computeScore,
  findBoss,
  weaponDef,
  weaponMaxLevel,
  type GameState,
  type Player,
  type PlayerStats,
} from '../sim';
import { COLORS } from './palette';
import { iconCanvas } from './icons';

export const FONT = '"Chakra Petch", "Trebuchet MS", sans-serif';
/** Échelle de tailles commune (identique au CSS) */
const LABEL = `600 12px ${FONT}`;
const TEXT = `600 13px ${FONT}`;

export interface HudOptions {
  showFps: boolean;
  fps: number;
  replay: { speed: number; progress: number } | null;
  /** meilleur score enregistré dans cette difficulté (0 si aucun) */
  best: number;
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

/** Lignes de stats du héros : [libellé, valeur, modifiée par un bonus]. */
export function statRows(st: PlayerStats): [string, string, boolean][] {
  return STATS.map((d) => [d.label, d.value(st), d.on(st)]);
}

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
    if (d.key === 'might' && p.rageUntil > tick) sources.push(`Rage : ×2 (${secs(p.rageUntil)})`);
    if (d.key === 'cooldown' && p.frenzyUntil > tick) sources.push(`Frénésie : ×0,5 (${secs(p.frenzyUntil)})`);
    if (d.key === 'speed' && p.turboUntil > tick) sources.push(`Turbo : ×1,5 (${secs(p.turboUntil)})`);
    if (d.key === 'cooldown' && p.base.cooldownMul <= 0.35) sources.push('Plafond atteint (−65 %)');
    if (d.key === 'armor' && p.base.armor >= 0.6) sources.push('Plafond atteint (60 %)');
    if (!sources.length) sources.push('Aucun bonus');
    return { label: d.label, value: d.value(p.stats), on: d.on(p.stats), hint: d.hint, sources };
  });
}

const BUFFS: { kind: number; field: 'rageUntil' | 'frenzyUntil' | 'turboUntil' | 'shieldUntil' }[] = [
  { kind: PK_RAGE, field: 'rageUntil' },
  { kind: PK_FRENZY, field: 'frenzyUntil' },
  { kind: PK_TURBO, field: 'turboUntil' },
  { kind: PK_SHIELD, field: 'shieldUntil' },
];

export function drawHud(ctx: Ctx, s: GameState, W: number, H: number, opt: HudOptions): void {
  const p = s.players[0];
  const score = computeScore(s);
  const blink = Math.floor(opt.time * 3) % 2 === 0;
  ctx.textBaseline = 'middle';

  // ---------- Haut gauche : PV, XP, niveau ----------
  panel(ctx, 12, 12, 316, 60);
  label(ctx, 'PV', 24, 31, 'left', COLORS.hp);
  const hpF = p.hp / p.stats.maxHp;
  bar(ctx, 54, 22, 206, 18, hpF, hpF < 0.3 && blink ? '#ffffff' : COLORS.hp, `${Math.ceil(p.hp)} / ${Math.round(p.stats.maxHp)}`);
  label(ctx, 'XP', 24, 55, 'left', COLORS.xp);
  bar(ctx, 54, 47, 206, 16, p.xp / p.xpNext, COLORS.xp, `${Math.floor(p.xp)} / ${p.xpNext}`);
  ctx.beginPath();
  ctx.roundRect(268.5, 21.5, 50, 42, 5);
  ctx.strokeStyle = COLORS.xp;
  ctx.lineWidth = 1;
  ctx.stroke();
  label(ctx, 'Niv.', 293, 31, 'center', COLORS.xp);
  ctx.font = `700 20px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(p.level), 293, 51);

  // ---------- Haut centre : chrono + boss ----------
  ctx.textAlign = 'center';
  ctx.font = `700 30px ${FONT}`;
  glowText(ctx, formatTime(score.tempsSurvecu), W / 2, 32, COLORS.player);
  const boss = findBoss(s);
  if (boss) {
    const bw = Math.min(460, W * 0.42);
    const name = BOSS.names[Math.min(boss.aux2, BOSS.names.length - 1)];
    label(ctx, `Boss · ${name}`, W / 2, 60, 'center', COLORS.boss);
    bar(ctx, W / 2 - bw / 2, 70, bw, 10, boss.hp / boss.maxHp, COLORS.boss, '');
  } else {
    const every = WAVES.bossEvery;
    const left = every - ((s.tick / TICK_RATE) % every);
    const soon = left <= 10;
    ctx.font = TEXT;
    ctx.fillStyle = soon ? (blink ? COLORS.boss : '#ffffff') : COLORS.muted;
    ctx.fillText(soon ? `Boss dans ${Math.ceil(left)} s` : `Prochain boss dans ${formatTime(left)}`, W / 2, 60);
  }

  // ---------- Haut droite : score, record, éliminés ----------
  const rx = W - 66;
  label(ctx, 'Score', rx, 18, 'right');
  ctx.font = `700 22px ${FONT}`;
  ctx.textAlign = 'right';
  glowText(ctx, pad7(score.score), rx, 38, '#ffe14d');
  const beaten = opt.best > 0 && score.score > opt.best;
  label(ctx, beaten ? 'Nouveau record' : `Record ${pad7(opt.best)}`, rx, 58, 'right', beaten ? COLORS.gold : COLORS.muted);
  ctx.font = TEXT;
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.text;
  ctx.fillText(`${p.kills.toLocaleString('fr-FR')} éliminés`, rx, 76);
  label(ctx, opt.difficulty.name, rx, 94, 'right', opt.difficulty.color);

  // ---------- Bas gauche : armes et passifs ----------
  const size = 48;
  const gap = 6;
  const y0 = H - size - 22;
  label(ctx, `Armes ${p.weapons.length}/${MAX_WEAPON_SLOTS}`, 16, y0 - 12);
  for (let i = 0; i < MAX_WEAPON_SLOTS; i++) {
    const x = 16 + i * (size + gap);
    const w = p.weapons[i];
    const def = w ? weaponDef(w.def) : null;
    slot(ctx, x, y0, size, def ? def.color : null);
    if (!w || !def) continue;
    ctx.drawImage(icon('weapon', def.id), x + 3, y0 + 3, size - 6, size - 6);
    if (def.fusion) {
      ctx.fillStyle = COLORS.gold;
      ctx.fillRect(x, y0 + size + 4, size, 4);
    } else pips(ctx, x, y0 + size + 4, size, w.level, weaponMaxLevel(w.def), def.color);
  }
  const px0 = 16 + MAX_WEAPON_SLOTS * (size + gap) + 12;
  const ps = 40;
  const py = y0 + (size - ps);
  label(ctx, `Passifs ${p.passives.length}/${MAX_PASSIVE_SLOTS}`, px0, y0 - 12);
  for (let i = 0; i < MAX_PASSIVE_SLOTS; i++) {
    const x = px0 + i * (ps + gap);
    const it = p.passives[i];
    const def = it ? PASSIVES[it.def] : null;
    slot(ctx, x, py, ps, def ? def.color : null);
    if (!it || !def) continue;
    ctx.drawImage(icon('passive', def.id), x + 3, py + 3, ps - 6, ps - 6);
    pips(ctx, x, py + ps + 4, ps, it.level, 5, def.color);
  }

  // ---------- Bas centre : objet activable + bonus actifs ----------
  const cx = Math.max(px0 + MAX_PASSIVE_SLOTS * (ps + gap) + 30, W / 2 - 28);
  const as = 56;
  const ay = H - as - 22;
  const act = p.activable;
  slot(ctx, cx, ay, as, act >= 0 ? PICKUPS[act].color : null);
  if (act >= 0) {
    ctx.drawImage(icon('pickup', PICKUPS[act].id), cx + 4, ay + 4, as - 8, as - 8);
    label(ctx, PICKUPS[act].name, cx + as / 2, ay - 12, 'center', PICKUPS[act].color);
  } else label(ctx, 'Objet', cx + as / 2, ay - 12, 'center');
  label(ctx, 'Espace', cx + as / 2, ay + as + 10, 'center', act >= 0 ? '#ffffff' : COLORS.muted);
  let bx = cx + as + 14;
  for (const b of BUFFS) {
    const left = p[b.field] - s.tick;
    if (left <= 0) continue;
    const def = PICKUPS[b.kind];
    const bs = 40;
    const by = H - bs - 30;
    slot(ctx, bx, by, bs, def.color);
    ctx.drawImage(icon('pickup', def.id), bx + 3, by + 3, bs - 6, bs - 6);
    const total = (def.duration ?? 5) * TICK_RATE;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(bx, by + bs + 4, bs, 4);
    ctx.fillStyle = def.color;
    ctx.fillRect(bx, by + bs + 4, bs * Math.min(1, left / total), 4);
    ctx.font = TEXT;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${Math.ceil(left / TICK_RATE)} s`, bx + bs / 2, by - 10);
    bx += bs + 8;
  }

  // ---------- Bas droite : stats ----------
  const rows = statRows(p.stats);
  const sw = 168;
  const lh = 17;
  const sh = 30 + rows.length * lh;
  const sx = W - sw - 14;
  const sy = H - sh - (opt.showFps ? 30 : 14);
  panel(ctx, sx, sy, sw, sh);
  label(ctx, 'Stats', sx + 12, sy + 15);
  ctx.font = TEXT;
  rows.forEach(([l, val, on], k) => {
    const y = sy + 34 + k * lh;
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(l, sx + 12, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = on ? COLORS.xp : 'rgba(242,234,255,0.5)';
    ctx.fillText(val, sx + sw - 12, y);
  });

  // Relecture
  if (opt.replay) {
    label(ctx, `Relecture ×${opt.replay.speed} · 1 / 2 / 4 : vitesse · Échap : quitter`, W / 2, H - 112, 'center', '#ffe14d');
    bar(ctx, W / 2 - 200, H - 100, 400, 4, opt.replay.progress, '#ffe14d', '');
  }

  if (opt.showFps) {
    ctx.textAlign = 'right';
    ctx.font = '12px monospace';
    ctx.fillStyle = opt.fps >= 55 ? '#39ff7a' : opt.fps >= 40 ? '#ffe14d' : '#ff3d6e';
    ctx.fillText(`${opt.fps.toFixed(0)} fps · ${s.enemyCount} ennemis · ${s.projCount} proj · ${s.gemCount} gemmes`, W - 16, H - 12);
  }
}
