/** Seeds internes lisibles (jamais affichées : elles servent à rejouer une partie). L'aléa ici n'a aucun impact sur la sim. */

const NOUNS = [
  'TOFU', 'FLAN', 'CROISSANT', 'PANDA', 'RADIS', 'KIWI', 'YAOURT', 'PNEU', 'CORNICHON', 'RACLETTE',
  'FLAMANT', 'CANARD', 'BIGOUDI', 'PATATE', 'BRIOCHE', 'HIBOU', 'GRUYERE', 'POIREAU', 'CAMEMBERT', 'MORSE',
];
const ADJS = [
  'FURIEUX', 'MOU', 'GLUANT', 'TIMIDE', 'COSMIQUE', 'BANCAL', 'RALEUR', 'DODU', 'FLUO', 'PRESSE',
  'TETU', 'BAVARD', 'CROUSTI', 'MOELLEUX', 'VEXE', 'CHAUVE', 'ZEN', 'SOURNOIS', 'MAJESTUEUX', 'TIEDE',
];

function rand(n: number): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}

export function randomSeed(): string {
  return `${NOUNS[rand(NOUNS.length)]}-${ADJS[rand(ADJS.length)]}-${String(rand(100)).padStart(2, '0')}`;
}
