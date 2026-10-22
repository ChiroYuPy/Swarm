/**
 * Audio 100 % synthétisé avec WebAudio : aucun fichier.
 * Effets courts (oscillateurs + bruit filtré) et une boucle « néon rétro » séquencée à la volée.
 */
import type { SfxName } from '../render/effects';

type Wave = OscillatorType;

const THROTTLE: Partial<Record<SfxName | 'ui', number>> = {
  shoot: 0.06,
  hit: 0.03,
  kill: 0.04,
  gem: 0.025,
  hurt: 0.12,
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
};

// La mineur : Am – F – C – G
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly last: Record<string, number> = {};
  private volume = 0.7;
  private musicVolume = 0.45;
  private sfxVolume = 0.8;
  private muted = false;
  private duck = 1;
  private musicOn = false;
  private nextNote = 0;
  private stepIdx = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** 0 = calme, 1 = boss */
  intensity = 0;

  /** Crée / réveille le contexte audio (doit suivre un geste de l'utilisateur). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.master);
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

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.musicBus || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, 0.03);
    this.musicBus.gain.setTargetAtTime(this.musicVolume * 0.5 * this.duck, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(0.9 * (this.sfxVolume / 0.8), t, 0.03);
  }

  private tone(
    wave: Wave,
    f0: number,
    f1: number,
    dur: number,
    gain: number,
    when = 0,
    bus: GainNode | null = this.sfxBus,
    filter?: { type: BiquadFilterType; freq: number },
  ): void {
    const ctx = this.ctx;
    if (!ctx || !bus) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type;
      f.frequency.value = filter.freq;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseHit(dur: number, gain: number, type: BiquadFilterType, f0: number, f1 = f0, when = 0, bus: GainNode | null = this.sfxBus): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !bus) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name: SfxName | 'ui' | 'uiMove' | 'powerOn', v = 0): void {
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
        this.tone('square', 900, 420, 0.06, 0.035, 0, this.sfxBus, { type: 'lowpass', freq: 3000 });
        break;
      case 'laser':
        this.tone('sawtooth', 1400, 300, 0.25, 0.05, 0, this.sfxBus, { type: 'lowpass', freq: 2500 });
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
        this.tone('sawtooth', 170 * (v < 1 ? 1.5 : 1), 60, 0.18, v < 1 ? 0.05 : 0.13, 0, this.sfxBus, { type: 'lowpass', freq: 900 });
        break;
      case 'levelup':
        [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.12, 0.05, i * 0.07, this.sfxBus, { type: 'lowpass', freq: 3500 }));
        break;
      case 'explosion': {
        const big = v > 80;
        this.noiseHit(big ? 0.5 : 0.3, big ? 0.22 : 0.14, 'lowpass', 1400, 90);
        this.tone('sine', 120, 40, 0.3, big ? 0.2 : 0.1);
        break;
      }
      case 'boss':
        for (let i = 0; i < 3; i++) {
          this.tone('sawtooth', 220, 330, 0.3, 0.07, i * 0.6, this.sfxBus, { type: 'lowpass', freq: 1800 });
          this.tone('sawtooth', 330, 220, 0.3, 0.07, i * 0.6 + 0.3, this.sfxBus, { type: 'lowpass', freq: 1800 });
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
        this.tone('sawtooth', 420, 40, 1.3, 0.15, 0, this.sfxBus, { type: 'lowpass', freq: 1500 });
        this.noiseHit(1.0, 0.15, 'lowpass', 3000, 80);
        break;
      case 'enemyShot':
        this.tone('square', v ? 260 : 340, v ? 200 : 300, 0.05, 0.018);
        break;
      case 'fusion':
        [262, 330, 392, 523, 659, 784].forEach((f, i) => this.tone('sawtooth', f, f * 1.005, 0.6, 0.035, i * 0.05, this.sfxBus, { type: 'lowpass', freq: 2600 }));
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
        this.tone('square', 1500, 700, 0.04, 0.02, 0, this.sfxBus, { type: 'lowpass', freq: 3500 });
        break;
      case 'shatter':
        // Verre qui se brise : souffle aigu et deux tintements
        this.noiseHit(0.12, 0.06, 'highpass', 5000);
        this.tone('sine', 2600, 2400, 0.08, 0.03);
        this.tone('sine', 3400, 3100, 0.06, 0.02, 0.03);
        break;
      case 'clock':
        // Tic-tac qui ralentit, sur une note grave qui descend
        [0, 0.22, 0.5, 0.86].forEach((t, i) => this.tone('square', i % 2 ? 1250 : 1650, i % 2 ? 1200 : 1600, 0.03, 0.04, t, this.sfxBus, { type: 'lowpass', freq: 4000 }));
        this.tone('sine', 220, 110, 1.1, 0.08);
        break;
      case 'clone':
        this.tone('sine', 440, 660, 0.25, 0.05);
        this.tone('sine', 446, 666, 0.25, 0.05, 0.05);
        break;
      case 'revive':
        this.noiseHit(0.5, 0.12, 'lowpass', 2000, 120);
        [392, 494, 587, 784, 988].forEach((f, i) => this.tone('triangle', f, f, 0.5, 0.06, 0.1 + i * 0.07));
        break;
      case 'ui':
        this.tone('square', 660, 990, 0.06, 0.04, 0, this.sfxBus, { type: 'lowpass', freq: 3000 });
        break;
      case 'uiMove':
        this.tone('triangle', 520, 520, 0.03, 0.025);
        break;
      case 'powerOn':
        // Fin de l'intro : montée électrique puis accord, comme un néon qui s'allume en grand.
        this.tone('sawtooth', 70, 420, 0.45, 0.06, 0, this.sfxBus, { type: 'lowpass', freq: 1400 });
        this.noiseHit(0.25, 0.06, 'highpass', 3500);
        [262, 392, 523, 784].forEach((f, i) => this.tone('triangle', f, f, 0.7, 0.045, 0.28 + i * 0.05));
        break;
    }
  }

  startMusic(): void {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.stepIdx = 0;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stopMusic(): void {
    this.musicOn = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicOn) return;
    if (this.musicVolume <= 0.001 || this.muted) {
      this.nextNote = ctx.currentTime + 0.05;
      return;
    }
    const stepDur = 60 / 112 / 4; // double-croches à 112 BPM
    while (this.nextNote < ctx.currentTime + 0.12) {
      this.note(this.stepIdx, this.nextNote - ctx.currentTime);
      this.nextNote += stepDur;
      this.stepIdx = (this.stepIdx + 1) % 64;
    }
  }

  private note(step: number, when: number): void {
    const bus = this.musicBus;
    const chord = CHORDS[Math.floor(step / 16) % 4];
    const s16 = step % 16;
    const hot = this.intensity > 0.5;
    // Basse
    if (s16 % 2 === 0) {
      const n = chord[0] - 24 + (s16 % 8 === 6 ? 12 : 0);
      this.tone('sawtooth', midi(n), midi(n), 0.2, 0.09, when, bus, { type: 'lowpass', freq: 500 });
    }
    // Arpège
    if (hot || s16 % 2 === 0) {
      const n = chord[(s16 >> (hot ? 0 : 1)) % 3] + (s16 >= 8 ? 12 : 0);
      this.tone('square', midi(n), midi(n), 0.12, hot ? 0.03 : 0.022, when, bus, { type: 'lowpass', freq: hot ? 3000 : 1800 });
    }
    // Grosse caisse et charleston quand ça chauffe
    if (s16 % 4 === 0) this.tone('sine', 120, 40, 0.18, hot ? 0.22 : 0.1, when, bus);
    if (s16 % 4 === 2) this.noiseHit(0.04, hot ? 0.05 : 0.025, 'highpass', 7000, 7000, when, bus);
  }
}
