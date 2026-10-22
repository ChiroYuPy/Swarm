/**
 * Curseur néon dessiné dans la page (le curseur système est masqué) :
 * - dans les menus, une flèche (pleine sur ce qui se clique) ;
 * - en partie, un point, qui s'efface quand la souris ne bouge plus, et un viseur (anneau) tant
 *   qu'on maintient le clic pour viser ;
 * - rien pendant la veille et l'allumage, ni au clavier, ni au doigt.
 * La flèche, le point et l'anneau ont la même structure (quatre courbes, voir style.css) : on passe de l'un à
 * l'autre en morphing, et le curseur apparaît / disparaît en fondu.
 */

/** En partie, le point s'efface après ce délai sans mouvement (ms). */
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
  /** clic gauche maintenu sur le jeu (visée manuelle, voir input.ts) */
  let aiming = false;
  const clickable = (t: EventTarget | null) => t instanceof Element && !!t.closest('button:not(:disabled), .track');

  window.addEventListener(
    'pointermove',
    (e) => {
      mouse = e.pointerType === 'mouse';
      inside = true;
      // Point actif = pointe de la flèche = centre du point (5, 4 dans le dessin).
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
  // Un écran qui glisse sous le pointeur immobile change ce qu'il survole.
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
