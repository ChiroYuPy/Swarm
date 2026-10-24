/**
 * First-load intro (standby, CRT power-on, particle swarm forming the logo, letter neon, menu unroll)
 * and the attract mode (demo taking the whole screen after a while idle on the menu). The intro and
 * attract state itself lives on the UI instance (ui.intro, ui.attract, ui.lastActivity).
 */
import { INTRO_TIMING } from '../../audio/audio';
import { t } from '../../i18n';
import { reducedMotion } from '../html';
import type { UI } from '../ui';

/** CRT power-on duration (ms), matching styles/intro.css. */
const CRT_MS = 1100;
/** start of the letters lighting up (ms after the screen turns on), matching letter-on in styles/intro.css */
const LETTERS_AT = INTRO_TIMING.crt + INTRO_TIMING.swarm;
/** the intro ends on its own once the logo is lit (last letter + a pause) */
const INTRO_END_MS = LETTERS_AT + 4 * INTRO_TIMING.letterGap + 600 + 600;
/** idle time on the menu before switching to attract mode (ms) */
const ATTRACT_MS = 20000;

// ---------- Intro (first load) ----------
/**
 * Intro in three stages:
 * 0. standby: black screen, an LED in the center, "Press to turn on". This gesture unlocks sound:
 *    the whole intro has sound;
 * 1. old-TV style power-on: the LED becomes a bright dot that stretches into a line,
 *    then the picture opens up to full screen;
 * 2. a particle swarm swirls in from every edge and forms the logo, whose
 *    letters then light up one by one like neon signs;
 * 3. the logo moves up into place and the menu buttons unroll (on their own, or as soon as a key is pressed).
 */
export function showIntro(ui: UI): void {
  const body = document.body;
  if (reducedMotion()) {
    body.classList.remove('booting');
    ui.showMenu();
    return;
  }
  // Captured before InputManager: during the intro, a key or click does nothing else.
  const onKey = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    ui.introInput();
  };
  const onPointer = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // The click that follows this gesture must not trigger anything else (a menu button, etc.).
    const block = (c: Event) => {
      c.preventDefault();
      c.stopPropagation();
    };
    window.addEventListener('click', block, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', block, true), 600);
    ui.introInput();
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onPointer, true);
  // Plain background during the intro: the demo game only appears with the menu.
  body.classList.add('intro-bg');
  // Black screen until the title font is loaded (otherwise the logo would visibly change font).
  const fontReady = document.fonts?.load('700 88px "Chakra Petch"') ?? Promise.resolve();
  const ready = Promise.race([fontReady, new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
  const intro: NonNullable<UI['intro']> = {
    stage: 'standby',
    ready,
    timers: [],
    stop: () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
      intro.timers.forEach((t) => clearTimeout(t));
    },
  };
  ui.intro = intro;
  void ready.then(() => {
    if (ui.intro !== intro || intro.stage !== 'standby') return;
    const sb = document.createElement('div');
    sb.className = 'standby';
    sb.innerHTML = `<i class="led"></i><p>${t('intro.standby')}</p>`;
    body.appendChild(sb);
  });
}

/** A key, click or gamepad button during the intro: turns the screen on, or skips the rest. */
export function introInput(ui: UI): void {
  const intro = ui.intro;
  if (!intro) return;
  if (intro.stage === 'on') {
    ui.finishIntro();
    return;
  }
  intro.stage = 'on';
  // Inside the gesture itself: that is what allows the browser to play sound.
  ui.app.introPowerOn();
  void intro.ready.then(() => {
    if (ui.intro !== intro) return;
    const body = document.body;
    document.querySelector('.standby')?.remove();
    ui.showMenu();
    const el = ui.screenEl!;
    // No slide: the screen is already in place when the picture turns on.
    el.classList.remove('enter-fwd');
    el.classList.add('intro');
    // The dot that becomes a line, then the two lines moving apart (see styles/intro.css).
    const lines = ['crt-line', 'crt-edge up', 'crt-edge down'].map((c) => {
      const d = document.createElement('div');
      d.className = c;
      body.appendChild(d);
      return d;
    });
    body.classList.remove('booting');
    body.classList.add('crt-on');
    const later = (fn: () => void, ms: number) => intro.timers.push(window.setTimeout(fn, ms));
    later(() => {
      lines.forEach((d) => d.remove());
      body.classList.remove('crt-on');
    }, CRT_MS);
    later(() => {
      const stopSwarm = swarmLogo(el);
      const stop = intro.stop;
      intro.stop = () => {
        stop();
        stopSwarm();
      };
    }, INTRO_TIMING.crt);
    later(() => ui.finishIntro(), INTRO_END_MS);
  });
}

/**
 * The swarm that forms the logo: particles in the enemies' colors spiral in from every edge
 * and settle on the letter shapes, then fade out as each letter lights up.
 * Returns a function that stops everything.
 */
function swarmLogo(screen: HTMLElement): () => void {
  const title = screen.querySelector<HTMLElement>('.title');
  const spans = [...(title?.querySelectorAll<HTMLElement>('span') ?? [])];
  if (!title || !spans.length) return () => {};
  const W = window.innerWidth;
  const H = window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.className = 'swarm-intro';
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d')!;

  // Targets: the letter shapes, at their on-screen position and size (enlarged logo included).
  const zoom = title.getBoundingClientRect().width / title.offsetWidth || 1;
  const size = parseFloat(getComputedStyle(title).fontSize) * zoom;
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const oc = off.getContext('2d', { willReadFrequently: true })!;
  oc.font = `700 ${size}px "Chakra Petch"`;
  oc.textBaseline = 'alphabetic';
  oc.fillStyle = '#fff';
  const rects = spans.map((sp) => sp.getBoundingClientRect());
  for (let i = 0; i < spans.length; i++) {
    const ascent = oc.measureText(spans[i].textContent ?? '').fontBoundingBoxAscent;
    oc.fillText(spans[i].textContent ?? '', rects[i].left, rects[i].top + ascent);
  }
  const x0 = Math.max(0, Math.floor(rects[0].left - 10));
  const y0 = Math.max(0, Math.floor(rects[0].top - 10));
  const x1 = Math.min(W, Math.ceil(rects[rects.length - 1].right + 10));
  const y1 = Math.min(H, Math.ceil(Math.max(...rects.map((r) => r.bottom)) + 10));
  const img = oc.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  const gap = Math.max(3, Math.round(size / 26));
  type P = { tx: number; ty: number; a: number; r: number; d: number; c: number; l: number };
  const ps: P[] = [];
  let seed = 7;
  const rnd = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 4294967296;
  };
  const reach = Math.hypot(W, H) * 0.6;
  for (let y = 0; y < y1 - y0; y += gap)
    for (let x = 0; x < x1 - x0; x += gap) {
      if (img[(y * (x1 - x0) + x) * 4 + 3] < 128) continue;
      const tx = x0 + x;
      const l = Math.max(0, rects.findIndex((r) => tx < r.right));
      ps.push({ tx, ty: y0 + y, a: rnd() * Math.PI * 2, r: reach * (1 + rnd() * 0.35), d: rnd() * 0.35, c: Math.floor(rnd() * 5), l });
    }
  const colors = ['#38f6ff', '#ff3df5', '#39ff7a', '#ffd23a', '#b48cff'];
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const T = INTRO_TIMING.swarm / 1000;
  const letterGap = INTRO_TIMING.letterGap / 1000;
  const start = performance.now();
  let raf = 0;
  const frame = () => {
    const t = (performance.now() - start) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Trails: the previous frame is partly erased.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${t < T ? 0.32 : 0.6})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of ps) {
      const k = Math.min(1, Math.max(0, (t - p.d) / (T - p.d)));
      const e = k * k * (3 - 2 * k);
      // Each letter's swarm fades out when the neon takes over (end of its power-on).
      const lit = T + p.l * letterGap + 0.35;
      const alpha = t < lit ? 1 : Math.max(0, 1 - (t - lit) / 0.3);
      if (alpha <= 0) continue;
      const rad = p.r * Math.pow(1 - e, 1.4);
      const ang = p.a + 5 * (1 - e);
      const x = p.tx + Math.cos(ang) * rad;
      const y = p.ty + Math.sin(ang) * rad;
      ctx.globalAlpha = alpha * (0.35 + 0.65 * Math.min(1, k * 3));
      ctx.fillStyle = e > 0.85 ? '#eafdff' : colors[p.c];
      const sz = e > 0.85 ? gap * 0.7 : 2;
      ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    // Shockwave when the swarm settles (together with the sound impact).
    if (t > T && t < T + 0.5) {
      const k = (t - T) / 0.5;
      ctx.globalAlpha = 0.6 * (1 - k);
      ctx.strokeStyle = '#38f6ff';
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, (x1 - x0) * (0.4 + k * 0.9), (y1 - y0) * (0.4 + k * 1.6), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (t < T + spans.length * letterGap + 1) raf = requestAnimationFrame(frame);
    else cv.remove();
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    cv.remove();
  };
}

/** Ends the intro (or skips it if still running) and reveals the menu. */
export function finishIntro(ui: UI): void {
  const intro = ui.intro;
  if (!intro) return;
  ui.intro = null;
  intro.stop();
  const body = document.body;
  // Skipped during power-on: the picture comes back at once, no black screen. The demo fades in.
  body.classList.remove('booting', 'crt-on', 'intro-bg');
  document.querySelectorAll('.crt-line, .crt-edge, .standby, .swarm-intro').forEach((d) => d.remove());
  ui.noteActivity();
  const el = ui.screenEl;
  if (ui.current !== 'menu' || !el?.classList.contains('intro')) {
    if (!ui.current) ui.showMenu();
    ui.app.introDone();
    return;
  }
  const brand = el.querySelector<HTMLElement>('.brand')!;
  const first = brand.getBoundingClientRect();
  el.classList.remove('intro');
  el.classList.add('intro-out');
  // The logo slides from the center to its place (FLIP: start from the old position).
  const last = brand.getBoundingClientRect();
  const dy = first.top + first.height / 2 - (last.top + last.height / 2);
  const sc = first.width / last.width;
  brand.animate([{ transform: `translateY(${dy}px) scale(${sc})` }, { transform: 'none' }], {
    duration: 650,
    easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
  });
  ui.home(el.querySelector<HTMLButtonElement>('.nav.primary'));
  ui.app.introDone();
}

// ---------- Attract mode (idle on the menu) ----------
/** Called every frame on the menu: after a while without input, the demo takes the whole screen. */
export function idleTick(ui: UI, now: number): void {
  if (ui.attract || ui.intro || ui.current !== 'menu' || reducedMotion()) return;
  if (now - ui.lastActivity < ATTRACT_MS) return;
  ui.attract = true;
  (document.activeElement as HTMLElement | null)?.blur();
  const hud = document.createElement('div');
  hud.className = 'attract-hud';
  hud.innerHTML = `<p class="attract-tag">${t('intro.attract')}</p>`;
  document.body.appendChild(hud);
  document.body.classList.add('attract');
}

export function exitAttract(ui: UI): void {
  if (!ui.attract) return;
  ui.attract = false;
  ui.noteActivity();
  document.body.classList.remove('attract');
  document.querySelector('.attract-hud')?.remove();
  ui.home(ui.screenEl?.querySelector<HTMLButtonElement>('.nav.primary'));
}
