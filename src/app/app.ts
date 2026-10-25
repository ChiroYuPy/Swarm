/**
 * Application: wires sim, rendering, input, audio, UI and storage together.
 * Loop: fixed-step simulation (60 Hz, accumulator) decoupled from rendering (interpolation).
 */
import {
  createGame,
  step,
  isAwaitingChoice,
  makeScoreRecord,
  computeScore,
  choiceCode,
  swapCode,
  INPUT_SWAP_CANCEL,
  isZeroTimeCode,
  aimCode,
  InputLog,
  ReplayCursor,
  INPUT_USE,
  type GameConfig,
  type GameState,
  type Offer,
  type ScoreRecord,
} from '../sim';
import { debugBigBuild, debugSpawnHorde } from '../sim/debug';
import { DIFFICULTIES } from '../data/difficulty';
import { botInput } from '../ai/bot';
import { Renderer } from '../render/renderer';
import { Effects } from '../render/effects';
import { AudioEngine, START_RISE } from '../audio/audio';
import { InputManager, type UiAction } from '../input/input';
import { UI, type AppApi, type BuildInfo, type DeathInfo, type RunInfo } from '../ui/ui';
import { randomSeed } from '../ui/seeds';
import { isLocale, setLocale } from '../i18n';
import { bestScore, loadSave, recordScore, writeSave, type SandboxSetup, type SaveData, type Settings } from '../storage/storage';
import { MenuDemo } from './demo';
import { buildInfo, ownedLevel, runInfo, swapInfo } from './info';
import { cameraZoom, landingFx } from './drop';
import { FpsMeter, MENU_CATCHUP, PLAY_CATCHUP, STEP_MS, musicIntensity } from './loop';

type Mode = 'menu' | 'playing' | 'levelup' | 'paused' | 'victory' | 'dying' | 'dead' | 'replay';

const params = new URLSearchParams(location.search);

export class App implements AppApi {
  save: SaveData = loadSave();
  /** config of the current run (the seed stays internal: it is used for the replay) */
  private config: GameConfig = { seed: randomSeed(), difficulty: this.save.difficulty };
  /** best score to beat shown in the HUD (same difficulty) */
  private bestAtStart = 0;

  private mode: Mode = 'menu';
  private pauseFrom: Mode = 'playing';
  private state: GameState;
  private demo = true;
  private readonly menuDemo: MenuDemo;
  /** start of the hero's fall (performance.now), -1 outside the fall */
  private dropAt = -1;
  private readonly log = new InputLog();
  /** last finished run, replayable from the end screen (in memory only) */
  private lastRun: { config: GameConfig; codes: Uint8Array } | null = null;
  private replay: { cursor: ReplayCursor; speed: number } | null = null;
  /** the active item was requested (Space): applied on the next sim step */
  private usePending = false;
  private acc = 0;
  private last = performance.now();
  private deathTimer = 0;
  private deathTotal = 1;
  /** avoids recording the same run twice */
  private runFinished = false;
  /** the victory screen was shown for this run (it only comes once) */
  private victoryShown = false;
  private readonly fps = new FpsMeter();
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
    // The canvas only uses a font that is already loaded: preload it for the HUD.
    for (const f of ['500 13px "Chakra Petch"', '600 13px "Chakra Petch"', '700 30px "Chakra Petch"']) void document.fonts?.load(f).catch(() => {});
    if (params.get('fps') === '1') this.save.settings.showFps = true;
    // ?lang=en: language override (kept like any other setting once the options are touched).
    const langParam = params.get('lang');
    if (isLocale(langParam)) this.save.settings.language = langParam;
    // Applies the language too, before the first screen is drawn.
    this.applySettings(this.save.settings, false);

    // Demo game played by the bot behind the menu, prepared during the intro.
    this.menuDemo = new MenuDemo('DEMO-NEONAWAK', (next) => {
      if (this.mode === 'menu') {
        this.state = next;
        this.fx.reset(this.state.seed);
      }
    });
    this.state = this.menuDemo.state;
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

    // ?seed=…&difficulty=…: test tools only.
    const seedParam = params.get('seed');
    if (seedParam) this.config.seed = seedParam;
    const dParam = params.get('difficulty');
    if (dParam !== null) this.config.difficulty = Number(dParam);
    if (params.get('autostart') === '1' || this.botMode || this.stressMode) {
      document.body.classList.remove('booting');
      this.start(this.config);
    } else this.ui.showIntro();

    (window as unknown as { __swarm: App }).__swarm = this;
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------- AppApi ----------------
  uiSound(kind: 'ui' | 'uiMove' | 'uiBack'): void {
    this.audio.unlock();
    this.audio.play(kind);
  }

  /** The player turns the screen on: this gesture unlocks sound, the whole intro soundtrack starts. */
  introPowerOn(): void {
    this.audio.unlock();
    this.audio.playIntro();
  }

  /** End of the intro (or intro skipped): the menu comes in, the music starts with a chord. */
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

  /** Sandbox: free settings, never ranked. The settings are kept for next time. */
  playSandbox(setup: SandboxSetup): void {
    this.save.sandbox = setup;
    writeSave(this.save);
    // Copy: the Sandbox screen edits its settings in place, the run (and its replay) must not follow.
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
    this.victoryShown = false;
    this.usePending = false;
    this.log.clear();
    this.fx.reset(this.state.seed);
    this.acc = 0;
    this.last = performance.now();
    this.mode = 'playing';
    // Arrival: the hero is dropped from above and lands right on the music's impact.
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

  continueEndless(): void {
    if (this.mode !== 'victory') return;
    this.mode = 'playing';
    this.ui.hide();
    this.audio.setDuck(1);
    this.acc = 0;
    this.last = performance.now();
  }

  quit(): void {
    // Quitting = end of run (the score is recorded, like a death).
    this.finishRun();
  }

  toMenu(screen: 'menu' | 'sandbox' = 'menu'): void {
    this.mode = 'menu';
    this.replay = null;
    this.demo = true;
    this.state = this.menuDemo.state;
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
    setLocale(s.language);
    document.documentElement.lang = s.language;
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

  // ---------------- Logic ----------------
  private onAction(a: UiAction): void {
    this.ui.noteActivity();
    // During the intro, any key (or gamepad button) turns the screen on, then skips it.
    if (this.ui.introActive) {
      this.ui.introInput();
      return;
    }
    // Attract mode: the first input brings the menu back, with no other effect.
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
        if (this.dropAt >= 0) break; // during the fall, the run has not started yet
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
        else if (a === 'back') this.cancelSwap();
        break;
      case 'paused':
        if (a === 'pause' || a === 'back') {
          if (this.ui.screen === 'settings' || this.ui.screen === 'codex') {
            this.uiSound('uiBack');
            this.ui.showPause(this.buildInfo(), this.runInfo());
          } else this.resume();
        } else if (dir) this.ui.navigate(dir);
        else if (a === 'confirm') this.ui.activate();
        break;
      case 'victory':
        if (dir) this.ui.navigate(dir);
        else if (a === 'confirm') this.ui.activate();
        else if (a === 'pause' || a === 'back') this.continueEndless();
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
        // Enter / Esc: skip the end animation
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

  /** `instant`: automatic pause, the screen is shown without animation (see UI.mount). */
  private pause(instant = false): void {
    if (this.mode !== 'playing' && this.mode !== 'levelup') return;
    this.pauseFrom = this.mode;
    this.mode = 'paused';
    this.ui.showPause(this.buildInfo(), this.runInfo(), instant);
    this.audio.setDuck(0.35);
  }

  private autoPause(): void {
    if (params.get('nopause') === '1' || !this.save.settings.autoPause) return; // test tool / setting
    if (this.mode === 'playing' || this.mode === 'levelup') this.pause(true);
  }

  private showLevelUp(): void {
    const p = this.state.players[0];
    const owned = (o: Offer): number => ownedLevel(p, o);
    this.ui.showLevelUp(p.offerLevel, p.offers, owned, { weapons: p.weapons.length, passives: p.passives.length }, swapInfo(p));
  }

  /** Weapon swap: a recorded zero-time step, then the offers are shown again. */
  startSwap(slot: number): void {
    this.swapStep(swapCode(slot));
  }
  cancelSwap(): void {
    if (this.state.players[0].swapSlot >= 0) this.swapStep(INPUT_SWAP_CANCEL);
  }
  private swapStep(code: number): void {
    if (this.mode !== 'levelup') return;
    this.log.push(code);
    step(this.state, [code]);
    this.fx.consume(this.state);
    this.showLevelUp();
  }

  private runInfo(): RunInfo {
    return runInfo(this.state, this.save, !!this.config.sandbox);
  }

  private buildInfo(): BuildInfo {
    return buildInfo(this.state);
  }

  /** One in-game simulation step. The active item is a recorded zero-time step just before it. */
  private simStep(): void {
    const s = this.state;
    if (this.usePending && !this.botMode) {
      this.usePending = false;
      if (s.players[0].activeItem >= 0) {
        this.log.push(INPUT_USE);
        step(s, [INPUT_USE]);
        this.fx.consume(s);
      }
    }
    // Manual aim: a recorded zero-time step, only when the aim direction changes.
    if (!this.botMode) {
      const aim = this.input.aim();
      if (aim !== s.players[0].aim) {
        const c = aimCode(aim);
        this.log.push(c);
        step(s, [c]);
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
    // The last boss of the run is down: go on (endless) or end here.
    if (s.won && !this.victoryShown && !this.botMode) {
      this.victoryShown = true;
      this.mode = 'victory';
      this.usePending = false;
      this.audio.setDuck(0.5);
      this.ui.showVictory(this.runInfo());
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
      won: this.state.won,
    };
    this.mode = 'dead';
    this.audio.setIntensity(0);
    this.ui.showDeath(info);
  }

  private endReplay(): void {
    this.replay = null;
    this.showDeathScreen(makeScoreRecord(this.state, new Date().toISOString()), 0, 0, true);
  }

  /** End of the fall: shake, shockwaves and sparks around the hero. */
  private land(): void {
    this.dropAt = -1;
    landingFx(this.fx, this.state.players[0]);
  }

  /** Fall progress (0 → 1), or -1 outside the fall. */
  private dropProgress(now: number): number {
    return this.dropAt < 0 || this.mode !== 'playing' ? -1 : Math.min(1, (now - this.dropAt) / (START_RISE * 1000));
  }

  private frame(now: number): void {
    const dtMs = Math.min(250, Math.max(0, now - this.last));
    this.last = now;
    const dt = dtMs / 1000;
    this.time += dt;
    this.fps.sample(dtMs);
    this.input.poll();

    let alpha = 1;
    switch (this.mode) {
      case 'menu': {
        this.menuDemo.prepare(this.time);
        this.ui.idleTick(now);
        // Background demo. During the intro (and while it is prepared) it is hidden and frozen.
        if (this.ui.introActive || this.menuDemo.next?.state === this.state) {
          this.acc = 0;
          break;
        }
        this.acc += dtMs;
        let n = 0;
        while (this.acc >= STEP_MS && n++ < MENU_CATCHUP) {
          this.acc -= STEP_MS;
          const s = this.state;
          step(s, [botInput(s, 0)]);
          this.fx.consume(s);
        }
        if (n >= MENU_CATCHUP) this.acc = 0;
        alpha = this.acc / STEP_MS;
        break;
      }
      case 'playing': {
        // Fall: the simulation waits for the landing (nothing is recorded, the run stays identical).
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
          if (++n >= PLAY_CATCHUP) {
            // Machine too slow: do not catch up forever (otherwise each frame costs even more than the
            // previous one and everything lags, cursor included). The game slows down a little instead.
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
          if (isZeroTimeCode(c)) continue; // choices and items take no time
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

    // Dynamic resolution: only while the run is really going (not paused, not in the menu).
    if (this.mode === 'playing' && this.dropAt < 0) this.renderer.adaptResolution(dtMs);
    // Cosmetic effects keep fading even when paused (the sim itself is frozen).
    this.fx.update(this.mode === 'dying' ? dt * 0.4 : dt);
    // Fall: the whole area is seen from above, then the camera dives faster and faster onto the hero.
    const drop = this.dropProgress(now);
    const zoom = cameraZoom(drop, this.demo);
    this.renderer.render(this.state, alpha, this.fx, {
      quality: this.save.settings.quality,
      time: this.time,
      // When paused, the summary repeats everything the HUD shows: hide it.
      hud: !this.demo && drop < 0 && this.mode !== 'paused' && this.mode !== 'victory',
      zoom,
      drop: drop >= 0 ? drop : undefined,
      showFps: this.save.settings.showFps && !this.demo,
      fps: this.fps.fps,
      resolution: this.renderer.resolution,
      replay: this.replay ? { speed: this.replay.speed, progress: this.replay.cursor.progress } : null,
      best: this.bestAtStart,
      sandbox: this.state.sandbox,
      difficulty: DIFFICULTIES[this.state.difficulty],
      deathFade: this.mode === 'dying' ? 1 - Math.max(0, this.deathTimer) / this.deathTotal : 0,
    });
    document.body.classList.toggle('demo', this.demo);
    document.body.classList.toggle('dead', this.mode === 'dead');
    document.body.classList.toggle('paused', this.mode === 'paused' || this.mode === 'victory');
    requestAnimationFrame((t) => this.frame(t));
  }
}
