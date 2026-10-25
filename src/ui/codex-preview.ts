/**
 * Codex live preview: a small real game (the actual sim, the actual renderer) showing what a codex sheet
 * describes: a weapon at a level, an enemy coming at you, a boss in its arena, an item being used. The
 * hero is driven by the bot and cannot die; the scenario adds the enemies, gems and items it needs and
 * starts over every few seconds, exactly the same every time (its own seeded randomness). Enemies come in
 * from the edges of the view, and the edges are the screen box of the sim (shurikens bounce on them).
 * One canvas for the whole codex, moved into each sheet.
 */
import { ENEMIES } from '../data/enemies';
import { PICKUPS } from '../data/loot';
import { DIFFICULTIES } from '../data/difficulty';
import {
  createGame,
  step,
  circleHitsObstacle,
  INPUT_USE,
  TICK_RATE,
  type GameState,
  type SandboxConfig,
} from '../sim';
import { spawnEnemy, spawnGem, spawnPickup } from '../sim/entities';
import { hurtPlayer } from '../sim/combat';
import { ENEMY_INDEX, PROP_TYPE } from '../sim/registry';
import { botInput } from '../ai/bot';
import { Renderer } from '../render/renderer';
import { Effects } from '../render/effects';

export type PreviewSubject =
  | { kind: 'weapon'; id: string; level: number }
  | { kind: 'passive'; id: string; level: number }
  | { kind: 'enemy'; id: string }
  | { kind: 'boss'; id: string }
  | { kind: 'pickup'; id: string }
  | { kind: 'crate' };

type Loadout = { id: string; level: number }[];

/** camera zoom of the preview (the world shown is about a third of the game's view) */
const ZOOM = 2.1;
/** height / width of the preview */
const RATIO = 0.6;
/** half-size of the world shown (the renderer shows 1400 x 860 at zoom 1, fitted to the canvas) */
const HALF_H = 430 / ZOOM;
const HALF_W = HALF_H / RATIO;
/** the bounce box sits this far inside the view, so a shuriken touches the edge as it turns back */
const BOX_MARGIN = 18;

/** The preview's own random stream (never the sim's): reset on each restart, so every loop is the same. */
let seed = 1;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

/** A point just outside the view around (x, y), in a random direction. */
function edgePoint(x: number, y: number, out = 30): [number, number] {
  const a = rnd() * Math.PI * 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const t = Math.min((HALF_W + out) / Math.max(1e-6, Math.abs(c)), (HALF_H + out) / Math.max(1e-6, Math.abs(s)));
  return [x + c * t, y + s * t];
}

const BASE: SandboxConfig = {
  invincible: true,
  level: 1,
  startWave: 1,
  enemyMul: 0,
  enemies: null,
  bosses: false,
  duel: null,
  duelMark: 1,
  summons: true,
  might: 1,
  xp: 0,
  weapons: [{ id: 'blaster', level: 3 }],
  passives: [],
  item: null,
};

/** Weapons that show a passive best (others: the default loadout). */
const PASSIVE_LOADOUT: Record<string, Loadout> = {
  amplifier: [{ id: 'force_field', level: 3 }],
  overclock: [{ id: 'blaster', level: 4 }],
  might: [{ id: 'blaster', level: 4 }],
};

/** How each scenario runs: its setup, what it does every tick, and how long before it starts over (s). */
interface Scenario {
  config: SandboxConfig;
  period: number;
  /** called every tick with the preview time (s); returns zero-time input codes to play first */
  update(s: GameState, time: number, ticks: number): number[];
}

const every = (ticks: number, sec: number, offset = 0) => ticks >= offset * TICK_RATE && (ticks - Math.round(offset * TICK_RATE)) % Math.round(sec * TICK_RATE) === 0;

/**
 * Keeps about `n` enemies of a type around the hero (packs for pack types), topping up every half second:
 * from the edges of the view, or between `near` distances.
 */
function keep(s: GameState, id: string, n: number, ticks: number, near?: [number, number]): void {
  if (ticks % 30 !== 1) return;
  const type = ENEMY_INDEX[id];
  if (type === undefined) return;
  let alive = 0;
  for (let i = 0; i < s.enemyCount; i++) if (s.enemies[i].alive && s.enemies[i].type === type) alive++;
  if (alive >= n) return;
  const d = ENEMIES[type];
  const p = s.players[0];
  const group = Math.min(n - alive, d.pack ?? (id === 'swarm' ? 14 : 1));
  let cx: number;
  let cy: number;
  if (near) {
    const a = rnd() * Math.PI * 2;
    const dist = near[0] + rnd() * (near[1] - near[0]);
    cx = p.x + Math.cos(a) * dist;
    cy = p.y + Math.sin(a) * dist;
  } else [cx, cy] = edgePoint(p.x, p.y, d.radius + 8);
  for (let k = 0; k < group; k++) {
    const rr = d.radius * 2.3 * Math.sqrt(k);
    const ga = k * 2.4;
    const x = cx + Math.cos(ga) * rr;
    const y = cy + Math.sin(ga) * rr;
    if (circleHitsObstacle(s.map, x, y, d.radius)) continue;
    spawnEnemy(s, type, x, y, 1, 1, 1, 0);
  }
}

/** The usual crowd: a few packs of Marbles and some Hunters. */
function crowd(s: GameState, ticks: number): void {
  keep(s, 'marble', 12, ticks);
  keep(s, 'hunter', 3, ticks);
}

function scatterGems(s: GameState, n: number): void {
  const p = s.players[0];
  for (let k = 0; k < n; k++) spawnGem(s, p.x + (rnd() * 2 - 1) * (HALF_W - 20), p.y + (rnd() * 2 - 1) * (HALF_H - 20), 1);
}

function scenario(sub: PreviewSubject): Scenario {
  switch (sub.kind) {
    case 'weapon':
      return {
        config: { ...BASE, weapons: [{ id: sub.id, level: sub.level }] },
        period: 30,
        update: (s, _t, ticks) => {
          crowd(s, ticks);
          return [];
        },
      };
    case 'passive':
      return {
        config: { ...BASE, invincible: sub.id !== 'armor' && sub.id !== 'vitality', weapons: PASSIVE_LOADOUT[sub.id] ?? BASE.weapons, passives: [{ id: sub.id, level: sub.level }] },
        period: 30,
        update: (s, _t, ticks) => {
          crowd(s, ticks);
          if (sub.id === 'magnet' && every(ticks, 3)) scatterGems(s, 10);
          // armor, vitality: hits are taken (and shown), the hero never falls
          const p = s.players[0];
          if (p.hp < p.stats.maxHp * 0.3) p.hp = p.stats.maxHp;
          return [];
        },
      };
    case 'enemy': {
      const d = ENEMIES[ENEMY_INDEX[sub.id]];
      const n = d.pack ? d.pack * 2 : d.cap ? Math.min(d.cap, 3) : sub.id === 'swarm' ? 14 : 5;
      return {
        config: { ...BASE, might: 0.6 },
        period: 30,
        update: (s, _t, ticks) => {
          keep(s, sub.id, n, ticks);
          return [];
        },
      };
    }
    case 'boss':
      return {
        config: { ...BASE, duel: sub.id, might: 0.25, weapons: [{ id: 'blaster', level: 3 }, { id: 'force_field', level: 2 }] },
        period: 45,
        update: () => [],
      };
    case 'crate':
      return {
        config: { ...BASE },
        period: 9,
        update: (s, _t, ticks) => {
          if (ticks === 20) {
            const p = s.players[0];
            const e = spawnEnemy(s, PROP_TYPE, p.x + 170, p.y, 1, 1, 1, 0);
            if (e) e.maxHp = e.hp = ENEMIES[PROP_TYPE].hp;
          }
          return [];
        },
      };
    case 'pickup': {
      const code = PICKUPS.findIndex((x) => x.id === sub.id);
      const def = PICKUPS[code];
      switch (def.kind) {
        case 'timed':
          return {
            config: { ...BASE },
            period: Math.max(10, (def.duration ?? 8) + 3),
            update: (s, _t, ticks) => {
              crowd(s, ticks);
              if (ticks === 36) spawnPickup(s, code, s.players[0].x, s.players[0].y);
              return [];
            },
          };
        case 'instant':
          return {
            config: { ...BASE, invincible: false },
            period: 6,
            update: (s, _t, ticks) => {
              const p = s.players[0];
              if (ticks === 10) p.hp = p.stats.maxHp * 0.35;
              if (ticks === 40) spawnPickup(s, code, p.x + 60, p.y);
              if (p.hp < p.stats.maxHp * 0.2) p.hp = p.stats.maxHp * 0.35;
              return [];
            },
          };
        case 'relic':
          return {
            config: { ...BASE, invincible: false },
            period: 9,
            update: (s, _t, ticks) => {
              const p = s.players[0];
              keep(s, 'hunter', 8, ticks, [110, 200]);
              if (ticks === 30) spawnPickup(s, code, p.x, p.y);
              // once it holds the relic, a fatal hit: it brings the hero back, then nothing can hurt it
              if (ticks === 150) hurtPlayer(s, p, p.hp + 1, true);
              if (ticks > 150 && s.sandbox) s.sandbox.invincible = true;
              if (ticks < 150 && p.hp < p.stats.maxHp * 0.5) p.hp = p.stats.maxHp;
              return [];
            },
          };
        case 'chest':
          return {
            config: { ...BASE, weapons: [{ id: 'blaster', level: 5 }] },
            period: 9,
            update: (s, _t, ticks) => {
              if (ticks === 40) spawnPickup(s, code, s.players[0].x + 110, s.players[0].y);
              return [];
            },
          };
        case 'active':
          return {
            config: { ...BASE },
            period: 7,
            update: (s, _t, ticks) => {
              crowd(s, ticks);
              keep(s, 'marble', 24, ticks);
              if (ticks === 1) scatterGems(s, 24);
              if (ticks === 30) s.players[0].activeItem = code;
              return ticks === 110 && s.players[0].activeItem === code ? [INPUT_USE] : [];
            },
          };
        default: {
          const unhandled: never = def.kind;
          throw new Error(`Unhandled pickup kind ${unhandled}`);
        }
      }
    }
  }
}

/** The codex's single live preview. */
export class CodexPreview {
  readonly canvas = document.createElement('canvas');
  private renderer: Renderer | null = null;
  private readonly fx = new Effects({ sfx: () => {}, toast: () => {} });
  private state: GameState | null = null;
  private sc: Scenario | null = null;
  private subject = '';
  private ticks = 0;
  private acc = 0;
  private last = 0;
  private time = 0;
  private running = false;
  private size = [0, 0];

  constructor() {
    this.canvas.className = 'preview';
  }

  /** Puts the preview canvas into `box` (a sheet) and shows `sub`; restarts only if the subject changed. */
  show(box: HTMLElement, sub: PreviewSubject): void {
    box.appendChild(this.canvas);
    const key = JSON.stringify(sub);
    if (key !== this.subject) {
      this.subject = key;
      this.sc = scenario(sub);
      this.restart();
    }
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    }
  }

  private restart(): void {
    if (!this.sc) return;
    seed = 12345;
    this.state = createGame({ seed: 'CODEX', difficulty: 1, sandbox: this.sc.config });
    this.state.boxX = HALF_W - BOX_MARGIN;
    this.state.boxY = HALF_H - BOX_MARGIN;
    this.ticks = 0;
    this.acc = 0;
    this.fx.reset(this.state.seed);
  }

  private stepOnce(): void {
    const s = this.state!;
    this.ticks++;
    for (const code of this.sc!.update(s, this.ticks / TICK_RATE, this.ticks)) {
      step(s, [code]);
      this.fx.consume(s);
    }
    step(s, [botInput(s, 0)]);
    this.fx.consume(s);
    if (this.ticks >= this.sc!.period * TICK_RATE || s.over) this.restart();
  }

  private frame(now: number): void {
    // The codex is gone (screen left): stop until the next show().
    if (!this.canvas.isConnected) {
      this.running = false;
      return;
    }
    const w = this.canvas.parentElement?.clientWidth ?? 0;
    const h = Math.round(w * RATIO);
    if (!this.renderer || w !== this.size[0] || h !== this.size[1]) {
      this.size = [w, h];
      if (!this.renderer) this.renderer = new Renderer(this.canvas, () => [this.size[0], this.size[1]]);
      else this.renderer.resize();
    }
    const dt = Math.min(100, Math.max(0, now - this.last));
    this.last = now;
    this.time += dt / 1000;
    this.acc += dt;
    const stepMs = 1000 / TICK_RATE;
    let n = 0;
    while (this.acc >= stepMs && n < 3 && this.state) {
      this.stepOnce();
      this.acc -= stepMs;
      n++;
    }
    if (n === 3) this.acc = 0;
    this.fx.update(dt / 1000);
    const s = this.state;
    if (s && w > 0) {
      this.renderer.render(s, Math.min(1, this.acc / stepMs), this.fx, {
        quality: 'high',
        time: this.time,
        hud: false,
        zoom: ZOOM,
        showFps: false,
        fps: 60,
        replay: null,
        best: 0,
        sandbox: s.sandbox,
        difficulty: DIFFICULTIES[s.difficulty],
        deathFade: 0,
      });
    }
    requestAnimationFrame((t) => this.frame(t));
  }
}

/** One preview for the whole codex (its renderer pre-renders the sprites once). */
let instance: CodexPreview | null = null;
export function codexPreview(): CodexPreview {
  instance ??= new CodexPreview();
  return instance;
}
