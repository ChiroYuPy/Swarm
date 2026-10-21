/**
 * Monde ouvert infini : un champ d'obstacles géométriques généré par morceaux (chunks) depuis la seed.
 * Aucune case spéciale : les bonus sont des objets à ramasser (voir loot.ts).
 */
export const MAP_GEN = {
  /** taille d'un morceau de monde (unités) */
  chunk: 768,
  /** marge intérieure : un obstacle ne déborde jamais de son morceau (évite les recoins piégeux) */
  margin: 170,
  /** probabilités d'avoir 0, 1, 2 ou 3 obstacles dans un morceau */
  countWeights: [3, 5, 3, 1],
  /** zone dégagée autour du point de départ */
  clearRadius: 420,
  /** écart minimal entre deux obstacles d'un même morceau (passage garanti) */
  gap: 90,
  circle: { min: 34, max: 95 },
  hexagon: { min: 45, max: 110 },
  rect: { min: 30, max: 150, thinMin: 26 },
};
