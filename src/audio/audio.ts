/**
 * Audio 100 % synthétisé avec WebAudio : aucun fichier.
 * Effets courts (oscillateurs + bruit filtré), une réverbération et un écho partagés, et deux boucles
 * séquencées à la volée, au même tempo : le menu et la partie (couches qui s'ajoutent avec l'intensité).
 */
import type { SfxName } from '../render/effects';

type Wave = OscillatorType;
export type UiSfx = 'ui' | 'uiMove' | 'uiBack' | 'powerOn';
type Track = 'menu' | 'game';

interface Filter {
  type: BiquadFilterType;
  freq: number;
  /** fréquence d'arrivée (rampe exponentielle sur la durée du son) */
  f1?: number;
  q?: number;
}

interface ToneOpts {
  bus?: Bus | null;
  filter?: Filter;
  detune?: number;
  /** exp : attaque et chute exponentielles (sons percussifs) ; lin : attaque, palier, chute linéaires */
  shape?: 'exp' | 'lin';
  attack?: number;
  /** durée de la chute (lin), par défaut tout ce qui suit l'attaque */
  release?: number;
  /** position stéréo, ou glissement [départ, arrivée] sur la durée du son */
  pan?: number | [number, number];
  /** envois vers la réverbération et l'écho */
  rev?: number;
  dly?: number;
  glide?: 'exp' | 'lin';
  glideTime?: number;
  /** résonance du filtre (bruit) */
  q?: number;
}

/** Une sortie et ses deux envois (réverbération, écho) : on règle ou coupe les trois ensemble. */
interface Bus {
  out: GainNode;
  rev: GainNode;
  dly: GainNode;
}

const THROTTLE: Partial<Record<SfxName | 'ui', number>> = {
  shoot: 0.06,
  hit: 0.03,
  kill: 0.04,
  gem: 0.025,
  hurt: 0.12,
  hatch: 0.08,
  explosion: 0.05,
  enemyShot: 0.09,
  zap: 0.05,
  ring: 0.08,
  laser: 0.1,
  mine: 0.08,
  boomerang: 0.08,
  fuse: 0.1,
  heal: 0.3,
  alert: 0.5,
  shotDown: 0.05,
  shatter: 0.04,
  blink: 0.08,
};

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const lp = (freq: number): Filter => ({ type: 'lowpass', freq });

// ---------------- Musique ----------------
/** double-croche à 112 BPM : les deux boucles partagent le tempo, les transitions tombent en rythme */
const STEP = 60 / 112 / 4;
const AM = [57, 60, 64];
const F = [53, 57, 60];
const C = [48, 52, 55];
const G = [55, 59, 62];
const DM = [50, 53, 57];
const E = [52, 56, 59];
/** boucle historique (une mesure par accord), reprise par le menu */
const LOOP = [AM, F, C, G];
/** partie : A (la boucle historique) puis B qui monte en tension vers Mi majeur */
const GAME_PROG = [AM, F, C, G, DM, F, G, E];
const LOOP_STEPS = 128;

// ---------------- Intro ----------------
/** instants (s) où chaque lettre du logo s'allume, voir letter-on dans style.css */
const FLICK = [0, 0.18, 0.348];
/** Lancement d'une partie : durée (s) de la montée avant l'impact, qui est aussi l'atterrissage du héros. */
export const START_RISE = 1.3;

/** Intro : allumage de l'écran, puis l'essaim forme le logo, puis les lettres s'allument (ms, alignés sur ui.ts). */
export const INTRO_TIMING = { crt: 1050, swarm: 1600, letterGap: 200 };

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private revIn: GainNode | null = null;
  private dlyIn: GainNode | null = null;
  private sfx: Bus | null = null;
  private music: Bus | null = null;
  /** sons de l'intro, coupés d'un coup si le joueur la passe */
  private intro: Bus | null = null;
  /** fondu et filtre de la musique (transitions) */
  private musicFade: GainNode | null = null;
  private musicLp: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly last: Record<string, number> = {};
  private volume = 0.7;
  private musicVolume = 0.45;
  private sfxVolume = 0.8;
  private muted = false;
  private duck = 1;
  private musicOn = false;
  private track: Track = 'menu';
  /** changement de boucle programmé (instant du contexte audio) */
  private pending: { track: Track; at: number } | null = null;
  private nextNote = 0;
  private stepIdx = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** 0 = calme … 1 = boss ; suit `intensityTarget` en douceur */
  private intensity = 0;
  private intensityTarget = 0;

  /** Crée / réveille le contexte audio (doit suivre un geste de l'utilisateur). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      // Réverbération : réponse impulsionnelle générée (bruit qui décroît), toujours la même.
      const rev = ctx.createConvolver();
      rev.buffer = this.impulse(2.6, 2.4);
      this.revIn = ctx.createGain();
      this.revIn.connect(rev);
      rev.connect(this.master);
      // Écho à la croche pointée, assourdi à chaque retour.
      const dly = ctx.createDelay(2);
      dly.delayTime.value = STEP * 3;
      const fb = ctx.createGain();
      fb.gain.value = 0.36;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 2600;
      this.dlyIn = ctx.createGain();
      this.dlyIn.connect(dly);
      dly.connect(damp);
      damp.connect(fb);
      fb.connect(dly);
      damp.connect(this.master);

      this.sfx = this.bus(this.master, this.revIn, this.dlyIn);
      this.musicLp = ctx.createBiquadFilter();
      this.musicLp.type = 'lowpass';
      this.musicLp.frequency.value = 20000;
      this.musicLp.connect(this.master);
      this.musicFade = ctx.createGain();
      this.musicFade.connect(this.musicLp);
      this.music = this.bus(this.musicFade, this.revIn, this.dlyIn);
      this.intro = this.bus(this.sfx.out, this.sfx.rev, this.sfx.dly);

      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let seed = 1234567;
      for (let i = 0; i < len; i++) {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
        d[i] = (seed / 4294967296) * 2 - 1;
      }
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private bus(out: AudioNode, rev: AudioNode, dly: AudioNode): Bus {
    const ctx = this.ctx!;
    const b = { out: ctx.createGain(), rev: ctx.createGain(), dly: ctx.createGain() };
    b.out.connect(out);
    b.rev.connect(rev);
    b.dly.connect(dly);
    return b;
  }

  private impulse(sec: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    let seed = 99;
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
        d[i] = ((seed / 4294967296) * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return b;
  }

  setVolume(v: number): void {
    this.volume = v;
    this.applyVolumes();
  }
  setMusicVolume(v: number): void {
    this.musicVolume = v;
    this.applyVolumes();
  }
  setSfxVolume(v: number): void {
    this.sfxVolume = v;
    this.applyVolumes();
  }
  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolumes();
  }
  isMuted(): boolean {
    return this.muted;
  }
  /** Baisse la musique (pause, menus). */
  setDuck(d: number): void {
    this.duck = d;
    this.applyVolumes();
  }
  /** Intensité voulue pour la musique de partie (0 = calme … 1 = boss). */
  setIntensity(v: number): void {
    this.intensityTarget = v;
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.music || !this.sfx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, 0.03);
    this.setBus(this.music, this.musicVolume * 0.5 * this.duck, 0.1);
    this.setBus(this.sfx, 0.9 * (this.sfxVolume / 0.8), 0.03);
  }

  private setBus(b: Bus, g: number, tc: number): void {
    const t = this.ctx!.currentTime;
    for (const n of [b.out, b.rev, b.dly]) {
      n.gain.cancelScheduledValues(t);
      n.gain.setTargetAtTime(g, t, tc);
    }
  }

  private env(p: AudioParam, t: number, dur: number, gain: number, o: ToneOpts): void {
    const a = o.attack ?? 0.005;
    // Sans ça, le gain vaut 1 jusqu'au premier événement : selon l'arrondi, le son démarre un
    // échantillon trop tôt, à plein volume, et claque.
    p.value = 0;
    if (o.shape === 'lin') {
      const rel = o.release ?? dur - a;
      p.setValueAtTime(0, t);
      p.linearRampToValueAtTime(gain, t + a);
      if (dur - rel > a) p.setValueAtTime(gain, t + dur - rel);
      p.linearRampToValueAtTime(0, t + dur);
    } else {
      p.setValueAtTime(0.0001, t);
      p.exponentialRampToValueAtTime(gain, t + a);
      p.exponentialRampToValueAtTime(0.0001, t + dur);
    }
  }

  /** Branche un son enveloppé sur son bus (panoramique, envois). */
  private route(node: AudioNode, bus: Bus, t: number, dur: number, o: ToneOpts): void {
    const ctx = this.ctx!;
    let n = node;
    if (o.pan !== undefined) {
      const p = ctx.createStereoPanner();
      if (Array.isArray(o.pan)) {
        p.pan.setValueAtTime(o.pan[0], t);
        p.pan.linearRampToValueAtTime(o.pan[1], t + dur);
      } else p.pan.value = o.pan;
      n.connect(p);
      n = p;
    }
    n.connect(bus.out);
    for (const [amount, dest] of [
      [o.rev, bus.rev],
      [o.dly, bus.dly],
    ] as const) {
      if (!amount) continue;
      const g = ctx.createGain();
      g.gain.value = amount;
      n.connect(g);
      g.connect(dest);
    }
  }

  private filter(node: AudioNode, t: number, dur: number, f: Filter): BiquadFilterNode {
    const b = this.ctx!.createBiquadFilter();
    b.type = f.type;
    b.frequency.setValueAtTime(f.freq, t);
    if (f.f1 !== undefined) b.frequency.exponentialRampToValueAtTime(f.f1, t + dur);
    if (f.q !== undefined) b.Q.value = f.q;
    node.connect(b);
    return b;
  }

  private tone(wave: Wave, f0: number, f1: number, dur: number, gain: number, when = 0, o: ToneOpts = {}): GainNode | null {
    const ctx = this.ctx;
    const bus = o.bus ?? this.sfx;
    if (!ctx || !bus) return null;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) {
      const end = t + (o.glideTime ?? dur);
      if (o.glide === 'lin') osc.frequency.linearRampToValueAtTime(f1, end);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), end);
    }
    if (o.detune) osc.detune.value = o.detune;
    const src: AudioNode = o.filter ? this.filter(osc, t, dur, o.filter) : osc;
    const g = ctx.createGain();
    this.env(g.gain, t, dur, gain, o);
    src.connect(g);
    this.route(g, bus, t, dur, o);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    return g;
  }

  private noiseHit(dur: number, gain: number, type: BiquadFilterType, f0: number, f1 = f0, when = 0, o: ToneOpts = {}): void {
    const ctx = this.ctx;
    const bus = o.bus ?? this.sfx;
    if (!ctx || !this.noise || !bus) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.filter(src, t, dur, { type, freq: f0, f1: f1 !== f0 ? Math.max(20, f1) : undefined, q: o.q });
    const g = ctx.createGain();
    this.env(g.gain, t, dur, gain, o);
    f.connect(g);
    this.route(g, bus, t, dur, o);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name: SfxName | UiSfx, v = 0): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const th = THROTTLE[name as SfxName];
    if (th !== undefined) {
      if (now - (this.last[name] ?? -1) < th) return;
      this.last[name] = now;
    }
    switch (name) {
      case 'shoot':
        this.tone('square', 900, 420, 0.06, 0.035, 0, { filter: lp(3000) });
        break;
      case 'laser':
        this.tone('sawtooth', 1400, 300, 0.25, 0.05, 0, { filter: lp(2500) });
        break;
      case 'mine':
        this.tone('triangle', 300, 520, 0.09, 0.07);
        break;
      case 'boomerang':
        this.tone('sine', 480, 760, 0.12, 0.05);
        this.tone('sine', 760, 480, 0.12, 0.04, 0.12);
        break;
      case 'zap':
        this.noiseHit(0.08, 0.08, 'bandpass', 3500);
        this.tone('square', 1600, 900, 0.06, 0.03);
        break;
      case 'ring':
        this.tone('sine', 240, 70, 0.3, 0.12);
        this.noiseHit(0.25, 0.05, 'lowpass', 1200, 200);
        break;
      case 'hit':
        this.noiseHit(0.025, 0.035, 'highpass', 2500);
        break;
      case 'kill': {
        const p = 600 + Math.random() * 300;
        this.tone('triangle', p, p * 2, 0.05, 0.045);
        break;
      }
      case 'gem': {
        const f = 880 * Math.pow(2, Math.min(v, 24) / 24);
        this.tone('sine', f, f * 1.01, 0.07, 0.045);
        break;
      }
      case 'hurt':
        this.tone('sawtooth', 170 * (v < 1 ? 1.5 : 1), 60, 0.18, v < 1 ? 0.05 : 0.13, 0, { filter: lp(900) });
        break;
      case 'levelup':
        [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.12, 0.05, i * 0.07, { filter: lp(3500) }));
        break;
      case 'explosion': {
        const big = v > 80;
        this.noiseHit(big ? 0.5 : 0.3, big ? 0.22 : 0.14, 'lowpass', 1400, 90);
        this.tone('sine', 120, 40, 0.3, big ? 0.2 : 0.1);
        break;
      }
      case 'boss':
        for (let i = 0; i < 3; i++) {
          this.tone('sawtooth', 220, 330, 0.3, 0.07, i * 0.6, { filter: lp(1800) });
          this.tone('sawtooth', 330, 220, 0.3, 0.07, i * 0.6 + 0.3, { filter: lp(1800) });
        }
        this.tone('sine', 55, 45, 1.8, 0.2);
        break;
      case 'bossDead':
        this.noiseHit(1.2, 0.25, 'lowpass', 2500, 60);
        [392, 523, 659, 784].forEach((f, i) => this.tone('triangle', f, f, 0.5, 0.06, 0.2 + i * 0.12));
        break;
      case 'chest':
        [1320, 1760, 2093, 2637].forEach((f, i) => this.tone('sine', f, f, 0.18, 0.04, i * 0.06));
        break;
      case 'heal':
        this.tone('sine', 520, 780, 0.22, 0.05);
        break;
      case 'pickup':
        this.tone('triangle', 700, 1400, 0.1, 0.06);
        break;
      case 'death':
        this.tone('sawtooth', 420, 40, 1.3, 0.15, 0, { filter: lp(1500) });
        this.noiseHit(1.0, 0.15, 'lowpass', 3000, 80);
        break;
      case 'enemyShot':
        this.tone('square', v ? 260 : 340, v ? 200 : 300, 0.05, 0.018);
        break;
      case 'fusion':
        [262, 330, 392, 523, 659, 784].forEach((f, i) => this.tone('sawtooth', f, f * 1.005, 0.6, 0.035, i * 0.05, { filter: lp(2600) }));
        this.noiseHit(0.6, 0.08, 'highpass', 4000);
        break;
      case 'bomb':
        this.noiseHit(0.8, 0.3, 'lowpass', 3000, 60);
        this.tone('sine', 90, 30, 0.6, 0.25);
        break;
      case 'magnet':
        this.tone('sine', 300, 1500, 0.4, 0.06);
        break;
      case 'fuse':
        this.tone('square', 1000, 1000, 0.04, 0.02);
        break;
      case 'alert':
        this.tone('triangle', 660, 660, 0.1, 0.05);
        this.tone('triangle', 440, 440, 0.12, 0.05, 0.12);
        break;
      case 'shotDown':
        this.tone('square', 1500, 700, 0.04, 0.02, 0, { filter: lp(3500) });
        break;
      case 'shatter':
        // Verre qui se brise : souffle aigu et deux tintements
        this.noiseHit(0.12, 0.06, 'highpass', 5000);
        this.tone('sine', 2600, 2400, 0.08, 0.03);
        this.tone('sine', 3400, 3100, 0.06, 0.02, 0.03);
        break;
      case 'clock':
        // Tic-tac qui ralentit, sur une note grave qui descend
        [0, 0.22, 0.5, 0.86].forEach((t, i) => this.tone('square', i % 2 ? 1250 : 1650, i % 2 ? 1200 : 1600, 0.03, 0.04, t, { filter: lp(4000) }));
        this.tone('sine', 220, 110, 1.1, 0.08);
        break;
      case 'clone':
        this.tone('sine', 440, 660, 0.25, 0.05);
        this.tone('sine', 446, 666, 0.25, 0.05, 0.05);
        break;
      case 'blink':
        // Distorsion qui « aspire » puis claque
        this.tone('sawtooth', 1400, 180, 0.16, 0.04, 0, { filter: lp(2400) });
        this.noiseHit(0.1, 0.05, 'highpass', 3000);
        break;
      case 'wave':
        // Gong court : une vague arrive
        this.tone('triangle', 330, 330, 0.25, 0.06);
        this.tone('triangle', 495, 495, 0.35, 0.05, 0.1);
        break;
      case 'hatch':
        this.tone('square', 900, 1500, 0.06, 0.025, 0, { filter: lp(3000) });
        this.noiseHit(0.06, 0.04, 'highpass', 4000);
        break;
      case 'bossLaser':
        // Rayon qui monte en puissance puis balaie
        this.tone('sawtooth', 120, 480, 0.9, 0.07, 0, { filter: lp(1800) });
        this.tone('square', 240, 960, 0.9, 0.03, 0, { filter: lp(2400) });
        break;
      case 'cage':
        // Murs qui sortent du sol
        this.noiseHit(0.5, 0.12, 'lowpass', 900, 80);
        [0, 0.08, 0.16].forEach((t) => this.tone('square', 160, 120, 0.07, 0.05, t));
        break;
      case 'revive':
        this.noiseHit(0.5, 0.12, 'lowpass', 2000, 120);
        [392, 494, 587, 784, 988].forEach((f, i) => this.tone('triangle', f, f, 0.5, 0.06, 0.1 + i * 0.07));
        break;
      // Interface « holo-mécanique » : clics secs d'écran tactile, petit choc grave pour valider.
      case 'uiMove':
        this.noiseHit(0.012, 0.05, 'highpass', 5000);
        this.tone('sine', 2400, 2400, 0.015, 0.02);
        break;
      case 'ui':
        this.noiseHit(0.015, 0.07, 'highpass', 4000);
        this.tone('sine', 180, 90, 0.08, 0.12);
        this.tone('triangle', 1760, 1760, 0.12, 0.03, 0.02);
        break;
      case 'uiBack':
        this.noiseHit(0.015, 0.07, 'highpass', 4000);
        this.tone('triangle', 1320, 660, 0.1, 0.03);
        break;
      case 'powerOn':
        // Fin de l'intro : montée électrique puis accord, comme un néon qui s'allume en grand.
        this.tone('sawtooth', 70, 420, 0.45, 0.06, 0, { filter: lp(1400) });
        this.noiseHit(0.25, 0.06, 'highpass', 3500);
        [262, 392, 523, 784].forEach((f, i) => this.tone('triangle', f, f, 0.7, 0.045, 0.28 + i * 0.05));
        break;
    }
  }

  // ---------------- Intro ----------------
  /**
   * Toute la bande-son de l'intro, programmée d'un coup au moment où le joueur allume l'écran :
   * allumage cathodique, essaim en tourbillon qui forme le logo, grésillement de chaque lettre.
   */
  playIntro(): void {
    const ctx = this.ctx;
    const bus = this.intro;
    if (!ctx || !bus || this.muted) return;
    this.setBus(bus, 1, 0.01);
    const o = { bus };
    const swarm = INTRO_TIMING.crt / 1000;
    const letters = swarm + INTRO_TIMING.swarm / 1000;

    // 1. Télé cathodique : claquement, « thoum » de démagnétisation, grésillement, l'image s'ouvre.
    this.noiseHit(0.03, 0.35, 'highpass', 1500, 1500, 0, o);
    this.tone('square', 140, 50, 0.04, 0.12, 0, { ...o, filter: lp(800) });
    const hum = this.tone('sawtooth', 60, 52, 1.2, 0.2, 0.04, { ...o, filter: lp(280), attack: 0.02 });
    if (hum) {
      const t = ctx.currentTime;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 9;
      const depth = ctx.createGain();
      depth.gain.value = 0.08;
      lfo.connect(depth);
      depth.connect(hum.gain);
      lfo.start(t);
      lfo.stop(t + 1.3);
    }
    this.tone('sine', 60, 50, 1.0, 0.18, 0.04, o);
    this.noiseHit(0.5, 0.05, 'bandpass', 5000, 2500, 0.05, { ...o, q: 1.5 });
    this.noiseHit(0.65, 0.07, 'lowpass', 400, 7000, 0.45, { ...o, shape: 'lin', attack: 0.45, release: 0.2 });
    this.tone('sine', 11000, 11000, 2.2, 0.01, 0.45, { ...o, shape: 'lin', attack: 0.3 });

    // 2. L'essaim : deux souffles qui tournent d'une oreille à l'autre de plus en plus vite, puis impact.
    const dur = INTRO_TIMING.swarm / 1000;
    const t0 = ctx.currentTime + swarm;
    for (const [f0, f1, side] of [
      [300, 3200, 1],
      [500, 4500, -1],
    ]) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = this.filter(src, t0, dur, { type: 'bandpass', freq: f0, f1, q: 4 });
      const g = ctx.createGain();
      this.env(g.gain, t0, dur, 0.14, { shape: 'lin', attack: dur - 0.1, release: 0.1 });
      bp.connect(g);
      const p = ctx.createStereoPanner();
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(1.5, t0);
      lfo.frequency.exponentialRampToValueAtTime(9, t0 + dur);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0.85 * side, t0);
      depth.gain.linearRampToValueAtTime(0, t0 + dur);
      lfo.connect(depth);
      depth.connect(p.pan);
      g.connect(p);
      p.connect(bus.out);
      src.start(t0);
      lfo.start(t0);
      src.stop(t0 + dur + 0.1);
      lfo.stop(t0 + dur + 0.1);
    }
    this.tone('sine', 100, 400, dur, 0.04, swarm, { ...o, shape: 'lin', attack: dur - 0.1, release: 0.1 });
    this.tone('sine', 85, 35, 0.6, 0.3, letters, o);
    this.noiseHit(0.5, 0.1, 'lowpass', 4000, 150, letters, { ...o, rev: 0.4 });

    // 3. Les lettres : chaque vacillement grésille, la lettre bourdonne une fois allumée.
    for (let i = 0; i < 5; i++)
      FLICK.forEach((f, k) => {
        const at = letters + (i * INTRO_TIMING.letterGap) / 1000 + f;
        const lit = k === FLICK.length - 1;
        const pan = (i - 2) * 0.3;
        this.noiseHit(0.05, 0.06, 'bandpass', 3500, 3500, at, { ...o, q: 3, pan });
        this.tone('sawtooth', 100, 100, lit ? 0.35 : 0.07, lit ? 0.06 : 0.04, at, { ...o, filter: lp(900), pan });
        if (lit) this.tone('sine', 150, 100, 0.1, 0.05, at, o);
      });
  }

  /** Coupe ce qui reste de la bande-son de l'intro (intro passée). */
  stopIntro(): void {
    if (this.intro) this.setBus(this.intro, 0, 0.04);
  }

  // ---------------- Musique ----------------
  startMusic(track: Track = this.track): void {
    if (!this.ctx) return;
    if (this.musicOn) {
      if (track !== this.track) this.switchTrack(track, false);
      return;
    }
    this.musicOn = true;
    this.track = track;
    this.pending = null;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.stepIdx = 0;
    this.intensity = this.intensityTarget;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stopMusic(): void {
    this.musicOn = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Lancement d'une partie : un claquement, la musique en cours se ferme (filtre) pendant une montée
   * de souffle, puis impact : la musique de partie démarre pile dessus.
   */
  startGame(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.musicOn) {
      this.startMusic('game');
      return;
    }
    const rise = START_RISE;
    if (!this.muted) {
      this.noiseHit(0.08, 0.1, 'lowpass', 1200);
      this.tone('sine', 120, 50, 0.25, 0.12);
      this.noiseHit(rise, 0.09, 'bandpass', 300, 6000, 0, { shape: 'lin', attack: rise - 0.05, release: 0.05, q: 1.5 });
      this.tone('sawtooth', 110, 880, rise, 0.035, 0, { filter: { type: 'lowpass', freq: 600, f1: 4000 }, shape: 'lin', attack: rise - 0.05, release: 0.05 });
      this.tone('sine', 90, 35, 0.6, 0.3, rise);
      this.noiseHit(0.5, 0.12, 'lowpass', 5000, 200, rise, { rev: 0.4 });
      [69, 76, 81].forEach((n) => this.tone('triangle', midi(n), midi(n), 0.8, 0.025, rise, { rev: 0.5 }));
    }
    this.switchTrack('game', true, rise);
  }

  /** Change de boucle : en filtrant (montée vers l'impact) ou par un court fondu. */
  switchTrack(track: Track, sweep: boolean, delay = 0.3): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicLp || !this.musicFade) return;
    if (!this.musicOn) {
      this.startMusic(track);
      return;
    }
    const t = ctx.currentTime;
    const at = t + delay;
    const f = this.musicLp.frequency;
    const g = this.musicFade.gain;
    f.cancelScheduledValues(t);
    g.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    g.setValueAtTime(g.value, t);
    if (sweep) f.exponentialRampToValueAtTime(250, at);
    else g.linearRampToValueAtTime(0, at);
    f.setValueAtTime(20000, at);
    g.setValueAtTime(sweep ? 1 : 0, at);
    if (!sweep) g.linearRampToValueAtTime(1, at + 0.15);
    this.pending = { track, at };
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicOn) return;
    if (this.musicVolume <= 0.001 || this.muted) {
      this.nextNote = ctx.currentTime + 0.05;
      if (this.pending && this.pending.at <= ctx.currentTime) this.takePending();
      return;
    }
    while (this.nextNote < ctx.currentTime + 0.12) {
      if (this.pending && this.nextNote >= this.pending.at - 0.001) {
        this.nextNote = Math.max(this.pending.at, ctx.currentTime);
        this.takePending();
      }
      // L'intensité suit sa cible en quelques secondes ; le boss la fait sauter d'un coup.
      const target = this.intensityTarget;
      this.intensity = target >= 0.95 ? target : this.intensity + (target - this.intensity) * 0.04;
      const when = this.nextNote - ctx.currentTime;
      if (this.track === 'menu') this.menuNote(this.stepIdx, when);
      else this.gameNote(this.stepIdx, when, this.intensity);
      this.nextNote += STEP;
      this.stepIdx = (this.stepIdx + 1) % LOOP_STEPS;
    }
  }

  private takePending(): void {
    if (!this.pending) return;
    this.track = this.pending.track;
    this.pending = null;
    this.stepIdx = 0;
    this.intensity = this.intensityTarget;
  }

  // Instruments
  private kick(when: number, g: number): void {
    const bus = this.music;
    this.tone('sine', 150, 42, 0.24, g, when, { bus, glideTime: 0.12 });
    this.noiseHit(0.012, g * 0.25, 'highpass', 3000, 3000, when, { bus });
  }
  private hat(when: number, g: number, open = false): void {
    this.noiseHit(open ? 0.16 : 0.035, g, 'highpass', 7500, 7500, when, { bus: this.music });
  }
  private clap(when: number, g: number): void {
    const bus = this.music;
    for (const d of [0, 0.011, 0.022]) this.noiseHit(0.02, g, 'bandpass', 1600, 1600, when + d, { bus, q: 1.2 });
    this.noiseHit(0.18, g * 0.6, 'bandpass', 1400, 1400, when + 0.03, { bus, q: 1, rev: 0.35 });
  }
  private bass(n: number, when: number, dur: number, g: number, cut: number): void {
    this.tone('sawtooth', midi(n), midi(n), dur, g, when, { bus: this.music, filter: { type: 'lowpass', freq: cut, q: 2 } });
  }

  /** Menu : la boucle historique (basse, arpège, kick, charleston), sans mélodie. */
  private menuNote(step: number, when: number): void {
    const bus = this.music;
    const chord = LOOP[Math.floor(step / 16) % 4];
    const s16 = step % 16;
    if (s16 % 2 === 0) {
      const b = chord[0] - 24 + (s16 % 8 === 6 ? 12 : 0);
      this.tone('sawtooth', midi(b), midi(b), 0.2, 0.09, when, { bus, filter: lp(500) });
      const a = chord[(s16 >> 1) % 3] + (s16 >= 8 ? 12 : 0);
      this.tone('square', midi(a), midi(a), 0.12, 0.022, when, { bus, filter: lp(1800) });
    }
    if (s16 % 4 === 0) this.tone('sine', 120, 40, 0.18, 0.1, when, { bus });
    if (s16 % 4 === 2) this.noiseHit(0.04, 0.025, 'highpass', 7000, 7000, when, { bus });
  }

  /**
   * Partie : 8 mesures (A puis B), sans mélodie. L'intensité ajoute des couches : charleston (25 %),
   * arpège rapide et clap (50 %), basse en double-croches (75 %), puis basse doublée et galop pour le boss.
   */
  private gameNote(step: number, when: number, I: number): void {
    const bus = this.music;
    const chord = GAME_PROG[Math.floor(step / 16)];
    const s16 = step % 16;
    const boss = I >= 0.95;
    if (I >= 0.75 || s16 % 2 === 0) {
      const n = chord[0] - 24 + (s16 % 8 === 6 ? 12 : 0);
      this.bass(n, when, I >= 0.75 ? 0.11 : 0.2, 0.085, 500 + I * 300);
      if (boss) this.tone('square', midi(n + 12), midi(n + 12), 0.1, 0.025, when, { bus, filter: lp(1400) });
    }
    const fast = I >= 0.5;
    if (fast || s16 % 2 === 0) {
      const n = chord[(s16 >> (fast ? 0 : 1)) % 3] + (s16 >= 8 ? 12 : 0);
      this.tone('square', midi(n), midi(n), 0.12, fast ? 0.026 : 0.02, when, { bus, filter: lp(fast ? 3000 : 1800), dly: 0.12 });
    }
    if (s16 % 4 === 0) this.kick(when, 0.1 + I * 0.12);
    if (boss && s16 % 4 === 3) this.kick(when, 0.12);
    if (I >= 0.25 && s16 % 4 === 2) this.hat(when, 0.035, boss);
    if (I >= 0.25 && s16 % 2 === 1) this.hat(when, 0.012);
    if (I >= 0.5 && (s16 === 4 || s16 === 12)) this.clap(when, 0.06);
  }
}
