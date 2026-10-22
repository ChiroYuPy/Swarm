/**
 * HUD dessiné dans le canvas, même police et mêmes tailles que l'interface DOM.
 * Haut gauche : score, record, éliminés, difficulté. Haut centre : chrono, prochain boss / barre du boss.
 * Bas centre : une seule barre avec PV, XP + niveau, armes, objet activable (Espace) et passifs ;
 * les bonus temporaires actifs juste au-dessus. Les stats détaillées sont dans l'écran de pause.
 */
import { BOSS } from '../data/enemies';
import { HERO } from '../data/hero';
import { PASSIVES } from '../data/passives';
import { LOOT, PICKUPS } from '../data/loot';
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
  PK_SHIELD,
  PK_TOTEM,
  PK_TURBO,
  TICK_RATE,
  computeScore,
  findBoss,
  weaponDef,
  weaponMaxLevel,
  type GameState,
  type Player,
  type PlayerStats,
  type SandboxRules,
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
  } else if (!opt.sandbox || opt.sandbox.bosses) {
    const every = WAVES.bossEvery;
    const left = every - ((s.tick / TICK_RATE) % every);
    const soon = left <= 10;
    ctx.font = TEXT;
    ctx.fillStyle = soon ? (blink ? COLORS.boss : '#ffffff') : COLORS.muted;
    ctx.fillText(soon ? `Boss dans ${Math.ceil(left)} s` : `Prochain boss dans ${formatTime(left)}`, W / 2, 60);
  }

  // ---------- Haut gauche : score, record, éliminés ----------
  const lx = 18;
  label(ctx, 'Score', lx, 20);
  ctx.font = `700 26px ${FONT}`;
  ctx.textAlign = 'left';
  glowText(ctx, pad7(score.score), lx, 44, '#ffe14d');
  const beaten = opt.best > 0 && score.score > opt.best;
  if (opt.sandbox) label(ctx, opt.sandbox.invincible ? 'Sandbox · invincible' : 'Sandbox · non classé', lx, 68, 'left', COLORS.sandbox);
  else label(ctx, beaten ? 'Nouveau record' : `Record ${pad7(opt.best)}`, lx, 68, 'left', beaten ? COLORS.gold : COLORS.muted);
  ctx.font = TEXT;
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.text;
  const killsText = `${p.kills.toLocaleString('fr-FR')} éliminés`;
  ctx.fillText(killsText, lx, 87);
  label(ctx, opt.difficulty.name, lx + ctx.measureText(killsText).width + 10, 87, 'left', opt.difficulty.color);

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
    ctx.fillText(`${opt.fps.toFixed(0)} fps · ${s.enemyCount} ennemis · ${s.projCount} proj · ${s.gemCount} gemmes`, W - 16, H - 12);
  }
}
