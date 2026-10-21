/**
 * Entrées clavier + manette. Produit un code d'entrée de sim (voir sim/inputcodec.ts).
 * On utilise `KeyboardEvent.code` (position physique) : WASD sur QWERTY = ZQSD sur AZERTY.
 */
import { encodeMove } from '../sim';

export type UiAction = 'pause' | 'mute' | 'use' | 'confirm' | 'back' | 'left' | 'right' | 'up' | 'down' | 'choice1' | 'choice2' | 'choice3' | 'fps' | 'speed1' | 'speed2' | 'speed4';

const UP = ['KeyW', 'ArrowUp'];
const DOWN = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];

export class InputManager {
  private readonly keys = new Set<string>();
  private padX = 0;
  private padY = 0;
  private padButtons: boolean[] = [];
  private listeners: ((a: UiAction) => void)[] = [];

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      // Laisse les champs de saisie tranquilles.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
        if (e.code === 'Escape') this.fire('back');
        return;
      }
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (!e.repeat) this.keyAction(e.code);
      this.keys.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
  }

  onAction(fn: (a: UiAction) => void): void {
    this.listeners.push(fn);
  }

  private fire(a: UiAction): void {
    for (const l of this.listeners) l(a);
  }

  private keyAction(code: string): void {
    switch (code) {
      case 'Escape':
      case 'KeyP':
        this.fire('pause');
        break;
      case 'KeyM':
        this.fire('mute');
        break;
      case 'Space':
        // Espace = objet activable uniquement (jamais un choix de level-up par accident).
        // Dans les menus, le navigateur active déjà le bouton qui a le focus.
        this.fire('use');
        break;
      case 'Enter': {
        // Si un bouton a le focus, le navigateur s'en charge déjà.
        const ae = document.activeElement;
        if (!ae || ae === document.body || ae.tagName !== 'BUTTON') this.fire('confirm');
        break;
      }
      case 'Digit1':
      case 'Numpad1':
        this.fire('choice1');
        this.fire('speed1');
        break;
      case 'Digit2':
      case 'Numpad2':
        this.fire('choice2');
        this.fire('speed2');
        break;
      case 'Digit3':
      case 'Numpad3':
        this.fire('choice3');
        break;
      case 'Digit4':
      case 'Numpad4':
        this.fire('speed4');
        break;
      case 'F3':
        this.fire('fps');
        break;
    }
    if (LEFT.includes(code)) this.fire('left');
    if (RIGHT.includes(code)) this.fire('right');
    if (UP.includes(code)) this.fire('up');
    if (DOWN.includes(code)) this.fire('down');
  }

  /** À appeler une fois par image : lit la manette et déclenche les actions de ses boutons. */
  poll(): void {
    this.padX = 0;
    this.padY = 0;
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) pad = pad ?? p;
    if (!pad) return;
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const mag = Math.sqrt(ax * ax + ay * ay);
    if (mag > 0.22) {
      this.padX = ax;
      this.padY = ay;
    }
    const b = pad.buttons.map((x) => x.pressed);
    const pressed = (i: number) => b[i] && !this.padButtons[i];
    if (b[12]) this.padY = -1;
    if (b[13]) this.padY = 1;
    if (b[14]) this.padX = -1;
    if (b[15]) this.padX = 1;
    if (pressed(9)) this.fire('pause');
    if (pressed(0)) this.fire('confirm');
    if (pressed(2)) this.fire('use');
    if (pressed(1)) this.fire('back');
    if (pressed(14)) this.fire('left');
    if (pressed(15)) this.fire('right');
    if (pressed(12)) this.fire('up');
    if (pressed(13)) this.fire('down');
    this.padButtons = b;
  }

  /** Vecteur de déplacement courant (clavier prioritaire si utilisé). */
  vector(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const k of LEFT) if (this.keys.has(k)) x -= 1;
    for (const k of RIGHT) if (this.keys.has(k)) x += 1;
    for (const k of UP) if (this.keys.has(k)) y -= 1;
    for (const k of DOWN) if (this.keys.has(k)) y += 1;
    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));
    if (x !== 0 || y !== 0) {
      const l = Math.sqrt(x * x + y * y);
      return { x: x / l, y: y / l };
    }
    return { x: this.padX, y: this.padY };
  }

  /** Code d'entrée de sim pour ce pas. */
  sampleCode(): number {
    const v = this.vector();
    return encodeMove(v.x, v.y);
  }

  clear(): void {
    this.keys.clear();
  }
}
