/**
 * Neon cursor drawn in the page (the system cursor is hidden):
 * - in menus, an arrow (filled over what can be clicked);
 * - in game, a dot that fades out when the mouse stops moving, and a crosshair (ring) while
 *   the button is held to aim;
 * - nothing during standby and power-on, nor with the keyboard, nor with touch.
 * The arrow, the dot and the ring share the same structure (four curves, see styles/cursor.css): they
 * morph into one another, and the cursor fades in / out.
 */

/** In game, the dot fades out after this long without movement (ms). */
const IDLE_MS = 1200;

type CursorState = 'off' | 'arrow' | 'hover' | 'dot' | 'aim';

export function initCursor(): void {
  const el = document.createElement('div');
  el.id = 'cursor';
  el.dataset.state = 'off';
  el.innerHTML = '<svg viewBox="0 0 32 32" width="32" height="32"><path/></svg>';
  document.body.appendChild(el);

  let mouse = false;
  let inside = false;
  let hover = false;
  let movedAt = -Infinity;
  /** left button held on the game (manual aim, see input/input.ts) */
  let aiming = false;
  const clickable = (t: EventTarget | null) => t instanceof Element && !!t.closest('button:not(:disabled), .track');

  window.addEventListener(
    'pointermove',
    (e) => {
      mouse = e.pointerType === 'mouse';
      inside = true;
      // Hotspot = arrow tip = dot center (5, 4 in the drawing).
      el.style.transform = `translate(${e.clientX - 5}px, ${e.clientY - 4}px)`;
      if (e.movementX || e.movementY) movedAt = performance.now();
      hover = clickable(e.target);
    },
    { passive: true },
  );
  window.addEventListener('pointerdown', (e) => {
    mouse = e.pointerType === 'mouse';
    if (e.button === 0 && e.target instanceof HTMLCanvasElement) aiming = true;
  });
  window.addEventListener('pointerup', (e) => {
    if (e.button === 0) aiming = false;
  });
  window.addEventListener('pointercancel', () => (aiming = false));
  window.addEventListener('blur', () => (aiming = false));
  // A screen sliding under a still pointer changes what it hovers.
  window.addEventListener('mouseover', (e) => {
    hover = clickable(e.target);
  });
  document.documentElement.addEventListener('mouseleave', () => (inside = false));

  const ui = document.getElementById('ui');
  const tick = (now: number) => {
    const b = document.body.classList;
    let state: CursorState;
    if (!mouse || !inside || b.contains('booting') || b.contains('crt-on') || b.contains('attract')) state = 'off';
    else if (ui?.classList.contains('visible')) state = b.contains('kbd') ? 'off' : hover ? 'hover' : 'arrow';
    else state = aiming ? 'aim' : now - movedAt < IDLE_MS ? 'dot' : 'off';
    if (el.dataset.state !== state) el.dataset.state = state;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
