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
  type Offer,
  type ScoreRecord,
} from './sim';
import { debugBigBuild, debugSpawnHorde } from './sim/debug';
import { PASSIVES } from './data/passives';
import { DIFFICULTIES } from './data/difficulty';
import { botInput } from './ai/bot';
import { Renderer } from './render/renderer';
import { Effects } from './render/effects';
import { AudioEngine } from './audio/audio';
import { InputManager, type UiAction } from './input/input';
import { UI, type AppApi, type BuildInfo, type DeathInfo } from './ui/ui';
import { randomSeed } from './ui/seeds';
import { statDetails } from './render/hud';
import { bestScore, loadSave, recordScore, writeSave, type SaveData, type Settings } from './storage/storage';

type Mode = 'menu' | 'playing' | 'levelup' | 'paused' | 'dying' | 'dead' | 'replay';

const STEP_MS = 1000 / TICK_RATE;
const params = new URLSearchParams(location.search);

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

    // Partie de démonstration jouée par le bot derrière le menu.
    this.state = createGame({ seed: 'DEMO-NEONAWAK' });
    this.fx.reset(this.state.seed);

    this.input.onAction((a) => this.onAction(a));
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('blur', () => this.autoPause());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.autoPause();
    });
    const unlock = () => {
      this.audio.unlock();
      this.audio.startMusic();
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
  uiSound(kind: 'ui' | 'uiMove'): void {
    this.audio.unlock();
    this.audio.play(kind);
  }

  /** Fin de l'intro : c'est le geste du joueur qui autorise le son, la musique démarre avec un accord. */
  introDone(): void {
    this.audio.unlock();
    this.audio.startMusic();
    this.audio.play('powerOn');
  }

  play(difficulty: number): void {
    this.save.difficulty = difficulty;
    writeSave(this.save);
    this.start({ seed: randomSeed(), difficulty });
  }

  retry(): void {
    this.play(this.config.difficulty ?? this.save.difficulty);
  }

  private start(cfg: GameConfig): void {
    this.config = cfg;
    this.state = createGame(cfg);
    this.bestAtStart = bestScore(this.save, this.state.difficulty);
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
    this.ui.hide();
    this.input.clear();
    this.audio.unlock();
    this.audio.startMusic();
    this.audio.setDuck(1);
    this.audio.intensity = 0;
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

  toMenu(): void {
    this.mode = 'menu';
    this.replay = null;
    this.demo = true;
    this.state = createGame({ seed: 'DEMO-NEONAWAK' });
    this.fx.reset(this.state.seed);
    this.audio.intensity = 0;
    this.audio.setDuck(1);
    this.ui.showMenu();
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
    this.audio.startMusic();
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
    // Pendant l'intro, n'importe quelle touche (ou bouton de manette) la termine, sans autre effet.
    if (this.ui.introActive) {
      this.ui.finishIntro();
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
          if (this.ui.screen === 'settings' || this.ui.screen === 'codex') this.ui.showPause(this.buildInfo());
          else this.resume();
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
        if ((a === 'pause' || a === 'back') && this.ui.screen !== 'menu') this.ui.showMenu();
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
        else if (a === 'pause' || a === 'back') this.toMenu();
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
    this.audio.intensity = s.bossId >= 0 ? 1 : 0;
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
    const ranked = !this.botMode && !this.stressMode;
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
    };
    this.mode = 'dead';
    this.audio.intensity = 0;
    this.ui.showDeath(info);
  }

  private endReplay(): void {
    this.replay = null;
    this.showDeathScreen(makeScoreRecord(this.state, new Date().toISOString()), 0, 0, true);
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
        // Démo en arrière-plan. Pendant l'intro elle est masquée et figée : elle démarre avec le menu.
        if (this.ui.introActive) {
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
          if (s.over) {
            this.state = createGame({ seed: `DEMO-${Math.floor(this.time)}` });
            this.fx.reset(this.state.seed);
          }
        }
        if (n >= 4) this.acc = 0;
        alpha = this.acc / STEP_MS;
        break;
      }
      case 'playing': {
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
          this.audio.intensity = this.state.bossId >= 0 ? 1 : 0;
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
    this.renderer.render(this.state, alpha, this.fx, {
      quality: this.save.settings.quality,
      time: this.time,
      hud: !this.demo,
      showFps: this.save.settings.showFps && !this.demo,
      fps: this.fps,
      replay: this.replay ? { speed: this.replay.speed, progress: this.replay.cursor.progress } : null,
      best: this.bestAtStart,
      difficulty: DIFFICULTIES[this.state.difficulty],
      deathFade: this.mode === 'dying' ? 1 - Math.max(0, this.deathTimer) / this.deathTotal : 0,
    });
    document.body.classList.toggle('demo', this.demo);
    document.body.classList.toggle('dead', this.mode === 'dead');
    requestAnimationFrame((t) => this.frame(t));
  }
}

new App();
