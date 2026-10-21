import { describe, expect, it } from 'vitest';
import {
  createGame,
  step,
  hashState,
  replayToEnd,
  encodeLog,
  decodeLog,
  weaponLevel,
  spawnRate,
  INPUT_USE,
  PK_FREEZE,
  PK_RAGE,
  PK_SHIELD,
  EV_NEW_ENEMY,
  TICK_RATE,
} from '../src/sim';
import { addWeapon } from '../src/sim/levelup';
import { weaponId } from '../src/sim/registry';
import { BASE_WEAPONS } from '../src/data/weapons';
import { ENEMIES } from '../src/data/enemies';
import { botInput } from '../src/ai/bot';

describe('contenu', () => {
  it('un niveau = une instance de plus pour les armes à instances', () => {
    for (const id of ['confetti', 'petitspois', 'crepes', 'boomerang', 'rallonge', 'klaxon']) {
      const w = weaponId(id);
      for (let l = 1; l <= 5; l++) expect(weaponLevel(w, l).count, `${id} niv. ${l}`).toBe(l);
    }
    // Le champ de force grandit à chaque niveau.
    const aura = weaponId('aura');
    for (let l = 2; l <= 5; l++) expect(weaponLevel(aura, l).radius!).toBeGreaterThan(weaponLevel(aura, l - 1).radius!);
    expect(BASE_WEAPONS.every((w) => w.levels.length === 5 && w.levelText.length === 5)).toBe(true);
  });

  it('les orbes en jeu sont aussi nombreux que le niveau', () => {
    const s = createGame({ seed: 'ORBES' });
    const p = s.players[0];
    const w = addWeapon(p, weaponId('petitspois'));
    for (let l = 1; l <= 5; l++) {
      w.level = l;
      step(s, [0]);
      expect(w.vN).toBe(l);
    }
  });

  it('les types d’ennemis arrivent progressivement, plus tôt en difficile', () => {
    const firstSeen = (difficulty: number, seconds: number) => {
      const s = createGame({ seed: 'ARRIVEES', difficulty });
      s.players[0].base.maxHp = 1e9;
      s.players[0].hp = 1e9;
      s.players[0].base.magnet = 0;
      const seen = new Map<string, number>();
      for (let i = 0; i < seconds * TICK_RATE && !s.over; i++) {
        step(s, [s.players[0].offers.length ? 200 : 0]);
        for (let k = 0; k < s.eventCount; k++) {
          const e = s.events[k];
          if (e.type === EV_NEW_ENEMY && !seen.has(ENEMIES[e.k].id)) seen.set(ENEMIES[e.k].id, s.tick / TICK_RATE);
        }
      }
      return seen;
    };
    const normal = firstSeen(1, 330);
    const hard = firstSeen(2, 200);
    // Au début, uniquement des Chasseurs ; les autres sont annoncés plus tard.
    expect(normal.get('losange')).toBeGreaterThan(60);
    expect(normal.has('carre')).toBe(true);
    expect(hard.get('losange')!).toBeLessThan(normal.get('losange')!);
    expect(spawnRate(30 * TICK_RATE, 0).rate).toBeLessThan(spawnRate(30 * TICK_RATE, 2).rate);
  });

  it('les bonus temporaires s’appliquent puis expirent', () => {
    const s = createGame({ seed: 'BONUS' });
    const p = s.players[0];
    const base = p.stats.might;
    s.pickups[0].kind = PK_RAGE;
    s.pickups[0].x = p.x;
    s.pickups[0].y = p.y;
    s.pickups[0].life = 100;
    s.pickups[0].magnet = false;
    s.pickupCount = 1;
    step(s, [0]);
    step(s, [0]);
    expect(p.stats.might).toBe(base * 2);
    for (let i = 0; i < 9 * TICK_RATE; i++) step(s, [0]);
    expect(p.stats.might).toBe(base);
    // Bouclier : aucun dégât reçu.
    p.shieldUntil = s.tick + 100;
    const hp = p.hp;
    for (let i = 0; i < s.enemyCount; i++) s.enemies[i].x = p.x;
    step(s, [0]);
    expect(p.hp).toBeGreaterThanOrEqual(hp);
    expect(PK_SHIELD).toBeGreaterThan(PK_RAGE);
  });

  it('utiliser un activable est un pas « zéro » rejoué à l’identique', () => {
    const s = createGame({ seed: 'ACTIVABLE' });
    const codes: number[] = [];
    for (let i = 0; i < 40 * TICK_RATE; i++) {
      const c = botInput(s, 0);
      codes.push(c);
      step(s, [c]);
    }
    s.players[0].activable = PK_FREEZE;
    const tick = s.tick;
    codes.push(INPUT_USE);
    step(s, [INPUT_USE]);
    expect(s.tick).toBe(tick);
    expect(s.players[0].activable).toBe(-1);
    expect(s.freezeUntil).toBeGreaterThan(tick);
    // La relecture doit refaire exactement la même chose... à condition d'avoir le même objet en réserve :
    // on rejoue donc une partie où l'objet a été obtenu en jeu (le bot s'en sert tout seul).
    const g = createGame({ seed: 'ACTIVABLE-2' });
    const log: number[] = [];
    let used = 0;
    for (let i = 0; i < 300 * TICK_RATE && !g.over; i++) {
      const c = botInput(g, 0);
      if (c === INPUT_USE && g.players[0].activable >= 0) used++;
      log.push(c);
      step(g, [c]);
    }
    const replayed = replayToEnd({ seed: 'ACTIVABLE-2' }, decodeLog(encodeLog(Uint8Array.from(log))));
    expect(hashState(replayed)).toBe(hashState(g));
    expect(used).toBeGreaterThan(0);
  });

  it('la difficulté change la partie mais reste déterministe', () => {
    const run = (difficulty: number) => {
      const s = createGame({ seed: 'DIFF', difficulty });
      for (let i = 0; i < 60 * TICK_RATE; i++) step(s, [botInput(s, 0)]);
      return hashState(s);
    };
    expect(run(0)).toBe(run(0));
    expect(run(0)).not.toBe(run(2));
  });
});
