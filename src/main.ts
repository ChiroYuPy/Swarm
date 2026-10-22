/**
 * Application : relie sim, rendu, entrées, audio, interface et stockage.
 * Boucle : simulation à pas fixe (60 Hz, accumulateur) découplée du rendu (interpolation).
 */
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import './style.css';
import {
  createGame,
  step,
  isAwaitingChoice,
  makeScoreRecord,
  computeScore,
  choiceCode,
  isZeroTimeCode,
  InputLog,
  ReplayCursor,
  weaponDef,
  OFFER_WEAPON,
  OFFER_PASSIVE,
  INPUT_USE,
  TICK_RATE,
  type GameConfig,
  type GameState,
  type SandboxConfig,
  type Offer,
  type ScoreRecord,
} from './sim';
import { debugBigBuild, debugSpawnHorde } from './sim/debug';
import { PASSIVES } from './data/passives';
import { DIFFICULTIES } from './data/difficulty';
import { botInput } from './ai/bot';
import { Renderer } from './render/renderer';
import { Effects } from './render/effects';
import { AudioEngine, START_RISE } from './audio/audio';
import { InputManager, type UiAction } from './input/input';
import { UI, type AppApi, type BuildInfo, type DeathInfo } from './ui/ui';
import { randomSeed } from './ui/seeds';
import { statDetails } from './render/hud';
import { bestScore, loadSave, recordScore, writeSave, type SandboxSetup, type SaveData, type Settings } from './storage/storage';

type Mode = 'menu' | 'playing' | 'levelup' | 'paused' | 'dying' | 'dead' | 'replay';

const STEP_MS = 1000 / TICK_RATE;
const params = new URLSearchParams(location.search);

/**
 * Démo derrière le menu : le bot joue une partie « bac à sable » déjà lancée (minute 6, ennemis plus
 * nombreux, héros équipé et invincible) pour qu'il y ait tout de suite un vrai essaim à l'écran.
 */
const DEMO_SANDBOX: SandboxConfig = {
  invincible: true,
  level: 14,
  startMinute: 6,
  enemyMul: 2.5,
  enemies: null,
  bosses: false,
  might: 1,
  xp: 1,
  weapons: [
    { id: 'aura', level: 4 },
    { id: 'boomerang', level: 4 },
    { id: 'laser', level: 3 },
    { id: 'confetti', level: 4 },
  ],
  passives: [
    { id: 'aimant', level: 3 },
    { id: 'chaussettes', level: 2 },
  ],
  item: null,
};
/** la démo est d'abord avancée de 15 s (hors écran, par petits bouts) pour que l'essaim soit déjà là */
const DEMO_WARMUP = 15 * TICK_RATE;
/** au-delà, l'essaim devient trop dense : on en prépare une nouvelle */
const DEMO_LIFETIME = 3 * 60 * TICK_RATE;
/** temps de calcul accordé par image à la préparation d'une démo (ms) */
const DEMO_BUDGET_MS = 4;

/** caméra au début de la chute (fraction du zoom normal) */
const DROP_ZOOM = 0.28;

const newDemo = (seed: string): GameState => createGame({ seed, difficulty: 1, sandbox: DEMO_SANDBOX });

/** Intensité de la musique de partie : monte avec le temps et le nombre d'ennemis, 1 pendant un boss. */
function musicIntensity(s: GameState): number {
  if (s.bossId >= 0) return 1;
  const minutes = s.tick / TICK_RATE / 60;
  return Math.min(0.9, Math.max(Math.min(0.7, 0.1 + minutes * 0.06), s.enemyCount / 350));
}

class App implements AppApi {
  save: SaveData = loadSave();
  /** configuration de la partie en cours (la seed reste interne : elle sert à la relecture) */
  private config: GameConfig = { seed: randomSeed(), difficulty: this.save.difficulty };
  /** record à battre affiché dans le HUD (même difficulté) */
  private bestAtStart = 0;

  private mode: Mode = 'menu';
  private pauseFrom: Mode = 'playing';
  private state: GameState;
  private demo = true;
  /** partie de démonstration (gardée pendant les parties : le menu la reprend où elle en était) */
  private demoState: GameState;
  /** démo en préparation et pas de simulation qu'il lui reste avant d'être montrée */
  private demoNext: { state: GameState; left: number } | null = null;
  private demoSwapping = false;
  /** début de la chute du héros (performance.now), -1 hors chute */
  private dropAt = -1;
  private readonly log = new InputLog();
  /** dernière partie terminée, rejouable depuis l'écran de fin (en mémoire uniquement) */
  private lastRun: { config: GameConfig; codes: Uint8Array } | null = null;
  private replay: { cursor: ReplayCursor; speed: number } | null = null;
  /** l'objet activable a été demandé (Espace) : appliqué au prochain pas de sim */
  private usePending = false;
  private acc = 0;
  private last = performance.now();
  private deathTimer = 0;
  private deathTotal = 1;
  /** évite d'enregistrer deux fois la même partie */
  private runFinished = false;
  private fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private time = 0;
  private readonly botMode = params.get('bot') === '1';
  private readonly stressMode = params.get('stress') === '1';

  private readonly renderer: Renderer;
  private readonly fx: Effects;
  private readonly audio = new AudioEngine();
  private readonly input = new InputManager(window);
  private readonly ui: UI;

  constructor() {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.fx = new Effects({
      sfx: (name, v) => {
        if (this.mode !== 'menu') this.audio.play(name, v);
      },
      toast: (text, color) => {
        if (this.mode !== 'menu') this.ui.toast(text, color);
      },
    });
    this.ui = new UI(this);
    // Le canvas n'utilise une police que si elle est déjà chargée : on la précharge pour le HUD.
    for (const f of ['500 13px "Chakra Petch"', '600 13px "Chakra Petch"', '700 30px "Chakra Petch"']) void document.fonts?.load(f).catch(() => {});
    if (params.get('fps') === '1') this.save.settings.showFps = true;
    this.applySettings(this.save.settings, false);

    // Partie de démonstration jouée par le bot derrière le menu, préparée pendant l'intro.
    this.demoState = this.state = newDemo('DEMO-NEONAWAK');
    this.demoNext = { state: this.state, left: DEMO_WARMUP };
    this.fx.reset(this.state.seed);

    this.input.onAction((a) => this.onAction(a));
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('blur', () => this.autoPause());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.autoPause();
    });
    const unlock = () => {
      this.audio.unlock();
      this.audio.startMusic(this.mode === 'menu' ? 'menu' : 'game');
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    // ?seed=…&difficulty=… : outils de test uniquement.
    const seedParam = params.get('seed');
    if (seedParam) this.config.seed = seedParam;
    const dParam = params.get('difficulty');
    if (dParam !== null) this.config.difficulty = Number(dParam);
    if (params.get('autostart') === '1' || this.botMode || this.stressMode) {
      document.body.classList.remove('booting');
      this.start(this.config);
    } else this.ui.showIntro();

    (window as unknown as { __neonawak: App }).__neonawak = this;
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------- AppApi ----------------
  uiSound(kind: 'ui' | 'uiMove' | 'uiBack'): void {
    this.audio.unlock();
    this.audio.play(kind);
  }

  /** Le joueur allume l'écran : ce geste autorise le son, toute la bande-son de l'intro part. */
  introPowerOn(): void {
    this.audio.unlock();
    this.audio.playIntro();
  }

  /** Fin de l'intro (ou intro passée) : le menu arrive, la musique démarre avec un accord. */
  introDone(): void {
    this.audio.unlock();
    this.audio.stopIntro();
    this.audio.startMusic('menu');
    this.audio.play('powerOn');
  }

  play(difficulty: number): void {
    this.save.difficulty = difficulty;
    writeSave(this.save);
    this.start({ seed: randomSeed(), difficulty });
  }

  /** Bac à sable : réglages libres, jamais classé. Les réglages sont gardés pour la prochaine fois. */
  playSandbox(setup: SandboxSetup): void {
    this.save.sandbox = setup;
    writeSave(this.save);
    // Copie : l'écran Sandbox modifie ses réglages en place, la partie (et sa relecture) ne doit pas suivre.
    this.start({ seed: randomSeed(), difficulty: setup.difficulty, sandbox: structuredClone(setup.rules) });
  }

  retry(): void {
    if (this.config.sandbox) this.start({ ...this.config, seed: randomSeed() });
    else this.play(this.config.difficulty ?? this.save.difficulty);
  }

  private start(cfg: GameConfig): void {
    this.config = cfg;
    this.state = createGame(cfg);
    this.bestAtStart = cfg.sandbox ? 0 : bestScore(this.save, this.state.difficulty);
    if (this.stressMode) {
      debugBigBuild(this.state);
      debugSpawnHorde(this.state, 800);
    }
    this.demo = false;
    this.replay = null;
    this.runFinished = false;
    this.usePending = false;
    this.log.clear();
    this.fx.reset(this.state.seed);
    this.acc = 0;
    this.last = performance.now();
    this.mode = 'playing';
    // Arrivée : le héros est lâché d'en haut et atterrit pile sur l'impact de la musique.
    this.dropAt = this.botMode || this.stressMode ? -1 : performance.now();
    this.ui.hide();
    this.input.clear();
    this.audio.unlock();
    this.audio.setIntensity(0);
    this.audio.startGame();
    this.audio.setDuck(1);
  }

  pickOffer(i: number): void {
    if (this.mode !== 'levelup') return;
    const s = this.state;
    if (i < 0 || i >= s.players[0].offers.length) return;
    this.ui.markPicked(i);
    const code = choiceCode(i);
    this.log.push(code);
    step(s, [code]);
    this.fx.consume(s);
    if (isAwaitingChoice(s)) this.showLevelUp();
    else {
      this.mode = 'playing';
      this.ui.hide();
      this.acc = 0;
      this.last = performance.now();
      this.audio.setDuck(1);
    }
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    this.mode = this.pauseFrom;
    this.audio.setDuck(1);
    if (this.mode === 'levelup') this.showLevelUp();
    else this.ui.hide();
    this.acc = 0;
    this.last = performance.now();
  }

  quit(): void {
    // Abandonner = fin de partie (le score est enregistré, comme une mort).
    this.finishRun();
  }

  toMenu(screen: 'menu' | 'sandbox' = 'menu'): void {
    this.mode = 'menu';
    this.replay = null;
    this.demo = true;
    this.state = this.demoState;
    this.fx.reset(this.state.seed);
    this.audio.setIntensity(0);
    this.audio.switchTrack('menu', false);
    this.audio.setDuck(1);
    if (screen === 'sandbox') this.ui.showSandbox();
    else this.ui.showMenu();
  }

  watchLastRun(): void {
    const run = this.lastRun;
    if (!run) return;
    this.replay = { cursor: new ReplayCursor(run.config, run.codes), speed: 1 };
    this.state = this.replay.cursor.state;
    this.demo = false;
    this.fx.reset(this.state.seed);
    this.acc = 0;
    this.last = performance.now();
    this.mode = 'replay';
    this.ui.hide();
    this.audio.unlock();
    this.audio.setIntensity(0);
    this.audio.startMusic('game');
  }

  applySettings(s: Settings, persist = true): void {
    const qualityChanged = s.quality !== this.save.settings.quality;
    this.save.settings = s;
    this.audio.setVolume(s.volume);
    this.audio.setMusicVolume(s.music);
    this.audio.setSfxVolume(s.sfx);
    this.audio.setMuted(s.muted);
    this.fx.damageNumbers = s.damageNumbers;
    this.fx.lowQuality = s.quality === 'low';
    this.fx.shakeEnabled = s.shake;
    if (qualityChanged || !persist) this.renderer.setQuality(s.quality);
    if (persist) writeSave(this.save);
  }

  // ---------------- Logique ----------------
  private onAction(a: UiAction): void {
    this.ui.noteActivity();
    // Pendant l'intro, n'importe quelle touche (ou bouton de manette) allume l'écran puis la passe.
    if (this.ui.introActive) {
      this.ui.introInput();
      return;
    }
    // Mode démo : le premier geste ramène le menu, sans autre effet.
    if (this.ui.attractActive) {
      this.ui.exitAttract();
      return;
    }
    if (a === 'mute') {
      this.ui.toggleMute();
      return;
    }
    if (a === 'fps') {
      this.applySettings({ ...this.save.settings, showFps: !this.save.settings.showFps });
      return;
    }
    const dir = a === 'left' || a === 'up' || a === 'right' || a === 'down' ? a : null;
    switch (this.mode) {
      case 'playing':
        if (this.dropAt >= 0) break; // pendant la chute, la partie n'a pas encore commencé
        if (a === 'pause') this.pause();
        else if (a === 'use' || a === 'confirm') this.usePending = true;
        break;
      case 'levelup':
        if (a === 'pause') this.pause();
        else if (a === 'choice1') this.pickOffer(0);
        else if (a === 'choice2') this.pickOffer(1);
        else if (a === 'choice3') this.pickOffer(2);
        else if (a === 'left' || a === 'up') this.ui.moveCard(-1);
        else if (a === 'right' || a === 'down') this.ui.moveCard(1);
        else if (a === 'confirm') this.ui.confirmCard();
        break;
      case 'paused':
        if (a === 'pause' || a === 'back') {
          if (this.ui.screen === 'settings' || this.ui.screen === 'codex') {
            this.uiSound('uiBack');
            this.ui.showPause(this.buildInfo());
          } else this.resume();
        } else if (dir) this.ui.navigate(dir);
        else if (a === 'confirm') this.ui.activate();
        break;
      case 'replay':
        if (!this.replay) break;
        if (a === 'pause' || a === 'back') this.toMenu();
        else if (a === 'speed1') this.replay.speed = 1;
        else if (a === 'speed2') this.replay.speed = 2;
        else if (a === 'speed4') this.replay.speed = 4;
        break;
      case 'menu':
        if ((a === 'pause' || a === 'back') && this.ui.screen !== 'menu') {
          this.uiSound('uiBack');
          this.ui.showMenu();
        }
        else if (dir) this.ui.navigate(dir);
        else if (a === 'confirm') this.ui.activate();
        break;
      case 'dying':
        // Entrée / Échap : passer l'animation de fin
        if (a === 'confirm' || a === 'pause' || a === 'back') this.deathTimer = 0;
        break;
      case 'dead':
        if (dir) this.ui.navigate(dir);
        else if (a === 'confirm' && !this.ui.activate()) this.retry();
        else if (a === 'pause' || a === 'back') {
          this.uiSound('uiBack');
          this.toMenu();
        }
        break;
    }
  }

  private pause(): void {
    if (this.mode !== 'playing' && this.mode !== 'levelup') return;
    this.pauseFrom = this.mode;
    this.mode = 'paused';
    this.ui.showPause(this.buildInfo());
    this.audio.setDuck(0.35);
  }

  private autoPause(): void {
    if (params.get('nopause') === '1' || !this.save.settings.autoPause) return; // outil de test / réglage
    if (this.mode === 'playing' || this.mode === 'levelup') this.pause();
  }

  private showLevelUp(): void {
    const p = this.state.players[0];
    const owned = (o: Offer): number => {
      if (o.kind === OFFER_WEAPON) return p.weapons.find((w) => w.def === o.id)?.level ?? 0;
      if (o.kind === OFFER_PASSIVE) return p.passives.find((x) => x.def === o.id)?.level ?? 0;
      return 0;
    };
    this.ui.showLevelUp(p.offerLevel, p.offers, owned, { weapons: p.weapons.length, passives: p.passives.length });
  }

  private buildInfo(): BuildInfo {
    const p = this.state.players[0];
    return {
      weapons: p.weapons.map((w) => ({ id: weaponDef(w.def).id, level: w.level, fusion: !!weaponDef(w.def).fusion })),
      passives: p.passives.map((x) => ({ id: PASSIVES[x.def].id, level: x.level })),
      stats: statDetails(p, this.state.tick),
      might: p.stats.might,
      cooldownMul: p.stats.cooldownMul,
    };
  }

  /** Un pas de simulation en jeu. L'objet activable est un pas « zéro » enregistré juste avant. */
  private simStep(): void {
    const s = this.state;
    if (this.usePending && !this.botMode) {
      this.usePending = false;
      if (s.players[0].activable >= 0) {
        this.log.push(INPUT_USE);
        step(s, [INPUT_USE]);
        this.fx.consume(s);
      }
    }
    const code = this.botMode ? botInput(s, 0) : this.input.sampleCode();
    this.log.push(code);
    step(s, [code]);
    this.fx.consume(s);
    this.audio.setIntensity(musicIntensity(s));
    if (s.over) {
      this.mode = 'dying';
      this.deathTimer = this.deathTotal = 2.2;
      this.audio.setDuck(0.3);
      return;
    }
    if (!this.botMode && isAwaitingChoice(s)) {
      this.mode = 'levelup';
      this.usePending = false;
      this.audio.setDuck(0.6);
      this.showLevelUp();
    }
  }

  private finishRun(): void {
    if (this.runFinished) return;
    this.runFinished = true;
    const s = this.state;
    const ranked = !this.botMode && !this.stressMode && !this.config.sandbox;
    const rec = makeScoreRecord(s, new Date().toISOString());
    const bestBefore = bestScore(this.save, s.difficulty);
    let rank = 0;
    if (ranked) {
      rank = recordScore(this.save, rec);
      writeSave(this.save);
    }
    this.lastRun = { config: { ...this.config }, codes: this.log.toArray() };
    this.showDeathScreen(rec, bestBefore, rank, false);
  }

  private showDeathScreen(rec: ScoreRecord, bestBefore: number, rank: number, isReplay: boolean): void {
    const score = computeScore(this.state);
    const info: DeathInfo = {
      record: rec,
      bossKills: score.bossKills,
      bestBefore,
      rank,
      build: this.buildInfo(),
      canReplay: !!this.lastRun,
      isReplay,
      sandbox: !!this.config.sandbox,
      survived: this.state.players[0].alive,
    };
    this.mode = 'dead';
    this.audio.setIntensity(0);
    this.ui.showDeath(info);
  }

  private endReplay(): void {
    this.replay = null;
    this.showDeathScreen(makeScoreRecord(this.state, new Date().toISOString()), 0, 0, true);
  }

  /** Fin de la chute : secousse, ondes de choc et éclats autour du héros. */
  private land(): void {
    this.dropAt = -1;
    const p = this.state.players[0];
    this.fx.addShake(12);
    this.fx.ring(p.x, p.y, 70, 1, 0.4);
    this.fx.ring(p.x, p.y, 200, 1, 0.65);
    this.fx.ring(p.x, p.y, 340, 0, 0.8);
    this.fx.burst(p.x, p.y, 40, 1, 620, 0.6, 3);
    this.fx.burst(p.x, p.y, 18, 0, 380, 0.45, 2);
    this.fx.flash = 0.2;
    this.fx.flashColor = '#38f6ff';
  }

  /** Avancement de la chute (0 → 1), ou -1 hors chute. */
  private dropProgress(now: number): number {
    return this.dropAt < 0 || this.mode !== 'playing' ? -1 : Math.min(1, (now - this.dropAt) / (START_RISE * 1000));
  }

  /**
   * Prépare la démo par petits bouts (quelques ms par image) : la première pendant l'intro, puis une
   * nouvelle quand l'essaim de la démo en cours devient trop dense. La relève arrive en fondu.
   */
  private prepareDemo(): void {
    const cur = this.demoState;
    if (!this.demoNext && cur.tick - DEMO_SANDBOX.startMinute * 60 * TICK_RATE > DEMO_LIFETIME + DEMO_WARMUP)
      this.demoNext = { state: newDemo(`DEMO-${Math.floor(this.time)}`), left: DEMO_WARMUP };
    const next = this.demoNext;
    if (!next || this.demoSwapping) return;
    const t0 = performance.now();
    while (next.left > 0 && performance.now() - t0 < DEMO_BUDGET_MS) {
      step(next.state, [botInput(next.state, 0)]);
      next.left--;
    }
    if (next.left > 0) return;
    if (next.state === cur) {
      this.demoNext = null;
      return;
    }
    // Relève : la démo s'efface (transition d'opacité de #game), on échange, elle revient.
    this.demoSwapping = true;
    document.body.classList.add('demo-swap');
    setTimeout(() => {
      this.demoSwapping = false;
      this.demoNext = null;
      this.demoState = next.state;
      if (this.mode === 'menu') {
        this.state = next.state;
        this.fx.reset(this.state.seed);
      }
      document.body.classList.remove('demo-swap');
    }, 1000);
  }

  private frame(now: number): void {
    const dtMs = Math.min(250, Math.max(0, now - this.last));
    this.last = now;
    const dt = dtMs / 1000;
    this.time += dt;
    this.fpsAcc += dtMs;
    this.fpsFrames++;
    if (this.fpsAcc >= 500) {
      this.fps = (this.fpsFrames * 1000) / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    this.input.poll();

    let alpha = 1;
    switch (this.mode) {
      case 'menu': {
        this.prepareDemo();
        this.ui.idleTick(now);
        // Démo en arrière-plan. Pendant l'intro (et sa préparation) elle est masquée et figée.
        if (this.ui.introActive || this.demoNext?.state === this.state) {
          this.acc = 0;
          break;
        }
        this.acc += dtMs;
        let n = 0;
        while (this.acc >= STEP_MS && n++ < 4) {
          this.acc -= STEP_MS;
          const s = this.state;
          step(s, [botInput(s, 0)]);
          this.fx.consume(s);
        }
        if (n >= 4) this.acc = 0;
        alpha = this.acc / STEP_MS;
        break;
      }
      case 'playing': {
        // Chute : la simulation attend l'atterrissage (rien n'est enregistré, la partie reste identique).
        if (this.dropAt >= 0) {
          if (now - this.dropAt < START_RISE * 1000) {
            this.acc = 0;
            break;
          }
          this.land();
        }
        this.acc += dtMs;
        let n = 0;
        while (this.acc >= STEP_MS) {
          this.acc -= STEP_MS;
          this.simStep();
          if (this.mode !== 'playing') {
            this.acc = 0;
            break;
          }
          if (++n >= 8) {
            // Machine trop lente : on ne rattrape pas indéfiniment.
            this.acc = 0;
            break;
          }
        }
        alpha = this.mode === 'playing' ? this.acc / STEP_MS : 1;
        break;
      }
      case 'replay': {
        const r = this.replay;
        if (!r) break;
        this.acc += dtMs * r.speed;
        let n = 0;
        while (this.acc >= STEP_MS && n < 40) {
          const c = r.cursor.next();
          if (c < 0) break;
          this.fx.consume(this.state);
          this.audio.setIntensity(musicIntensity(this.state));
          if (isZeroTimeCode(c)) continue; // choix et objets ne consomment pas de temps
          this.acc -= STEP_MS;
          n++;
        }
        if (n >= 40) this.acc = 0;
        alpha = Math.min(1, this.acc / STEP_MS);
        if (r.cursor.done) {
          this.mode = 'dying';
          this.deathTimer = this.deathTotal = 1.6;
        }
        break;
      }
      case 'dying':
        this.deathTimer -= dt;
        if (this.deathTimer <= 0) {
          if (this.replay) this.endReplay();
          else this.finishRun();
        }
        break;
    }

    // Les effets cosmétiques continuent de s'estomper même en pause (la sim, elle, est figée).
    this.fx.update(this.mode === 'dying' ? dt * 0.4 : dt);
    // Chute : on voit toute la zone de haut, puis la caméra plonge de plus en plus vite sur le héros.
    const drop = this.dropProgress(now);
    const zoom = drop >= 0 ? DROP_ZOOM + (1 - DROP_ZOOM) * drop * drop * drop : this.demo ? 0.8 : 1;
    this.renderer.render(this.state, alpha, this.fx, {
      quality: this.save.settings.quality,
      time: this.time,
      hud: !this.demo && drop < 0,
      zoom,
      drop: drop >= 0 ? drop : undefined,
      showFps: this.save.settings.showFps && !this.demo,
      fps: this.fps,
      replay: this.replay ? { speed: this.replay.speed, progress: this.replay.cursor.progress } : null,
      best: this.bestAtStart,
      sandbox: this.state.sandbox,
      difficulty: DIFFICULTIES[this.state.difficulty],
      deathFade: this.mode === 'dying' ? 1 - Math.max(0, this.deathTimer) / this.deathTotal : 0,
    });
    document.body.classList.toggle('demo', this.demo);
    document.body.classList.toggle('dead', this.mode === 'dead');
    requestAnimationFrame((t) => this.frame(t));
  }
}

new App();
