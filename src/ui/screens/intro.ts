/**
 * First-load intro (standby, CRT power-on, particle swarm forming the logo, letter neon, menu unroll)
 * and the attract mode (demo taking the whole screen after a while idle on the menu). The intro and
 * attract state itself lives on the UI instance (ui.intro, ui.attract, ui.lastActivity).
 */
import { INTRO_TIMING } from '../../audio/audio';
import { reducedMotion } from '../html';
import type { UI } from '../ui';

/** Durée de l'allumage cathodique (ms), alignée sur style.css. */
const CRT_MS = 1100;
/** début de l'allumage des lettres (ms après l'allumage de l'écran), aligné sur letter-on dans style.css */
const LETTERS_AT = INTRO_TIMING.crt + INTRO_TIMING.swarm;
/** l'intro se termine seule une fois le logo allumé (dernière lettre + un temps de pose) */
const INTRO_END_MS = LETTERS_AT + 4 * INTRO_TIMING.letterGap + 600 + 600;
/** inactivité sur le menu avant de passer en mode démo (ms) */
const ATTRACT_MS = 20000;

// ---------- Intro (premier chargement) ----------
/**
 * Intro en trois temps :
 * 0. veille : écran noir, un voyant au centre, « Appuie pour allumer ». Ce geste autorise le son :
 *    toute l'intro est sonorisée ;
 * 1. allumage façon vieux téléviseur : le voyant devient un point lumineux qui s'étire en trait,
 *    puis l'image s'ouvre jusqu'à plein écran ;
 * 2. un essaim de particules arrive en tourbillon de tous les bords et forme le logo, dont les
 *    lettres s'allument ensuite une par une comme des néons ;
 * 3. le logo remonte à sa place et les boutons du menu se déroulent (seul, ou dès qu'on appuie).
 */
export function showIntro(ui: UI): void {
  const body = document.body;
  if (reducedMotion()) {
    body.classList.remove('booting');
    ui.showMenu();
    return;
  }
  // Capturées avant InputManager : pendant l'intro, une touche ou un clic ne fait rien d'autre.
  const onKey = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    ui.introInput();
  };
  const onPointer = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Le clic qui suit ce geste ne doit rien déclencher d'autre (un bouton du menu, etc.).
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
  // Fond uni pendant l'intro : la partie de démonstration n'apparaît qu'avec le menu.
  body.classList.add('intro-bg');
  // Écran noir tant que la police du titre n'est pas là (sinon on verrait le logo changer de police).
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
    sb.innerHTML = '<i class="led"></i><p>Appuie pour allumer</p>';
    body.appendChild(sb);
  });
}

/** Une touche, un clic ou un bouton de manette pendant l'intro : allume l'écran, ou passe la suite. */
export function introInput(ui: UI): void {
  const intro = ui.intro;
  if (!intro) return;
  if (intro.stage === 'on') {
    ui.finishIntro();
    return;
  }
  intro.stage = 'on';
  // Dans le geste lui-même : c'est ce qui autorise le navigateur à jouer du son.
  ui.app.introPowerOn();
  void intro.ready.then(() => {
    if (ui.intro !== intro) return;
    const body = document.body;
    document.querySelector('.standby')?.remove();
    ui.showMenu();
    const el = ui.screenEl!;
    // Pas de glissement : l'écran est déjà en place quand l'image s'allume.
    el.classList.remove('enter-fwd');
    el.classList.add('intro');
    // Le point qui devient trait, puis les deux lignes qui s'écartent (voir style.css).
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
 * L'essaim qui forme le logo : des particules aux couleurs des ennemis arrivent en spirale de
 * tous les bords et se posent sur le dessin des lettres, puis s'effacent quand chaque lettre
 * s'allume. Retourne de quoi tout arrêter.
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

  // Cibles : le dessin des lettres, à leur place et à leur taille à l'écran (logo agrandi compris).
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
    // Traînées : l'image précédente s'efface en partie.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${t < T ? 0.32 : 0.6})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of ps) {
      const k = Math.min(1, Math.max(0, (t - p.d) / (T - p.d)));
      const e = k * k * (3 - 2 * k);
      // Chaque lettre s'éteint côté essaim quand le néon prend le relais (fin de son allumage).
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
    // Onde de choc quand l'essaim se pose (en même temps que l'impact sonore).
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

/** Termine l'intro (ou la passe si elle est encore en cours) et révèle le menu. */
export function finishIntro(ui: UI): void {
  const intro = ui.intro;
  if (!intro) return;
  ui.intro = null;
  intro.stop();
  const body = document.body;
  // Passée pendant l'allumage : l'image se remet d'un coup, sans écran noir. La démo apparaît en fondu.
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
  // Le logo glisse du centre jusqu'à sa place (FLIP : on part de l'ancienne position).
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

// ---------- Mode démo (inactivité sur le menu) ----------
/** Appelé à chaque image sur le menu : passé un moment sans rien toucher, la démo prend tout l'écran. */
export function idleTick(ui: UI, now: number): void {
  if (ui.attract || ui.intro || ui.current !== 'menu' || reducedMotion()) return;
  if (now - ui.lastActivity < ATTRACT_MS) return;
  ui.attract = true;
  (document.activeElement as HTMLElement | null)?.blur();
  const hud = document.createElement('div');
  hud.className = 'attract-hud';
  hud.innerHTML = '<p class="attract-tag">Démo · appuie sur une touche</p>';
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
