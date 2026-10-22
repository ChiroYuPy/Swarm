import { describe, expect, it } from 'vitest';
import {
  createGame,
  step,
  availableFusions,
  FUSION_TABLE,
  PassiveInst,
  PJ_BLAZE,
  PJ_DRONE,
  PJ_EBULLET,
  PJ_PHOENIX,
  PJ_RICOCHET,
  PJ_SHELL,
  PJ_TURRET,
  TICK_RATE,
  weaponDef,
  type GameState,
} from '../src/sim';
import { spawnEnemy } from '../src/sim/entities';
import { enemyId, weaponId } from '../src/sim/registry';
import { addWeapon, rollOffers } from '../src/sim/levelup';
import { computeStats } from '../src/sim/player';
import { OFFER_FUSION } from '../src/sim/state';

const DAMAGING = ['fouet', 'flammes', 'tourelle', 'drone', 'ricochet', 'mortier', 'faux', 'tornade', 'phenix', 'bastion', 'escadrille', 'kamikazes', 'meteores'];

/** Une partie avec une seule arme, un héros immortel et des ennemis tout autour. */
function arena(id: string, level: number, hp = 50, type = 'carre'): GameState {
  const s = createGame({ seed: 'ARMES' });
  s.sandbox = { invincible: true, enemyMul: 0, enemies: null, bosses: false, xp: 1 };
  const p = s.players[0];
  p.weapons.length = 0;
  addWeapon(p, weaponId(id)).level = level;
  computeStats(p);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const d = 90 + (i % 4) * 70;
    spawnEnemy(s, enemyId(type), Math.cos(a) * d, Math.sin(a) * d, hp, 0.01, 0.3, 0);
  }
  return s;
}

function run(s: GameState, seconds: number, each?: (s: GameState) => void): void {
  for (let i = 0; i < seconds * TICK_RATE && !s.over; i++) {
    step(s, [0]);
    each?.(s);
  }
}

const projs = (s: GameState, kind: number) => s.projectiles.slice(0, s.projCount).filter((b) => b.kind === kind);

describe('nouvelles armes', () => {
  it.each(DAMAGING)('%s fait des dégâts (niveau 1 et max)', (id) => {
    const max = weaponDef(weaponId(id)).levels.length;
    for (const level of [1, max]) {
      const s = arena(id, level);
      run(s, 8);
      expect(s.players[0].damageDealt, `${id} niv. ${level}`).toBeGreaterThan(0);
    }
  });

  it('le Fouet blesse et repousse', () => {
    const s = arena('fouet', 5, 5000);
    const p = s.players[0];
    const before = s.enemies.slice(0, s.enemyCount).map((e) => Math.hypot(e.x - p.x, e.y - p.y));
    run(s, 0.8);
    expect(p.damageDealt).toBeGreaterThan(0);
    const pushed = s.enemies.slice(0, s.enemyCount).some((e, i) => e.kbx !== 0 || e.kby !== 0 || Math.hypot(e.x - p.x, e.y - p.y) > before[i] + 20);
    expect(pushed).toBe(true);
  });

  it('chaque nouvelle évolution est proposée quand l’arme et son passif sont au max', () => {
    for (const result of ['faux', 'tornade', 'phenix', 'bastion', 'escadrille', 'kamikazes', 'meteores']) {
      const fi = FUSION_TABLE.findIndex((f) => f.result === weaponId(result));
      expect(fi, result).toBeGreaterThanOrEqual(0);
      const f = FUSION_TABLE[fi];
      const s = createGame({ seed: 'FUSIONS' });
      const p = s.players[0];
      p.weapons.length = 0;
      addWeapon(p, f.weapon).level = weaponDef(f.weapon).levels.length;
      const x = new PassiveInst();
      x.def = f.with;
      x.level = 5;
      p.passives.push(x);
      expect(availableFusions(p), result).toContain(fi);
    }
  });

  it('une arme à deux fusions possibles les propose toutes les deux', () => {
    const s = createGame({ seed: 'FUSIONS' });
    const p = s.players[0];
    p.weapons.length = 0;
    addWeapon(p, weaponId('flammes')).level = 5;
    for (const id of ['lunettes', 'soupe']) {
      const x = new PassiveInst();
      x.def = ['biceps', 'cafe', 'lunettes', 'chaussettes', 'aimant', 'soupe', 'blindage', 'chance'].indexOf(id);
      x.level = 5;
      p.passives.push(x);
    }
    p.pendingLevels = 1;
    rollOffers(s, p);
    const fused = p.offers.filter((o) => o.kind === OFFER_FUSION).map((o) => FUSION_TABLE[o.id].result);
    expect(fused).toContain(weaponId('tornade'));
    expect(fused).toContain(weaponId('phenix'));
  });

  it('la Faux achève les ennemis presque morts', () => {
    const s = arena('faux', 1, 1);
    for (let i = 0; i < s.enemyCount; i++) {
      const e = s.enemies[i];
      e.maxHp = 100000;
      e.hp = 5000;
    }
    run(s, 2);
    expect(s.players[0].kills).toBeGreaterThan(0);
  });

  it('la tourelle reste posée et tire sans le joueur', () => {
    const s = arena('tourelle', 1);
    run(s, 0.5);
    const t = projs(s, PJ_TURRET)[0];
    expect(t).toBeDefined();
    const before = s.players[0].damageDealt;
    run(s, 4);
    const t2 = projs(s, PJ_TURRET)[0];
    expect([t2?.x, t2?.y]).toEqual([t.x, t.y]);
    expect(s.players[0].damageDealt).toBeGreaterThan(before);
  });

  it('un disque ricochet touche plusieurs ennemis (niveau max)', () => {
    const s = arena('ricochet', 5);
    let maxHits = 0;
    run(s, 3, (st) => {
      for (const b of projs(st, PJ_RICOCHET)) maxHits = Math.max(maxHits, b.hitCount);
    });
    expect(maxHits).toBeGreaterThan(1);
  });

  it('les drones partent chasser, et reviennent près du joueur quand ils sont abattus', () => {
    const s = arena('drone', 2, 50, 'pentagone');
    run(s, 1);
    expect(projs(s, PJ_DRONE).length).toBe(2);
    // On abat tous les drones : ils doivent réapparaître près du joueur.
    for (const b of projs(s, PJ_DRONE)) b.b = -1;
    // Un ennemi au contact déclenche la destruction au pas suivant ; on force via les PV.
    run(s, 0.1);
    const p = s.players[0];
    run(s, 4);
    const ds = projs(s, PJ_DRONE);
    expect(ds.length).toBe(2);
    expect(ds.every((b) => b.age < 4 * TICK_RATE)).toBe(true);
    expect(p.damageDealt).toBeGreaterThan(0);
  });

  it('le Lance-flammes ne tourne plus une fois allumé', () => {
    const s = arena('flammes', 1, 5000);
    const w = s.players[0].weapons[0];
    let start = NaN;
    let moved = false;
    run(s, 2, () => {
      if (w.activeTicks > 0) {
        if (Number.isNaN(start)) start = w.angles[0];
        else if (w.angles[0] !== start) moved = true;
      }
    });
    expect(Number.isNaN(start)).toBe(false);
    expect(moved).toBe(false);
  });

  it('les drones se répartissent les cibles et ne tournent pas sur place', () => {
    const s = arena('drone', 5, 100000);
    let maxTurn = 0;
    const heading = new Map<number, number>();
    run(s, 3, (st) => {
      for (const b of projs(st, PJ_DRONE)) {
        const h = Math.atan2(b.vy, b.vx);
        const prev = heading.get(b.d);
        if (prev !== undefined && b.age > 1) {
          let d = Math.abs(h - prev);
          if (d > Math.PI) d = 2 * Math.PI - d;
          maxTurn = Math.max(maxTurn, d);
        }
        heading.set(b.d, h);
      }
    });
    const drones = projs(s, PJ_DRONE).filter((b) => b.c >= 0);
    expect(drones.length).toBeGreaterThan(2);
    expect(new Set(drones.map((b) => b.ty)).size).toBe(drones.length);
    // Virage limité : jamais un demi-tour d'un coup.
    expect(maxTurn).toBeLessThan(0.2);
  });

  it('les Tireurs ne tirent que droit devant eux', () => {
    const s = arena('fouet', 1, 100000, 'pentagone');
    s.players[0].weapons.length = 0;
    let checked = 0;
    run(s, 6, (st) => {
      for (const b of projs(st, PJ_EBULLET)) {
        if (b.age !== 1) continue;
        // La balle part dans le sens où le Tireur regarde.
        const e = st.enemies.slice(0, st.enemyCount).find((en) => Math.hypot(en.x - b.x, en.y - b.y) < 12);
        if (!e) continue;
        const dot = (b.vx * e.vx + b.vy * e.vy) / Math.hypot(b.vx, b.vy);
        expect(dot).toBeGreaterThan(0.99);
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(0);
  });

  it('les Phénix partent sans revenir, renaissent près de toi et laissent du feu', () => {
    const s = arena('phenix', 1, 100000);
    const p = s.players[0];
    let maxTurn = 0;
    let fires = 0;
    let maxAlive = 0;
    const births = new Set<number>();
    const heading = new Map<number, number>();
    run(s, 10, (st) => {
      fires = Math.max(fires, projs(st, PJ_BLAZE).length);
      const birds = projs(st, PJ_PHOENIX);
      maxAlive = Math.max(maxAlive, birds.length);
      for (const ph of birds) {
        // Un oiseau par envol : on le reconnaît à son tick de départ.
        const id = st.tick - ph.age;
        if (ph.age === 1) {
          births.add(id);
          expect(Math.hypot(ph.x - p.x, ph.y - p.y)).toBeLessThan(20);
        }
        const h = Math.atan2(ph.vy, ph.vx);
        const prev = heading.get(id);
        if (prev !== undefined) {
          let d = Math.abs(h - prev);
          if (d > Math.PI) d = 2 * Math.PI - d;
          maxTurn = Math.max(maxTurn, d);
        }
        heading.set(id, h);
      }
    });
    expect(maxAlive).toBe(2);
    // Vie de 4 s : en 10 s, chaque oiseau a renaît au moins une fois.
    expect(births.size).toBeGreaterThan(2);
    expect(fires).toBeGreaterThan(3);
    expect(maxTurn).toBeLessThan(0.2);
    expect(p.hp).toBe(p.stats.maxHp);
  });

  it('le Fouet claque en éventail devant toi et le Lance-flammes en demi-cercle au max', () => {
    const whip = arena('fouet', 5, 100000);
    run(whip, 2);
    const w = whip.players[0].weapons[0];
    const spread = (a: Float64Array, n: number) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let k = 0; k < n; k++) {
        lo = Math.min(lo, a[k]);
        hi = Math.max(hi, a[k]);
      }
      return hi - lo;
    };
    expect(spread(w.angles, 5)).toBeCloseTo((2 * Math.PI) / 5, 5);
    const fl = arena('flammes', 5, 100000);
    run(fl, 2);
    const f = fl.players[0].weapons[0];
    // 5 jets de 1/10 de tour, côte à côte : un demi-cercle (bord à bord).
    expect(spread(f.angles, 5) + 2 * (Math.PI / 10)).toBeCloseTo(Math.PI, 5);
  });

  it('le Mortier lance des obus qui explosent au loin, les Météores laissent un cratère', () => {
    const m = arena('mortier', 1);
    let shells = 0;
    run(m, 3, (st) => (shells += projs(st, PJ_SHELL).length));
    expect(shells).toBeGreaterThan(0);
    expect(m.players[0].damageDealt).toBeGreaterThan(0);
    const met = arena('meteores', 1);
    let craters = 0;
    run(met, 3, (st) => (craters += projs(st, PJ_BLAZE).length));
    expect(craters).toBeGreaterThan(0);
  });
});
