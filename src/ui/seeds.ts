/** Readable internal seeds (never displayed: they are used to replay a run). The randomness here has no impact on the sim. */

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
