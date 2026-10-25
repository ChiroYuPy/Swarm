/**
 * Neon cursor, as native cursor images: the system draws them, so the cursor never waits for a
 * slow frame of the game.
 * - in menus, an arrow (filled over what can be clicked);
 * - in game, a dot that hides when the mouse stops moving (it stays while manual aim is on);
 * - nothing during standby and power-on, nor with the keyboard in menus, nor with touch.
 */

/** In game, the dot hides after this long without movement (ms). */
const IDLE_MS = 1200;

const ACCENT = '#38f6ff';
const GLOW = `<filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="1.5" flood-color="${ACCENT}" flood-opacity="0.85"/></filter>`;
/** arrow outline, tip at (7, 6) = hotspot */
const ARROW = 'M 7 6 L 28 16.5 L 17.5 19 L 13.5 29.5 Z';

/** CSS `cursor` value: a 32×32 SVG with the neon glow, its hotspot, and a system fallback. */
function image(body: string, x: number, y: number, fallback: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${GLOW}<g filter="url(#g)">${body}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, ${fallback}`;
}

function arrow(fill: string, stroke: string): string {
  return image(`<path d="${ARROW}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/>`, 7, 6, 'default');
}

const CURSORS = {
  arrow: arrow('#08070f', ACCENT),
  hover: arrow('#228a93', '#eafdff'),
  dot: image(`<circle cx="16" cy="16" r="3" fill="${ACCENT}" stroke="#eafdff" stroke-width="1.5"/>`, 16, 16, 'crosshair'),
};

type CursorState = 'off' | 'arrow' | 'dot';

/** what can be clicked shows the filled arrow */
const CLICKABLE = ':is(button:not(:disabled), .track)';

function stylesheet(): string {
  const on = (state: CursorState) => `html[data-cursor='${state}']`;
  return [
    `${on('off')}, ${on('off')} * { cursor: none !important; }`,
    `${on('arrow')}, ${on('arrow')} * { cursor: ${CURSORS.arrow} !important; }`,
    `${on('arrow')} ${CLICKABLE}, ${on('arrow')} ${CLICKABLE} * { cursor: ${CURSORS.hover} !important; }`,
    `${on('dot')}, ${on('dot')} * { cursor: ${CURSORS.dot} !important; }`,
  ].join('\n');
}

export function initCursor(): void {
  const style = document.createElement('style');
  style.textContent = stylesheet();
  document.head.appendChild(style);
  const root = document.documentElement;
  root.dataset.cursor = 'off';

  let mouse = false;
  let movedAt = -Infinity;

  const update = (now: number) => {
    const b = document.body.classList;
    let state: CursorState;
    if (!mouse || b.contains('booting') || b.contains('crt-on') || b.contains('attract')) state = 'off';
    else if (document.getElementById('ui')?.classList.contains('visible')) state = b.contains('kbd') ? 'off' : 'arrow';
    else state = b.contains('aim-on') || now - movedAt < IDLE_MS ? 'dot' : 'off';
    if (root.dataset.cursor !== state) root.dataset.cursor = state;
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      mouse = e.pointerType === 'mouse';
      if (e.movementX || e.movementY) movedAt = performance.now();
      update(performance.now());
    },
    { passive: true },
  );
  window.addEventListener('pointerdown', (e) => {
    mouse = e.pointerType === 'mouse';
    update(performance.now());
  });

  // Screens and modes change without the mouse moving (menu opens, dot times out).
  const tick = (now: number) => {
    update(now);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
