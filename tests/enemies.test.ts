import { describe, expect, it } from 'vitest';
import { createGame, step, TICK_RATE, type GameState } from '../src/sim';
import { spawnEnemy } from '../src/sim/entities';
import { enemyId } from '../src/sim/registry';
import { damageEnemy } from '../src/sim/combat';
import { ENEMIES } from '../src/data/enemies';
import { defaultSandbox } from '../src/storage/storage';
import { DIFFICULTIES } from '../src/data/difficulty';
import { WAVES } from '../src/data/waves';
import { MIXES, UNLOCK_SLOT } from '../src/sim/registry';
import { mixAt } from '../src/sim/spawner';

/** Partie vide (aucune apparition automatique). */
function arena(): GameState {
  return createGame({ seed: 'ENNEMIS', sandbox: { ...defaultSandbox().rules, invincible: false, enemyMul: 0, bosses: false, weapons: [] } });
}

function put(s: GameState, id: string, x: number, y: number, hp = 1) {
  return spawnEnemy(s, enemyId(id), s.players[0].x + x, s.players[0].y + y, hp, 1, 1, 0)!;
}

function alive(s: GameState, id: string) {
  const t = enemyId(id);
  return s.enemies.slice(0, s.enemyCount).filter((e) => e.alive && e.type === t);
}

const def = (id: string) => ENEMIES.find((e) => e.id === id)!;

describe('nouveaux ennemis', () => {
  it('Golem : se coupe en 2 Golems moyens, puis chacun en 2 petits', () => {
    const s = arena();
    const g = put(s, 'golem', 400, 0);
    damageEnemy(s, s.enemies.indexOf(g), 1e6, 0, 0, 0);
    step(s, [0]);
    const mid = alive(s, 'golem2');
    expect(mid.length).toBe(2);
    // Ils partent chacun de leur côté.
    expect(Math.abs(mid[0].y - mid[1].y)).toBeGreaterThan(10);
    for (const e of mid) damageEnemy(s, s.enemies.indexOf(e), 1e6, 0, 0, 0);
    step(s, [0]);
    const small = alive(s, 'golem3');
    expect(small.length).toBe(4);
    for (const e of small) damageEnemy(s, s.enemies.indexOf(e), 1e6, 0, 0, 0);
    step(s, [0]);
    expect(s.enemyCount).toBe(0);
  });

  it('Meneur : les voisins vont plus vite, plus du tout une fois le Meneur gelé', () => {
    const s = arena();
    const m = put(s, 'meneur', 400, 0, 100);
    const a = put(s, 'carre', 460, 0, 100);
    const far = put(s, 'carre', -400, 0, 100);
    step(s, [0]);
    expect(a.boostUntil).toBeGreaterThan(s.tick);
    expect(far.boostUntil).toBe(0);
    expect(m.boostUntil).toBe(0); // il ne s'accélère pas lui-même
    // Même Bloc, avec et sans Meneur : celui qui est galvanisé avance plus.
    const b = arena();
    const ref = put(b, 'carre', 460, 0, 100);
    put(b, 'carre', -400, 0, 100);
    const x0 = a.x;
    for (let i = 0; i < 30; i++) {
      step(s, [0]);
      step(b, [0]);
    }
    expect(x0 - a.x).toBeGreaterThan((460 - (ref.x - b.players[0].x)) * 1.15);
    m.frozenUntil = s.tick + 600;
    step(s, [0]);
    step(s, [0]);
    expect(a.boostUntil).toBeLessThanOrEqual(s.tick);
  });

  it('Téléporteur : marque le sol sous le joueur, y atterrit et blesse qui est resté', () => {
    const s = arena();
    const p = s.players[0];
    const t = put(s, 'teleporteur', 300, 0, 100);
    step(s, [0]);
    expect(t.ai).toBe(1);
    const tx = t.aux;
    const ty = t.aux2;
    expect(Math.hypot(tx - p.x, ty - p.y)).toBeLessThan(5);
    const hp0 = p.hp;
    for (let i = 0; i < def('teleporteur').fuse! * TICK_RATE + 2; i++) step(s, [0]);
    expect(t.x).toBe(tx);
    expect(t.y).toBe(ty);
    expect(p.hp).toBeLessThan(hp0);
  });

  it('Téléporteur : on esquive en sortant du cercle', () => {
    const s = arena();
    const p = s.players[0];
    put(s, 'teleporteur', 300, 0, 100);
    step(s, [0]);
    const hp0 = p.hp;
    // On fuit vers le bas pendant l’avertissement (code 1 + 16 : un quart de tour sur 64 directions).
    for (let i = 0; i < def('teleporteur').fuse! * TICK_RATE + 2; i++) step(s, [17]);
    expect(p.hp).toBe(hp0);
  });

  it('Orbiteur : tourne autour du joueur en se rapprochant', () => {
    const s = arena();
    const p = s.players[0];
    const o = put(s, 'orbiteur', 380, 0, 100);
    const a0 = Math.atan2(o.y - p.y, o.x - p.x);
    const d0 = Math.hypot(o.x - p.x, o.y - p.y);
    for (let i = 0; i < 90; i++) step(s, [0]);
    const a1 = Math.atan2(o.y - p.y, o.x - p.x);
    const d1 = Math.hypot(o.x - p.x, o.y - p.y);
    expect(Math.abs(a1 - a0)).toBeGreaterThan(0.4);
    expect(d1).toBeLessThan(d0 - 40);
  });
});

describe('vagues lisibles', () => {
  it('jamais plus de 3 types dans le flux à la fois, et les nouveaux types finissent par sortir', () => {
    for (let diff = 0; diff < DIFFICULTIES.length; diff++) {
      const seen = new Set<number>();
      for (let slot = 0; slot < 40; slot++) {
        const m = MIXES[mixAt(12345, diff, slot)];
        expect(m.types.length).toBeLessThanOrEqual(3);
        // Tous les types du mélange sont déjà arrivés.
        for (const t of m.types) expect(UNLOCK_SLOT[diff][t]).toBeLessThanOrEqual(slot);
        m.types.forEach((t) => seen.add(t));
      }
      for (const id of Object.keys(WAVES.unlocks)) expect(seen.has(enemyId(id))).toBe(true);
    }
  });

  it('un nouveau type est mis en vedette à son arrivée, et le mélange ne se répète pas', () => {
    const t = enemyId('golem');
    const slot = UNLOCK_SLOT[1][t];
    expect(MIXES[mixAt(7, 1, slot)].types).toContain(t);
    // (dès qu'il y a le choix : au tout début, seuls les Chasseurs existent)
    for (let k = UNLOCK_SLOT[1][enemyId('losange')] + 1; k < 40; k++) expect(mixAt(7, 1, k)).not.toBe(mixAt(7, 1, k - 1));
  });

  it('Golem : nombre en vie plafonné', () => {
    const s = createGame({ seed: 'GOLEMS', sandbox: { ...defaultSandbox().rules, invincible: true, enemyMul: 5, bosses: false, enemies: ['golem'], weapons: [] } });
    for (let i = 0; i < 40 * TICK_RATE; i++) step(s, [0]);
    expect(alive(s, 'golem').length).toBeLessThanOrEqual(def('golem').capStart! + 1);
    expect(alive(s, 'golem').length).toBeGreaterThan(0);
  });
});

describe('ennemis semés et plafond', () => {
  it('un ennemi semé loin du joueur disparaît, sans gemme ni kill', () => {
    const s = arena();
    put(s, 'triangle', WAVES.lostDistance + 200, 0);
    put(s, 'triangle', 300, 0);
    step(s, [0]);
    expect(alive(s, 'triangle').length).toBe(1);
    expect(s.gemCount).toBe(0);
    expect(s.players[0].kills).toBe(0);
  });

  it('les vagues ne dépassent jamais le plafond, même avec beaucoup d’ennemis demandés', () => {
    const s = createGame({ seed: 'PLAFOND', sandbox: { ...defaultSandbox().rules, startWave: 11, enemyMul: 10, bosses: false, weapons: [] } });
    let max = 0;
    for (let i = 0; i < 90 * TICK_RATE; i++) {
      step(s, [0]);
      max = Math.max(max, s.enemyCount);
    }
    expect(max).toBeGreaterThan(WAVES.fluxCap - 20);
    // + quelques caisses bonus, qui ne comptent pas
    expect(max).toBeLessThanOrEqual(WAVES.enemyCap + WAVES.props.max);
  });
});
